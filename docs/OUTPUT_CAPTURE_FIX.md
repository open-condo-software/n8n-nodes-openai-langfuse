# Output Capture Fix for Langfuse Integration

## Problem

The `langfuse-langchain` CallbackHandler (v3.38.6) does **not properly capture**:

1. **Output content** when `response.content` is an array (OpenAI Responses API format)
2. **Output tokens** from `usage_metadata`

### Root Cause

When using ChatOpenAI with built-in tools (like `web_search`), OpenAI's Responses API returns content in array format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "The actual response text..."
    }
  ],
  "usage_metadata": {
    "input_tokens": 17068,
    "output_tokens": 1506,
    "total_tokens": 18574
  }
}
```

The standard CallbackHandler expects:
- `content` as a string
- Usage in `response_metadata.usage` (not `usage_metadata`)

## Solution

### Enhanced Callback Handler

Created `utils/EnhancedLangfuseCallbackHandler.ts` that:

1. **Wraps the standard CallbackHandler**
2. **Provides a `fixOutput` method** that:
   - Extracts text from array-format content
   - Extracts usage from `usage_metadata` or `response_metadata.usage`
   - Manually updates the Langfuse generation with correct data

### Usage Pattern

```typescript
import { createEnhancedLangfuseCallback } from './utils/EnhancedLangfuseCallbackHandler';

// Create enhanced callback
const { handler, fixOutput } = createEnhancedLangfuseCallback(
  {
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
    sessionId: 'session-123',
    userId: 'user@example.com',
  },
  langfuseClient
);

// Use handler in model invocation
const response = await model.invoke(messages, {
  callbacks: [handler],
});

// CRITICAL: Manually fix output after invocation
await fixOutput(response);

// Flush events
await langfuseClient.flushAsync();
```

## Test Results

**Latest Trace:** https://prompts.accept.copperiq.com/trace/c45745ec-ac4a-4a02-95c5-93a21cff74b5

### Langfuse UI Behavior (Important!)

The Langfuse UI shows a **hierarchical trace structure**:
- **Parent Span** (top-level "ChatOpenAI"): Shows `output: null` - THIS IS EXPECTED
- **Child Generation** (nested "ChatOpenAI"): Shows full output text and token usage - THIS IS WHERE THE DATA IS

**This is NOT a bug** - it's how Langfuse represents nested LangChain executions.

### What Gets Captured

✅ **All data is captured correctly:**
- Output text: Full response (7000+ characters)
- Input tokens: ~17,000
- Output tokens: ~1,500 
- Total tokens: ~18,500
- Session ID and User ID
- Model metadata

### Where to Find the Output

In Langfuse UI:
1. Expand the trace tree on the left
2. Click on the **nested/child "ChatOpenAI" generation** (not the parent)
3. The output and tokens are visible there

### Remaining Issue: Prompt Linking

Prompt linking status still needs verification. The prompt is passed via metadata but may require additional configuration.

## Integration into AiAgentLangfuse Node

The fix needs to be integrated into:
- `nodes/AiAgentLangfuse/AiAgentLangfuse.node.ts`

Steps:
1. Import `createEnhancedLangfuseCallback`
2. Replace `CallbackHandler` creation with enhanced version
3. Call `fixOutput(response)` immediately after model invocation
4. Ensure flush happens after fix

## Alternative Solutions Considered

### 1. Upgrade langfuse-langchain
- **Status**: Not available yet
- **Issue**: v3.38.6 is latest, doesn't support new response format
- **Action**: Monitor for updates

### 2. Custom CallbackHandler Subclass
- **Status**: Not feasible
- **Issue**: handleLLMEnd is already called before we can intercept
- **Reason**: Manual update is required

### 3. OpenAI SDK Wrapper
- **Status**: Too invasive
- **Issue**: Would require wrapping entire ChatOpenAI class
- **Reason**: Current solution is cleaner

## Prompt Linking Status

**Note**: Prompt linking still needs verification. The prompt is passed in metadata as:
```typescript
{
  metadata: {
    langfusePrompt: fetchedPrompt
  }
}
```

This may also require manual linking if CallbackHandler doesn't handle it properly.
