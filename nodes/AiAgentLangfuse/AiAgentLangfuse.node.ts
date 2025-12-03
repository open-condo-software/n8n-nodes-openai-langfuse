import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ICredentialDataDecryptedObject,
	ResourceMapperField,
	ResourceMapperFields,
	INodeInputConfiguration,
	NodeConnectionType,
	EngineRequest,
	EngineResponse,
	IDataObject,
	GenericValue,
} from 'n8n-workflow';
import { NodeOperationError, NodeConnectionTypes, jsonParse } from 'n8n-workflow';
import { CallbackHandler } from 'langfuse-langchain';
import { HumanMessage, SystemMessage, AIMessage, trimMessages } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage, AIMessageChunk, MessageContentText } from '@langchain/core/messages';
import type { ToolCall } from '@langchain/core/messages/tool';
import { createToolCallingAgent, type AgentRunnableSequence } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import type { StreamEvent } from '@langchain/core/dist/tracers/event_stream';
import type { IterableReadableStream } from '@langchain/core/dist/utils/stream';
import type { BaseChatMemory } from 'langchain/memory';
import { DynamicStructuredTool, Tool } from 'langchain/tools';
import omit from 'lodash/omit';
import { getLangfuseClient } from '../../utils/langfuseClient';
import { ensureSessionId } from '../../utils/sessionManager';
import { fetchPrompts, getDefaultLabels, createAuthObject } from './api';
import { extractVariablesFromPrompt, parsePromptName } from './helpers';

interface LangfusePromptResponse {
	name: string;
	version: number;
	prompt: string | Array<{ role: string; content: string }>;
	config?: Record<string, unknown>;
}

type ToolCallRequest = {
	tool: string;
	toolInput: Record<string, unknown>;
	toolCallId: string;
	type?: string;
	log?: string;
	messageLog?: unknown[];
};

type ToolCallData = {
	action: {
		tool: string;
		toolInput: Record<string, unknown>;
		log: string | number | true | object;
		toolCallId: IDataObject | GenericValue | GenericValue[] | IDataObject[];
		type: string | number | true | object;
	};
	observation: string;
};

export type ActionMetadata = {
	itemIndex: number;
};

export type RequestResponseMetadata = {
	itemIndex?: number;
	previousRequests: ToolCallData[];
	iterationCount?: number;
};

type IntermediateStep = {
	action: {
		tool: string;
		toolInput: Record<string, unknown>;
		log: string;
		messageLog: unknown[];
		toolCallId: string;
		type: string;
	};
	observation?: string;
};

type AgentResult = {
	output: string;
	intermediateSteps?: IntermediateStep[];
	toolCalls?: ToolCallRequest[];
};

/**
 * Uses provided tools and tries to get tools from model metadata
 * Some chat model nodes can define built-in tools in their metadata
 */
function getAllTools(model: BaseChatModel, tools: Array<DynamicStructuredTool | Tool>) {
	const modelTools = (model.metadata?.tools as Tool[]) ?? [];
	const allTools = [...tools, ...modelTools];
	return allTools;
}

/**
 * Creates engine requests for tool execution
 */
async function createEngineRequests(
	toolCalls: ToolCallRequest[],
	itemIndex: number,
	tools: Array<DynamicStructuredTool | Tool>,
) {
	console.log('[createEngineRequests] Tool calls:', toolCalls.map(tc => tc.tool));
	console.log('[createEngineRequests] Available tools:', tools.map(t => ({ name: t.name, metadata: t.metadata })));
	return toolCalls.map((toolCall) => {
		const foundTool = tools.find((tool) => tool.name === toolCall.tool);
		if (!foundTool) {
			console.log('[createEngineRequests] Tool not found:', toolCall.tool);
			return;
		}

		const nodeName = foundTool.metadata?.sourceNodeName as string;
		console.log('[createEngineRequests] Found tool:', toolCall.tool, 'nodeName:', nodeName, 'metadata:', foundTool.metadata);
		
		// Skip tools without sourceNodeName (built-in model tools that aren't n8n nodes)
		if (!nodeName) {
			console.log('[createEngineRequests] Skipping tool without sourceNodeName:', toolCall.tool);
			return;
		}
		
		const input = foundTool.metadata?.isFromToolkit
			? { ...toolCall.toolInput, tool: toolCall.tool }
			: toolCall.toolInput;

		return {
			actionType: 'ExecutionNodeAction' as const,
			nodeName,
			input: input as IDataObject,
			type: NodeConnectionTypes.AiTool,
			id: toolCall.toolCallId,
			metadata: {
				itemIndex,
			},
		};
	});
}

