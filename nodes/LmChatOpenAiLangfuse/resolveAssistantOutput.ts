import type { BaseMessage, MessageContent } from '@langchain/core/messages';

export type ResolvedAssistantOutput = {
	content?: string | MessageContent;
	role: string;
	tool_calls?: unknown;
	additional_kwargs?: Record<string, unknown>;
	_content?: MessageContent;
};

export function isEmptyContent(content: unknown): boolean {
	if (content == null) return true;
	if (typeof content === 'string') return content.length === 0;
	if (Array.isArray(content)) return content.length === 0;
	return false;
}

export const STREAMING_TAG = 'streaming';

export type StreamingLangfuseMetadata = {
	n8n_streaming: true;
	n8n_streaming_text_aggregated: boolean;
	n8n_streaming_token_events: number;
};

/**
 * Metadata (+ optional tag) that marks a Langfuse observation as produced
 * from an n8n streaming LLM run whose text was aggregated for Langfuse.
 */
export function buildStreamingLangfuseMetadata(params: {
	tokenEvents: number;
	textAggregated: boolean;
}): StreamingLangfuseMetadata {
	return {
		n8n_streaming: true,
		n8n_streaming_text_aggregated: params.textAggregated,
		n8n_streaming_token_events: params.tokenEvents,
	};
}

export function mergeStreamingTag(existingTags?: string[] | null): string[] {
	const tags = [...(existingTags ?? [])].filter(Boolean);
	if (!tags.includes(STREAMING_TAG)) {
		tags.push(STREAMING_TAG);
	}
	return tags;
}

function flattenMessageContent(content: MessageContent): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content
		.map((part) => {
			if (typeof part === 'string') return part;
			if (part && typeof part === 'object' && 'text' in part) {
				const type = 'type' in part ? String((part as { type?: unknown }).type ?? '') : '';
				// Responses API uses output_text; Chat Completions / LC use text
				if (!type || type === 'text' || type === 'output_text') {
					return String((part as { text?: unknown }).text ?? '');
				}
			}
			return '';
		})
		.join('');
}

/**
 * Responses API `response.completed` copies the raw response into
 * response_metadata. `output_text` is often a non-enumerable getter and is
 * missing after Object.entries() — recover text from `output` items instead.
 */
export function extractTextFromResponsesMetadata(
	responseMetadata: Record<string, unknown> | undefined,
): string | undefined {
	if (!responseMetadata || typeof responseMetadata !== 'object') return undefined;

	if (typeof responseMetadata.output_text === 'string' && responseMetadata.output_text.trim()) {
		return responseMetadata.output_text;
	}

	const output = responseMetadata.output;
	if (!Array.isArray(output)) return undefined;

	const parts: string[] = [];
	for (const item of output) {
		if (!item || typeof item !== 'object') continue;
		const typed = item as { type?: string; content?: unknown };
		if (typed.type !== 'message' || !Array.isArray(typed.content)) continue;
		for (const part of typed.content) {
			if (!part || typeof part !== 'object') continue;
			const contentPart = part as { type?: string; text?: unknown };
			if (
				(contentPart.type === 'output_text' || contentPart.type === 'text') &&
				typeof contentPart.text === 'string'
			) {
				parts.push(contentPart.text);
			}
		}
	}

	const joined = parts.join('');
	return joined.trim() ? joined : undefined;
}

/**
 * Resolve assistant text for Langfuse when streaming / Responses API leaves
 * message.content empty while the real answer sits in generation.text or
 * response_metadata.
 */
export function resolveAssistantOutput(
	message: BaseMessage,
	generationText?: string,
): ResolvedAssistantOutput {
	const response: ResolvedAssistantOutput = {
		content: message.content,
		role: 'assistant',
	};

	if (message.getType() !== 'ai') {
		const type = message.getType();
		if (type === 'human') response.role = 'user';
		else if (type === 'system') response.role = 'system';
		else if (message.name) response.role = message.name;
	}

	if ('tool_calls' in message && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
		response.tool_calls = message.tool_calls;
	} else if (
		'additional_kwargs' in message &&
		message.additional_kwargs &&
		'tool_calls' in message.additional_kwargs
	) {
		response.tool_calls = message.additional_kwargs.tool_calls;
	}

	const flattened = flattenMessageContent(message.content);
	const outputTextFromMetadata = extractTextFromResponsesMetadata(
		message.response_metadata as Record<string, unknown> | undefined,
	);

	const resolvedText =
		(flattened && flattened.trim().length > 0 ? flattened : undefined) ||
		(generationText && generationText.trim().length > 0 ? generationText : undefined) ||
		(typeof message.text === 'string' && message.text.trim().length > 0 ? message.text : undefined) ||
		(outputTextFromMetadata && outputTextFromMetadata.trim().length > 0
			? outputTextFromMetadata
			: undefined);

	if (resolvedText) {
		response.content = resolvedText;
	} else if (isEmptyContent(response.content)) {
		// Preserve tool-call-only turns: avoid sending empty content arrays that
		// Langfuse renders as null, but keep a marker for debugging.
		response._content = response.content as MessageContent;
		delete response.content;
	}

	if (
		(message.additional_kwargs?.function_call || message.additional_kwargs?.tool_calls) &&
		response.tool_calls === undefined
	) {
		return { ...response, additional_kwargs: message.additional_kwargs };
	}

	return response;
}
