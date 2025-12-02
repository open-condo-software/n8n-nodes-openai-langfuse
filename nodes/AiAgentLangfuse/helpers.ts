export function extractVariablesFromPrompt(
	prompt: string | Array<{ role: string; content: string }>,
): string[] {
	const template = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
	const regex = /\{\{([^}]+)\}\}/g;
	const variables = new Set<string>();

	let match: RegExpExecArray | null;
	while ((match = regex.exec(template)) !== null) {
		variables.add(match[1].trim());
	}

	return Array.from(variables);
}

export function parsePromptName(
	promptNameRaw: string | { mode: string; value: string } | undefined,
): string {
	if (!promptNameRaw) return '';
	return typeof promptNameRaw === 'string' ? promptNameRaw : promptNameRaw?.value || '';
}
