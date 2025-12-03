# LmChatOpenAiLangfuse Node Rewrite - Implementation Plan

## Context
This plan documents the complete rewrite of the `LmChatOpenAiLangfuse.node.ts` file to align with the OpenAI Language Model Chat node implementation while maintaining Langfuse observability integration.

## Current State
- Helper files already copied and ready:
  - `nodes/LmChatOpenAiLangfuse/helpers/common.ts` ✅
  - `nodes/LmChatOpenAiLangfuse/helpers/types.ts` ✅
  - `nodes/LmChatOpenAiLangfuse/methods/loadModels.ts` ✅
- Token usage wrapper implemented in previous work (preserve this)
- Base structure exists but needs complete rewrite (~800 lines)

## Implementation Tasks

### 1. Credential System Update
**File:** `nodes/LmChatOpenAiLangfuse/LmChatOpenAiLangfuse.node.ts`

#### Use combined credential:
```typescript
credentials: [
  {
    name: 'openAiApiWithLangfuseApi',
    required: true,
  },
],
```

**Why combined credential?**
- ✅ Single credential contains both OpenAI API key AND Langfuse credentials
- ✅ OpenAI API key → Configure ChatOpenAI model
- ✅ Langfuse credentials → Create CallbackHandler for tracing
- ✅ Simpler UX - one credential instead of separate configs

#### ~~Add Langfuse configuration parameters as node properties:~~ (NOT NEEDED - in credential)
```typescript
{
  displayName: 'Langfuse Configuration',
  name: 'langfuseConfig',
  type: 'fixedCollection',
  default: {},
  placeholder: 'Add Langfuse Configuration',
  options: [
    {
      name: 'values',
      displayName: 'Values',
      values: [
        {
          displayName: 'Public Key',
          name: 'publicKey',
          type: 'string',
          default: '',
          description: 'Langfuse public key for tracing',
        },
        {
          displayName: 'Secret Key',
          name: 'secretKey',
          type: 'string',
          typeOptions: { password: true },
          default: '',
          description: 'Langfuse secret key',
        },
        {
          displayName: 'Base URL',
          name: 'baseUrl',
          type: 'string',
          default: 'https://cloud.langfuse.com',
          description: 'Langfuse instance URL',
        },
      ],
    },
  ],
},
```

### 2. Model Selection Update
**File:** `nodes/LmChatOpenAiLangfuse/LmChatOpenAiLangfuse.node.ts`

#### Add resource locator for model selection:
```typescript
{
  displayName: 'Model',
  name: 'model',
  type: 'resourceLocator',
  default: { mode: 'list', value: 'gpt-4o' },
  required: true,
  modes: [
    {
      displayName: 'From List',
      name: 'list',
      type: 'list',
      typeOptions: {
        searchListMethod: 'modelSearch',
        searchable: true,
      },
    },
    {
      displayName: 'ID',
      name: 'id',
      type: 'string',
      validation: [
        {
          type: 'regex',
          properties: {
            regex: '[a-zA-Z0-9_-]{1,64}',
            errorMessage: 'Not a valid OpenAI Model ID',
          },
        },
      ],
      placeholder: 'e.g. gpt-4o',
    },
  ],
},
```

### 3. Responses API Support
**File:** `nodes/LmChatOpenAiLangfuse/LmChatOpenAiLangfuse.node.ts`

#### Add toggle for Responses API:
```typescript
{
  displayName: 'Use Responses API',
  name: 'useResponsesApi',
  type: 'boolean',
  default: false,
  description: 'Whether to use the Responses API (supports built-in tools like web search)',
  displayOptions: {
    show: {
      resource: ['chat'],
      operation: ['message'],
    },
  },
},
```

#### Add Built-in Tools Collection:
```typescript
{
  displayName: 'Built-in Tools',
  name: 'builtInTools',
  type: 'fixedCollection',
  typeOptions: {
    multipleValues: true,
  },
  default: {},
  placeholder: 'Add Built-in Tool',
  displayOptions: {
    show: {
      useResponsesApi: [true],
    },
  },
  options: [
    {
      name: 'tools',
      displayName: 'Tools',
      values: [
        {
          displayName: 'Tool Type',
          name: 'type',
          type: 'options',
          default: 'web_search',
          options: [
            {
              name: 'Web Search',
              value: 'web_search',
              description: 'Enable web search capability',
            },
          ],
        },
      ],
    },
  ],
},
```

### 4. Core Node Implementation
**File:** `nodes/LmChatOpenAiLangfuse/LmChatOpenAiLangfuse.node.ts`

