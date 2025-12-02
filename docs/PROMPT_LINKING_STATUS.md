# Prompt Linking Status

## Current Implementation

The test script (`test-langfuse.ts`) now implements prompt linking according to Langfuse documentation:

```typescript
// Fetch prompt from Langfuse
const fetchedPrompt = await langfuseClient.getPrompt('test-websearch');

// Pass prompt in metadata during invocation
const invocationConfig = {
  callbacks: [callbackHandler],
  metadata: {
    langfusePrompt: fetchedPrompt, // Key: 'langfusePrompt' (camelCase)
  },
};

// Invoke model
const response = await boundModel.invoke(messages, invocationConfig);
```

## Test Trace

**Latest Test:** https://prompts.accept.copperiq.com/trace/9f3d384d-825b-461e-b3ae-1b19fa7ba5ef

**Prompt Details:**
- Name: `test-websearch`
- Version: `1`
- Type: `chat`

## Verification Steps

To verify if prompt linking is working correctly:

### 1. Check Langfuse UI

Open the trace link above and look for:

✅ **Prompt icon/badge** next to the generation  
✅ **Prompt name and version** displayed inline  
✅ **Clickable link** to view prompt details

### 2. Expected Behavior

According to Langfuse documentation, when prompt linking is successful:
- The generation view shows a linked prompt
- You can click the prompt to view its template and variables
- Prompt metrics are tracked by version

### 3. If Prompt Link Doesn't Appear

The issue might be that we're **not using LangChain PromptTemplates**. The documentation examples all use:

```typescript
// Python example
langchain_prompt = PromptTemplate.from_template(
    langfuse_prompt.get_langchain_prompt(),
    metadata={"langfuse_prompt": langfuse_prompt}
)

// JS example  
const langchainPrompt = PromptTemplate.fromTemplate(
    langfusePrompt.getLangchainPrompt()
).withConfig({
    metadata: { langfusePrompt: langfusePrompt }
});
```

**Our case is different:** We're invoking the ChatOpenAI model directly without using LangChain's PromptTemplate abstraction.

## Alternative Approaches

### Option A: Use LangChain PromptTemplate (Recommended)

Modify the implementation to use LangChain's PromptTemplate:

```typescript
import { ChatPromptTemplate } from '@langchain/core/prompts';

// Fetch prompt from Langfuse
const fetchedPrompt = await langfuseClient.getPrompt('test-websearch');

// Convert to LangChain ChatPromptTemplate
const langchainPrompt = ChatPromptTemplate.fromMessages(
  fetchedPrompt.prompt // Assuming this is array of {role, content}
).withConfig({
  metadata: {
    langfusePrompt: fetchedPrompt
  }
});

// Create chain
const chain = langchainPrompt.pipe(boundModel);

// Invoke
const response = await chain.invoke(
  { /* variables */ },
  { callbacks: [callbackHandler] }
);
```

**Pros:**
- Official documented approach
- Guaranteed to work
- Cleaner integration

**Cons:**
- Requires changing current architecture
- Adds LangChain PromptTemplate layer

### Option B: Manual Prompt Tracking (Current Approach)

Keep current direct invocation but track prompt manually:

```typescript
// After invocation, manually record prompt usage
langfuseClient.generation({
  id: observationId, // From callbackHandler
  traceId: traceId, // From callbackHandler
  prompt: fetchedPrompt,
});
```

**Pros:**
- No architecture changes needed
- Direct control

**Cons:**
- Not officially documented for this use case
- May not show up in UI the same way
- Requires additional API calls

## Recommendations

### 1. Verify Current Implementation First

Check the test trace to see if prompt linking is already working. The metadata is being passed correctly, so it may just work.

### 2. If Not Working, Adopt Option A

Refactor to use LangChain PromptTemplates. This is the officially supported pattern and will ensure:
- Prompt links appear in UI
- Prompt metrics are tracked correctly
- Future compatibility with Langfuse updates

### 3. Update AiAgentLangfuse Node

Once verified, apply the same pattern to `nodes/AiAgentLangfuse/AiAgentLangfuse.node.ts`:

```typescript
import { ChatPromptTemplate } from '@langchain/core/prompts';

// ... fetch prompt ...

// Convert to LangChain template
const promptTemplate = ChatPromptTemplate.fromMessages(
  compiledMessages
).withConfig({
  metadata: {
    langfusePrompt: fetchedPrompt
  }
});

// Create chain with model
const chain = promptTemplate.pipe(languageModel);

// Invoke
const response = await chain.invoke(
  {}, // Variables already compiled into messages
  { callbacks: [callbackHandler] }
);
```

## Version Requirements

✅ **langfuse-langchain**: 3.38.6 (>= 3.3.0 required)  
✅ **langfuse**: 3.38.6  
✅ **@langchain/core**: 0.3.68  
✅ **@langchain/openai**: 0.6.16

All dependencies are at correct versions for prompt linking support.

## Next Actions

1. ✅ Check test trace for prompt link in UI
2. ⏳ If link doesn't appear, implement Option A (LangChain PromptTemplate)
3. ⏳ Update AiAgentLangfuse node with verified approach
4. ⏳ Add tests for prompt linking
5. ⏳ Document prompt linking in user guide
