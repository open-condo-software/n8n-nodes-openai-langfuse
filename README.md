# @copperiq/n8n-nodes-ai-langfuse

> **Status:** Planning Phase  
> **Package Name:** `@copperiq/n8n-nodes-ai-langfuse`  
> **License:** MIT

Unified n8n community package providing AI Agent and OpenAI Chat Model nodes with full Langfuse v4 observability.

## Overview

This package provides a simple, maintainable solution for using OpenAI models with Langfuse observability in n8n:

- ✅ **OpenAI Chat Model with Langfuse Tracing**: Drop-in replacement for standard OpenAI Chat Model
- ✅ **Works with n8n's V3 Agent**: Use with standard n8n AI Agent node for tool calling and reasoning
- ✅ **Complete Observability**: Automatic capture of LLM calls, tool executions, and token usage
- ✅ **Simple Architecture**: Langfuse tracing at LLM level via callbacks, not agent level
- ✅ **Single Credential**: One credential for OpenAI + Langfuse

## Why This Approach?

### The Problem with Custom Agent Nodes

Building a custom agent node means reimplementing complex logic:
- Multi-turn conversation handling
- Tool calling orchestration
- Reasoning model support (o1/o3)
- Streaming responses
- Error handling and retries

**Result**: Fragile, hard to maintain, and duplicates n8n's existing work.

### The Simple Solution

```
✅ OpenAI Chat Model with Langfuse (This Package)
   ↓ (ai_languageModel connection)
✅ n8n AI Agent (Built-in V3 Node)
   ↓ (tool connections)
✅ Your Tools (n8n Tool Nodes)

Benefits:
- Langfuse tracing via LLM-level callbacks
- Zero custom agent logic
- Leverage n8n's proven V3 Agent
- Simple, maintainable code
- Complete observability (LLM + tools + tokens)
```

## Features

### OpenAI Chat Model with Langfuse Node
- **Full OpenAI Compatibility**: All models (gpt-4o, o1, o3-mini, etc.)
- **Automatic Langfuse Tracing**: LLM calls, tool executions, token usage
- **Session Tracking**: Group traces by session ID
- **User Identification**: Track which users are using your agents
- **Tagging and Metadata**: Custom tags and metadata for filtering
- **Reasoning Model Support**: Works with o1/o3 models and tool calling
- **Drop-in Replacement**: Works exactly like standard OpenAI Chat Model node

### How It Works
1. **LLM Level Tracing**: Langfuse CallbackHandler attached to ChatOpenAI
2. **Agent Orchestration**: n8n's V3 Agent handles tool calling and conversations
3. **Complete Observability**: All interactions automatically traced
4. **No Custom Logic**: Zero reimplementation of agent patterns

## Installation

```bash
# Via npm
npm install @copperiq/n8n-nodes-ai-langfuse

# Via pnpm (recommended)
pnpm add @copperiq/n8n-nodes-ai-langfuse
```

## Quick Start

1. **Install the package** in your n8n instance
2. **Create credential**: "OpenAI API with Langfuse"
   - OpenAI API Key
   - Langfuse Public Key
   - Langfuse Secret Key
   - Langfuse Base URL
3. **Add nodes** to your workflow:
   - "AI Agent Langfuse"
   - "OpenAI Chat Model Langfuse"
4. **Connect them**: AI Agent → OpenAI Chat Model
5. **Configure agent**:
   - Select prompt from Langfuse (dropdown)
   - Fill in variables
   - Session ID auto-generated
6. **Run workflow** and check Langfuse for traces!

## Configuration

### Agent Node
```json
{
  "promptSource": "fetchFromLangfuse",
  "promptName": "my-agent-prompt",
  "promptVersion": 1,
  "variables": {
    "userQuery": "{{$json.question}}",
    "context": "{{$json.context}}"
  },
  "langfuseSettings": {
    "sessionId": "n8n-{{$execution.id}}",
    "userId": "user-123",
    "tags": ["production", "customer-support"]
  }
}
```

### LLM Node
```json
{
  "model": "gpt-4o",
  "useResponsesApi": true,
  "builtInTools": {
    "webSearch": {
      "searchContextSize": "medium"
    }
  },
  "options": {
    "temperature": 0.7,
    "reasoningEffort": "medium"
  }
}
```

## Documentation

- **[Implementation Briefing](./IMPLEMENTATION-BRIEFING.md)**: Comprehensive technical design
- **[API Reference](./docs/API.md)**: Detailed API documentation (coming soon)
- **[Examples](./examples/)**: Sample workflows (coming soon)

## Architecture

```
@copperiq/n8n-nodes-ai-langfuse/
├── credentials/
│   ├── LangfuseApi.credentials.ts
│   └── OpenAiApiWithLangfuseApi.credentials.ts
├── nodes/
│   ├── AiAgentLangfuse/         # Agent node
│   └── LmChatOpenAiLangfuse/    # LLM node
└── utils/
    ├── langfuseClient.ts        # Shared Langfuse SDK
    ├── otelSetup.ts             # OTEL initialization
    ├── promptCompiler.ts        # Prompt fetching/compilation
    └── sessionManager.ts        # Session ID generation
```

## Requirements

- **n8n**: v1.0.0 or higher
- **Node.js**: v18 or higher
- **Langfuse**: v4.x (cloud or self-hosted)

## Development

```bash
# Clone repository
git clone https://github.com/Copper-IQ/n8n-nodes-ai-langfuse.git
cd n8n-nodes-ai-langfuse

# Install dependencies
pnpm install

# Build
pnpm run build

# Link for local development
pnpm link --global

# In your n8n installation
cd ~/.n8n
pnpm link --global @copperiq/n8n-nodes-ai-langfuse
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) first.

## Roadmap

### v1.0.0 (Current)
- [x] AI Agent node with prompt selector
- [x] OpenAI Chat Model node with OTEL
- [x] Session tracking
- [x] Token usage tracking
- [x] Prompt linking

### v1.1.0 (Future)
- [ ] Anthropic support
- [ ] Google Gemini support
- [ ] Prompt caching
- [ ] Multi-modal support (images, audio)

### v2.0.0 (Future)
- [ ] Advanced agent patterns (reflection, planning)
- [ ] Human-in-the-loop workflows
- [ ] Evaluation metrics UI

## License

MIT © Copper-IQ

## Support

- **Issues**: [GitHub Issues](https://github.com/Copper-IQ/n8n-nodes-ai-langfuse/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Copper-IQ/n8n-nodes-ai-langfuse/discussions)
- **Email**: support@copperiq.com

## Credits

Built on top of:
- [n8n](https://n8n.io/) - Workflow automation
- [LangChain](https://js.langchain.com/) - LLM framework
- [Langfuse](https://langfuse.com/) - LLM observability
- [OpenTelemetry](https://opentelemetry.io/) - Distributed tracing

## Related Projects

- [n8n-nodes-langfuse](https://github.com/Copper-IQ/n8n-nodes-langfuse) - Original prompt selector node
- [n8n-nodes-openai-langfuse](https://github.com/Copper-IQ/n8n-nodes-openai-langfuse) - Original LLM node with tracing
- [n8n-nodes-ai-agent-langfuse](https://github.com/Copper-IQ/n8n-nodes-ai-agent-langfuse) - Original agent node with OTEL

---

**Made with ❤️ by Copper-IQ**
