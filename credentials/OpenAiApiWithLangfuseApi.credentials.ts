import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class OpenAiApiWithLangfuseApi implements ICredentialType {
	name = 'openAiApiWithLangfuseApi';
	displayName = 'OpenAI API with Langfuse';
	documentationUrl = 'https://github.com/Copper-IQ/n8n-nodes-ai-langfuse';
	properties: INodeProperties[] = [
		{
			displayName: 'OpenAI API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Your OpenAI API key',
		},
		{
			displayName: 'Langfuse Public Key',
			name: 'langfusePublicKey',
			type: 'string',
			default: '',
			required: true,
			description: 'Your Langfuse public key',
		},
		{
			displayName: 'Langfuse Secret Key',
			name: 'langfuseSecretKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Your Langfuse secret key',
		},
		{
			displayName: 'Langfuse Base URL',
			name: 'langfuseBaseUrl',
			type: 'string',
			default: 'https://cloud.langfuse.com',
			required: true,
			description: 'The base URL of your Langfuse instance',
		},
		{
			displayName: 'Langfuse Environment',
			name: 'langfuseEnvironment',
			type: 'string',
			default: '',
			description: 'The environment for Langfuse (e.g., production, staging, development)',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'Authorization': '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.openai.com',
			url: '/v1/models',
			method: 'GET',
		},
	};
}
