import { randomUUID } from 'crypto';

export function generateSessionId(prefix: string = 'n8n'): string {
	const timestamp = Date.now();
	const uuid = randomUUID().split('-')[0];
	return `${prefix}-${timestamp}-${uuid}`;
}

export function parseSessionIdTemplate(template: string, context: Record<string, unknown>): string {
	let result = template;
	
	Object.entries(context).forEach(([key, value]) => {
		const placeholder = new RegExp(`{{${key}}}`, 'g');
		result = result.replace(placeholder, String(value));
	});
	
	return result;
}

export function ensureSessionId(
	providedSessionId: string | undefined,
	executionId: string,
): string {
	if (providedSessionId && providedSessionId.trim() !== '') {
		return parseSessionIdTemplate(providedSessionId, { executionId });
	}
	
	return generateSessionId('n8n');
}
