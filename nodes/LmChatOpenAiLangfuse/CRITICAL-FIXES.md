# Critical Fixes Applied from Previous Learnings

This document explains the critical fixes that were ported from our previous custom agent implementation to this LLM-only node.

## 1. Token Usage Transformation Fix

### The Problem
The `langfuse-langchain` CallbackHandler expects `tokenUsage` in the `llmOutput` object, but OpenAI returns different formats depending on the context:

- **Without tools**: Returns `llmOutput.tokenUsage` ✅
- **With tools**: Returns `llmOutput.estimatedTokenUsage` ❌
- **Message-level**: Returns `message.usage_metadata` ❌

When `tokenUsage` is missing, the CallbackHandler crashes with:
```
Cannot use 'in' operator to search for 'promptTokens' in undefined
```

### The Solution
We wrap `CallbackHandler.handleLLMEnd` to transform these formats:

```typescript
const originalHandleLLMEnd = (langfuseCallback as any).handleLLMEnd?.bind(langfuseCallback);
if (originalHandleLLMEnd) {
  (langfuseCallback as any).handleLLMEnd = async function (...args: any[]) {
    const output = args[0];
    
    // Try to get token usage from multiple sources
    let tokenUsage = output?.llmOutput?.tokenUsage;
    
    // Fallback 1: estimatedTokenUsage (common with tool calls)
    if (!tokenUsage && output?.llmOutput?.estimatedTokenUsage) {
      tokenUsage = {
        promptTokens: output.llmOutput.estimatedTokenUsage.promptTokens,
        completionTokens: output.llmOutput.estimatedTokenUsage.completionTokens,
        totalTokens: output.llmOutput.estimatedTokenUsage.totalTokens,
      };
    }
    
    // Fallback 2: usage_metadata (from message)
    if (!tokenUsage) {
      const lastResponse = output.generations?.[output.generations.length - 1]?.[output.generations[output.generations.length - 1].length - 1];
      const usageMetadata = lastResponse?.message?.usage_metadata;
      if (usageMetadata) {
        tokenUsage = {
          promptTokens: usageMetadata.input_tokens ?? usageMetadata.promptTokens ?? 0,
          completionTokens: usageMetadata.output_tokens ?? usageMetadata.completionTokens ?? 0,
          totalTokens: usageMetadata.total_tokens ?? usageMetadata.totalTokens ?? 0,
        };
      }
    }
    
    // Ensure tokenUsage exists in llmOutput to prevent crashes
    if (tokenUsage) {
      args[0] = {
        ...output,
        llmOutput: {
          ...output.llmOutput,
          tokenUsage,
        },
      };
    }
    
    return originalHandleLLMEnd(...args);
  };
}
```

### Why This Matters
Without this fix:
- ❌ Token usage not tracked when using tools
- ❌ Langfuse crashes during handleLLMEnd
- ❌ Missing cost estimates in Langfuse dashboard

With this fix:
- ✅ Accurate token tracking in all scenarios
- ✅ No crashes
- ✅ Complete cost visibility in Langfuse

## 2. Built-in Model Tools Support

### The Problem
Some OpenAI models support built-in tools (like web search, code interpreter, file search). These tools need to be:
1. Passed to the model
2. Made available to the n8n AI Agent
3. Merged with regular n8n tool nodes

### The Solution
Store built-in tools in `model.metadata.tools`:

```typescript
// Support built-in model tools (like web search for certain models)
if (options.builtInTools) {
  if (!model.metadata) {
    model.metadata = {};
  }
  model.metadata.tools = options.builtInTools;
}
```

The n8n AI Agent will automatically:
1. Read `model.metadata.tools`
2. Merge them with connected n8n tool nodes
3. Present all tools to the LLM

### Example Usage

```typescript
// In the node configuration:
{
  model: 'gpt-4o',
  options: {
    builtInTools: [
      { name: 'web_search', description: 'Search the web' },
      { name: 'code_interpreter', description: 'Execute Python code' }
    ]
  }
}
```

### Why This Matters
Without this fix:
- ❌ Built-in model tools ignored
- ❌ Models with special capabilities can't use them
- ❌ Must manually recreate functionality with n8n nodes

With this fix:
- ✅ Built-in tools automatically available
- ✅ Models can use all their capabilities
- ✅ Cleaner, simpler workflows

## 3. Proper CallbackHandler Configuration

### The Setup
The CallbackHandler must be configured with:
- **sessionId**: For grouping traces
- **userId**: For user tracking
- **tags**: For filtering
- **metadata**: For additional context

```typescript
const langfuseCallback = new CallbackHandler({
  publicKey: credentials.langfusePublicKey as string,
  secretKey: credentials.langfuseSecretKey as string,
  baseUrl: credentials.langfuseBaseUrl as string,
  sessionId: sessionId || undefined,
  userId: userId || undefined,
  tags: tags.length > 0 ? tags : undefined,
  metadata,
});
```

### Automatic Metadata Enrichment
We automatically add execution context:

```typescript
metadata.executionId = this.getExecutionId();
const workflowName = this.getWorkflow().name;
if (workflowName) {
  metadata.workflowName = workflowName;
}
```

This ensures every trace includes:
- Which n8n execution triggered it
- Which workflow it came from
- Any custom metadata the user added

## Testing

All three fixes are covered by tests:

```bash
# Run tests
pnpm test nodes/LmChatOpenAiLangfuse/LmChatOpenAiLangfuse.node.test.ts

# Tests include:
# ✅ Token usage wrapper exists
# ✅ Built-in tools stored in metadata
# ✅ CallbackHandler properly configured
# ✅ Metadata enrichment works
```

## References

These fixes were discovered and validated in:
- `nodes/AiAgentLangfuse/AiAgentLangfuse.node.ts` (lines 916-929, 806-816)
- `nodes/AiAgentLangfuse/patches/langfuse-callback-patch.ts` (complete file)

The key insight: **Langfuse tracing should happen at the LLM level via callbacks, not at the agent level**. This makes the code simpler, more maintainable, and leverages n8n's existing agent logic.
