import type { ILoadOptionsFunctions, IExecuteFunctions } from 'n8n-workflow';

interface LangfuseCredentials {
	langfusePublicKey: string;
	langfuseSecretKey: string;
	langfuseBaseUrl: string;
}

export function createAuthObject(credentials: LangfuseCredentials) {
	return {
		username: credentials.langfusePublicKey,
		password: credentials.langfuseSecretKey,
	};
}

export async function fetchPrompts(
	context: ILoadOptionsFunctions | IExecuteFunctions,
	credentials: LangfuseCredentials,
) {
	const response = (await context.helpers.httpRequest({
		method: 'GET',
		url: `${credentials.langfuseBaseUrl}/api/public/v2/prompts`,
		auth: createAuthObject(credentials),
	})) as { data?: Array<{ name: string; labels?: string[]; versions?: number[] }> };

	return response.data || [];
}

export function getDefaultLabels() {
	return [
		{ name: 'Production', value: 'production' },
		{ name: 'Latest', value: 'latest' },
	];
}
