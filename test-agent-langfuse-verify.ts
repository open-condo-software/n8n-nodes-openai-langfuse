/**
 * Test createToolCallingAgent with Langfuse and verify tokens via API
 * This script:
 * 1. Runs agent with tool calling
 * 2. Waits for Langfuse ingestion
 * 3. Fetches trace via API and verifies output tokens are captured
 */

import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { Langfuse } from 'langfuse';
import { CallbackHandler } from 'langfuse-langchain';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { createToolCallingAgent } from 'langchain/agents';

const CONFIG = {
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY || '',
  langfuseBaseUrl: process.env.LANGFUSE_BASE_URL || '',
  sessionId: 'agent-verify-test-' + Date.now(),
  userId: 'test@copperiq.com',
  modelName: 'gpt-4o', // Use gpt-4o for better tool usage
};

async function fetchTraceFromLangfuse(traceId: string): Promise<any> {
  const auth = Buffer.from(`${CONFIG.langfusePublicKey}:${CONFIG.langfuseSecretKey}`).toString('base64');
  
  const response = await fetch(`${CONFIG.langfuseBaseUrl}/api/public/traces/${traceId}`, {
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch trace: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function testAgentWithLangfuseVerification() {
  console.log('🧪 Testing createToolCallingAgent with Langfuse token verification...\\n');
  
  // Initialize Langfuse
  const langfuseClient = new Langfuse({
    publicKey: CONFIG.langfusePublicKey,
    secretKey: CONFIG.langfuseSecretKey,
    baseUrl: CONFIG.langfuseBaseUrl,
  });
  
  // Create Langfuse callback
  const langfuseCallback = new CallbackHandler({
    publicKey: CONFIG.langfusePublicKey,
    secretKey: CONFIG.langfuseSecretKey,
    baseUrl: CONFIG.langfuseBaseUrl,
    sessionId: CONFIG.sessionId,
    userId: CONFIG.userId,
    tags: ['test', 'agent-verification'],
  });
  
  // Wrap callback to see if it's called
  const originalHandleChainStart = (langfuseCallback as any).handleChainStart?.bind(langfuseCallback);
  if (originalHandleChainStart) {
    (langfuseCallback as any).handleChainStart = async function(...args: any[]) {
      console.log('[Debug] handleChainStart called');
      return originalHandleChainStart(...args);
    };
  }
  
  const originalHandleLLMStart = (langfuseCallback as any).handleLLMStart?.bind(langfuseCallback);
  if (originalHandleLLMStart) {
    (langfuseCallback as any).handleLLMStart = async function(...args: any[]) {
      console.log('[Debug] handleLLMStart called');
      return originalHandleLLMStart(...args);
    };
  }
  
  console.log('✓ Langfuse initialized');
  
  // Create model
  const model = new ChatOpenAI({
    apiKey: CONFIG.openaiApiKey,
    model: CONFIG.modelName,
  });
  
  // Add web_search to model.metadata.tools (exactly like n8n does)
  // This is how n8n's OpenAI Chat Model node sets it up
  const webSearchTool = {
    type: 'web_search' as const,
    search_context_size: 'medium' as const,
  };
  
  model.metadata = {
    ...model.metadata,
    tools: [webSearchTool],
  };
  
  console.log('✓ Model created with web_search in metadata.tools');
  console.log('  Model metadata.tools:', model.metadata?.tools?.length || 0);
  
  console.log('✓ Langfuse initialized');
  
  // Create simple prompt that FORCES tool use
  const prompt = ChatPromptTemplate.fromMessages([
    ['system', 'You MUST use the web_search tool for ANY question about news, current events, or real-time information. Do NOT answer without searching first.'],
    ['human', '{input}'],
    new MessagesPlaceholder('agent_scratchpad'),
  ]);
  
  // Get all tools (from model.metadata.tools)
  const modelTools = (model.metadata?.tools as any[]) || [];
  console.log('✓ Model tools from metadata:', modelTools.length);
  
  // Create agent with model that has tools in metadata
  const agent = createToolCallingAgent({
    llm: model,
    tools: modelTools, // Pass tools from metadata
    prompt,
    streamRunnable: false,
  });
  
  console.log('✓ Agent created');
  console.log('\\nInvoking agent with: "Search for news about Hong Kong fires"\\n');
  
  const startTime = Date.now();
  // Invoke agent directly (like n8n V3 does)
  const result = await agent.invoke(
    {
      input: 'Search the web for the latest news about Hong Kong fires',
      steps: [],
    } as any,
    {
      callbacks: [langfuseCallback],
    }
  );
  const duration = Date.now() - startTime;
  
  console.log(`✓ Response received (${duration}ms)`);
  const outputText = result.output || (typeof result === 'string' ? result : JSON.stringify(result).substring(0, 200));
  console.log('  Output:', outputText);
  
  // Check result structure
  console.log('\nDebug - Result structure:');
  console.log('  Keys:', Object.keys(result));
  console.log('  Output length:', result.output?.length || 0);
  
  // Flush Langfuse
  console.log('\\n⏳ Flushing Langfuse and waiting for ingestion...');
  await (langfuseCallback as any).flushAsync?.();
  await langfuseClient.flushAsync();
  
  // Wait for ingestion
  await new Promise(resolve => setTimeout(resolve, 12000));
  
  // Get trace ID
  const traceId = (langfuseCallback as any).traceId || (langfuseCallback as any).lastTraceId;
  
  if (!traceId) {
    throw new Error('No trace ID found');
  }
  
  console.log(`\\n🔍 Fetching trace from Langfuse API...`);
  console.log(`   Trace ID: ${traceId}`);
  
  const trace = await fetchTraceFromLangfuse(traceId);
  
  // Find generations in trace
  const generations = trace.observations?.filter((obs: any) => obs.type === 'GENERATION') || [];
  
  console.log(`\\n📊 Trace Analysis:`);
  console.log(`  Total observations: ${trace.observations?.length || 0}`);
  console.log(`  Generations: ${generations.length}`);
  
  // Check each generation for token usage
  let allPassed = true;
  const issues: string[] = [];
  
  generations.forEach((gen: any, idx: number) => {
    console.log(`\\n  Generation ${idx + 1}:`);
    console.log(`    Model: ${gen.model || 'N/A'}`);
    console.log(`    Input tokens: ${gen.usage?.input || 'MISSING'}`);
    console.log(`    Output tokens: ${gen.usage?.output || 'MISSING'}`);
    console.log(`    Total tokens: ${gen.usage?.total || 'MISSING'}`);
    
    if (!gen.usage?.output || gen.usage.output === 0) {
      allPassed = false;
      issues.push(`Generation ${idx + 1}: output tokens are ${gen.usage?.output || 'missing'}`);
    }
    
    if (!gen.usage?.input || gen.usage.input === 0) {
      allPassed = false;
      issues.push(`Generation ${idx + 1}: input tokens are ${gen.usage?.input || 'missing'}`);
    }
  });
  
  // Auto-assertions
  console.log('\\n' + '='.repeat(60));
  console.log('📊 AUTO-ASSERTIONS:\\n');
  
  const assertions = {
    'Trace has ID': !!traceId,
    'Trace fetched from API': !!trace,
    'Has generations': generations.length > 0,
    'All generations have output tokens > 0': allPassed,
  };
  
  let testsPassed = true;
  for (const [test, passed] of Object.entries(assertions)) {
    const icon = passed ? '✅' : '❌';
    console.log(`  ${icon} ${test}`);
    if (!passed) testsPassed = false;
  }
  
  if (issues.length > 0) {
    console.log('\\n🔴 Issues found:');
    issues.forEach(issue => console.log(`  - ${issue}`));
  }
  
  console.log('\\n🔗 Langfuse Trace: ' + `${CONFIG.langfuseBaseUrl}/trace/${traceId}`);
  console.log('='.repeat(60));
  
  if (testsPassed) {
    console.log('\\n✅ ALL TESTS PASSED - Output tokens are captured correctly!');
  } else {
    console.log('\\n❌ TESTS FAILED - Output tokens issue reproduced');
  }
  
  return testsPassed;
}

testAgentWithLangfuseVerification()
  .then((passed) => {
    process.exit(passed ? 0 : 1);
  })
  .catch((error) => {
    console.error('\\n💥 Test crashed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  });
