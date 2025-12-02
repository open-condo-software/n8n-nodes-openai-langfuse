# @copperiq/n8n-nodes-ai-langfuse

> **Status:** Planning Phase  
> **Package Name:** `@copperiq/n8n-nodes-ai-langfuse`  
> **License:** MIT

Unified n8n community package providing AI Agent and OpenAI Chat Model nodes with full Langfuse v4 observability.

## Overview

This package combines the best features of three existing Langfuse integration nodes into a single, cohesive solution:

- ✅ **AI Agent with built-in prompt management** (fetch from Langfuse)
- ✅ **OpenAI Chat Model with automatic OTEL tracing**
- ✅ **Single credential configuration** (no more mismatches)
- ✅ **Full observability**: sessions, traces, token usage, prompt linking
- ✅ **Better UX**: fewer nodes, simpler configuration

## Why This Package?

### Before (3 separate packages)
```
❌ n8n-nodes-ai-agent-langfuse (OTEL sessions)
❌ n8n-nodes-langfuse (prompt selector)
❌ n8n-nodes-openai-langfuse (LLM tracing)

Problems:
- Different credentials for each node
- Complex configuration
- Credential mismatches break features
- Fragile connections
```

### After (1 unified package)
```
✅ @copperiq/n8n-nodes-ai-langfuse

Benefits:
- 2 nodes, 1 credential
- Built-in prompt management
- Automatic session tracking
- Complete observability
```

## Features

### AI Agent Langfuse Node
- **Prompt Selector**: Dropdown populated from Langfuse API
- **Dynamic Variables**: UI auto-generates based on selected prompt
- **OTEL Sessions**: Automatic session tracking with `propagateAttributes()`
- **LangChain Integration**: Full support for tools, memory, output parsers
- **Streaming**: Real-time output streaming

### OpenAI Chat Model Langfuse Node
- **OTEL Tracing**: Auto-initialized on first use (singleton pattern)
- **Token Usage**: Captured via OpenTelemetry instrumentation
- **Responses API**: Built-in tools (web search, code interpreter, file search)
- **Metadata Inheritance**: Session ID from agent node
- **Prompt Linking**: Automatic trace-to-prompt associations

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
