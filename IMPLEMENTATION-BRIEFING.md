# n8n-nodes-ai-langfuse: Unified AI Agent Package with Langfuse Integration

**Package Name:** `@copperiq/n8n-nodes-ai-langfuse`  
**Target Audience:** n8n community / Copper-IQ internal  
**Status:** Planning / Design Phase  
**Date:** November 28, 2025

---

## Executive Summary

Create a **single unified n8n package** that combines the best features of three existing nodes:
1. **n8n-nodes-ai-agent-langfuse** (OTEL session tracking)
2. **n8n-nodes-langfuse** (prompt selector + variables UI)
3. **n8n-nodes-openai-langfuse** (Langfuse v4 OTEL tracing)

**Problem:** Current solution requires 3 separate nodes with different credentials, complex configuration, and fragile connections.

**Solution:** Two tightly integrated nodes in a single package:
- **AI Agent with Langfuse** (agent node with prompt selector)
- **OpenAI Chat Model with Langfuse** (LLM node with built-in tracing)

**Key Benefits:**
- ✅ **Single credential definition** (shared between agent and LLM)
- ✅ **Built-in prompt management** (fetch from Langfuse, compile variables)
- ✅ **Automatic session tracking** (OTEL-based)
- ✅ **Full observability** (sessions, traces, token usage, prompt linking)
- ✅ **Better UX** (fewer nodes, less configuration)

---

## Architecture Overview

### Package Structure
```
@copperiq/n8n-nodes-ai-langfuse/
├── credentials/
│   ├── LangfuseApi.credentials.ts          # Langfuse credentials
│   └── OpenAiApiWithLangfuseApi.credentials.ts  # OpenAI + Langfuse combo
├── nodes/
│   ├── AiAgentLangfuse/
│   │   ├── AiAgentLangfuse.node.ts         # Agent node
│   │   ├── execute.ts                       # Execution logic with OTEL
│   │   ├── promptSelector.ts                # Langfuse prompt fetching
│   │   └── description.ts                   # Node parameter definitions
│   └── LmChatOpenAiLangfuse/
│       ├── LmChatOpenAiLangfuse.node.ts    # LLM node
│       ├── supplyData.ts                    # Model initialization with OTEL
│       └── description.ts                   # Node parameter definitions
├── utils/
│   ├── langfuseClient.ts                    # Shared Langfuse SDK client
│   ├── otelSetup.ts                         # OTEL SDK initialization
│   ├── promptCompiler.ts                    # Compile prompts with variables
│   └── sessionManager.ts                    # Session ID generation/management
├── package.json
├── tsconfig.json
└── README.md
```

### Data Flow

```
User configures Agent node
    ├─→ Select Langfuse prompt (dropdown populated via API)
    ├─→ Define variables (UI shows prompt variables)
    ├─→ Configure session ID (auto or custom)
    └─→ Select connected LLM node (OpenAI Chat Model Langfuse)
        ↓
Agent executes:
    ├─→ Fetch prompt from Langfuse API
    ├─→ Compile prompt with n8n workflow variables
    ├─→ Create messages array from compiled prompt
    ├─→ Wrap execution with propagateAttributes() for OTEL
    ├─→ Call LLM node via LangChain agent
        ↓
LLM node (via supplyData):
    ├─→ Initialize OTEL SDK with LangfuseSpanProcessor (once)
    ├─→ Create ChatOpenAI with metadata (session.id, langfusePrompt)
    ├─→ Return model to agent
        ↓
Execution completes:
    ├─→ OTEL captures all spans (agent, LLM, tools)
    ├─→ Langfuse receives traces with sessions, tokens, prompt links
    └─→ Results returned to n8n workflow
```

---

## Node 1: AI Agent with Langfuse

### Purpose
Execute AI agents with full Langfuse observability and prompt management.

### Key Features
1. **Prompt Selector UI** (from n8n-nodes-langfuse)
   - Dropdown to select Langfuse-managed prompts
   - Auto-populate prompt variables as node parameters
   - Support for prompt versions

2. **Variable Management**
   - Dynamic UI based on selected prompt
   - Map n8n expressions to prompt variables
   - Compile prompt on execution

3. **OTEL Session Tracking** (from n8n-nodes-ai-agent-langfuse)
   - Wrap execution with `propagateAttributes()`
   - Automatic session ID generation
   - User ID and tags support

