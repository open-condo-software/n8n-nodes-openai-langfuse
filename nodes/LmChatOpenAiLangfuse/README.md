# OpenAI Chat Model with Langfuse

This n8n node provides an OpenAI Chat Model with integrated Langfuse tracing and observability. It wraps the standard OpenAI Chat Model with Langfuse callbacks, allowing you to capture detailed traces, token usage, and performance metrics for all LLM interactions.

## Key Features

- **Full OpenAI Chat Model compatibility**: Works exactly like the standard n8n OpenAI Chat Model node
- **Langfuse tracing**: Automatic capture of LLM calls, tool executions, and token usage
- **Token Usage Fix**: Properly handles `estimatedTokenUsage` → `tokenUsage` transformation for accurate tracking
- **Built-in Tools Support**: Supports model-level tools (like web search) via metadata
- **Session tracking**: Group traces by session ID for conversation flows
- **User identification**: Track which users are using your agents
- **Tagging and metadata**: Add custom tags and metadata to traces for filtering and analysis
- **Works with n8n's V3 Agent**: Connect this node to n8n's standard AI Agent node for tool calling and reasoning

## Why Use This Node?

Instead of creating a custom agent node (which requires reimplementing complex agent logic), this node provides a **simple, maintainable solution**:

1. **Separation of Concerns**: Langfuse tracing happens at the LLM level via callbacks, not at the agent level
2. **Leverage n8n's Agent**: Use n8n's proven V3 Agent node for orchestration and tool calling
3. **Zero Code Changes**: Drop-in replacement for the standard OpenAI Chat Model node
4. **Complete Observability**: All LLM calls, tool executions, and token usage are automatically traced

## How It Works

```
┌─────────────────────────────────────┐
│  OpenAI Chat Model with Langfuse   │
│  (This Node)                        │
│                                     │
│  • Wraps ChatOpenAI                 │
│  • Adds Langfuse CallbackHandler   │
│  • Captures all LLM interactions   │
└──────────────┬──────────────────────┘
               │ ai_languageModel
               ▼
┌─────────────────────────────────────┐
│         n8n AI Agent (V3)           │
│                                     │
│  • Orchestrates tool calling        │
│  • Handles reasoning models         │
│  • Manages multi-turn conversations │
└─────────────────────────────────────┘
```

## Setup

### 1. Configure Credentials

Create a new "OpenAI API with Langfuse" credential with:

- **OpenAI API Key**: Your OpenAI API key
- **Langfuse Public Key**: Your Langfuse project public key
- **Langfuse Secret Key**: Your Langfuse project secret key
- **Langfuse Base URL**: Default is `https://cloud.langfuse.com` (or your self-hosted URL)

### 2. Add the Node to Your Workflow

1. Add "OpenAI Chat Model with Langfuse" node to your workflow
2. Configure the model settings (model name, temperature, etc.)
3. Optionally configure session ID, user ID, tags, and metadata for Langfuse tracking

### 3. Connect to AI Agent

Connect the output of this node to the `Model` input of an "AI Agent" node. The agent will use this model for all LLM interactions, and Langfuse will automatically capture all traces.

## Configuration

### Required Parameters

- **Model**: The OpenAI model to use (e.g., `gpt-4o`, `gpt-4o-mini`, `o1`, `o3-mini`)

### Langfuse Parameters

- **Session ID**: Group traces by session for conversation flows
- **User ID**: Track which users are using your AI agents
- **Tags**: Comma-separated tags for filtering traces (e.g., `production,agent-v2`)
- **Parent Span ID**: Link this node's observations under an existing parent observation
- **Trace ID**: Continue an existing distributed trace across your app/test runner and n8n
- **Metadata**: JSON object with custom metadata (e.g., `{"environment":"production","version":"1.0"}`)

### OpenAI Options

All standard OpenAI parameters are supported:

- **Base URL**: Override the default OpenAI API endpoint
- **Temperature**: Controls randomness (0-2)
- **Maximum Tokens**: Maximum tokens to generate (-1 for no limit)
- **Frequency Penalty**: Reduce repetition (-2 to 2)
- **Presence Penalty**: Encourage topic diversity (-2 to 2)
- **Top P**: Nucleus sampling (0-1)
- **Timeout**: Request timeout in milliseconds
- **Max Retries**: Maximum number of retries

## Example Workflow

```
1. [Trigger] → Get user input
2. [OpenAI Chat Model with Langfuse] → Configure model
   ├─ Model: gpt-4o-mini
   ├─ Session ID: {{ $json.sessionId }}
   ├─ User ID: {{ $json.userId }}
   └─ Tags: production,customer-support
3. [AI Agent] → Connect Model input to step 2
   ├─ System Prompt: "You are a helpful customer support agent"
   └─ Tools: [Email Tool, Database Lookup Tool]
4. [Output] → Return response to user
```

## What Gets Traced?

Langfuse automatically captures:

- **LLM Calls**: All requests to OpenAI with input/output tokens
- **Tool Executions**: When using with AI Agent, all tool calls are traced
- **Token Usage**: Detailed token counts for prompts, completions, and reasoning
- **Latency**: Response times for each LLM call
- **Costs**: Estimated costs based on token usage and model pricing
- **Errors**: Any errors that occur during LLM calls

## Reasoning Models (o1/o3)

This node fully supports OpenAI's reasoning models (o1, o3-mini, etc.):

- **Multi-turn tool execution**: The standard AI Agent handles tool calling correctly
- **Token tracking**: Reasoning tokens are captured separately in Langfuse
- **No special handling needed**: Works exactly like other models

## Troubleshooting

### No Traces in Langfuse

1. Check your Langfuse credentials are correct
2. Verify the Base URL is set correctly (cloud vs self-hosted)
3. Check Langfuse project is active and accessible

### Token Usage Not Showing

- Langfuse may take a few seconds to process traces
- Check the Langfuse dashboard for any API errors
- Verify your Langfuse project has token tracking enabled

### Model Not Available

- Ensure you have access to the model in your OpenAI account
- Check the model name is spelled correctly (case-sensitive)
- Verify your OpenAI API key has sufficient credits

## Technical Details

### Token Usage Transformation

This node includes a critical fix for token usage tracking with Langfuse. The `langfuse-langchain` library expects `tokenUsage` in the `llmOutput`, but OpenAI sometimes returns `estimatedTokenUsage` (especially with tool calls) or `usage_metadata` (in message responses).

The node wraps `CallbackHandler.handleLLMEnd` to transform these different formats:

```typescript
// Fallback chain:
1. tokenUsage (standard)
2. estimatedTokenUsage → tokenUsage (tool calls)
3. usage_metadata → tokenUsage (message-level)
```

This ensures accurate token tracking in Langfuse regardless of which format OpenAI returns.

### Built-in Tools Support

Some OpenAI models support built-in tools (like web search). These tools can be passed via the `builtInTools` option and will be stored in `model.metadata.tools`. The n8n AI Agent will automatically merge these with regular n8n tool nodes.

```typescript
// Example:
options: {
  builtInTools: [
    { name: 'web_search', description: 'Search the web' }
  ]
}
```

## Development

### Running Tests

```bash
pnpm test nodes/LmChatOpenAiLangfuse/LmChatOpenAiLangfuse.node.test.ts
```

### Building

```bash
pnpm build
```

## License

MIT
