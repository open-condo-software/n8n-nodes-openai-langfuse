/**
 * Verify Langfuse trace data via API
 * Usage: npx tsx verify-langfuse-trace.ts <trace-id>
 */

import 'dotenv/config';

const CONFIG = {
  publicKey: process.env.LANGFUSE_PUBLIC_KEY || 'pk-lf-d478681e-3e50-4e17-a34b-8616f506299b',
  secretKey: process.env.LANGFUSE_SECRET_KEY || 'sk-lf-24d91061-3404-4f83-bba1-44a713a37fb2',
  baseUrl: process.env.LANGFUSE_BASE_URL || 'https://prompts.accept.copperiq.com',
};

async function getTrace(traceId: string) {
  const authHeader = 'Basic ' + Buffer.from(`${CONFIG.publicKey}:${CONFIG.secretKey}`).toString('base64');
  
  const url = `${CONFIG.baseUrl}/api/public/traces/${traceId}`;
  console.log(`Fetching trace: ${url}\n`);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data;
}

async function main() {
  const traceId = process.argv[2];
  
  if (!traceId) {
    console.error('Usage: npx tsx verify-langfuse-trace.ts <trace-id>');
    process.exit(1);
  }
  
  try {
    console.log(`🔍 Verifying Langfuse trace: ${traceId}\n`);
    
    const trace = await getTrace(traceId);
    
    console.log('📊 Trace Data:');
    console.log('  ID:', trace.id);
    console.log('  Name:', trace.name);
    console.log('  Timestamp:', trace.timestamp);
    console.log('  User ID:', trace.userId);
    console.log('  Session ID:', trace.sessionId);
    console.log('  Tags:', trace.tags);
    console.log('');
    
    // Find all observations (spans/generations)
    const observations = trace.observations || [];
    console.log(`📝 Observations: ${observations.length}`);
    console.log('');
    
    for (const obs of observations) {
      console.log(`🔸 Observation: ${obs.name}`);
      console.log('   Type:', obs.type);
      console.log('   ID:', obs.id);
      
      if (obs.type === 'GENERATION') {
        console.log('   Model:', obs.model);
        console.log('   Usage:', JSON.stringify(obs.usage, null, 4));
        console.log('   Usage Details:', JSON.stringify(obs.usageDetails, null, 4));
        
        if (!obs.usage || !obs.usage.output) {
          console.log('   ❌ NO OUTPUT TOKENS CAPTURED!');
        } else {
          console.log('   ✅ Output tokens captured:', obs.usage.output);
        }
      }
      
      console.log('');
    }
    
    // Summary
    const generations = observations.filter((o: any) => o.type === 'GENERATION');
    const withTokens = generations.filter((g: any) => g.usage && g.usage.output);
    
    console.log('📊 Summary:');
    console.log(`  Total generations: ${generations.length}`);
    console.log(`  With output tokens: ${withTokens.length}`);
    console.log(`  Missing output tokens: ${generations.length - withTokens.length}`);
    
    if (withTokens.length === generations.length) {
      console.log('\n✅ All generations have output tokens captured!');
    } else {
      console.log('\n❌ Some generations are missing output tokens!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