4. **LangChain Agent Integration**
   - Support standard LangChain tools
   - Create agent from compiled prompt messages
   - Full callback support for Langfuse

### Node Parameters

#### Core Settings
- **Prompt Source** (options: "Define Manually", "Fetch from Langfuse")
  - If "Fetch from Langfuse":
    - **Prompt Name** (resourceLocator, list mode)
    - **Prompt Version** (number or "latest")
    - **Variables** (collection, dynamically generated from prompt)

- **Prompt Type** (when manual: "Auto" or "Define")
- **Text Input** (when manual + define)
- **System Message** (optional override)

#### Langfuse Settings (collection)
- **Session ID** (string, default: `n8n-{{ $execution.id }}`)
- **User ID** (string, optional)
- **Tags** (array of strings)
- **Custom Metadata** (JSON)

#### Agent Options (collection)
- **Max Iterations** (number, default: 10)
- **Return Intermediate Steps** (boolean)
- **Enable Streaming** (boolean, default: true)
- **Memory** (optional connection to memory node)
- **Output Parser** (optional connection to parser node)

### Implementation Details

#### Prompt Fetching
```typescript
import Langfuse from 'langfuse';

async function fetchAndCompilePrompt(
  promptName: string,
  promptVersion: number | 'latest',
  variables: Record<string, unknown>,
  credentials: { publicKey: string; secretKey: string; baseUrl: string }
): Promise<BaseMessage[]> {
  const langfuse = new Langfuse(credentials);
  
  // Fetch prompt
  const prompt = await langfuse.getPrompt(promptName, promptVersion);
  
  // Compile with variables
  const compiled = prompt.compile(variables);
  
  // Convert to LangChain messages
  return promptToMessages(compiled);
}
```

#### OTEL Wrapper
```typescript
import { propagateAttributes } from '@langfuse/tracing';

const result = await propagateAttributes(
  {
    sessionId,
    userId,
    tags,
    metadata: flattenedMetadata, // Record<string, string>
  },
  async () => {
    // Create agent executor
    const executor = createAgentExecutor(model, tools, messages);
    
    // Execute with callbacks
    return await executor.invoke(
      { input, steps },
      { callbacks: [langfuseHandler] }
    );
  }
);
```

---

## Node 2: OpenAI Chat Model with Langfuse

### Purpose
Provide ChatOpenAI model with built-in Langfuse OTEL tracing and token usage tracking.

### Key Features
1. **OTEL Initialization** (from n8n-nodes-openai-langfuse)
   - Auto-initialize OTEL SDK on first use
   - Register LangfuseSpanProcessor
   - Singleton pattern for SDK

2. **Metadata Management**
   - Inherit session ID from agent node
   - Add prompt metadata for linking
   - Pass through OTEL attributes

3. **Responses API Support**
   - Built-in tools (web search, code interpreter)
   - Token usage tracking via OTEL
   - Reasoning effort configuration

### Node Parameters

#### Model Settings
- **Model** (resourceLocator: list or ID)
- **Use Responses API** (boolean, default: true)

#### Built-in Tools (when Responses API enabled)
- **Web Search** (collection)
  - Search Context Size (low/medium/high)
  - Allowed Domains, Country, City, Region
- **File Search** (collection)
  - Vector Store IDs, Filters, Max Results
- **Code Interpreter** (boolean)

#### Options (collection)
- **Temperature** (number, 0-2)
- **Max Tokens** (number)
- **Frequency Penalty** (number, -2 to 2)
- **Presence Penalty** (number, -2 to 2)
- **Top P** (number, 0-1)
- **Reasoning Effort** (options: low/medium/high)

#### Langfuse Settings (inherited from agent, optional override)
- **Session ID Override** (string)
- **Metadata Override** (JSON)

### Implementation Details

#### OTEL SDK Initialization
```typescript
import Langfuse, { LangfuseSpanProcessor } from '@langfuse/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';

// Singleton initialization
let otelSdk: NodeSDK | null = null;

function initializeOtelSdk(credentials: LangfuseCredentials): void {
  if (otelSdk) return; // Already initialized
  
  const langfuse = new Langfuse({
    publicKey: credentials.publicKey,
    secretKey: credentials.secretKey,
    baseUrl: credentials.baseUrl,
  });
  
  otelSdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor({ client: langfuse })],
  });
  
  otelSdk.start();
}
```