#### Import required dependencies:
```typescript
import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import OpenAI from 'openai';
import { Langfuse } from 'langfuse';
import {
  formatMessagesForOpenAI,
  getModelId,
  handleToolCalls,
  processResponse,
} from './helpers/common';
import type { N8nChatMessage } from './helpers/types';
```

#### Implement execute method structure:
```typescript
async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
  const items = this.getInputData();
  const returnData: INodeExecutionData[] = [];

  // Initialize OpenAI client
  const credentials = await this.getCredentials('openAiApi');
  const openai = new OpenAI({
    apiKey: credentials.apiKey as string,
  });

  // Initialize Langfuse (optional)
  let langfuse: Langfuse | undefined;
  const langfuseConfig = this.getNodeParameter('langfuseConfig', 0) as any;
  if (langfuseConfig?.values?.publicKey) {
    langfuse = new Langfuse({
      publicKey: langfuseConfig.values.publicKey,
      secretKey: langfuseConfig.values.secretKey,
      baseUrl: langfuseConfig.values.baseUrl || 'https://cloud.langfuse.com',
    });
  }

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    try {
      // Get parameters
      const model = getModelId(this, itemIndex);
      const useResponsesApi = this.getNodeParameter('useResponsesApi', itemIndex, false) as boolean;
      const messages = this.getNodeParameter('messages', itemIndex) as N8nChatMessage[];
      
      // Create trace in Langfuse
      let trace;
      if (langfuse) {
        trace = langfuse.trace({
          name: 'openai-chat',
          userId: items[itemIndex].json.userId as string,
          metadata: {
            model,
            itemIndex,
          },
        });
      }

      // Format messages
      const formattedMessages = formatMessagesForOpenAI(messages);

      // Create generation span in Langfuse
      let generation;
      if (trace) {
        generation = trace.generation({
          name: 'chat-completion',
          model,
          input: formattedMessages,
        });
      }

      // Make API call
      let response;
      if (useResponsesApi) {
        // Use Responses API with built-in tools
        const builtInTools = this.getNodeParameter('builtInTools', itemIndex, {}) as any;
        response = await openai.chat.completions.create({
          model,
          messages: formattedMessages,
          tools: builtInTools?.tools || [],
        });
      } else {
        // Use standard Chat API
        response = await openai.chat.completions.create({
          model,
          messages: formattedMessages,
        });
      }

      // Update generation with response
      if (generation) {
        generation.end({
          output: response.choices[0].message.content,
          usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
            totalTokens: response.usage?.total_tokens || 0,
          },
        });
      }

      // Process response
      const processedResponse = processResponse(response);
      returnData.push({
        json: processedResponse,
        pairedItem: { item: itemIndex },
      });

    } catch (error) {
      if (this.continueOnFail()) {
        returnData.push({
          json: { error: error.message },
          pairedItem: { item: itemIndex },
        });
        continue;
      }
      throw new NodeOperationError(this.getNode(), error, { itemIndex });
    }
  }

  // Flush Langfuse
  if (langfuse) {
    await langfuse.flushAsync();
  }

  return [returnData];
}
```

### 5. CallbackHandler Integration
**File:** `nodes/LmChatOpenAiLangfuse/LmChatOpenAiLangfuse.node.ts`

The existing token usage wrapper should be preserved and integrated:

```typescript
// Import the callback handler
import { N8nLangfuseCallbackHandler } from './helpers/callbackHandler';

// In execute method, create callback handler if Langfuse is configured
let callbackHandler;
if (langfuse && trace) {
  callbackHandler = new N8nLangfuseCallbackHandler({
    trace,
    generation,
  });
}

// Pass to OpenAI call if streaming
if (callbackHandler) {
  response = await openai.chat.completions.create({
    model,
    messages: formattedMessages,
    stream: true,
    stream_options: { include_usage: true },
  });
  
  // Handle streaming with callback
  for await (const chunk of response) {
    await callbackHandler.handleLLMNewToken(chunk);
  }
}
```

### 6. Helper Functions Updates
**Files:** `nodes/LmChatOpenAiLangfuse/helpers/common.ts`

Ensure these functions are implemented:
- `formatMessagesForOpenAI(messages)` - Convert n8n messages to OpenAI format
- `getModelId(executeFunctions, itemIndex)` - Extract model from resource locator
- `handleToolCalls(toolCalls, executeFunctions)` - Process tool calls
- `processResponse(response)` - Format OpenAI response for n8n

### 7. Testing Updates
**File:** `nodes/LmChatOpenAiLangfuse/__tests__/LmChatOpenAiLangfuse.test.ts`

