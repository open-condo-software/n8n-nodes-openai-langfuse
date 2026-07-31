import { type AnonymousLlmMessage, CallbackHandler, type LlmMessage } from 'langfuse-langchain'
import type { Serialized } from '@langchain/core/load/serializable';
import { BaseMessage, type MessageContent } from '@langchain/core/messages'
import { type LLMResult } from '@langchain/core/outputs'
import {
	appendAvailableToolsToInput,
	extractBoundToolsFromExtraParams,
} from './extractBoundTools'
import {
	buildStreamingLangfuseMetadata,
	isEmptyContent,
	mergeStreamingTag,
	resolveAssistantOutput,
} from './resolveAssistantOutput'

type StreamRunStats = {
	tokenEvents: number;
	aggregatedText: string;
};

/**
 * Custom Langfuse CallbackHandler that overrides observation names
 * to use our custom naming instead of the default "ChatOpenAI"
 * and preserves trace name when updateRoot is enabled
 */
export class CustomLangfuseHandler extends CallbackHandler {
	private customName: string;
	private originalTraceName?: string;
	private environment?: string;
	private baseTags: string[];
	private streamStatsByRunId = new Map<string, StreamRunStats>();

	// Ensure LangChain waits for async Langfuse updates (critical for streaming)
	awaitHandlers = true;

	constructor(params: any, customName: string, traceName?: string, baseTags: string[] = []) {
		super(params);
		this.customName = customName;
		this.originalTraceName = traceName;
		this.environment = params?.environment;
		this.baseTags = baseTags;

		(this as any).extractChatMessageContent = (message: BaseMessage): LlmMessage | AnonymousLlmMessage | MessageContent => {
			if (message.getType() === 'ai') {
				return resolveAssistantOutput(message) as LlmMessage;
			}

			let response = undefined;

			if (message.getType() === "human") {
				response = { content: message.content, role: "user" };
			} else if (message.getType() === "generic") {
				response = {
					content: message.content,
					role: "human",
				};
			} else if (message.getType() === "system") {
				response = { content: message.content, role: "system" };
			} else if (message.getType() === "function") {
				response = {
					content: message.content,
					additional_kwargs: message.additional_kwargs,
					role: message.name,
				};
			} else if (message.getType() === "tool") {
				response = {
					content: message.content,
					additional_kwargs: message.additional_kwargs,
					role: message.name,
				};
			} else if (!message.name) {
				response = { content: message.content };
			} else {
				response = {
					role: message.name,
					content: message.content,
				};
			}

			if (
				(message.additional_kwargs.function_call ||
					message.additional_kwargs.tool_calls) &&
				(response as any)["tool_calls"] === undefined
			) {
				return { ...response, additional_kwargs: message.additional_kwargs };
			}

			return response;
		};
	}

	async handleLLMNewToken(
		token: string,
		idx: any,
		runId: string,
		parentRunId?: string,
		tags?: string[],
		fields?: any,
	): Promise<void> {
		if (runId) {
			const stats = this.streamStatsByRunId.get(runId) ?? {
				tokenEvents: 0,
				aggregatedText: '',
			};
			stats.tokenEvents += 1;
			if (token) {
				stats.aggregatedText += token;
			}
			this.streamStatsByRunId.set(runId, stats);
		}
		return super.handleLLMNewToken(token, idx, runId, parentRunId, tags, fields);
	}

	/**
	 * Enrich generation input with bound tools from invocation_params.
	 * langfuse-langchain JS only logs messages; Python SDK also appends tools.
	 * Without this, traces look like "system + user only" and hide why the model
	 * could/couldn't call tools.
	 */
	private enrichGenerationInputAndMetadata (
		messages: unknown[],
		extraParams?: Record<string, unknown>,
		metadata?: Record<string, unknown>,
	): { input: unknown[]; metadata?: Record<string, unknown> } {
		const boundTools = extractBoundToolsFromExtraParams(extraParams)
		const input = appendAvailableToolsToInput(messages, boundTools)

		if (!boundTools) {
			return { input, metadata }
		}

		return {
			input,
			metadata: {
				...metadata,
				tools_count: boundTools.toolsCount,
				tool_choice: boundTools.toolChoice ?? 'auto',
				// Compact list for filters in Langfuse UI
				tool_names: boundTools.tools.map((tool) => tool.name),
			},
		}
	}

