import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { DynamicTool } from '@langchain/core/tools';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { CallbackHandler } from 'langfuse-langchain';

async function testAgentExecutor() {
  console.log('🧪 Testing AgentExecutor with custom tools and built-in web_search...\n');

  // 1. Create base model
  const baseModel = new ChatOpenAI({
    modelName: 'gpt-4o',
    temperature: 0,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  // 2. Bind web_search tool to model (this is what n8n does)
  const model = baseModel.bindTools([{
    type: 'web_search',
    search_context_size: 'medium',
  }]);

  console.log('✅ Model created with web_search bound via bindTools()');

  // 3. Create a custom tool (simulating FormatTool)
  const customTool = new DynamicTool({
    name: 'FormatTool',
    description: 'Formats text by adding emphasis markers around it. Use this to emphasize important parts of your response.',
    func: async (input: string) => {
      console.log(`  🔧 FormatTool called with input: "${input}"`);
      return `**${input}**`;
    },
  });

  console.log('✅ Custom tool created: FormatTool\n');

  // 4. Create prompt template
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You are a helpful assistant. When providing important information, use the FormatTool to emphasize it.'],
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);

  // 5. Create agent with ONLY custom tool (web_search already bound to model)
  const agent = createToolCallingAgent({
    llm: model,
    tools: [customTool], // Only custom tool, NOT web_search
    prompt,
    streamRunnable: false,
  });

  console.log('✅ Agent created with 1 custom tool (FormatTool only)\n');

  // 6. Create agent executor
  const agentExecutor = new AgentExecutor({
    agent,
    tools: [customTool], // Only custom tool
    maxIterations: 15,
    verbose: true, // Enable verbose to see tool calls
  });

  console.log('✅ AgentExecutor created\n');

  // 7. Setup Langfuse callback
  const langfuseCallback = new CallbackHandler({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
    secretKey: process.env.LANGFUSE_SECRET_KEY!,
    baseUrl: process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com',
    sessionId: 'test-agent-executor',
  });

  console.log('✅ Langfuse callback created\n');

  // 8. Test with a query that requires web search AND custom tool
  console.log('📝 Testing query: "What happened in Hong Kong fires last week? Use FormatTool to emphasize the key facts."');
  console.log('   Expected: Model uses web_search (built-in) AND calls FormatTool (custom)\n');

  try {
    const result = await agentExecutor.invoke(
      {
        input: 'What happened in Hong Kong fires last week? Use FormatTool to emphasize the key facts.',
      },
      {
        callbacks: [langfuseCallback],
      }
    );

    console.log('\n✅ Result:', result.output);
    console.log('\n📊 Summary:');
    console.log('   - Web search should have been used (check if response has recent info)');
    console.log('   - FormatTool should have been called (check console for "🔧 FormatTool called")');
    console.log('   - Langfuse should have captured all LLM calls');
    
    await langfuseCallback.shutdownAsync();
    console.log('\n✅ Langfuse flushed');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

// Run test
testAgentExecutor().catch(console.error);