Update tests to cover:
- Credential system change (openAiApi instead of combined)
- Langfuse config as node parameters
- Model resource locator
- Responses API toggle
- Built-in tools
- Token usage tracking
- Error handling

Example test structure:
```typescript
describe('LmChatOpenAiLangfuse', () => {
  describe('Credential System', () => {
    it('should use openAiApi credential', () => {
      // Test credential reference
    });

    it('should accept Langfuse config as parameters', () => {
      // Test Langfuse config extraction
    });
  });

  describe('Model Selection', () => {
    it('should support resource locator with list mode', () => {
      // Test model list selection
    });

    it('should support resource locator with ID mode', () => {
      // Test model ID input
    });
  });

  describe('Responses API', () => {
    it('should use standard API when toggle is off', () => {
      // Test standard chat completion
    });

    it('should use Responses API when toggle is on', () => {
      // Test Responses API
    });

    it('should include built-in tools with Responses API', () => {
      // Test built-in tools
    });
  });

  describe('Langfuse Integration', () => {
    it('should create trace when Langfuse is configured', () => {
      // Test trace creation
    });

    it('should track token usage', () => {
      // Test token tracking
    });

    it('should work without Langfuse config', () => {
      // Test graceful degradation
    });
  });
});
```

### 8. Package.json Updates
**File:** `package.json`

Ensure dependencies are up to date:
```json
{
  "dependencies": {
    "openai": "^4.75.0",
    "langfuse": "^3.29.0",
    "n8n-workflow": "^1.x.x"
  }
}
```

### 9. README Updates
**File:** `README.md`

Document the changes:
```markdown
# n8n-nodes-ai-langfuse

OpenAI Language Model Chat node with Langfuse observability integration.

## Features

- OpenAI Chat Completions API support
- Responses API with built-in tools (web search)
- Langfuse tracing and observability (optional)
- Token usage tracking
- Resource locator for model selection

## Configuration

### Credentials

This node uses the standard `openAiApi` credential. Configure in n8n:
- API Key: Your OpenAI API key

### Langfuse Configuration (Optional)

Add Langfuse configuration directly in the node:
- Public Key: Your Langfuse public key
- Secret Key: Your Langfuse secret key
- Base URL: Langfuse instance URL (default: https://cloud.langfuse.com)

### Model Selection

Use the model resource locator to:
- Select from a list of available models
- Enter a custom model ID

### Responses API

Enable "Use Responses API" to access built-in tools:
- Web Search: Enable web search capability for the model

## Usage

[Add usage examples here]
```

## Implementation Checklist

- [ ] Update credential reference in node definition
- [ ] Add Langfuse config parameters to node properties
- [ ] Add model resource locator
- [ ] Add Responses API toggle
- [ ] Add Built-in Tools collection
- [ ] Implement core execute method with OpenAI client
- [ ] Integrate Langfuse tracing (optional)
- [ ] Preserve token usage wrapper/callback handler
- [ ] Update helper functions in common.ts
- [ ] Write comprehensive tests
- [ ] Update package.json dependencies
- [ ] Update README documentation
- [ ] Run all tests: `pnpm test`
- [ ] Run type check: `pnpm typecheck`
- [ ] Run linter: `pnpm lint`
- [ ] Verify no console statements left behind

## Key Design Decisions

1. **Credential Separation**: Using standard `openAiApi` credential + node-level Langfuse config for flexibility
2. **Optional Langfuse**: Node works with or without Langfuse configuration
3. **Resource Locator**: Better UX for model selection with validation
4. **Responses API**: Toggle allows access to advanced OpenAI features
5. **Token Tracking**: Preserve existing callback handler for usage monitoring

## Testing Strategy

Follow TDD principles:
1. Write tests for credential system changes
2. Write tests for model selection
3. Write tests for Responses API
4. Write tests for Langfuse integration
5. Write tests for error handling
6. Ensure 100% code coverage

## File Size Guidelines

Keep files under 200 lines by:
- Separating concerns into helper files
- Using common.ts for shared utilities
- Keeping types in types.ts
- Splitting tests into logical groups

## Next Steps for Fresh Conversation

When continuing this work in a new conversation, reference this plan and:
1. Start with credential system updates
2. Add model resource locator
3. Add Responses API support
4. Integrate Langfuse tracing
5. Write tests alongside implementation
6. Verify everything works end-to-end

## Notes

- Estimated total lines: ~800 (split across main node file and helpers)
- All code must follow eslint rules
- All code must pass TypeScript strict checks
- No `any` types allowed
- Use constructor injection for dependencies
- Follow repository pattern (no direct API calls outside helpers)
- Write tests as you go (TDD)
