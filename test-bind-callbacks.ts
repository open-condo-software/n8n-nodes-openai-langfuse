import { ChatOpenAI } from '@langchain/openai';
import 'dotenv/config';

const model = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
});

// Add callback
const mockCallback = { name: 'test' };
if (!model.callbacks) {
  model.callbacks = [];
}
model.callbacks.push(mockCallback as any);

console.log('Before bindTools - callbacks:', model.callbacks.length);

// Bind tools
const boundModel = model.bindTools([
  {
    type: 'web_search' as const,
    search_context_size: 'medium' as const,
  },
]);

console.log('After bindTools - callbacks:', boundModel.callbacks?.length || 0);
console.log('Same callback?', boundModel.callbacks?.includes(mockCallback as any));
console.log('Same model instance?', model === boundModel);