	// Override handleChatModelStart to use custom name + log bound tools
	async handleChatModelStart (
		llm: Serialized,
		messages: BaseMessage[][],
		runId: string,
		parentRunId?: string,
		extraParams?: Record<string, unknown>,
		tags?: string[],
		metadata?: Record<string, unknown>,
		name?: string,
	): Promise<void> {
		const prompts = messages.flatMap((row) =>
			row.map((message) => (this as any).extractChatMessageContent(message)),
		)
		const { input, metadata: enrichedMetadata } = this.enrichGenerationInputAndMetadata(
			prompts,
			extraParams,
			metadata,
		)

		return this.handleGenerationStart(
			llm,
			input,
			runId,
			parentRunId,
			extraParams,
			tags,
			enrichedMetadata,
			this.customName,
		)
	}

	// Override handleLLMStart to use custom name + log bound tools when present
	async handleLLMStart (
		llm: Serialized,
		prompts: string[],
		runId: string,
		parentRunId?: string,
		extraParams?: Record<string, unknown>,
		tags?: string[],
		metadata?: Record<string, unknown>,
		name?: string,
	): Promise<void> {
		const { input, metadata: enrichedMetadata } = this.enrichGenerationInputAndMetadata(
			prompts,
			extraParams,
			metadata,
		)

		return this.handleGenerationStart(
			llm,
			input,
			runId,
			parentRunId,
			extraParams,
			tags,
			enrichedMetadata,
			this.customName,
		)
	}

	// Override handleGenerationStart to use custom name
	async handleGenerationStart (
		llm: Serialized,
		messages: any[],
		runId: string,
		parentRunId?: string,
		extraParams?: Record<string, unknown>,
		tags?: string[],
		metadata?: Record<string, unknown>,
		name?: string,
	): Promise<void> {
		return super.handleGenerationStart(
			llm,
			messages,
			runId,
			parentRunId,
			extraParams,
			tags,
			metadata,
			this.customName,
		)
	}

	// Override generateTrace to preserve original trace name
	generateTrace(
		runName: string,
		runId: string,
		parentRunId: string | undefined,
		tags?: string[],
		metadata?: Record<string, unknown>,
		input?: any,
	): void {
		if (this.rootProvided && this.updateRoot && !parentRunId && this.originalTraceName) {
			if (!this.traceId) {
				const params = {
					name: this.originalTraceName,
					metadata: this.joinTagsAndMetaData(tags, metadata, this.metadata),
					userId: this.userId,
					version: this.version,
					sessionId: this.sessionId,
					environment: this.environment,
					input: input,
					tags: this.tags,
				};
				this.langfuse.trace({
					id: runId,
					...params,
				});
				this.traceId = runId;
				(this as any).topLevelObservationId = runId;
				return;
			}

			const updateParams = {
				metadata: this.joinTagsAndMetaData(tags, metadata, this.metadata),
				userId: this.userId,
				version: this.version,
				sessionId: this.sessionId,
				environment: this.environment,
				input: input,
				tags: this.tags,
			};

			if ((this as any).rootObservationId) {
				this.langfuse._updateSpan({
					id: (this as any).rootObservationId,
					traceId: this.traceId,
					...updateParams,
				});
			} else {
				this.langfuse.trace({
					id: this.traceId,
					...updateParams,
				});
			}

			(this as any).topLevelObservationId = runId;
			return;
		}

		const nameToUse = this.originalTraceName || runName;
		super.generateTrace(nameToUse, runId, parentRunId, tags, metadata, input);
	}

