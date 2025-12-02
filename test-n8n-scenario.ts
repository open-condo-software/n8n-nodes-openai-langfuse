/**
 * Test script that mimics EXACTLY what the n8n node does
 * With automatic trace verification
 */

import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';
import { Langfuse } from 'langfuse';
import { CallbackHandler } from 'langfuse-langchain';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

const CONFIG = {
  openaiApiKey: process.env.OPENAI_API_KEY!,
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY!,
  langfuseBaseUrl: process.env.LANGFUSE_BASE_URL || 'https://prompts.accept.copperiq.com',
  sessionId: 'test-n8n-' + Date.now(),
  userId: 'test@example.com',
};

async function verifyTrace(traceId: string): Promise<boolean> {
  const authHeader = 'Basic ' + Buffer.from(`${CONFIG.langfusePublicKey}:${CONFIG.langfuseSecretKey}`).toString('base64');
  
  // Wait for ingestion
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  const response = await fetch(`${CONFIG.langfuseBaseUrl}/api/public/traces/${traceId}`, {
    headers: { 'Authorization': authHeader },
  });
  
  if (!response.ok) {
    console.log('❌ Trace not found in API');
    return false;
  }
  
  const trace = await response.json();
  const generations = trace.observations?.filter((o: any) => o.type === 'GENERATION') || [];
  
  console.log('\n📊 Verification Results:');
  console.log(`  Trace ID: ${traceId}`);
  console.log(`  Generations: ${generations.length}`);
  
  for (const gen of generations) {
    console.log(`\n  Generation: ${gen.name}`);
    console.log(`    Model: ${gen.model}`);
    console.log(`    Input tokens: ${gen.usage?.input || 0}`);
    console.log(`    Output tokens: ${gen.usage?.output || 0}`);
    console.log(`    Total tokens: ${gen.usage?.total || 0}`);
    
    if (!gen.usage?.output || gen.usage.output === 0) {
      console.log('    ❌ NO OUTPUT TOKENS!');
      return false;
    }
  }
  
  console.log('\n✅ All tokens captured correctly!');
  return true;
}

async function testN8nScenario() {
  console.log('🧪 Testing exact n8n scenario...\n');
  
  // Step 1: Fetch prompt from Langfuse (like n8n does)
  const langfuseClient = new Langfuse({
    publicKey: CONFIG.langfusePublicKey,
    secretKey: CONFIG.langfuseSecretKey,
    baseUrl: CONFIG.langfuseBaseUrl,
  });
  
  const fetchedPrompt = await langfuseClient.getPrompt('test-websearch');
  console.log('✓ Fetched prompt:', fetchedPrompt.name, 'v' + fetchedPrompt.version);
  
  // Step 2: Create CallbackHandler
  const callbackHandler = new CallbackHandler({
    publicKey: CONFIG.langfusePublicKey,
    secretKey: CONFIG.langfuseSecretKey,
    baseUrl: CONFIG.langfuseBaseUrl,
    sessionId: CONFIG.sessionId,
    userId: CONFIG.userId,
    tags: ['test', 'n8n-scenario'],
  });
  
  console.log('✓ CallbackHandler created');
  
  // Step 3: Get model from n8n (with pre-configured tools)
  // Use gpt-5 which supports web_search
  const baseModel = new ChatOpenAI({
    apiKey: CONFIG.openaiApiKey,
    model: 'gpt-5-2025-08-07',
    callbacks: [], // n8n injects its own callback here
  });
  
  // Bind web_search tool
  const model = baseModel.bindTools([
    {
      type: 'web_search',
      search_context_size: 'medium',
    },
  ]);
  
  console.log('✓ Model created with built-in tools');
  
  // Step 4: Compile prompt messages
  const promptMessages = (fetchedPrompt.prompt as any[]).map((msg: any) => {
    const content = msg.content.replace(/\{\{\s*subject\s*\}\}/g, 'Hong Kong fires');
    if (msg.role === 'system') {
      return new SystemMessage(content);
    } else {
      return new HumanMessage(content);
    }
  });
  
  console.log('✓ Prompt compiled with', promptMessages.length, 'messages');
  
  // Step 5: Inject Langfuse callback into model
  if (!model.callbacks) {
    model.callbacks = [];
  }
  model.callbacks.push(callbackHandler);
  console.log('✓ Langfuse callback injected');
  
  // Step 6: Invoke model directly (preserves token capture)
  // NOTE: Prompt linking does NOT work with this pattern
  // Prompt linking requires ChatPromptTemplate.metadata + chain (prompt | model)
  // However, that pattern breaks token capture and doesn't work with agent loops
  // For n8n use case, token capture is MORE important than prompt linking
  console.log('\n📤 Invoking model...');
  const response = await model.invoke(promptMessages, {
    runName: 'AI Agent: test-websearch',
  });
  
  console.log('✓ Response received');
  console.log('  Content length:', response.content.toString().length);
  console.log('  Usage:', response.usage_metadata);
  
  // Step 7: Flush
  await callbackHandler.flushAsync?.();
  await langfuseClient.flushAsync();
  console.log('✓ Flushed');
  
  // Step 8: Verify
  const traceId = (callbackHandler as any).traceId;
  console.log('\n🔗 Trace:', `${CONFIG.langfuseBaseUrl}/trace/${traceId}`);
  
  const success = await verifyTrace(traceId);
  
  return success;
}

testN8nScenario()
  .then(success => {
    if (success) {
      console.log('\n✅ TEST PASSED');
      process.exit(0);
    } else {
      console.log('\n❌ TEST FAILED');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ ERROR:', error);
    process.exit(1);
  });