#### Model Creation
```typescript
async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
  const credentials = await this.getCredentials('openAiApiWithLangfuseApi');
  
  // Initialize OTEL once
  initializeOtelSdk({
    publicKey: credentials.langfusePublicKey,
    secretKey: credentials.langfuseSecretKey,
    baseUrl: credentials.langfuseBaseUrl,
  });
  
  // Get session ID from agent (via metadata)
  const sessionId = this.getNodeParameter('sessionId', 0, '') || 
                    extractSessionFromContext(this);
  
  // Create model with metadata
  const model = new ChatOpenAI({
    apiKey: credentials.apiKey,
    model: modelName,
    useResponsesApi: true,
    metadata: {
      'session.id': sessionId,
      'sessionId': sessionId,
      // Prompt metadata added if available
    },
    // No callbacks - OTEL handles everything
  });
  
  return { response: model };
}
```

---

## Credentials

### 1. Langfuse API Credentials
**Name:** `langfuseApi`

**Fields:**
- **Public Key** (string, required)
- **Secret Key** (string, password, required)
- **Base URL** (string, default: `https://cloud.langfuse.com`)

### 2. OpenAI API with Langfuse Credentials
**Name:** `openAiApiWithLangfuseApi`

**Fields:**
- **OpenAI API Key** (string, password, required)
- **Langfuse Public Key** (string, required)
- **Langfuse Secret Key** (string, password, required)
- **Langfuse Base URL** (string, default: `https://cloud.langfuse.com`)

**Why Combined?** 
- Single credential for both nodes
- Ensures same Langfuse project
- Reduces configuration errors

---

## Shared Utilities

### 1. Langfuse Client Factory
**File:** `utils/langfuseClient.ts`

```typescript
import Langfuse from 'langfuse';

export interface LangfuseCredentials {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
}

// Singleton client per credential set
const clients = new Map<string, Langfuse>();

export function getLangfuseClient(creds: LangfuseCredentials): Langfuse {
  const key = `${creds.publicKey}:${creds.baseUrl}`;
  
  if (!clients.has(key)) {
    clients.set(key, new Langfuse(creds));
  }
  
  return clients.get(key)!;
}
```

### 2. Prompt Compiler
**File:** `utils/promptCompiler.ts`

```typescript
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

export interface CompiledPrompt {
  messages: BaseMessage[];
  metadata: {
    name: string;
    version: number;
    variables: Record<string, unknown>;
  };
}

export async function fetchAndCompilePrompt(
  langfuse: Langfuse,
  promptName: string,
  promptVersion: number | 'latest',
  variables: Record<string, unknown>
): Promise<CompiledPrompt> {
  // Fetch prompt
  const prompt = await langfuse.getPrompt(promptName, promptVersion);
  
  // Compile with variables
  const compiled = prompt.compile(variables);
  
  // Convert to messages
  const messages = promptToMessages(compiled);
  
  return {
    messages,
    metadata: {
      name: promptName,
      version: typeof prompt.version === 'number' ? prompt.version : 0,
      variables,
    },
  };
}

function promptToMessages(compiled: string | any[]): BaseMessage[] {
  // Handle different prompt formats
  if (typeof compiled === 'string') {
    return [new HumanMessage(compiled)];
  }
  
  // Handle chat format: [{ role: 'system', content: '...' }, ...]
  return compiled.map(msg => {
    if (msg.role === 'system') return new SystemMessage(msg.content);
    return new HumanMessage(msg.content);
  });
}
```

### 3. Session Manager
**File:** `utils/sessionManager.ts`

```typescript
export function generateSessionId(executionId: string, prefix = 'n8n'): string {
  return `${prefix}-${executionId}`;
}

export function extractSessionFromContext(ctx: ISupplyDataFunctions): string | null {
  // Try to get from agent metadata
  const agentMetadata = ctx.getInputConnectionData?.(NodeConnectionTypes.AiLanguageModel, 0);
  return agentMetadata?.sessionId || null;
}
```

### 4. OTEL Setup
**File:** `utils/otelSetup.ts`

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import Langfuse, { LangfuseSpanProcessor } from '@langfuse/otel';