	async handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string | undefined): Promise<void> {
		const streamStats = this.streamStatsByRunId.get(runId);
		this.streamStatsByRunId.delete(runId);
		const streamedText = streamStats?.aggregatedText;
		const wasStreaming = Boolean(streamStats && streamStats.tokenEvents > 0);

		let resolvedAssistantText: string | undefined;
		let textAggregated = false;

		// Normalize streaming / Responses API generations so Langfuse gets real text
		// instead of null when message.content is [] but the answer lives in
		// generation.text, response_metadata.output, or streamed tokens.
		const normalizedGenerations = (output.generations ?? []).map((row) =>
			row.map((generation) => {
				const gen = generation as { text?: string; message?: BaseMessage };
				if (!gen?.message) return generation;

				const contentWasEmpty = isEmptyContent(gen.message.content);
				const resolved = resolveAssistantOutput(
					gen.message,
					(gen.text && gen.text.trim()) || streamedText || undefined,
				);

				if (typeof resolved.content === 'string' && resolved.content.length > 0) {
					resolvedAssistantText = resolved.content;
					if (contentWasEmpty || Boolean(streamedText?.trim())) {
						textAggregated = true;
					}
					(gen.message as { content: MessageContent }).content = resolved.content;
					if (!gen.text || !gen.text.trim()) {
						gen.text = resolved.content;
					}
				}

				return generation;
			}),
		);

		// Token usage fallbacks (tool calls / message metadata)
		let tokenUsage = output?.llmOutput?.tokenUsage;
		const lastResponse = normalizedGenerations?.[normalizedGenerations.length - 1]?.[
			normalizedGenerations[normalizedGenerations.length - 1].length - 1
		] as { message?: { usage_metadata?: Record<string, number> } } | undefined;

		if (!tokenUsage && output?.llmOutput?.estimatedTokenUsage) {
			tokenUsage = {
				promptTokens: output.llmOutput.estimatedTokenUsage.promptTokens,
				completionTokens: output.llmOutput.estimatedTokenUsage.completionTokens,
				totalTokens: output.llmOutput.estimatedTokenUsage.totalTokens,
			};
		}

		if (!tokenUsage) {
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

		const normalizedOutput: LLMResult = {
			...output,
			generations: normalizedGenerations,
			llmOutput: tokenUsage
				? {
						...output.llmOutput,
						tokenUsage,
					}
				: output.llmOutput,
		};

		await super.handleLLMEnd(normalizedOutput, runId, parentRunId);

		const streamingMetadata = wasStreaming
			? buildStreamingLangfuseMetadata({
					tokenEvents: streamStats!.tokenEvents,
					textAggregated,
				})
			: undefined;

		if (streamingMetadata) {
			this.langfuse._updateGeneration({
				id: runId,
				traceId: this.traceId,
				metadata: streamingMetadata,
			});
		}

		// Agent wraps the LLM, so parentRunId is set and langfuse-langchain's
		// updateTrace skips root output. Push the resolved answer onto the root
		// trace/span explicitly when updateRoot is enabled.
		if (this.rootProvided && this.updateRoot && this.traceId) {
			const streamingTagUpdate = streamingMetadata
				? {
						metadata: streamingMetadata,
						tags: mergeStreamingTag(this.baseTags),
					}
				: {};

			if ((this as any).rootObservationId) {
				this.langfuse._updateSpan({
					id: (this as any).rootObservationId,
					traceId: this.traceId,
					...(resolvedAssistantText
						? { output: { role: 'assistant', content: resolvedAssistantText } }
						: {}),
					...(streamingMetadata ? { metadata: streamingMetadata } : {}),
				});
				if (Object.keys(streamingTagUpdate).length > 0) {
					this.langfuse.trace({
						id: this.traceId,
						...streamingTagUpdate,
					});
				}
			} else {
				this.langfuse.trace({
					id: this.traceId,
					...(resolvedAssistantText
						? { output: { role: 'assistant', content: resolvedAssistantText } }
						: {}),
					...streamingTagUpdate,
				});
			}
		}
	}
}