/**
 * Builds steps from previous tool executions
 */
function buildSteps(
	response: EngineResponse<RequestResponseMetadata> | undefined,
	itemIndex: number,
): ToolCallData[] {
	const steps: ToolCallData[] = [];

	if (response) {
		const responses = response?.actionResponses ?? [];

		if (response.metadata?.previousRequests) {
			steps.push(...response.metadata.previousRequests);
		}

		for (const tool of responses) {
			if (tool.action?.metadata?.itemIndex !== itemIndex) continue;

			const toolInput: IDataObject = {
				...tool.action.input,
				id: tool.action.id,
			};
			if (!toolInput || !tool.data) {
				continue;
			}

			const step = steps.find((step) => step.action.toolCallId === toolInput.id);
			if (step) {
				continue;
			}

			const syntheticAIMessage = new AIMessage({
				content: `Calling ${tool.action.nodeName} with input: ${JSON.stringify(toolInput)}`,
				tool_calls: [
					{
						id: (toolInput?.id as string) ?? 'reconstructed_call',
						name: tool.action.nodeName,
						args: toolInput,
						type: 'tool_call',
					},
				],
			});

			const toolResult = {
				action: {
					tool: tool.action.nodeName,
					toolInput: (tool.action.input as IDataObject) || {},
					log: (toolInput.log as string) || syntheticAIMessage.content,
					messageLog: [syntheticAIMessage],
					toolCallId: toolInput?.id,
					type: (toolInput.type as string) || 'tool_call',
				},
				observation: JSON.stringify(tool.data?.data?.ai_tool?.[0]?.map((item) => item?.json) ?? ''),
			};

			steps.push(toolResult);
		}
	}
	return steps;
}

/**
 * Creates an agent sequence with the given configuration
 */
function createAgentSequence(
	model: BaseChatModel,
	tools: Array<DynamicStructuredTool | Tool>,
	prompt: ChatPromptTemplate,
	_options: { maxIterations?: number; returnIntermediateSteps?: boolean },
) {
	// Use both model built-in tools (webSearch) AND connected n8n tools (FormatTool)
	// Model tools will be executed by the model, n8n tools by the engine
	const allTools = getAllTools(model, tools);
	console.log('[createAgentSequence] Creating agent with', allTools.length, 'tools:', allTools.map(t => ({ name: t.name, hasSourceNode: !!t.metadata?.sourceNodeName })));
	const agent = createToolCallingAgent({
		llm: model,
		tools: allTools,
		prompt,
		streamRunnable: false,
	});

	const runnableAgent = agent as AgentRunnableSequence;
	runnableAgent.singleAction = true;
	runnableAgent.streamRunnable = false;

	return runnableAgent;
}

/**
 * Processes event stream from agent execution
 */
