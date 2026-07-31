export type BoundToolSummary = {
	name: string
	description?: string
	parameters?: unknown
}

export type BoundToolsExtraction = {
	tools: BoundToolSummary[]
	toolChoice?: unknown
	toolsCount: number
}

function asRecord (value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
	return value as Record<string, unknown>
}

function summarizeTool (tool: unknown): BoundToolSummary | undefined {
	const root = asRecord(tool)
	if (!root) return undefined

	// OpenAI Chat Completions: { type: 'function', function: { name, description, parameters } }
	const fn = asRecord(root.function)
	if (fn && typeof fn.name === 'string') {
		return {
			name: fn.name,
			...(typeof fn.description === 'string' ? { description: fn.description } : {}),
			...(fn.parameters !== undefined ? { parameters: fn.parameters } : {}),
		}
	}

	// Already flattened / Responses-style / LangChain dict
	if (typeof root.name === 'string') {
		return {
			name: root.name,
			...(typeof root.description === 'string' ? { description: root.description } : {}),
			...(root.parameters !== undefined
				? { parameters: root.parameters }
				: root.schema !== undefined
					? { parameters: root.schema }
					: {}),
		}
	}

	return undefined
}

/**
 * Pull bound tools from LangChain chat-model start `extraParams.invocation_params`.
 * These are what the model actually receives, not just text in the system prompt.
 */
export function extractBoundToolsFromExtraParams (
	extraParams?: Record<string, unknown>,
): BoundToolsExtraction | undefined {
	const invocationParams = asRecord(extraParams?.invocation_params)
	if (!invocationParams) return undefined

	const rawTools = invocationParams.tools
	const rawFunctions = invocationParams.functions

	const tools: BoundToolSummary[] = []

	if (Array.isArray(rawTools)) {
		for (const tool of rawTools) {
			const summarized = summarizeTool(tool)
			if (summarized) tools.push(summarized)
		}
	}

	// Legacy OpenAI functions
	if (tools.length === 0 && Array.isArray(rawFunctions)) {
		for (const fn of rawFunctions) {
			const record = asRecord(fn)
			if (!record || typeof record.name !== 'string') continue
			tools.push({
				name: record.name,
				...(typeof record.description === 'string' ? { description: record.description } : {}),
				...(record.parameters !== undefined ? { parameters: record.parameters } : {}),
			})
		}
	}

	if (tools.length === 0 && invocationParams.tool_choice === undefined) {
		return undefined
	}

	return {
		tools,
		toolsCount: tools.length,
		...(invocationParams.tool_choice !== undefined
			? { toolChoice: invocationParams.tool_choice }
			: {}),
	}
}

/**
 * Append a synthetic message so Langfuse generation input shows available tools
 * next to system/user messages (similar to langfuse-python CallbackHandler).
 */
export function appendAvailableToolsToInput (
	messages: unknown[],
	extraction: BoundToolsExtraction | undefined,
): unknown[] {
	if (!extraction || extraction.toolsCount === 0) return messages

	return [
		...messages,
		{
			role: 'available_tools',
			content: {
				tools_count: extraction.toolsCount,
				tool_choice: extraction.toolChoice ?? 'auto',
				tools: extraction.tools,
			},
		},
	]
}
