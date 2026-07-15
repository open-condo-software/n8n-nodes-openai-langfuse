import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import {
	buildStreamingLangfuseMetadata,
	mergeStreamingTag,
	resolveAssistantOutput,
	STREAMING_TAG,
} from './resolveAssistantOutput';

describe('resolveAssistantOutput', () => {
	it('uses generation.text when streaming leaves message.content empty', () => {
		const message = new AIMessageChunk({ content: [] });
		const output = resolveAssistantOutput(message, 'Короткий ответ ассистента');

		expect(output.role).toBe('assistant');
		expect(output.content).toBe('Короткий ответ ассистента');
	});

	it('uses response_metadata.output_text from Responses API completed event', () => {
		const message = new AIMessageChunk({
			content: [],
			response_metadata: { output_text: 'Текст из response.completed' },
		});
		const output = resolveAssistantOutput(message, '');

		expect(output.content).toBe('Текст из response.completed');
	});

	it('extracts text from response_metadata.output when output_text getter was not copied', () => {
		const message = new AIMessageChunk({
			content: [],
			response_metadata: {
				output: [
					{
						type: 'reasoning',
						summary: [{ type: 'summary_text', text: 'thinking' }],
					},
					{
						type: 'message',
						content: [{ type: 'output_text', text: 'Короткий ответ для подъезда' }],
					},
				],
			},
		});
		const output = resolveAssistantOutput(message, '');

		expect(output.content).toBe('Короткий ответ для подъезда');
	});

	it('flattens Responses API text content parts to a string', () => {
		const message = new AIMessage({
			content: [
				{ type: 'text', text: 'Hello ' },
				{ type: 'text', text: 'world' },
			],
		});
		const output = resolveAssistantOutput(message);

		expect(output.content).toBe('Hello world');
	});

	it('keeps tool_calls when there is no assistant text', () => {
		const message = new AIMessage({
			content: [],
			tool_calls: [
				{
					name: 'search',
					args: { q: 'test' },
					id: 'call-1',
					type: 'tool_call',
				},
			],
		});
		const output = resolveAssistantOutput(message, '');

		expect(output.tool_calls).toHaveLength(1);
		expect(output.content).toBeUndefined();
		expect(output._content).toEqual([]);
	});

	it('prefers flattened content over generation.text', () => {
		const message = new AIMessage({ content: 'from-message' });
		const output = resolveAssistantOutput(message, 'from-generation');

		expect(output.content).toBe('from-message');
	});
});

describe('streaming langfuse markers', () => {
	it('builds streaming metadata for Langfuse', () => {
		expect(
			buildStreamingLangfuseMetadata({ tokenEvents: 12, textAggregated: true }),
		).toEqual({
			n8n_streaming: true,
			n8n_streaming_text_aggregated: true,
			n8n_streaming_token_events: 12,
		});
	});

	it('merges streaming tag without duplicates', () => {
		expect(mergeStreamingTag(['ai-assistant'])).toEqual(['ai-assistant', STREAMING_TAG]);
		expect(mergeStreamingTag(['ai-assistant', 'streaming'])).toEqual([
			'ai-assistant',
			'streaming',
		]);
		expect(mergeStreamingTag()).toEqual([STREAMING_TAG]);
	});
});