async function processEventStream(
	ctx: IExecuteFunctions,
	eventStream: IterableReadableStream<StreamEvent>,
	itemIndex: number,
	returnIntermediateSteps: boolean = false,
	memory?: BaseChatMemory,
	input?: string,
): Promise<AgentResult> {
	const agentResult: AgentResult = {
		output: '',
	};

	if (returnIntermediateSteps) {
		agentResult.intermediateSteps = [];
	}

	const toolCalls: ToolCallRequest[] = [];

	if ('sendChunk' in ctx) {
		ctx.sendChunk('begin', itemIndex);
	}

	for await (const event of eventStream) {
		console.log('[processEventStream] Event:', event.event, 'name:', event.name);
		switch (event.event) {
			case 'on_chat_model_stream':
				const chunk = event.data?.chunk as AIMessageChunk;
				if (chunk?.content) {
					const chunkContent = chunk.content;
					let chunkText = '';
					if (Array.isArray(chunkContent)) {
						for (const message of chunkContent) {
							if (message?.type === 'text') {
								chunkText += (message as MessageContentText)?.text;
							}
						}
					} else if (typeof chunkContent === 'string') {
						chunkText = chunkContent;
					}
					if ('sendChunk' in ctx) {
						ctx.sendChunk('item', itemIndex, chunkText);
					}
					agentResult.output += chunkText;
				}
				break;
			case 'on_chat_model_end':
				if (event.data) {
					const chatModelData = event.data as {
						output?: { tool_calls?: ToolCall[]; content?: string };
					};
					const output = chatModelData.output;

					if (output?.tool_calls && output.tool_calls.length > 0) {
						for (const toolCall of output.tool_calls) {
							toolCalls.push({
								tool: toolCall.name,
								toolInput: toolCall.args,
								toolCallId: toolCall.id || 'unknown',
								type: toolCall.type || 'tool_call',
								log:
									output.content ||
									`Calling ${toolCall.name} with input: ${JSON.stringify(toolCall.args)}`,
								messageLog: [output],
							});
						}

						if (returnIntermediateSteps) {
							for (const toolCall of output.tool_calls) {
								agentResult.intermediateSteps!.push({
									action: {
										tool: toolCall.name,
										toolInput: toolCall.args,
										log:
											output.content ||
											`Calling ${toolCall.name} with input: ${JSON.stringify(toolCall.args)}`,
										messageLog: [output],
										toolCallId: toolCall.id || 'unknown',
										type: toolCall.type || 'tool_call',
									},
								});
							}
						}
					}
				}
				break;
			case 'on_tool_end':
				if (returnIntermediateSteps && event.data && agentResult.intermediateSteps!.length > 0) {
					const toolData = event.data as { output?: string };
					const matchingStep = agentResult.intermediateSteps!.find(
						(step) => !step.observation && step.action.tool === event.name,
					);
					if (matchingStep) {
						matchingStep.observation = toolData.output || '';
					}
				}
				break;
			default:
				break;
		}
	}

	if ('sendChunk' in ctx) {
		ctx.sendChunk('end', itemIndex);
	}

	if (memory && input && agentResult.output) {
		await memory.saveContext({ input }, { output: agentResult.output });
	}

	if (toolCalls.length > 0) {
		agentResult.toolCalls = toolCalls;
	}

	return agentResult;
}

function getInputs(
	hasMainInput?: boolean,
	hasOutputParser?: boolean,
	needsFallback?: boolean,
): Array<NodeConnectionType | INodeInputConfiguration> {
	interface SpecialInput {
		type: NodeConnectionType;
		displayName: string;
		required?: boolean;
		filter?: {
			nodes?: string[];
			excludedNodes?: string[];
		};
	}

	const getInputData = (
		inputs: SpecialInput[],
	): Array<NodeConnectionType | INodeInputConfiguration> => {
		return inputs.map(({ type, displayName, required, filter }) => {
			const input: INodeInputConfiguration = {
				type,
				displayName,
				required,
				maxConnections: ['ai_languageModel', 'ai_memory', 'ai_outputParser'].includes(type)
					? 1
					: undefined,
			};

			if (filter) {
				input.filter = filter;
			}

			return input;
		});
	};

	let specialInputs: SpecialInput[] = [
		{
		type: 'ai_languageModel',
		displayName: 'Chat Model',
		required: true,
	},
	{
		type: 'ai_languageModel',
		displayName: 'Fallback Model',
		required: true,
	},
		{
			displayName: 'Memory',
			type: 'ai_memory',
		},
		{
			displayName: 'Tool',
			type: 'ai_tool',
		},
		{
			displayName: 'Output Parser',
			type: 'ai_outputParser',
		},
	];

	if (hasOutputParser === false) {
		specialInputs = specialInputs.filter((input) => input.type !== 'ai_outputParser');
	}
	if (needsFallback === false) {
		specialInputs = specialInputs.filter((input) => input.displayName !== 'Fallback Model');
	}

	const mainInputs = hasMainInput ? ['main' as NodeConnectionType] : [];
	return [...mainInputs, ...getInputData(specialInputs)];
}

