import {
	appendAvailableToolsToInput,
	extractBoundToolsFromExtraParams,
} from './extractBoundTools'

describe('extractBoundToolsFromExtraParams', () => {
	it('returns undefined when invocation_params missing', () => {
		expect(extractBoundToolsFromExtraParams(undefined)).toBeUndefined()
		expect(extractBoundToolsFromExtraParams({})).toBeUndefined()
	})

	it('extracts OpenAI tools with function.name/description/parameters', () => {
		const result = extractBoundToolsFromExtraParams({
			invocation_params: {
				tools: [
					{
						type: 'function',
						function: {
							name: 'getTickets',
							description: 'Fetch tickets by from/to',
							parameters: {
								type: 'object',
								properties: { filters: { type: 'string' } },
							},
						},
					},
				],
				tool_choice: 'auto',
			},
		})

		expect(result).toEqual({
			tools: [
				{
					name: 'getTickets',
					description: 'Fetch tickets by from/to',
					parameters: {
						type: 'object',
						properties: { filters: { type: 'string' } },
					},
				},
			],
			toolsCount: 1,
			toolChoice: 'auto',
		})
	})

	it('falls back to legacy functions array', () => {
		const result = extractBoundToolsFromExtraParams({
			invocation_params: {
				functions: [
					{
						name: 'legacy_fn',
						description: 'old style',
						parameters: { type: 'object', properties: {} },
					},
				],
			},
		})

		expect(result?.tools).toEqual([
			{
				name: 'legacy_fn',
				description: 'old style',
				parameters: { type: 'object', properties: {} },
			},
		])
	})
})

describe('appendAvailableToolsToInput', () => {
	it('keeps messages unchanged when no tools', () => {
		const messages = [{ role: 'user', content: 'hi' }]
		expect(appendAvailableToolsToInput(messages, undefined)).toEqual(messages)
	})

	it('appends available_tools message', () => {
		const messages = [{ role: 'system', content: 'sys' }]
		const result = appendAvailableToolsToInput(messages, {
			tools: [{ name: 'getTickets', description: 'tickets' }],
			toolsCount: 1,
			toolChoice: 'auto',
		})

		expect(result).toHaveLength(2)
		expect(result[1]).toEqual({
			role: 'available_tools',
			content: {
				tools_count: 1,
				tool_choice: 'auto',
				tools: [{ name: 'getTickets', description: 'tickets' }],
			},
		})
	})
})
