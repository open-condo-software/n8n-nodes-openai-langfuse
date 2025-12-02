import 'dotenv/config';
import { Langfuse } from 'langfuse';

const TRACE_ID = '3ab20174-6ced-4b17-8fee-dd558a3fabc8'; // Latest working trace

const langfuse = new Langfuse({
  publicKey: 'pk-lf-d478681e-3e50-4e17-a34b-8616f506299b',
  secretKey: 'sk-lf-24d91061-3404-4f83-bba1-44a713a37fb2',
  baseUrl: 'https://prompts.accept.copperiq.com',
});

async function inspectTrace() {
  console.log('Fetching trace:', TRACE_ID);
  console.log('Note: Langfuse SDK does not have a direct trace fetch API');
  console.log('Using HTTP API instead...\n');

  const auth = {
    username: 'pk-lf-d478681e-3e50-4e17-a34b-8616f506299b',
    password: 'sk-lf-24d91061-3404-4f83-bba1-44a713a37fb2',
  };

  try {
    const response = await fetch(
      `https://prompts.accept.copperiq.com/api/public/traces/${TRACE_ID}`,
      {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${auth.username}:${auth.password}`).toString('base64'),
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const trace = await response.json();
    console.log('Trace fetched successfully!\n');
    console.log('='.repeat(80));
    console.log('TRACE OVERVIEW');
    console.log('='.repeat(80));
    console.log('ID:', trace.id);
    console.log('Name:', trace.name);
    console.log('Session ID:', trace.sessionId);
    console.log('User ID:', trace.userId);
    console.log('Input:', JSON.stringify(trace.input, null, 2));
    console.log('Output:', JSON.stringify(trace.output, null, 2));
    console.log('\n' + '='.repeat(80));
    console.log('OBSERVATIONS');
    console.log('='.repeat(80));

    if (trace.observations && trace.observations.length > 0) {
      trace.observations.forEach((obs: any, idx: number) => {
        console.log(`\n[${idx + 1}] ${obs.type}: ${obs.name}`);
        console.log('    Input tokens:', obs.usage?.input || obs.promptTokens || 'N/A');
        console.log('    Output tokens:', obs.usage?.output || obs.completionTokens || 'N/A');
        console.log('    Total tokens:', obs.usage?.total || obs.totalTokens || 'N/A');
        
        if (obs.input) {
          const inputStr = JSON.stringify(obs.input);
          console.log('    Input length:', inputStr.length, 'chars');
          console.log('    Input preview:', inputStr.substring(0, 200) + '...');
        }
        
        if (obs.output) {
          const outputStr = JSON.stringify(obs.output);
          console.log('    Output length:', outputStr.length, 'chars');
          console.log('    Output preview:', outputStr.substring(0, 200) + '...');
        }
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('TOKEN ANALYSIS');
    console.log('='.repeat(80));
    
    const totalInputTokens = trace.observations?.reduce((sum: number, obs: any) => 
      sum + (obs.usage?.input || obs.promptTokens || 0), 0) || 0;
    const totalOutputTokens = trace.observations?.reduce((sum: number, obs: any) => 
      sum + (obs.usage?.output || obs.completionTokens || 0), 0) || 0;
    
    console.log('Total input tokens:', totalInputTokens);
    console.log('Total output tokens:', totalOutputTokens);
    console.log('Total tokens:', totalInputTokens + totalOutputTokens);

  } catch (error) {
    console.error('Error fetching trace:', error);
  }
}

inspectTrace();
