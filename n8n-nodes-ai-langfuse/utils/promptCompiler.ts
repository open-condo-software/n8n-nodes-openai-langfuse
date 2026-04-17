import { getLangfuseClient } from './langfuseClient';

export interface PromptVariable {
	name: string;
	value: string;
}

export interface FetchedPrompt {
	name: string;
	version: number;
	prompt: Array<{ role: string; content: string }>;
	config: Record<string, unknown> | undefined;
}

export interface PromptCompileResult {
	messages: Array<{ role: string; content: string }>;
	config: Record<string, unknown>;
	promptMetadata: {
		name: string;
		version: number;
	};
}

export async function fetchPromptFromLangfuse(
	langfuseConfig: {
		publicKey: string;
		secretKey: string;
		baseUrl: string;
		environment?: string;
	},
	promptName: string,
	version?: number,
): Promise<FetchedPrompt> {
	const client = getLangfuseClient(langfuseConfig);
	
	const prompt = await client.getPrompt(promptName, version);
	
	return {
		name: promptName,
		version: prompt.version,
		prompt: prompt.prompt as unknown as Array<{ role: string; content: string }>,
		config: prompt.config as Record<string, unknown> | undefined,
	};
}

export function compilePrompt(
	fetchedPrompt: FetchedPrompt,
	variables: Record<string, string>,
): PromptCompileResult {
	const messages = fetchedPrompt.prompt.map((message: { role: string; content: string }) => {
		let content = message.content;
		
		Object.entries(variables).forEach(([key, value]) => {
			const placeholder = `{{${key}}}`;
			content = content.replace(new RegExp(placeholder, 'g'), value);
		});
		
		return {
			role: message.role,
			content,
		};
	});

	return {
		messages,
		config: fetchedPrompt.config || {},
		promptMetadata: {
			name: fetchedPrompt.name,
			version: fetchedPrompt.version,
		},
	};
}

export async function fetchAndCompilePrompt(
	langfuseConfig: {
		publicKey: string;
		secretKey: string;
		baseUrl: string;
		environment?: string;
	},
	promptName: string,
	variables: Record<string, string>,
	version?: number,
): Promise<PromptCompileResult> {
	const fetchedPrompt = await fetchPromptFromLangfuse(
		langfuseConfig,
		promptName,
		version,
	);
	
	return compilePrompt(fetchedPrompt, variables);
}
