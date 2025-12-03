import { CallbackHandler } from 'langfuse-langchain';
import type { Serialized } from '@langchain/core/load/serializable';
import type { BaseMessage } from '@langchain/core/messages';

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
}
