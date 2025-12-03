import type {
	ISupplyDataFunctions,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { LmChatOpenAiLangfuse } from './LmChatOpenAiLangfuse.node';

describe('LmChatOpenAiLangfuse', () => {
	let node: LmChatOpenAiLangfuse;
	let mockSupplyDataFunctions: Partial<ISupplyDataFunctions>;

	beforeEach(() => {
		node = new LmChatOpenAiLangfuse();

		mockSupplyDataFunctions = {
			getCredentials: jest.fn().mockResolvedValue({
				apiKey: 'test-openai-key',
				langfusePublicKey: 'test-public-key',
				langfuseSecretKey: 'test-secret-key',
				langfuseBaseUrl: 'https://cloud.langfuse.com',
			}),
			getNodeParameter: jest.fn((paramName: string) => {
				const params: Record<string, string | object> = {
					model: 'gpt-4o-mini',
					sessionId: 'test-session',
					userId: 'test-user',
					tags: 'test,langfuse',
					metadata: '{"env":"test"}',
					options: {},
				};
				return params[paramName];
			}),
			getExecutionId: jest.fn().mockReturnValue('test-execution-id'),
			getWorkflow: jest.fn().mockReturnValue({ name: 'Test Workflow' }),
		} as unknown as Partial<ISupplyDataFunctions>;
	});

	it('should be defined', () => {
		expect(node).toBeDefined();
		expect(node.description).toBeDefined();
	});

	it('should have correct node metadata', () => {
		expect(node.description.displayName).toBe('OpenAI Chat Model with Langfuse');
		expect(node.description.name).toBe('lmChatOpenAiLangfuse');
		expect(node.description.version).toBe(1);
	});

	it('should have correct properties', () => {
		const properties = node.description.properties;
		expect(properties).toBeDefined();
		expect(properties.some((p) => p.name === 'model')).toBe(true);
		expect(properties.some((p) => p.name === 'sessionId')).toBe(true);
		expect(properties.some((p) => p.name === 'userId')).toBe(true);
		expect(properties.some((p) => p.name === 'tags')).toBe(true);
		expect(properties.some((p) => p.name === 'metadata')).toBe(true);
	});

	it('should require openAiApiWithLangfuseApi credentials', () => {
		const credentials = node.description.credentials;
		expect(credentials).toBeDefined();
		expect(credentials?.length).toBe(1);
		expect(credentials?.[0].name).toBe('openAiApiWithLangfuseApi');
		expect(credentials?.[0].required).toBe(true);
	});

	it('should create ChatOpenAI model with Langfuse callback', async () => {
		const result = await node.supplyData.call(
			mockSupplyDataFunctions as ISupplyDataFunctions,
			0,
		);

		expect(result).toBeDefined();
		expect(result.response).toBeDefined();
		// The response should be a ChatOpenAI instance
		expect((result.response as any).constructor.name).toBe('ChatOpenAI');
	});

	it('should parse tags correctly', async () => {
		const getNodeParameter = mockSupplyDataFunctions.getNodeParameter as jest.Mock;
		getNodeParameter.mockImplementation((paramName: string) => {
			if (paramName === 'tags') return 'tag1, tag2, tag3';
			if (paramName === 'model') return 'gpt-4o-mini';
			if (paramName === 'sessionId') return 'test-session';
			if (paramName === 'userId') return 'test-user';
			if (paramName === 'metadata') return '{}';
			if (paramName === 'options') return {};
			return '';
		});

		const result = await node.supplyData.call(
			mockSupplyDataFunctions as ISupplyDataFunctions,
			0,
		);

		expect(result).toBeDefined();
		expect(result.response).toBeDefined();
	});

	it('should parse metadata correctly', async () => {
		const getNodeParameter = mockSupplyDataFunctions.getNodeParameter as jest.Mock;
		getNodeParameter.mockImplementation((paramName: string) => {
			if (paramName === 'metadata') return '{"key1":"value1","key2":"value2"}';
			if (paramName === 'model') return 'gpt-4o-mini';
			if (paramName === 'sessionId') return 'test-session';
			if (paramName === 'userId') return 'test-user';
			if (paramName === 'tags') return '';
			if (paramName === 'options') return {};
			return '';
		});

		const result = await node.supplyData.call(
			mockSupplyDataFunctions as ISupplyDataFunctions,
			0,
		);

		expect(result).toBeDefined();
		expect(result.response).toBeDefined();
	});

	it('should handle empty metadata gracefully', async () => {
		const getNodeParameter = mockSupplyDataFunctions.getNodeParameter as jest.Mock;
		getNodeParameter.mockImplementation((paramName: string) => {
			if (paramName === 'metadata') return '';
			if (paramName === 'model') return 'gpt-4o-mini';
			if (paramName === 'sessionId') return '';
			if (paramName === 'userId') return '';
			if (paramName === 'tags') return '';
			if (paramName === 'options') return {};
			return '';
		});

		const result = await node.supplyData.call(
			mockSupplyDataFunctions as ISupplyDataFunctions,
			0,
		);

		expect(result).toBeDefined();
		expect(result.response).toBeDefined();
	});

	it('should wrap CallbackHandler.handleLLMEnd for token usage transformation', async () => {
		const result = await node.supplyData.call(
			mockSupplyDataFunctions as ISupplyDataFunctions,
			0,
		);

		expect(result).toBeDefined();
		expect(result.response).toBeDefined();

		// Check that callbacks array exists
		const model = result.response as any;
		expect(model.callbacks).toBeDefined();
		expect(Array.isArray(model.callbacks)).toBe(true);
		expect(model.callbacks.length).toBeGreaterThan(0);

		// Check that the callback has handleLLMEnd method (it's wrapped)
		const callback = model.callbacks[0];
		expect(callback.handleLLMEnd).toBeDefined();
		expect(typeof callback.handleLLMEnd).toBe('function');
	});

	it('should support built-in model tools via metadata', async () => {
		const getNodeParameter = mockSupplyDataFunctions.getNodeParameter as jest.Mock;
		const mockBuiltInTools = [{ name: 'web_search', description: 'Search the web' }];
		getNodeParameter.mockImplementation((paramName: string) => {
			if (paramName === 'model') return 'gpt-4o-mini';
			if (paramName === 'sessionId') return '';
			if (paramName === 'userId') return '';
			if (paramName === 'tags') return '';
			if (paramName === 'metadata') return '{}';
			if (paramName === 'options') return { builtInTools: mockBuiltInTools };
			return '';
		});

		const result = await node.supplyData.call(
			mockSupplyDataFunctions as ISupplyDataFunctions,
			0,
		);

		expect(result).toBeDefined();
		expect(result.response).toBeDefined();

		// Check that model has metadata.tools
		const model = result.response as any;
		expect(model.metadata).toBeDefined();
		expect(model.metadata.tools).toBeDefined();
		expect(model.metadata.tools).toEqual(mockBuiltInTools);
	});
});
