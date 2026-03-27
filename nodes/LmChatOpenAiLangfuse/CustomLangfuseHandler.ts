import { type AnonymousLlmMessage, CallbackHandler, type LlmMessage } from 'langfuse-langchain'
import type { Serialized } from '@langchain/core/load/serializable';
import { BaseMessage, type MessageContent } from '@langchain/core/messages'
import { type LLMResult } from '@langchain/core/outputs'

/**
 * Custom Langfuse CallbackHandler that overrides observation names
 * to use our custom naming instead of the default "ChatOpenAI"
 * and preserves trace name when updateRoot is enabled
 */
export class CustomLangfuseHandler extends CallbackHandler {
	private customName: string;
	private originalTraceName?: string;

	constructor(params: any, customName: string, traceName?: string) {
		super(params);
		this.customName = customName;
		this.originalTraceName = traceName;

		(this as any).extractChatMessageContent = (message: BaseMessage): LlmMessage | AnonymousLlmMessage | MessageContent => {
			let response = undefined;

			if (message.getType() === "human") {
				response = { content: message.content, role: "user" };
			} else if (message.getType() === "generic") {
				response = {
					content: message.content,
					role: "human",
				};
			} else if (message.getType() === "ai") {
				response = { content: message.content, role: "assistant" };

				if (
					"tool_calls" in message &&
					Array.isArray(message.tool_calls) &&
					(message.tool_calls?.length ?? 0) > 0
				) {
					(response as any)["tool_calls"] = message["tool_calls"];
				}
				if (
					"additional_kwargs" in message &&
					"tool_calls" in message["additional_kwargs"]
				) {
					(response as any)["tool_calls"] =
						message["additional_kwargs"]["tool_calls"];
				}
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

			// NOTE: Fix output display in the interface
			const responseContent = response?.content
			const responseContentIsEmptyArray = responseContent && Array.isArray(responseContent) && responseContent.length < 1
			if (responseContentIsEmptyArray) {
				(response as any)._content = responseContent
				delete (response as any)['content']
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

	// Override handleChatModelStart to use custom name
	async handleChatModelStart(
		llm: Serialized,
		messages: BaseMessage[][],
		runId: string,
		parentRunId?: string,
		extraParams?: Record<string, unknown>,
		tags?: string[],
		metadata?: Record<string, unknown>,
		name?: string,
	): Promise<void> {
		// Use our custom name instead of the default
		return super.handleChatModelStart(
			llm,
			messages,
			runId,
			parentRunId,
			extraParams,
			tags,
			metadata,
			this.customName, // Override name
		);
	}

	// Override handleLLMStart to use custom name
	async handleLLMStart(
		llm: Serialized,
		prompts: string[],
		runId: string,
		parentRunId?: string,
		extraParams?: Record<string, unknown>,
		tags?: string[],
		metadata?: Record<string, unknown>,
		name?: string,
	): Promise<void> {
		// Use our custom name instead of the default
		return super.handleLLMStart(
			llm,
			prompts,
			runId,
			parentRunId,
			extraParams,
			tags,
			metadata,
			this.customName, // Override name
		);
	}

	// Override handleGenerationStart to use custom name
	async handleGenerationStart(
		llm: Serialized,
		messages: any[],
		runId: string,
		parentRunId?: string,
		extraParams?: Record<string, unknown>,
		tags?: string[],
		metadata?: Record<string, unknown>,
		name?: string,
	): Promise<void> {
		// Use our custom name instead of the default
		return super.handleGenerationStart(
			llm,
			messages,
			runId,
			parentRunId,
			extraParams,
			tags,
			metadata,
			this.customName, // Override name
		);
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
		// When at the root level (no parent) and we have an original trace name,
		// manually handle the trace update to preserve the name while still updating other properties
		if (this.rootProvided && this.updateRoot && !parentRunId && this.originalTraceName) {
			// First, ensure the trace exists and top-level ID is set
			if (!this.traceId) {
				// Create trace with original name
				const params = {
					name: this.originalTraceName,
					metadata: this.joinTagsAndMetaData(tags, metadata, this.metadata),
					userId: this.userId,
					version: this.version,
					sessionId: this.sessionId,
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

			// Update the root observation/trace without changing the name
			const updateParams = {
				// Explicitly omit 'name' to preserve original trace name
				metadata: this.joinTagsAndMetaData(tags, metadata, this.metadata),
				userId: this.userId,
				version: this.version,
				sessionId: this.sessionId,
				input: input,
				tags: this.tags,
			};

			if ((this as any).rootObservationId) {
				// Update span without name
				this.langfuse._updateSpan({
					id: (this as any).rootObservationId,
					traceId: this.traceId,
					...updateParams,
				});
			} else {
				// Update trace without name
				this.langfuse.trace({
					id: this.traceId,
					...updateParams,
				});
			}

			(this as any).topLevelObservationId = runId;
			return;
		}

		// For all other cases (has parent, no original name, etc.), use default behavior
		// but still prefer our custom names where appropriate
		const nameToUse = this.originalTraceName || runName;
		super.generateTrace(nameToUse, runId, parentRunId, tags, metadata, input);
	}

	async handleLLMEnd(output: LLMResult, runId: string, parentRunId?: string | undefined): Promise<void> {
		// CRITICAL: Log the full output structure to understand what we're getting
		console.log('[Langfuse Debug] Full output object keys:', Object.keys(output));
		const firstGen = output.generations?.[0]?.[0];
		if (firstGen) {
			console.log('[Langfuse Debug] First generation keys:', Object.keys(firstGen));
			console.log('[Langfuse Debug] First generation full:', JSON.stringify(firstGen, null, 2));
		}
		if (output.llmOutput) {
			console.log('[Langfuse Debug] Output.llmOutput keys:', Object.keys(output.llmOutput));
			console.log('[Langfuse Debug] Output.llmOutput full:', JSON.stringify(output.llmOutput, null, 2));
		}

		// Extract the response before calling the handler
		const lastResponse =
			output.generations?.[output.generations.length - 1]?.[
			output.generations[output.generations.length - 1].length - 1
				] as any;

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
			output = {
				...output,
				llmOutput: {
					...output.llmOutput,
					tokenUsage,
				},
			};
		}

		const messageParsed = lastResponse?.message?.parsed
		const messageContent = lastResponse?.message?.content
		const text = lastResponse?.text
		const messageToolCalls = lastResponse?.message?.tool_calls

		// CRITICAL: Log full response structure for debugging
		console.log('[Langfuse Debug] Full lastResponse:', JSON.stringify({
			text,
			messageType: lastResponse?.message?.constructor?.name,
			messageContent,
			messageAdditionalKwargs: lastResponse?.message?.additional_kwargs,
			messageParsed,
			messageToolCalls,
			messageKeys: lastResponse?.message ? Object.keys(lastResponse.message) : [],
		}, null, 2));

		// Call the original handler
		return await super.handleLLMEnd(output, runId, parentRunId)
	}
}
