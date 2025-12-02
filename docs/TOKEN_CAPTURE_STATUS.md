# Token Capture Status - AI Agent Langfuse Node

## Current Status: ⚠️ PARTIAL SUCCESS

**Isolated Test**: ✅ **18,358 tokens captured** (including web_search)  
**n8n Runtime**: ❌ **60 tokens only** - significant discrepancy

---

## What Works ✅

### 1. Isolated Test Script (test-agent-langfuse-verify.ts)
- **Token Capture**: 18,358 total tokens, 1,188 output tokens
- **Setup**:
  - langchain 0.3.33 (matches n8n)
  - Model with `model.metadata.tools = [webSearchTool]`
  - `createToolCallingAgent({ llm: model, tools: modelTools })`
  - `agent.invoke({ input, steps: [] }, { callbacks: [langfuseCallback] })`
- **Result**: Full web_search execution with all tokens captured in Langfuse

### 2. Implementation Architecture
- ✅ Reads tools from `languageModel.metadata.tools` (n8n's approach)
- ✅ Combines with connected ai_tool nodes
- ✅ Uses `createToolCallingAgent` (matches n8n V3 Agent)
- ✅ Passes callbacks via invoke config parameter
- ✅ Proper Langfuse CallbackHandler initialization
- ✅ Session ID management with execution context

---

## What Doesn't Work ❌

### n8n Runtime Environment
- **Observed**: Only 60 tokens captured vs 18k expected
- **Symptom**: Web_search tool not executing OR tokens not being captured
- **Possible Causes**:
  1. Callbacks not propagating through n8n's execution context
  2. n8n's wrapper/middleware intercepting callbacks
  3. Model instance differences between test and n8n runtime
  4. n8n's execution engine handling tool calls differently

---

## Implementation Details

### Callback Handling Strategy
```typescript
// CORRECT APPROACH (proven in test):
const callbackHandler = new CallbackHandler({ /* config */ });

// Pass via invoke config, NOT model.callbacks
response = await agent.invoke(
  { steps: [], input: userInput },
  { callbacks: [callbackHandler] }  // ← Key: pass here
);
```

**Why this works**:
- `createToolCallingAgent` creates a Runnable chain
- Callbacks passed to invoke() propagate through the entire chain
- Model's built-in callbacks (from `.bindTools()`) are lost - don't use them

### Tool Configuration
```typescript
// N8N's approach (in OpenAI Chat Model node):
model.metadata = {
  ...model.metadata,
  tools: formatBuiltInTools(builtInTools)
};

// Our node reads it:
const modelTools = (languageModel.metadata?.tools) || [];
const allTools = [...tools, ...modelTools];

// Pass to agent:
createToolCallingAgent({ llm: model, tools: allTools })
```

---

## Investigation History

### Attempts That Failed
1. ❌ **Adding callbacks to model.callbacks**: Lost after `bindTools()`
2. ❌ **Using AgentExecutor**: Doesn't help with built-in OpenAI tools
3. ❌ **Using RunnableSequence**: Test shows it's not needed for basic case
4. ❌ **Direct model.invoke()**: Doesn't execute tools properly
5. ❌ **model.bindTools()**: Creates new instance, loses callbacks

### Breakthrough Discovery
- ✅ **Setting `model.metadata.tools`** (n8n's approach) works perfectly
- ✅ **Passing callbacks to agent.invoke()** ensures proper propagation
- ✅ **Using langchain 0.3.33** matches n8n's version

---

## Key Differences: Test vs n8n

### Test Environment
```typescript
// Manual model setup
const model = new ChatOpenAI({ ... });
model.metadata = { tools: [webSearchTool] };

// Direct agent invocation
const agent = createToolCallingAgent({ llm: model, tools });
await agent.invoke({ input, steps: [] }, { callbacks: [...] });
```

### n8n Environment
```typescript
// Model comes from n8n's connection
const languageModel = await this.getInputConnectionData('ai_languageModel', 0);

// n8n may wrap or modify the model
// Callbacks might not propagate the same way
await agent.invoke(...);
```

**Hypothesis**: n8n's `getInputConnectionData` returns a wrapped/proxied model that doesn't handle callbacks the same way.

---

## Next Steps 🔍

### Debugging in n8n
1. **Add extensive logging** to see:
   - What's in `languageModel.metadata.tools`
   - Whether `callbackHandler.handleLLMStart/End` are called
   - What the agent response structure looks like
   - Whether tools are actually passed to the agent

2. **Compare model instances**:
   ```typescript
   console.log('[Debug] Model type:', languageModel.constructor.name);
   console.log('[Debug] Model metadata:', languageModel.metadata);
   console.log('[Debug] Model has callbacks:', !!languageModel.callbacks);
   console.log('[Debug] Tools passed to agent:', allTools);
   ```

3. **Test callback propagation**:
   ```typescript
   const originalHandleLLMStart = callbackHandler.handleLLMStart?.bind(callbackHandler);
   callbackHandler.handleLLMStart = async (...args) => {
     console.log('[Debug] 🔵 handleLLMStart CALLED');
     return originalHandleLLMStart(...args);
   };
   ```

4. **Check if web_search executes**:
   - Log the response structure
   - Check if output length matches expectations (~1000+ chars for web_search)

### Potential Fixes

#### Option 1: Force Callback Registration
```typescript
// Try both approaches simultaneously
if (!languageModel.callbacks) {
  languageModel.callbacks = [];
}
languageModel.callbacks.push(callbackHandler);

// AND pass to invoke
await agent.invoke({ ... }, { callbacks: [callbackHandler] });
```

#### Option 2: Wrap Model
```typescript
// Create a wrapper that ensures callbacks
const wrappedModel = new Proxy(languageModel, {
  get(target, prop) {
    if (prop === 'invoke') {
      return async (...args) => {
        // Inject callbacks
        if (args[1]) args[1].callbacks = [callbackHandler];
        return target[prop](...args);
      };
    }
    return target[prop];
  }
});
```

#### Option 3: Use n8n's Execution Context
```typescript
// Check if n8n provides callback infrastructure
const n8nCallbacks = this.getExecutionContext?.()?.callbacks;
// Combine with our callback
```

---

## Test Verification

### Run Isolated Test
```bash
npx tsx test-agent-langfuse-verify.ts
```

**Expected Output**:
- ✅ ~18k total tokens
- ✅ ~1k+ output tokens
- ✅ Trace created in Langfuse with generation

### Run in n8n
1. Connect OpenAI Chat Model with web_search enabled
2. Connect to AI Agent Langfuse node
3. Execute with prompt about current events
4. Check Langfuse trace

**Currently Seeing**:
- ❌ 60 tokens only
- ❌ Web_search not reflected in token count

---

## Code References

### Node Implementation
- **File**: `nodes/AiAgentLangfuse/AiAgentLangfuse.node.ts`
- **Key Lines**:
  - Line 594: Read `model.metadata.tools`
  - Line 634-639: Create agent with `createToolCallingAgent`
  - Line 652-660: Invoke with callbacks

### Test Script
- **File**: `test-agent-langfuse-verify.ts`
- **Key Setup**:
  - Line 95-98: Set `model.metadata.tools`
  - Line 117-121: Create agent
  - Line 129-136: Invoke with callbacks

### Reference Implementation
- **File**: `langfuse-poc/n8n-source/.../ToolsAgent/V3/execute.ts`
- **Key Pattern**:
  - Line 91-94: `getAllTools(model, tools)`
  - Line 109-114: `createToolCallingAgent`
  - Line 517: `executor.invoke()`

---

## Conclusion

**The implementation is theoretically correct** based on:
1. ✅ Matches n8n V3 Agent pattern
2. ✅ Isolated test proves it works with 18k tokens
3. ✅ Proper callback handling verified

**The n8n runtime issue** suggests:
- 🔍 n8n's execution context differs from isolated test
- 🔍 Something in n8n's model wrapper or execution engine interferes
- 🔍 Need more debugging in actual n8n environment

**Next Action**: Add comprehensive debug logging to the node and test in n8n to understand the discrepancy.
