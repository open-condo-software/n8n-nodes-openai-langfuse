import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { CallbackHandler } from 'langfuse-langchain';

const model = new ChatOpenAI({
	openAIApiKey: 'sk-test-key-fake',
	modelName: 'gpt-4o',
	temperature: 0.7,
	callbacks: [
		new CallbackHandler({
			publicKey: 'test-public',
			secretKey: 'test-secret',
			baseUrl: 'https://test.langfuse.com',
		}),
	],
});

console.log('Model instance created');
console.log('model.model:', model.model);
console.log('model.modelName:', model.modelName);

const messages = [
	new SystemMessage('You are a helpful assistant.'),
	new HumanMessage('Hello, test!'),
];

console.log('\\nInvoking model with messages...');
try {
	const response = await model.invoke(messages);
	console.log('Success:', response);
} catch (error) {
	console.log('Error:', error.message);
	console.log('Stack:', error.stack);
}