let globalOtelSdk: NodeSDK | null = null;

export function initializeOtelSdk(creds: LangfuseCredentials): void {
  if (globalOtelSdk) return;
  
  const langfuse = new Langfuse({
    publicKey: creds.publicKey,
    secretKey: creds.secretKey,
    baseUrl: creds.baseUrl,
  });
  
  globalOtelSdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor({ client: langfuse })],
  });
  
  globalOtelSdk.start();
}

export function getOtelSdk(): NodeSDK | null {
  return globalOtelSdk;
}
```

---

## Dependencies

### Core n8n
```json
{
  "peerDependencies": {
    "n8n-workflow": "*"
  }
}
```

### LangChain
```json
{
  "dependencies": {
    "@langchain/core": "^0.3.72",
    "@langchain/openai": "^0.6.9",
    "langchain": "^0.3.16"
  }
}
```

### Langfuse
```json
{
  "dependencies": {
    "langfuse": "^4.4.2",
    "@langfuse/otel": "^4.4.2",
    "@langfuse/tracing": "^4.4.2",
    "langfuse-langchain": "^3.38.6"
  }
}
```

### OpenTelemetry
```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/sdk-node": "^0.59.1"
  }
}
```

### Utilities
```json
{
  "dependencies": {
    "lodash": "^4.17.21"
  },
  "devDependencies": {
    "@types/lodash": "^4.17.20",
    "typescript": "^5.8.3"
  }
}
```

---

## Implementation Phases

### Phase 1: Project Setup (1-2 hours)
1. Initialize package with `package.json`, `tsconfig.json`
2. Set up basic folder structure
3. Add shared utilities (langfuseClient, otelSetup)
4. Create credential definitions

### Phase 2: LLM Node (2-3 hours)
1. Port from `n8n-nodes-openai-langfuse`
2. Implement `supplyData()` with OTEL initialization
3. Add Responses API support
4. Add metadata inheritance from agent
5. Test standalone (without agent)

### Phase 3: Agent Node (3-4 hours)
1. Port from `n8n-nodes-ai-agent-langfuse`
2. Add prompt selector UI (from `n8n-nodes-langfuse`)
3. Implement dynamic variable parameters
4. Add prompt fetching and compilation
5. Wrap execution with `propagateAttributes()`
6. Test with LLM node

### Phase 4: Integration Testing (2-3 hours)
1. Test full workflow: agent + LLM + tools
2. Verify session tracking in Langfuse
3. Verify token usage appears
4. Verify prompt linking works
5. Test with different prompt types

### Phase 5: Documentation & Publishing (1-2 hours)
1. Write README with examples
2. Add inline code documentation
3. Create example workflows
4. Publish to npm under `@copperiq` scope
5. Update n8n-helm to use new package

**Total Estimated Time:** 9-14 hours

---

## Migration Path from Current Setup

### Current (3 nodes)
```
Workflow:
  ├─ AI Agent with Langfuse (n8n-nodes-ai-agent-langfuse)
  │   └─ Credential: langfuseCustomApi
  ├─ OpenAI Chat Model Langfuse (n8n-nodes-openai-langfuse)
  │   └─ Credential: openAiApiWithLangfuseApi
  └─ Langfuse (n8n-nodes-langfuse) [if using prompt selector]
      └─ Credential: langfuseApi
```

### New (2 nodes, 1 credential)
```
Workflow:
  ├─ AI Agent Langfuse (@copperiq/n8n-nodes-ai-langfuse)
  │   ├─ Built-in prompt selector
  │   ├─ Built-in session tracking
  │   └─ Credential: openAiApiWithLangfuseApi (shared)
  └─ OpenAI Chat Model Langfuse (@copperiq/n8n-nodes-ai-langfuse)
      ├─ Built-in OTEL tracing
      └─ Credential: openAiApiWithLangfuseApi (shared)
