import type { BaseMessage, MessageContent } from '@langchain/core/messages';

export type ResolvedAssistantOutput = {
	content?: string | MessageContent;
	role: string;
	tool_calls?: unknown;
	additional_kwargs?: Record<string, unknown>;
	_content?: MessageContent;
};

function isEmptyContent(content: unknown): boolean {
	if (content == null) return true;
	if (typeof content === 'string') return content.length === 0;
	if (Array.isArray(content)) return content.length === 0;
	return false;
}

function flattenMessageContent(content: MessageContent): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content
		.map((part) => {
			if (typeof part === 'string') return part;
			if (part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part) {
				return String((part as { text?: unknown }).text ?? '');
			}
			return '';
		})
		.join('');
}

/**
 * Resolve assistant text for Langfuse when streaming / Responses API leaves
 * message.content empty while the real answer sits in generation.text or
 * response_metadata.output_text.
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
	const outputTextFromMetadata =
		message.response_metadata &&
		typeof message.response_metadata === 'object' &&
		typeof (message.response_metadata as { output_text?: unknown }).output_text === 'string'
			? ((message.response_metadata as { output_text: string }).output_text)
			: undefined;

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
