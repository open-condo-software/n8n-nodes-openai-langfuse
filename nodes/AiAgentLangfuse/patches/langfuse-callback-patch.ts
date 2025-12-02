/**
 * Monkey patch for langfuse-langchain v3.38.6 bug
 * 
 * Bug: CallbackHandler.handleLLMEnd crashes with:
 * "Cannot use 'in' operator to search for 'promptTokens' in undefined"
 * 
 * This happens when using tools because llmOutput.tokenUsage is undefined,
 * but the library doesn't check before using the 'in' operator.
 */

import type { CallbackHandler } from 'langfuse-langchain';

export function patchLangfuseCallback(handler: CallbackHandler): void {
	const original = handler.handleLLMEnd?.bind(handler);
	
	if (!original) return;
	
	(handler as any).handleLLMEnd = async function(this: CallbackHandler, output: any, runId: string, parentRunId?: string) {
		try {
			console.log('[Langfuse Patch] handleLLMEnd called');
			console.log('[Langfuse Patch] output keys:', output ? Object.keys(output) : 'N/A');
			console.log('[Langfuse Patch] output.llmOutput:', JSON.stringify(output?.llmOutput, null, 2));
			
			// Safe extraction with proper null checks
			const lastResponse = output.generations?.[output.generations.length - 1]?.[output.generations[output.generations.length - 1].length - 1];
			console.log('[Langfuse Patch] lastResponse keys:', lastResponse ? Object.keys(lastResponse) : 'N/A');
			
			// Try usage_metadata first (works with tools)
			let llmUsage = lastResponse?.message?.usage_metadata;
			console.log('[Langfuse Patch] usage_metadata:', JSON.stringify(llmUsage, null, 2));
			
			// Fallback to tokenUsage (works without tools)
			if (!llmUsage) {
				llmUsage = output.llmOutput?.tokenUsage;
				console.log('[Langfuse Patch] fallback to tokenUsage:', JSON.stringify(llmUsage, null, 2));
			}
			
			// If still no usage, create empty object to avoid crash
			if (!llmUsage) {
				llmUsage = {};
				console.log('[Langfuse Patch] WARNING: No tokens found, using empty object');
			}
			
			// Call original with safe llmUsage
			// Patch the output to ensure tokenUsage exists
			const patchedOutput = {
				...output,
				llmOutput: {
					...output.llmOutput,
					tokenUsage: {
						promptTokens: llmUsage.input_tokens ?? llmUsage.promptTokens ?? 0,
						completionTokens: llmUsage.output_tokens ?? llmUsage.completionTokens ?? 0,
						totalTokens: llmUsage.total_tokens ?? llmUsage.totalTokens ?? 0,
					},
				},
			};
			
			return await original.call(this, patchedOutput, runId, parentRunId);
		} catch (error) {
			console.error('[Langfuse Patch] Error in patched handleLLMEnd:', error);
			// Don't throw - just log and continue
		}
	};
}
