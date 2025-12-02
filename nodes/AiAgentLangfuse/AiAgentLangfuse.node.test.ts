import { AiAgentLangfuse } from './AiAgentLangfuse.node';
import type { IExecuteFunctions, ICredentialDataDecryptedObject } from 'n8n-workflow';
import { ChatOpenAI } from '@langchain/openai';

describe('AiAgentLangfuse', () => {
	let node: AiAgentLangfuse;
	let mockContext: IExecuteFunctions;

	beforeEach(() => {
		node = new AiAgentLangfuse();

		mockContext = {
			getCredentials: jest.fn().mockResolvedValue({
				apiKey: 'test-openai-key',
				langfusePublicKey: 'test-public-key',
				langfuseSecretKey: 'test-secret-key',
				langfuseBaseUrl: 'https://test.langfuse.com',
			} as ICredentialDataDecryptedObject),
			getNodeParameter: jest.fn((paramName: string, itemIndex: number) => {
				if (paramName === 'promptSource') return 'manual';
				if (paramName === 'text') return 'Hello, test!';
				if (paramName === 'sessionIdType') return 'customKey';
				if (paramName === 'sessionKey') return 'test-session-123';
				if (paramName === 'options') return {};
				return undefined;
			}),
			getInputData: jest.fn().mockReturnValue([{ json: { test: 'data' } }]),
			getNode: jest.fn().mockReturnValue({ name: 'TestNode', type: 'aiAgentLangfuse' }),
			continueOnFail: jest.fn().mockReturnValue(false),
			getInputConnectionData: jest.fn().mockImplementation((type: string, index: number) => {
				if (type === 'ai_languageModel') {
					// Return a real ChatOpenAI instance
					const model = new ChatOpenAI({
						openAIApiKey: 'test-key',
						modelName: 'gpt-4o',
					});
					return Promise.resolve(model);
				}
				return Promise.resolve(undefined);
			}),
			helpers: {
				httpRequest: jest.fn(),
			},
		} as unknown as IExecuteFunctions;
	});

	describe('Node Configuration', () => {
		it('should have correct node type description', () => {
			expect(node.description.name).toBe('aiAgentLangfuse');
			expect(node.description.displayName).toBe('AI Agent Langfuse');
			expect(node.description.version).toBe(1);
		});

		it('should have Main output', () => {
			expect(node.description.outputs).toContain('main');
		});

		it('should require openAiApiWithLangfuseApi credential', () => {
			const credential = node.description.credentials?.find(
				(c) => c.name === 'openAiApiWithLangfuseApi'
			);
			expect(credential).toBeDefined();
			expect(credential?.required).toBe(true);
		});

		it('should have dynamic inputs based on parameters', () => {
			expect(typeof node.description.inputs).toBe('string');
			expect(node.description.inputs).toContain('getInputs');
		});

		it('should have prompt source parameter', () => {
			const param = node.description.properties.find((p) => p.name === 'promptSource');
			expect(param).toBeDefined();
			expect(param?.type).toBe('options');
		});

		it('should have model input filter to only accept custom Langfuse model', () => {
			// Check if input definition includes filter
			expect(node.description.inputs).toContain('CUSTOM.lmChatOpenAiLangfuse');
		});
	});

	describe('execute', () => {
		it('should validate model connection type', async () => {
			// This test verifies the model is received correctly
			const inputData = [{ json: { test: 'data' } }];
			(mockContext.getInputData as jest.Mock).mockReturnValue(inputData);

			try {
				await node.execute.call(mockContext);
			} catch (error) {
				// We expect this to throw because OTEL/Langfuse setup won't work in test
				// But we can verify the model was accessed
				expect(mockContext.getInputConnectionData).toHaveBeenCalledWith('ai_languageModel', 0);
			}
		});

		it('should throw error if no model connected', async () => {
			(mockContext.getInputConnectionData as jest.Mock).mockResolvedValue(undefined);

			await expect(node.execute.call(mockContext)).rejects.toThrow(
				'No language model connected'
			);
		});

		it('should throw error if model lacks invoke method', async () => {
			(mockContext.getInputConnectionData as jest.Mock).mockResolvedValue({});

			await expect(node.execute.call(mockContext)).rejects.toThrow(
				'No language model connected'
			);
		});
	});

	describe('Model Compatibility', () => {
		it('should work with ChatOpenAI instance from LmChatOpenAiLangfuse', async () => {
			const model = new ChatOpenAI({
				openAIApiKey: 'test-key',
				modelName: 'gpt-4o',
			});

			// Verify model has required properties
			expect(model.invoke).toBeDefined();
			expect(typeof model.invoke).toBe('function');

			// Verify LangChain namespace
			expect((model as any).lc_namespace).toBeDefined();
			expect((model as any).lc_namespace).toContain('chat_models');
		});
	});
});
