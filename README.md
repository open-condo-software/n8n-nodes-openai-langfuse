# n8n-nodes-ai-langfuse

[![NPM Version](https://img.shields.io/npm/v/@open-condo/n8n-nodes-llm-openai-langfuse)](https://www.npmjs.com/package/@open-condo/n8n-nodes-llm-openai-langfuse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This is an n8n community node that provides an OpenAI Language Model with built-in [Langfuse](https://langfuse.com/) observability and tracing.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Langfuse](https://langfuse.com/) is an open-source LLM engineering platform for tracing, evaluating, and monitoring AI applications.

## Features

- **OpenAI Language Model**: Full-featured OpenAI chat model with support for all latest models
- **Built-in Langfuse Tracing**: Automatic observability for all LLM interactions
- **Organized Traces**: Traces named as `WorkflowName - NodeName` with model-specific observation names
- **Session Tracking**: Group related traces using session IDs
- **Custom Metadata**: Add custom metadata and tags for filtering and organization
- **Token Tracking**: Accurate token usage tracking including tool calls
- **User Tracking**: Associate traces with specific users

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

### Using npm

```bash
npm install @copperiq/n8n-nodes-ai-langfuse
```

### Using n8n's UI

1. Go to **Settings** > **Community Nodes**
2. Select **Install**
3. Enter `@copperiq/n8n-nodes-ai-langfuse` in the **Enter npm package name** field
4. Agree to the [risks](https://docs.n8n.io/integrations/community-nodes/risks/) of using community nodes
5. Select **Install**

After installing the node, you can use it like any other node in your n8n workflows.

## Configuration

### Prerequisites

- An [OpenAI API key](https://platform.openai.com/api-keys)
- A [Langfuse account](https://langfuse.com/) (cloud or self-hosted)
- Langfuse public and secret keys from your project settings

### Credentials Setup

1. Create new credentials: **OpenAI API with Langfuse**
2. Enter your **OpenAI API Key**
3. Enter your **Langfuse Public Key**
4. Enter your **Langfuse Secret Key**
5. (Optional) Enter your **Langfuse Base URL** if using self-hosted Langfuse

## Usage

### Basic Setup

1. Add the **OpenAI Language Model (Langfuse)** node to your workflow
2. Select or create **OpenAI API with Langfuse** credentials
3. Choose your desired model (e.g., `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`)
4. Configure any additional options (temperature, max tokens, etc.)

### Langfuse Tracking

The node includes optional Langfuse tracking fields for enhanced observability:

- **Session ID**: Group related traces together (e.g., multi-turn conversations)
- **User ID**: Associate traces with specific users
- **Tags**: Add comma-separated tags for filtering (e.g., `production`, `customer-support`)
- **Custom Metadata**: Add any additional context as JSON

All fields support n8n expressions for dynamic values:

```javascript
// Example session ID from incoming data
{{ $json.sessionId }}

// Example user ID
{{ $json.userId }}

// Example tags
production, api-call, {{ $json.department }}

// Example metadata
{
  "customerTier": "{{ $json.tier }}",
  "region": "{{ $json.region }}"
}
```

### Trace Organization

Traces in Langfuse are automatically organized with:

- **Trace Name**: `WorkflowName - NodeName` (e.g., `Customer Support - AI Assistant`)
- **Observation Names**: Actual model name (e.g., `gpt-4o`)
- **Trace ID**: Unique per workflow execution and node
- **Metadata**: Includes execution ID and workflow name

## Examples

### Simple Chat Completion

```
1. Trigger (e.g., Webhook)
2. OpenAI Language Model (Langfuse)
   - Model: gpt-4o
   - System Message: "You are a helpful assistant"
   - User Message: {{ $json.userMessage }}
3. Respond to Webhook
```

### Conversation with Session Tracking

```
1. Webhook Trigger
2. OpenAI Language Model (Langfuse)
   - Model: gpt-4o
   - Langfuse Tracking:
     * Session ID: {{ $json.conversationId }}
     * User ID: {{ $json.userId }}
     * Tags: support, {{ $json.priority }}
3. Store in Database
4. Respond to Webhook
```

## Compatibility

- Requires n8n version 1.0.0 or above
- Requires Node.js 18.0.0 or above
- Compatible with all OpenAI models including latest GPT-4 and GPT-3.5 models

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
- [Langfuse documentation](https://langfuse.com/docs)
- [OpenAI API documentation](https://platform.openai.com/docs)

## Support

For issues, questions, or feature requests, please visit:
- GitHub Issues: [Copper-IQ/n8n-nodes-ai-langfuse](https://github.com/Copper-IQ/n8n-nodes-ai-langfuse/issues)
- Email: support@copperiq.com

## License

[MIT](LICENSE)

## Version History

### 1.0.0
- Initial release
- OpenAI Language Model with Langfuse integration
- Session tracking and custom metadata support
- Automatic token usage tracking
- Professional trace naming and organization
