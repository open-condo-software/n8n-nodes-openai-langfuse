# Basic AI Agent with Langfuse Tracing

This example shows how to use the "OpenAI Chat Model with Langfuse" node with n8n's built-in AI Agent node.

## Workflow Structure

```
Trigger (Webhook)
    ↓
OpenAI Chat Model with Langfuse
    ↓
AI Agent (n8n built-in V3)
    ↓
Tools (HTTP Request, Code, etc.)
    ↓
Return Response
```

## Configuration

### 1. Trigger (Webhook)

Configure a webhook to receive user queries:

```json
{
  "httpMethod": "POST",
  "path": "chat",
  "responseMode": "lastNode"
}
```

**Input Example:**
```json
{
  "message": "What's the weather in San Francisco?",
  "userId": "user-123",
  "sessionId": "session-abc"
}
```

### 2. OpenAI Chat Model with Langfuse

Connect to your OpenAI + Langfuse credentials and configure the model:

```json
{
  "model": "gpt-4o-mini",
  "sessionId": "={{ $json.sessionId }}",
  "userId": "={{ $json.userId }}",
  "tags": "production,customer-support",
  "metadata": "{\"environment\":\"production\"}",
  "options": {
    "temperature": 0.7,
    "maxTokens": 500
  }
}
```

### 3. AI Agent (n8n built-in)

Connect the Model input to the OpenAI Chat Model with Langfuse node:

```json
{
  "systemMessage": "You are a helpful assistant that can check the weather and answer questions.",
  "text": "={{ $json.message }}",
  "hasOutputParser": false
}
```

### 4. HTTP Request Tool

Add a weather API tool:

```json
{
  "name": "get_weather",
  "description": "Get the current weather for a city",
  "schemaType": "fromAI",
  "method": "GET",
  "url": "https://api.weatherapi.com/v1/current.json",
  "sendQuery": true,
  "queryParameters": {
    "parameters": [
      {
        "name": "key",
        "value": "YOUR_WEATHER_API_KEY"
      },
      {
        "name": "q",
        "value": "={{ $json.city }}"
      }
    ]
  }
}
```

### 5. Return Response

Format and return the response:

```json
{
  "response": "={{ $json.output }}"
}
```

## What Gets Traced in Langfuse?

When you run this workflow, Langfuse will capture:

1. **LLM Call #1**: Initial query processing
   - Input: System message + user query
   - Output: Tool call decision
   - Tokens: Prompt + completion + reasoning (if o1/o3)
   
2. **Tool Execution**: Weather API call
   - Tool name: get_weather
   - Input parameters: city
   - Output: Weather data
   
3. **LLM Call #2**: Response generation
   - Input: Tool results
   - Output: Final response to user
   - Tokens: Prompt + completion

4. **Session Grouping**: All traces linked by session ID
5. **User Tracking**: All traces tagged with user ID
6. **Custom Tags**: "production", "customer-support"
7. **Metadata**: Environment info

## Testing the Workflow

### Example Request

```bash
curl -X POST http://localhost:5678/webhook/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is the weather like in San Francisco?",
    "userId": "user-123",
    "sessionId": "session-abc"
  }'
```

### Expected Response

```json
{
  "response": "The current weather in San Francisco is partly cloudy with a temperature of 18°C (64°F)."
}
```

### Check Langfuse Dashboard

1. Go to your Langfuse project dashboard
2. Filter by session ID: `session-abc`
3. You should see:
   - 2 LLM generations (initial + response)
   - 1 tool execution (weather API)
   - Token counts for each step
   - Total latency
   - Estimated costs

## Using with Reasoning Models (o1/o3)

Simply change the model in step 2:

```json
{
  "model": "o3-mini",
  "sessionId": "={{ $json.sessionId }}",
  "userId": "={{ $json.userId }}",
  "tags": "reasoning,production",
  "options": {
    "reasoningEffort": "medium"
  }
}
```

Reasoning tokens are automatically captured separately in Langfuse!

## Multi-Turn Conversations

To handle conversations, maintain the session ID across requests:

```bash
# First message
curl -X POST http://localhost:5678/webhook/chat \
  -d '{"message": "What is the weather?", "sessionId": "conv-1", "userId": "user-123"}'

# Follow-up message (same session)
curl -X POST http://localhost:5678/webhook/chat \
  -d '{"message": "What about tomorrow?", "sessionId": "conv-1", "userId": "user-123"}'
```

Both messages will appear in the same Langfuse session, making it easy to analyze conversation flows.

## Advanced: Dynamic Metadata

Add dynamic metadata based on the conversation:

```json
{
  "model": "gpt-4o-mini",
  "sessionId": "={{ $json.sessionId }}",
  "userId": "={{ $json.userId }}",
  "metadata": "={{ JSON.stringify({
    'query_type': $json.message.includes('weather') ? 'weather' : 'general',
    'timestamp': new Date().toISOString(),
    'source': 'webhook'
  }) }}"
}
```

This allows rich filtering in Langfuse!