```

### Migration Steps
1. Install `@copperiq/n8n-nodes-ai-langfuse` in n8n
2. Create new `openAiApiWithLangfuseApi` credential
3. Replace old agent node with new agent node
4. Replace old LLM node with new LLM node
5. Configure prompt in agent node (replaces old Langfuse node)
6. Test workflow
7. Delete old nodes and credentials

---

## Success Criteria

### Functional
- ✅ Agent node can fetch and compile Langfuse prompts
- ✅ Variables UI dynamically updates based on selected prompt
- ✅ LLM node initializes OTEL SDK correctly
- ✅ Sessions appear in Langfuse with correct grouping
- ✅ Token usage is tracked and displayed in Langfuse
- ✅ Prompts are linked to traces in Langfuse
- ✅ Both nodes share same credential set
- ✅ Full LangChain agent functionality works (tools, memory, etc.)

### Technical
- ✅ TypeScript compiles with no errors
- ✅ Package builds successfully
- ✅ No circular dependencies
- ✅ Follows n8n community node guidelines
- ✅ Works with n8n 1.x

### UX
- ✅ Fewer configuration steps than current solution
- ✅ Clearer error messages
- ✅ Helpful parameter descriptions
- ✅ Logical parameter organization

---

## Open Questions

### 1. Credential Sharing Mechanism
**Q:** How do we ensure the LLM node gets the same Langfuse credentials as the agent?

**Options:**
A. Pass via metadata in connection (current approach)
B. Require both nodes to use same credential name
C. Agent passes credential reference to LLM

**Recommendation:** Option A (metadata) + validation warning if mismatch detected.

### 2. Prompt Version Management
**Q:** Should we support "production" label in addition to numeric versions?

**A:** Yes, add option for:
- Latest version (default)
- Specific version number
- Production label

### 3. Multiple LLM Support
**Q:** Should we support Anthropic, Google, etc. in v1?

**A:** No, start with OpenAI only. Add others in v2 based on demand.

### 4. Backward Compatibility
**Q:** Should we maintain compatibility with old node names?

**A:** No. This is a fresh start under `@copperiq` namespace. Clean break is cleaner.

---

## Risk Mitigation

### Risk 1: OTEL SDK Conflicts
**Mitigation:** 
- Use singleton pattern for SDK initialization
- Check for existing SDK before creating new one
- Add logging for SDK lifecycle events

### Risk 2: Prompt Compilation Errors
**Mitigation:**
- Validate variables match prompt schema
- Graceful error handling with clear messages
- Fallback to manual prompt if fetch fails

### Risk 3: Credential Mismatch
**Mitigation:**
- Validate Langfuse project IDs match
- Show warning in UI if different projects detected
- Add documentation about credential requirements

### Risk 4: Performance Impact
**Mitigation:**
- Cache fetched prompts (with TTL)
- Lazy-load OTEL SDK (only when needed)
- Benchmark token overhead vs old solution

---

## Appendix: Code Snippets from Source Nodes

### From n8n-nodes-langfuse (Prompt Selector UI)
```typescript
// Prompt name as resource locator
{
  displayName: 'Prompt',
  name: 'promptName',
  type: 'resourceLocator',
  default: { mode: 'list', value: '' },
  modes: [
    {
      displayName: 'From List',
      name: 'list',
      type: 'list',
      typeOptions: {
        searchListMethod: 'searchPrompts',
        searchable: true,
      },
    },
    {
      displayName: 'By Name',
      name: 'name',
      type: 'string',
      placeholder: 'my-prompt',
    },
  ],
}
```

### From n8n-nodes-ai-agent-langfuse (OTEL Wrapper)
```typescript
const result = await propagateAttributes(
  {
    sessionId: langfuseMetadata.sessionId,
    userId: langfuseMetadata.userId,
    metadata: otelMetadata,
    tags: langfuseMetadata.tags,
  },
  async () => {
    return await executor.invoke({ input, steps });
  }
);
```

### From n8n-nodes-openai-langfuse (OTEL Init)
```typescript
if (!global.langfuseOtelSdk) {
  const sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({ 
        client: new Langfuse(credentials) 
      })
    ]
  });
  sdk.start();
  global.langfuseOtelSdk = sdk;
}
```

---

## Next Steps

1. **Review this briefing** with team
2. **Approve architecture** and approach
3. **Create GitHub repository** under Copper-IQ org
4. **Set up project skeleton** (Phase 1)
5. **Begin implementation** (Phases 2-4)
6. **Test in acceptance** environment
7. **Document and publish** to npm

**Estimated Timeline:** 2-3 days for full implementation and testing