export class AiAgentLangfuse implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AI Agent Langfuse',
		name: 'aiAgentLangfuse',
		icon: 'file:AiAgentLangfuse.svg',
		group: ['transform'],
		version: 1,
		description: 'AI Agent with built-in Langfuse prompt management and OTEL tracing',
		defaults: {
			name: 'AI Agent Langfuse',
			color: '#404040',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Agents', 'Root Nodes'],
			},
		},
		inputs: `={{
			((hasOutputParser, needsFallback) => {
				${getInputs.toString()};
				return getInputs(true, hasOutputParser, needsFallback);
			})(
				!!$parameter.hasOutputParser, 
				!!$parameter.needsFallback   
				)
		}}`,
		outputs: ['main'],
		credentials: [
			{
				name: 'openAiApiWithLangfuseApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Prompt Source',
				name: 'promptSource',
				type: 'options',
				options: [
					{
						name: 'Fetch from Langfuse',
						value: 'fetchFromLangfuse',
					},
					{
						name: 'Define Below',
						value: 'define',
					},
				],
				default: 'fetchFromLangfuse',
				description: 'Choose where to load the prompt from',
			},
			{
				displayName: 'Prompt',
				name: 'promptName',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a prompt...',
						typeOptions: {
							searchListMethod: 'searchPrompts',
							searchable: true,
						},
					},
					{
						displayName: 'By Name',
						name: 'name',
						type: 'string',
						placeholder: 'e.g. customer-support-agent',
					},
				],
				displayOptions: {
					show: {
						promptSource: ['fetchFromLangfuse'],
					},
				},
			},
			{
				displayName: 'Prompt Label Name or ID',
				name: 'promptLabel',
				type: 'options',
				default: 'production',
				required: true,
				description: 'Choose from the list, or specify an ID using an expression',
				typeOptions: {
					loadOptionsMethod: 'loadPromptLabels',
					loadOptionsDependsOn: ['promptName.value'],
				},
				options: [],
				displayOptions: {
					show: {
						promptSource: ['fetchFromLangfuse'],
					},
				},
			},
			{
				displayName: 'Prompt Variables',
				name: 'promptVariables',
				type: 'resourceMapper',
				noDataExpression: true,
				default: {
					mappingMode: 'defineBelow',
					value: null,
				},
				description: 'Provide values for variables in your prompt template. Variables like {{topic}} or {{country}} are automatically detected from your Langfuse prompt.',
				typeOptions: {
					loadOptionsDependsOn: ['promptName.value', 'promptLabel'],
					resourceMapper: {
						resourceMapperMethod: 'getMappingVariables',
						mode: 'add',
						fieldWords: {
							singular: 'prompt variable',
							plural: 'prompt variables',
						},
						addAllFields: true,
						multiKeyMatch: false,
						supportAutoMap: false,
					},
				},
				displayOptions: {
					show: {
						promptSource: ['fetchFromLangfuse'],
					},
				},
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				displayOptions: {
					show: {
						promptSource: ['define'],
					},
				},
				description: 'The input text for the agent',
			},
			{
				displayName: 'Require Specific Output Format',
				name: 'hasOutputParser',
				type: 'boolean',
				default: false,
				noDataExpression: true,
			},
			{
				displayName: 'Enable Fallback Model',
				name: 'needsFallback',
				type: 'boolean',
				default: false,
				noDataExpression: true,
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Maximum Iterations',
						name: 'maxIterations',
						type: 'number',
						default: 10,
						description: 'Maximum number of times the agent can iterate',
					},
					{
						displayName: 'Return Intermediate Steps',
						name: 'returnIntermediateSteps',
						type: 'boolean',
						default: false,
						description: 'Whether to return the intermediate steps taken by the agent',
					},
				],
			},
			{
				displayName: 'Session ID',
				name: 'sessionId',
				type: 'string',
				default: 'n8n-{{$execution.id}}',
				description: 'Session ID for grouping traces (supports {{$execution.id}} placeholder)',
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				description: 'Optional user ID for trace attribution',
			},
			{
				displayName: 'Tags',
				name: 'tags',
				type: 'string',
				default: '',
				description: 'Comma-separated tags for categorization',
			},
			{
				displayName: 'Additional Metadata (JSON)',
				name: 'metadata',
				type: 'json',
				default: '{}',
				description: 'Additional metadata to attach to traces',
			},
		],
	};

	methods = {
		loadOptions: {
			async loadPromptLabels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const promptNameRaw = this.getNodeParameter('promptName') as
						| string
						| { mode: string; value: string };

					const promptName = parsePromptName(promptNameRaw);

					if (!promptName) {
						return getDefaultLabels();
					}

					const credentials = (await this.getCredentials(
						'openAiApiWithLangfuseApi',
					)) as ICredentialDataDecryptedObject;

					const langfuseCredentials = {
						langfusePublicKey: credentials.langfusePublicKey as string,
						langfuseSecretKey: credentials.langfuseSecretKey as string,
						langfuseBaseUrl: credentials.langfuseBaseUrl as string,
					};

					const prompts = await fetchPrompts(this, langfuseCredentials);
					const selectedPrompt = prompts.find((p) => p.name === promptName);

					if (!selectedPrompt || !selectedPrompt.labels || selectedPrompt.labels.length === 0) {
						return getDefaultLabels();
					}

					return selectedPrompt.labels.map((label) => ({
						name: label,
						value: label,
					}));
				} catch (error) {
					return getDefaultLabels();
				}
			},
		},
		listSearch: {
			async searchPrompts(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				try {
					const credentials = (await this.getCredentials(
						'openAiApiWithLangfuseApi',
					)) as ICredentialDataDecryptedObject;

					const langfuseCredentials = {
						langfusePublicKey: credentials.langfusePublicKey as string,
						langfuseSecretKey: credentials.langfuseSecretKey as string,
						langfuseBaseUrl: credentials.langfuseBaseUrl as string,
					};

					const prompts = await fetchPrompts(this, langfuseCredentials);

					const results = prompts
						.filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()))
						.map((p) => {
							const latestVersion = p.versions ? Math.max(...p.versions) : 1;
							return {
								name: `${p.name} (v${latestVersion})`,
								value: p.name,
							};
						});

					return { results };
				} catch (error) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to fetch prompts: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			},
		},
		resourceMapping: {
			async getMappingVariables(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
				try {
					const promptNameRaw = this.getNodeParameter('promptName') as
						| string
						| { mode: string; value: string };
					const promptName = parsePromptName(promptNameRaw);
					const promptLabel = this.getNodeParameter('promptLabel') as string;

					if (!promptName || !promptLabel) {
						return { fields: [] };
					}

					const credentials = (await this.getCredentials(
						'openAiApiWithLangfuseApi',
					)) as ICredentialDataDecryptedObject;

					const langfuseCredentials = {
						langfusePublicKey: credentials.langfusePublicKey as string,
						langfuseSecretKey: credentials.langfuseSecretKey as string,
						langfuseBaseUrl: credentials.langfuseBaseUrl as string,
					};

					const promptResponse = (await this.helpers.httpRequest({
						method: 'GET',
						url: `${langfuseCredentials.langfuseBaseUrl}/api/public/v2/prompts/${encodeURIComponent(promptName)}?label=${encodeURIComponent(promptLabel)}`,
						auth: createAuthObject(langfuseCredentials),
					})) as LangfusePromptResponse;

					const variables = extractVariablesFromPrompt(promptResponse.prompt);

					const fields: ResourceMapperField[] = variables.map((variable) => ({
						id: variable,
						displayName: variable,
						required: false,
						defaultMatch: false,
						display: true,
						type: 'string',
						canBeUsedToMatch: false,
					}));

					return { fields };
				} catch (error) {
					return { fields: [] };
				}
			},
		},
	};

	async execute(
		this: IExecuteFunctions,
		response?: EngineResponse<RequestResponseMetadata>,
	): Promise<INodeExecutionData[][] | EngineRequest<RequestResponseMetadata>> {
		console.log('[AiAgentLangfuse] ===== Execute v2.0 called, response:', response ? 'YES' : 'NO', 'metadata:', response?.metadata);
		const items = this.getInputData();
		console.log('[AiAgentLangfuse] Items count:', items.length);
		const returnData: INodeExecutionData[] = [];
		let request: EngineRequest<RequestResponseMetadata> | undefined = undefined;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			console.log('[AiAgentLangfuse] Processing item:', itemIndex);
			// If we have a response with a specific itemIndex, only process that item
			// If response.metadata.itemIndex is undefined, this is the first execution, process all items
			if (response && response?.metadata?.itemIndex !== undefined && response?.metadata?.itemIndex !== itemIndex) {
				console.log('[AiAgentLangfuse] Skipping item', itemIndex, '- response is for item', response?.metadata?.itemIndex);
				// Skip items that don't match the response
				continue;
			}
			console.log('[AiAgentLangfuse] Executing item:', itemIndex);
			try {
				const credentials = (await this.getCredentials(
					'openAiApiWithLangfuseApi',
					itemIndex,
				)) as ICredentialDataDecryptedObject;

				const langfuseConfig = {
					publicKey: credentials.langfusePublicKey as string,
					secretKey: credentials.langfuseSecretKey as string,
					baseUrl: credentials.langfuseBaseUrl as string,
				};

				// Get options
				const options = this.getNodeParameter('options', itemIndex, {}) as {
					maxIterations?: number;
					returnIntermediateSteps?: boolean;
				};

				// Build steps from previous tool executions
				const steps = buildSteps(response, itemIndex);
				console.log('[AiAgentLangfuse] Steps from previous execution:', steps.length, 'steps:', JSON.stringify(steps, null, 2));

			// Get prompt messages
			const promptSource = this.getNodeParameter('promptSource', itemIndex) as string;

				let messages: Array<{ role: string; content: string }>;
				let promptMetadata: { name: string; version: number } | undefined;

				if (promptSource === 'fetchFromLangfuse') {
					const promptNameRaw = this.getNodeParameter('promptName', itemIndex) as
						| string
						| { mode: string; value: string };
					const promptName = parsePromptName(promptNameRaw);
					const promptLabel = this.getNodeParameter('promptLabel', itemIndex) as string;
					const promptVariablesRaw = this.getNodeParameter('promptVariables', itemIndex, {
						value: {},
					}) as {
						value: Record<string, string> | null;
					};

					const variables = promptVariablesRaw.value || {};

					const langfuseCredentials = {
						langfusePublicKey: credentials.langfusePublicKey as string,
						langfuseSecretKey: credentials.langfuseSecretKey as string,
						langfuseBaseUrl: credentials.langfuseBaseUrl as string,
					};

					const promptResponse = (await this.helpers.httpRequest({
						method: 'GET',
						url: `${langfuseCredentials.langfuseBaseUrl}/api/public/v2/prompts/${encodeURIComponent(promptName)}?label=${encodeURIComponent(promptLabel)}`,
						auth: createAuthObject(langfuseCredentials),
					})) as LangfusePromptResponse;

					promptMetadata = {
						name: promptResponse.name,
						version: promptResponse.version,
					};

					const promptTemplate = promptResponse.prompt;

					if (typeof promptTemplate === 'string') {
						let compiled = promptTemplate;
						for (const [key, value] of Object.entries(variables)) {
							const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
							compiled = compiled.replace(pattern, value);
						}
						messages = [{ role: 'user', content: compiled }];
					} else {
						messages = promptTemplate.map((msg) => {
							let compiledContent = msg.content;
							for (const [key, value] of Object.entries(variables)) {
								const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
								compiledContent = compiledContent.replace(pattern, value);
							}
							return {
								role: msg.role,
								content: compiledContent,
							};
						});
					}
				} else {
					const text = this.getNodeParameter('text', itemIndex) as string;
					messages = [{ role: 'user', content: text }];
				}

				// Setup Langfuse
				const sessionId = this.getNodeParameter('sessionId', itemIndex, '') as string;
				const userId = this.getNodeParameter('userId', itemIndex, '') as string;
				const tagsStr = this.getNodeParameter('tags', itemIndex, '') as string;
				const metadataStr = this.getNodeParameter('metadata', itemIndex, '{}') as string;

				const finalSessionId = ensureSessionId(sessionId, this.getExecutionId());
				const tags = tagsStr ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : [];
				let metadata: Record<string, string> = {};
				try {
					metadata = JSON.parse(metadataStr);
				} catch {
					metadata = {};
				}

				const langfuseClient = getLangfuseClient(langfuseConfig);

				let fetchedPrompt: any;
					// Fetch prompt for linking
					if (promptMetadata) {
						try {
							fetchedPrompt = await langfuseClient.getPrompt(
								promptMetadata.name,
								promptMetadata.version,
							);
						} catch (error) {
							console.warn('Failed to fetch prompt for linking:', error);
						}
					}

					// Create callback handler
				const callbackHandler = new CallbackHandler({
					publicKey: langfuseConfig.publicKey,
					secretKey: langfuseConfig.secretKey,
						baseUrl: langfuseConfig.baseUrl,
						sessionId: finalSessionId || undefined,
						userId: userId || undefined,
						tags: tags.length > 0 ? tags : undefined,
						metadata: {
							...metadata,
							executionId: this.getExecutionId(),
							workflowName: this.getWorkflow().name,
						},
					});

					// Wrap callbacks for token capture
					const originalHandleLLMEnd = (callbackHandler as any).handleLLMEnd?.bind(callbackHandler);
					if (originalHandleLLMEnd) {
						(callbackHandler as any).handleLLMEnd = async function(...args: any[]) {
							if (args[0]?.llmOutput?.estimatedTokenUsage && !args[0]?.llmOutput?.tokenUsage) {
								args[0].llmOutput.tokenUsage = {
									promptTokens: args[0].llmOutput.estimatedTokenUsage.promptTokens,
									completionTokens: args[0].llmOutput.estimatedTokenUsage.completionTokens,
									totalTokens: args[0].llmOutput.estimatedTokenUsage.totalTokens,
								};
							}
							return originalHandleLLMEnd(...args);
						};
					}

					// Get language model
					const languageModel = (await this.getInputConnectionData(
						'ai_languageModel',
						0,
					)) as BaseChatModel;

					if (!languageModel) {
						throw new NodeOperationError(
							this.getNode(),
							'No language model connected. Please connect an AI Language Model node.',
						);
					}

				// Get connected tools
				console.log('[AiAgentLangfuse] Getting connected tools...');
				const toolsData = (await this.getInputConnectionData('ai_tool', 0)) as
					| Array<DynamicStructuredTool | Tool>
					| DynamicStructuredTool
					| Tool
					| undefined;
				const tools: Array<DynamicStructuredTool | Tool> = [];
				if (toolsData && Array.isArray(toolsData)) {
					tools.push(...toolsData);
				} else if (toolsData) {
					tools.push(toolsData);
				}
				console.log('[AiAgentLangfuse] Got', tools.length, 'tools, metadata before fix:', tools.map(t => ({ name: t.name, metadata: t.metadata })));
				
				// Manually set sourceNodeName for tools that don't have it
				// Since tools don't have sourceNodeName, set it to the tool's own name as fallback
				// This works because the tool execution will look up by this name
				for (const tool of tools) {
					if (!tool.metadata) {
						tool.metadata = {};
					}
					if (!tool.metadata.sourceNodeName) {
						// Use the tool's display name as the source node name
						// This should match the actual node name in the workflow
						tool.metadata.sourceNodeName = tool.name;
						console.log('[AiAgentLangfuse] Set sourceNodeName for tool to:', tool.metadata.sourceNodeName);
					}
				}
				console.log('[AiAgentLangfuse] Tools after sourceNodeName fix:', tools.map(t => ({ name: t.name, metadata: t.metadata })));

					// Convert messages to LangChain format
					const langchainMessages = messages.map((msg) => {
						if (msg.role === 'system') {
							return new SystemMessage(msg.content);
						} else if (msg.role === 'assistant' || msg.role === 'ai') {
							return new AIMessage(msg.content);
						} else {
							return new HumanMessage(msg.content);
						}
					});

					// Create prompt template
					const prompt = ChatPromptTemplate.fromMessages([
						...langchainMessages.slice(0, -1),
						['human', '{input}'],
						new MessagesPlaceholder('agent_scratchpad'),
					]);

					// Create agent
					const executor = createAgentSequence(languageModel, tools, prompt, options);

				// Extract user input
				const lastMessage = langchainMessages[langchainMessages.length - 1];
				const userInput = typeof lastMessage.content === 'string'
					? lastMessage.content
					: Array.isArray(lastMessage.content)
					? lastMessage.content.map((c) => (typeof c === 'string' ? c : JSON.stringify(c))).join('')
					: String(lastMessage.content);

					// Use streaming
					const eventStream = executor.streamEvents(
						{
							steps,
							input: userInput,
						} as any,
						{
							version: 'v2',
							callbacks: [callbackHandler],
						},
					);

					console.log('[AiAgentLangfuse] Processing event stream...');
					const result = await processEventStream(
						this,
						eventStream,
						itemIndex,
						options.returnIntermediateSteps,
						undefined, // memory - add later if needed
						userInput,
					);
					console.log('[AiAgentLangfuse] Event stream processed, result:', { hasToolCalls: !!result.toolCalls, toolCallsCount: result.toolCalls?.length, outputLength: result.output?.length });

					// Flush Langfuse
					await langfuseClient.flushAsync();

					console.log('[AiAgentLangfuse] Checking for tool calls...');
					// If tool calls detected, return EngineRequest
					if (result.toolCalls && result.toolCalls.length > 0) {
						console.log('[AiAgentLangfuse] Tool calls detected:', result.toolCalls.length);
						const currentIteration = (response?.metadata?.iterationCount ?? 0) + 1;

						// Check max iterations
						if (options.maxIterations && currentIteration > options.maxIterations) {
							throw new NodeOperationError(this.getNode(), 'Maximum iterations reached');
						}

				const actions = (await createEngineRequests(result.toolCalls, itemIndex, tools)).filter(
					(action) => action !== undefined,
				) as any;

					console.log('[AiAgentLangfuse] Actions after filtering:', actions.length);

					// Only create EngineRequest if there are actual actions to execute
					// (built-in model tools get filtered out)
					if (actions.length > 0) {
						console.log('[AiAgentLangfuse] Creating EngineRequest with', actions.length, 'actions');
						request = {
							actions,
							metadata: {
								previousRequests: buildSteps(response, itemIndex),
								iterationCount: currentIteration,
								itemIndex,
							},
						};
						break; // Exit loop, return request
					} else {
						console.log('[AiAgentLangfuse] No valid actions (all were built-in tools), treating as final result');
						// All tool calls were built-in tools, treat as no external tool calls
						// Fall through to return final result
					}
					}

					console.log('[AiAgentLangfuse] No tool calls - returning final result');
					// No tool calls - return final result
					const itemResult: INodeExecutionData = {
						json: omit(
							{
								output: result.output,
								...(options.returnIntermediateSteps &&
									result.intermediateSteps && { intermediateSteps: result.intermediateSteps }),
								sessionId: finalSessionId,
								...(promptMetadata && { prompt: promptMetadata }),
							},
							'input',
							'steps',
						),
						pairedItem: { item: itemIndex },
					};

					returnData.push(itemResult);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error instanceof Error ? error.message : String(error),
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw error;
			}
		}

		// Return request if we have tool calls to execute
		if (request) {
			return request;
		}

		// Otherwise return execution data
		return [returnData];
	}
}
