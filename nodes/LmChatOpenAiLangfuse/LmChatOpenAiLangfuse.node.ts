import { ChatOpenAI, type ChatOpenAIFields, type ClientOptions } from '@langchain/openai';
import { Langfuse } from 'langfuse-langchain';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import { CustomLangfuseHandler } from './CustomLangfuseHandler';
import pick from 'lodash/pick';
import get from 'lodash/get';
import {
	NodeConnectionTypes,
	type INodeProperties,
	type IDataObject,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

import { formatBuiltInTools, prepareAdditionalResponsesParams } from './helpers/common';
import { searchModels } from './methods/loadModels';
import { N8nLlmTracing } from './N8nLlmTracing';

export class LmChatOpenAiLangfuse implements INodeType {
	methods = {
		listSearch: {
			searchModels,
		},
	};

	description: INodeTypeDescription = {
		displayName: 'OpenAI Chat Model with Langfuse',
		name: 'lmChatOpenAiLangfuse',
		icon: 'file:openAiLight.svg',
		group: ['transform'],
		version: [1, 1.3],
		description: 'OpenAI Chat Model with Langfuse tracing for advanced usage with AI chains and agents',
		defaults: {
			name: 'OpenAI Chat Model with Langfuse',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'openAiApiWithLangfuseApi',
				required: true,
			},
		],
		requestDefaults: {
			ignoreHttpStatusErrors: true,
			baseURL:
				'={{ $parameter.options?.baseURL?.split("/").slice(0,-1).join("/") || "https://api.openai.com" }}',
		},
		properties: [
			{
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: 'gpt-4o-mini',
				description: 'The model to use for completion',
				displayOptions: {
					show: {
						'@version': [{ _cnd: { lt: 1.3 } }],
					},
				},
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'resourceLocator',
				default: { mode: 'list', value: 'gpt-4o-mini' },
				required: true,
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a model...',
						typeOptions: {
							searchListMethod: 'searchModels',
							searchable: true,
						},
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						placeholder: 'gpt-4o-mini',
					},
				],
				description: 'The model to use. Choose from the list, or specify an ID.',
				displayOptions: {
					show: {
						'@version': [{ _cnd: { gte: 1.3 } }],
					},
				},
			},
			{
				displayName: 'Use Responses API',
				name: 'responsesApiEnabled',
				type: 'boolean',
				default: true,
				description: 'Whether to use the Responses API (supports built-in tools like web search)',
				displayOptions: {
					show: {
						'@version': [{ _cnd: { gte: 1.3 } }],
					},
				},
			},
			{
				displayName: 'Built-in Tools',
				name: 'builtInTools',
				placeholder: 'Add Built-in Tool',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Web Search',
						name: 'webSearch',
						type: 'collection',
						default: { searchContextSize: 'medium' },
						options: [
							{
								displayName: 'Search Context Size',
								name: 'searchContextSize',
								type: 'options',
								default: 'medium',
								options: [
									{ name: 'Low', value: 'low' },
									{ name: 'Medium', value: 'medium' },
									{ name: 'High', value: 'high' },
								],
							},
							{
								displayName: 'Allowed Domains',
								name: 'allowedDomains',
								type: 'string',
								default: '',
								description: 'Comma-separated list of domains to search',
								placeholder: 'e.g. google.com, wikipedia.org',
							},
							{
								displayName: 'Country',
								name: 'country',
								type: 'string',
								default: '',
								placeholder: 'e.g. US, GB',
							},
							{
								displayName: 'City',
								name: 'city',
								type: 'string',
								default: '',
								placeholder: 'e.g. New York, London',
							},
							{
								displayName: 'Region',
								name: 'region',
								type: 'string',
								default: '',
								placeholder: 'e.g. New York, London',
							},
						],
					},
					{
						displayName: 'File Search',
						name: 'fileSearch',
						type: 'collection',
						default: { vectorStoreIds: '[]' },
						options: [
							{
								displayName: 'Vector Store IDs',
								name: 'vectorStoreIds',
								type: 'json',
								default: '[]',
								required: true,
							},
							{
								displayName: 'Filters',
								name: 'filters',
								type: 'json',
								default: '{}',
							},
							{
								displayName: 'Max Results',
								name: 'maxResults',
								type: 'number',
								default: 1,
								typeOptions: { minValue: 1, maxValue: 50 },
							},
						],
					},
					{
						displayName: 'Code Interpreter',
						name: 'codeInterpreter',
						type: 'boolean',
						default: true,
						description: 'Whether to allow the model to execute code',
					},
				],
				displayOptions: {
					show: {
						'@version': [{ _cnd: { gte: 1.3 } }],
						responsesApiEnabled: [true],
					},
				},
			},
			{
				displayName: 'Langfuse Tracking',
				name: 'langfuseTracking',
				type: 'collection',
				default: {},
				placeholder: 'Add Tracking Field',
				description: 'Optional fields for enhanced Langfuse observability',
				options: [
					{
						displayName: 'Session ID',
						name: 'sessionId',
						type: 'string',
						default: '',
						description:
							'Session identifier for grouping related traces. Use expressions to include dynamic values.',
						placeholder: 'e.g. {{ $json.sessionId }}',
					},
					{
						displayName: 'User ID',
						name: 'userId',
						type: 'string',
						default: '',
						description:
							'User identifier for tracking user-specific traces. Use expressions to include dynamic values.',
						placeholder: 'e.g. {{ $json.userId }}',
					},
					{
						displayName: 'Tags',
						name: 'tags',
						type: 'string',
						default: '',
						description:
							'Comma-separated tags for categorizing traces. Use expressions to include dynamic values.',
						placeholder: 'e.g. production, customer-support',
					},
					{
						displayName: 'Custom Metadata',
						name: 'metadata',
						type: 'json',
						default: '{}',
						description:
							'Additional metadata as JSON object. This will be merged with execution context.',
						placeholder: '{ "customField": "value" }',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				default: {},
				placeholder: 'Add Option',
				options: [
					{
						displayName: 'Base URL',
						name: 'baseURL',
						type: 'string',
						default: 'https://api.openai.com/v1',
						description: 'Override the default base URL',
					},
					{
						displayName: 'Temperature',
						name: 'temperature',
						type: 'number',
						default: 0.7,
						typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
						description: 'Controls randomness in responses',
					},
					{
						displayName: 'Maximum Tokens',
						name: 'maxTokens',
						type: 'number',
						default: -1,
						description: 'Maximum tokens to generate (-1 for no limit)',
					},
					{
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						type: 'number',
						default: 0,
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 1 },
					},
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						type: 'number',
						default: 0,
						typeOptions: { minValue: -2, maxValue: 2, numberPrecision: 1 },
					},
					{
						displayName: 'Response Format',
						name: 'responseFormat',
						type: 'options',
						default: 'text',
						description:
							'Choose Text or JSON. JSON ensures the model returns valid JSON (not available when Responses API is enabled)',
						options: [
							{ name: 'Text', value: 'text' },
							{ name: 'JSON', value: 'json_object' },
						],
						displayOptions: {
							show: {
								'/responsesApiEnabled': [false],
							},
						},
					},
					{
						displayName: 'Reasoning Effort',
						name: 'reasoningEffort',
						default: 'medium',
						description:
							'Controls the amount of reasoning tokens to use. "low" favors speed, "high" favors complete reasoning',
						type: 'options',
						options: [
							{ name: 'Low', value: 'low', description: 'Favors speed and economical token usage' },
							{
								name: 'Medium',
								value: 'medium',
								description: 'Balance between speed and reasoning accuracy',
							},
							{
								name: 'High',
								value: 'high',
								description: 'Favors complete reasoning at the cost of more tokens',
							},
						],
						displayOptions: {
							show: {
								'/model': [{ _cnd: { regex: '(^o1([-\\d]+)?$)|(^o[3-9].*)|(^gpt-5.*)' } }],
							},
						},
					},
					{
						displayName: 'Top P',
						name: 'topP',
						type: 'number',
						default: 1,
						typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 1 },
						description:
							'Controls diversity via nucleus sampling. We generally recommend altering this or temperature but not both',
					},
					{
						displayName: 'Timeout',
						name: 'timeout',
						type: 'number',
						default: 60000,
						description: 'Maximum amount of time a request is allowed to take in milliseconds',
					},
					{
						displayName: 'Max Retries',
						name: 'maxRetries',
						type: 'number',
						default: 2,
						description: 'Maximum number of retries to attempt',
					},
					{
						displayName: 'Conversation ID',
						name: 'conversationId',
						default: '',
						description:
							'The conversation that this response belongs to (Responses API only)',
						type: 'string',
						displayOptions: {
							show: {
								'@version': [{ _cnd: { gte: 1.3 } }],
								'/responsesApiEnabled': [true],
							},
						},
					},
					{
						displayName: 'Prompt Cache Key',
						name: 'promptCacheKey',
						type: 'string',
						default: '',
						description:
							'Used by OpenAI to cache responses for similar requests (Responses API only)',
						displayOptions: {
							show: {
								'@version': [{ _cnd: { gte: 1.3 } }],
								'/responsesApiEnabled': [true],
							},
						},
					},
					{
						displayName: 'Safety Identifier',
						name: 'safetyIdentifier',
						type: 'string',
						default: '',
						description:
							"A stable identifier used to help detect users violating OpenAI's usage policies (Responses API only)",
						displayOptions: {
							show: {
								'@version': [{ _cnd: { gte: 1.3 } }],
								'/responsesApiEnabled': [true],
							},
						},
					},
					{
						displayName: 'Service Tier',
						name: 'serviceTier',
						type: 'options',
						default: 'auto',
						description: 'The service tier to use for the request (Responses API only)',
						options: [
							{ name: 'Auto', value: 'auto' },
							{ name: 'Flex', value: 'flex' },
							{ name: 'Default', value: 'default' },
							{ name: 'Priority', value: 'priority' },
						],
						displayOptions: {
							show: {
								'@version': [{ _cnd: { gte: 1.3 } }],
								'/responsesApiEnabled': [true],
							},
						},
					},
					{
						displayName: 'Metadata',
						name: 'metadata',
						type: 'json',
						description:
							'Set of key-value pairs (max 16) that can be attached to an object (Responses API only)',
						default: '{}',
						displayOptions: {
							show: {
								'@version': [{ _cnd: { gte: 1.3 } }],
								'/responsesApiEnabled': [true],
							},
						},
					},
					{
						displayName: 'Top Logprobs',
						name: 'topLogprobs',
						type: 'number',
						default: 0,
						description:
							'Number of most likely tokens to return at each position (0-20, Responses API only)',
						typeOptions: { minValue: 0, maxValue: 20 },
						displayOptions: {
							show: {
								'@version': [{ _cnd: { gte: 1.3 } }],
								'/responsesApiEnabled': [true],
							},
						},
					},
					{
						displayName: 'Text Format',
						name: 'textFormat',
						type: 'fixedCollection',
						default: {},
						description: 'Response format and verbosity settings (Responses API only)',
						displayOptions: {
							show: {
								'@version': [{ _cnd: { gte: 1.3 } }],
								'/responsesApiEnabled': [true],
							},
						},
						options: [
							{
								displayName: 'Text Options',
								name: 'textOptions',
								values: [
									{
										displayName: 'Type',
										name: 'type',
										type: 'options',
										default: 'text',
										options: [
											{ name: 'Text', value: 'text' },
											{ name: 'JSON Object', value: 'json_object' },
											{ name: 'JSON Schema', value: 'json_schema' },
										],
										description: 'Format type for the response',
									},
									{
										displayName: 'Verbosity',
										name: 'verbosity',
										type: 'options',
										default: 'concise',
										options: [
											{ name: 'Concise', value: 'concise' },
											{ name: 'Detailed', value: 'detailed' },
										],
										description: 'Level of detail in the response',
									},
									{
										displayName: 'Schema Name',
										name: 'name',
										type: 'string',
										default: '',
										description: 'Name for the JSON schema (required for json_schema type)',
										displayOptions: {
											show: {
												type: ['json_schema'],
											},
										},
									},
									{
										displayName: 'Schema',
										name: 'schema',
										type: 'json',
										default: '{}',
										description: 'JSON schema for structured output (required for json_schema type)',
										displayOptions: {
											show: {
												type: ['json_schema'],
											},
										},
									},
								],
							},
						],
					},
					{
						displayName: 'Prompt Config',
						name: 'promptConfig',
						type: 'fixedCollection',
						default: {},
						description: 'Configure a predefined prompt with variables (Responses API only)',
						displayOptions: {
							show: {
								'@version': [{ _cnd: { gte: 1.3 } }],
								'/responsesApiEnabled': [true],
							},
						},
						options: [
							{
								displayName: 'Prompt Options',
								name: 'promptOptions',
								values: [
									{
										displayName: 'Prompt ID',
										name: 'promptId',
										type: 'string',
										default: '',
										description: 'ID of the prompt to use',
									},
									{
										displayName: 'Version',
										name: 'version',
										type: 'string',
										default: '',
										description: 'Version of the prompt to use',
									},
									{
										displayName: 'Variables',
										name: 'variables',
										type: 'json',
										default: '{}',
										description: 'Variables to substitute in the prompt',
									},
								],
							},
						],
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('openAiApiWithLangfuseApi');

		// Get model - handle both version 1 (string) and 1.3+ (resource locator)
		const nodeVersion = this.getNode().typeVersion;
		const modelName =
			nodeVersion >= 1.3
				? (this.getNodeParameter('model.value', itemIndex) as string)
				: (this.getNodeParameter('model', itemIndex) as string);

		// Get Responses API configuration
		const responsesApiEnabled = this.getNodeParameter(
			'responsesApiEnabled',
			itemIndex,
			false,
		) as boolean;

		// Get options
		const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;

		// Configure OpenAI client
		const configuration: ClientOptions = {};
		if (options.baseURL) {
			configuration.baseURL = options.baseURL as string;
		}

		const includedOptions = pick(options, [
			'frequencyPenalty',
			'maxTokens',
			'presencePenalty',
			'temperature',
			'topP',
			]) as Partial<ChatOpenAIFields>;

		// Always add N8nLlmTracing for UI feedback and token tracking
		const callbacks: any[] = [new N8nLlmTracing(this)];

		// Create Langfuse callback handler from credentials
		if (credentials.langfusePublicKey) {
			// Get Langfuse tracking fields
			const langfuseTracking = this.getNodeParameter(
				'langfuseTracking',
				itemIndex,
				{},
			) as IDataObject;

			// Add execution context to metadata
			const metadata: Record<string, unknown> = {
				executionId: this.getExecutionId(),
			};
			const workflowName = this.getWorkflow().name;
			if (workflowName) {
				metadata.workflowName = workflowName;
			}

			// Merge custom metadata from Langfuse tracking
			if (langfuseTracking.metadata) {
				try {
					const customMetadata =
						typeof langfuseTracking.metadata === 'string'
							? JSON.parse(langfuseTracking.metadata)
							: langfuseTracking.metadata;
					Object.assign(metadata, customMetadata);
				} catch (error) {
					// If parsing fails, skip custom metadata
					console.warn('Failed to parse Langfuse custom metadata:', error);
				}
			}

			// Build CallbackHandler options
			// Create unique trace ID per agent node to avoid conflicts when multiple agents exist in workflow
			const executionId = this.getExecutionId();
			const nodeId = this.getNode().id;
			const nodeName = this.getNode().name;
			// Use format: executionId-nodeId to make it unique per agent in the workflow execution
			const traceId = `${executionId}-${nodeId}`;
			const traceName = workflowName ? `${workflowName} - ${nodeName}` : nodeName;
			
			// Create Langfuse client and trace
			const langfuseClient = new Langfuse({
				publicKey: credentials.langfusePublicKey as string,
				secretKey: credentials.langfuseSecretKey as string,
				baseUrl: (credentials.langfuseBaseUrl as string) || 'https://cloud.langfuse.com',
			});
			
			// Create trace with custom ID, name, and metadata
			const trace = langfuseClient.trace({
				id: traceId,
				name: traceName,
				metadata,
			});
			
			// Pass trace as root to group all LLM calls under this trace
			// Use model name for generation observations (e.g., "gpt-5.1")
			// while trace keeps the workflow-node format
			const generationName = modelName;
			const callbackOptions: any = {
				root: trace,
				updateRoot: true, // Update trace with final input/output
			};

			// Add optional Langfuse tracking fields
			if (langfuseTracking.sessionId) {
				callbackOptions.sessionId = langfuseTracking.sessionId as string;
			}
			if (langfuseTracking.userId) {
				callbackOptions.userId = langfuseTracking.userId as string;
			}
			if (langfuseTracking.tags) {
				// Convert comma-separated string to array
				const tagsString = langfuseTracking.tags as string;
				callbackOptions.tags = tagsString
					.split(',')
					.map((tag) => tag.trim())
					.filter(Boolean);
			}

			const langfuseCallback = new CustomLangfuseHandler(callbackOptions, generationName, traceName);

			// CRITICAL: Wrap handleLLMEnd to transform estimatedTokenUsage to tokenUsage
			const originalHandleLLMEnd = (langfuseCallback as any).handleLLMEnd?.bind(langfuseCallback);
			if (originalHandleLLMEnd) {
				(langfuseCallback as any).handleLLMEnd = async function (...args: any[]) {
					const output = args[0];

					// Try to get token usage from multiple sources
					let tokenUsage = output?.llmOutput?.tokenUsage;

					// Fallback 1: estimatedTokenUsage (common with tool calls)
					if (!tokenUsage && output?.llmOutput?.estimatedTokenUsage) {
						tokenUsage = {
							promptTokens: output.llmOutput.estimatedTokenUsage.promptTokens,
							completionTokens: output.llmOutput.estimatedTokenUsage.completionTokens,
							totalTokens: output.llmOutput.estimatedTokenUsage.totalTokens,
						};
					}

					// Fallback 2: usage_metadata (from message)
					if (!tokenUsage) {
						const lastResponse =
							output.generations?.[output.generations.length - 1]?.[
								output.generations[output.generations.length - 1].length - 1
							];
						const usageMetadata = lastResponse?.message?.usage_metadata;
						if (usageMetadata) {
							tokenUsage = {
								promptTokens: usageMetadata.input_tokens ?? usageMetadata.promptTokens ?? 0,
								completionTokens:
									usageMetadata.output_tokens ?? usageMetadata.completionTokens ?? 0,
								totalTokens: usageMetadata.total_tokens ?? usageMetadata.totalTokens ?? 0,
							};
						}
					}

					// Ensure tokenUsage exists in llmOutput
					if (tokenUsage) {
						args[0] = {
							...output,
							llmOutput: {
								...output.llmOutput,
								tokenUsage,
							},
						};
					}

					return originalHandleLLMEnd(...args);
				};
			}

			callbacks.push(langfuseCallback);
		}

		// Prepare model kwargs for Responses API
		const modelKwargs: Record<string, unknown> = {};
		if (responsesApiEnabled) {
			const kwargs = prepareAdditionalResponsesParams(options);
			Object.assign(modelKwargs, kwargs);
		}

		const fields: ChatOpenAIFields = {
			apiKey: credentials.apiKey as string,
			model: modelName,
			...includedOptions,
			timeout: (options.timeout as number) ?? 60000,
			maxRetries: (options.maxRetries as number) ?? 2,
			configuration,
			callbacks,
			modelKwargs,
		};

		// Handle response format for non-Responses API mode
		if (!responsesApiEnabled && options.responseFormat) {
			const responseFormat = options.responseFormat as string;
			if (responseFormat === 'json_object') {
				fields.modelKwargs = {
					...fields.modelKwargs,
					response_format: { type: 'json_object' },
				};
			}
		}

		// Force Responses API if enabled
		if (responsesApiEnabled) {
			fields.useResponsesApi = true;
		}

		const model = new ChatOpenAI(fields);

		// Add built-in tools to model metadata for agent usage
		if (responsesApiEnabled) {
			const tools = formatBuiltInTools(
				this.getNodeParameter('builtInTools', itemIndex, {}) as IDataObject,
			);
			if (tools.length) {
				model.metadata = {
					...model.metadata,
					tools,
				};
			}
		}

		return {
			response: model,
		};
	}
}
