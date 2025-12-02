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
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { CallbackHandler } from 'langfuse-langchain';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createToolCallingAgent } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
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

				const promptSource = this.getNodeParameter('promptSource', itemIndex) as string;
				const sessionId = this.getNodeParameter('sessionId', itemIndex, '') as string;
				const userId = this.getNodeParameter('userId', itemIndex, '') as string;
				const tagsStr = this.getNodeParameter('tags', itemIndex, '') as string;
				const metadataStr = this.getNodeParameter('metadata', itemIndex, '{}') as string;

				const finalSessionId = ensureSessionId(
					sessionId,
					this.getExecutionId(),
				);

				const tags = tagsStr
					? tagsStr.split(',').map((t) => t.trim()).filter(Boolean)
					: [];

				let metadata: Record<string, string> = {};
				try {
					metadata = JSON.parse(metadataStr);
				} catch {
					metadata = {};
				}

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

				console.log('[Langfuse Debug] 📁 Node file:', __filename);
				console.log('[Langfuse Debug] ⚡ Node execution starting...');
				
				const langfuseClient = getLangfuseClient(langfuseConfig);

				let fetchedPrompt: any;
				if (promptMetadata) {
					try {
						fetchedPrompt = await langfuseClient.getPrompt(
							promptMetadata.name,
							promptMetadata.version,
						);
						console.log('[Langfuse Debug] Fetched prompt for linking:', {
							name: promptMetadata.name,
							version: promptMetadata.version,
							promptType: typeof fetchedPrompt,
						});
					} catch (error) {
						console.warn('Failed to fetch prompt for linking:', error);
					}
				}

				// Use CallbackHandler for automatic tracing with proper prompt linking
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

				console.log('[Langfuse Debug] CallbackHandler created', {
					sessionId: finalSessionId,
					userId,
					hasPrompt: !!fetchedPrompt,
					hasHandleLLMEnd: typeof callbackHandler.handleLLMEnd === 'function',
					hasHandleLLMStart: typeof callbackHandler.handleLLMStart === 'function',
				});

				// Get language model from n8n connection
				const languageModel = (await this.getInputConnectionData(
					'ai_languageModel',
					0,
				)) as any;

				if (!languageModel || !languageModel.invoke) {
					throw new NodeOperationError(
						this.getNode(),
						'No language model connected. Please connect an AI Language Model node.',
					);
				}

				console.log('[Langfuse Debug] Language model type:', languageModel.constructor.name);
				console.log('[Langfuse Debug] Model inspection:', {
					hasInvoke: !!languageModel.invoke,
					hasBindTools: typeof languageModel.bindTools === 'function',
					hasMetadata: !!languageModel.metadata,
					modelName: languageModel.modelName,
				});

				// Get tools from n8n connections
				const tools: any[] = [];
				const toolsData = await this.getInputConnectionData('ai_tool', 0);
				if (toolsData && Array.isArray(toolsData)) {
					tools.push(...toolsData);
				}
				
				// Get tools from model metadata (built-in tools)
				const modelTools = (languageModel.metadata?.tools) || [];
				console.log('[Langfuse Debug] Tools:', {
					connectedTools: tools.length,
					modelTools: modelTools.length,
				});
				
				// Combine all tools
				const allTools = [...tools, ...modelTools];

				// Convert messages to LangChain format and create prompt
				const langchainMessages = messages.map((msg) => {
					if (msg.role === 'system') {
						return new SystemMessage(msg.content);
					} else if (msg.role === 'assistant' || msg.role === 'ai') {
						return new AIMessage(msg.content);
					} else {
						return new HumanMessage(msg.content);
					}
				});

				const promptName = promptMetadata?.name || 'AI Agent';
				console.log('[Langfuse Debug] Creating agent with:', {
					promptName,
					toolCount: allTools.length,
					messageCount: langchainMessages.length,
				});

				// Use toolCallingAgent like V3 does
				let response: any;
				
				if (allTools.length > 0) {
					// Create prompt template for agent
					// Must include placeholders for input and agent_scratchpad
					const prompt = ChatPromptTemplate.fromMessages([
						...langchainMessages.slice(0, -1), // All messages except the last user message
						['human', '{input}'], // User input placeholder
						new MessagesPlaceholder('agent_scratchpad'), // Agent's working memory
					]);
					
					// Create agent with tools
					const agent = createToolCallingAgent({
						llm: languageModel,
						tools: allTools,
						prompt,
						streamRunnable: false,
					});
					
					console.log('[Langfuse Debug] ✅ Created toolCallingAgent');
					
					// Extract the user's input (last message content)
					const userInput = typeof langchainMessages[langchainMessages.length - 1].content === 'string'
						? langchainMessages[langchainMessages.length - 1].content
						: String(langchainMessages[langchainMessages.length - 1].content);
					
					// Invoke agent with proper parameters
					// Agent expects: { steps: [], input: string, ...other_vars }
					// TypeScript types are strict but runtime accepts input parameter
					// CRITICAL: Pass callbacks via config parameter for agent to use them
					response = await agent.invoke(
						{
							steps: [], // Initial call has no previous steps
							input: userInput, // User's message
						} as any,
						{
							runName: `AI Agent: ${promptName}`,
							callbacks: [callbackHandler],
						},
					);
				} else {
					// No tools - invoke model directly with callbacks
					response = await languageModel.invoke(langchainMessages, {
						runName: `AI Agent: ${promptName}`,
						callbacks: [callbackHandler],
					});
				}

				// Wait for Langfuse to flush events
				await langfuseClient.flushAsync();
				console.log('[Langfuse Debug] Langfuse events flushed');

				// Extract output from agent result
				// Agent responses have structure: { output: string, ... }
				// Direct model invocations return BaseMessage
				let output: any;
				if (response?.output) {
					// Agent response
					output = response.output;
				} else if (response?.content) {
					// Direct model response (BaseMessage)
					output = response.content;
				} else {
					// Fallback
					output = response;
				}
				
				console.log('[Langfuse Debug] Response structure:', {
					hasOutput: !!response?.output,
					hasContent: !!response?.content,
					outputType: typeof output,
				});

				returnData.push({
					json: {
						output,
						sessionId: finalSessionId,
						...(promptMetadata && { prompt: promptMetadata }),
					},
					pairedItem: { item: itemIndex },
				});
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

		return [returnData];
	}
}
