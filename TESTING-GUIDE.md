# Testing Guide for @copperiq/n8n-nodes-ai-langfuse

## ✅ Setup Complete

The package has been successfully:
1. ✅ Built with npm (`npm run build`)
2. ✅ Linked globally (`npm link`)
3. ✅ Linked in `~/.n8n/custom` directory

## 🔍 Verify Installation

The package is now symlinked at:
```
C:\Users\ChrisBlokland\.n8n\custom\node_modules\@copperiq\n8n-nodes-ai-langfuse
  → C:\Users\ChrisBlokland\projects\copperiq\n8n-nodes-ai-langfuse
```

## 🚀 Testing in n8n

### 1. Restart n8n
If n8n is running, restart it to load the new nodes:
```powershell
# Stop n8n (Ctrl+C if running in terminal)
# Or restart the service/Docker container

# Start n8n
n8n start
# or
npm run dev  # if running from n8n source
```

### 2. Available Nodes
After restart, you should see two new nodes:

**AI Agent Langfuse**
- Category: AI → Agents
- Icon: Clock/timer icon
- Use for: AI agent with prompt management

**OpenAI Chat Model Langfuse**
- Category: AI → Language Models
- Icon: OpenAI logo
- Use for: Chat completions with tracing

### 3. Required Credential
Both nodes use the same credential:

**OpenAI API with Langfuse**
- OpenAI API Key
- Langfuse Public Key
- Langfuse Secret Key
- Langfuse Base URL (default: https://cloud.langfuse.com)

### 4. Test Workflow

Create a simple workflow to test:

```
Manual Trigger
  ↓
AI Agent Langfuse (configure with prompt from Langfuse)
  ↓ (connected to)
OpenAI Chat Model Langfuse (select model: gpt-4o)
```

**AI Agent Langfuse Configuration:**
- Prompt Source: "Fetch from Langfuse"
- Prompt Name: `<your-prompt-name>`
- Add variables if your prompt uses them
- Session ID: `n8n-{{$execution.id}}` (auto-generated)

**OpenAI Chat Model Configuration:**
- Model: `gpt-4o` or `gpt-4o-mini`
- Temperature: `0.7` (optional)

### 5. Verify in Langfuse

After running the workflow:
1. Go to your Langfuse dashboard
2. Check the "Traces" tab
3. You should see:
   - ✅ Session ID (grouped traces)
   - ✅ Token usage (input/output tokens)
   - ✅ Prompt linking (if using Langfuse prompt)
   - ✅ User ID and tags (if provided)

## 🔧 Development Workflow

If you make changes to the package:

1. **Rebuild**:
   ```powershell
   cd C:\Users\ChrisBlokland\projects\copperiq\n8n-nodes-ai-langfuse
   npm run build
   ```

2. **Restart n8n** - Changes will be picked up automatically (symlink)

3. **No need to re-link** - The symlink stays active

## 🐛 Troubleshooting

### Nodes not appearing in n8n
- Check n8n logs for errors
- Verify package is in custom directory: `ls ~/.n8n/custom/node_modules/@copperiq`
- Ensure n8n was restarted after linking

### Credential not found
- Make sure credential type is `openAiApiWithLangfuseApi`
- Check credentials are properly set in n8n UI

### Build errors
- Run `npm install` to ensure all dependencies are installed
- Check TypeScript errors with `npm run build`

### Langfuse traces not appearing
- Verify Langfuse credentials (public key, secret key, base URL)
- Check browser console for errors
- Ensure OpenTelemetry is initialized (automatic on first LLM node use)

## 📝 Package Info

**Package Name:** `@copperiq/n8n-nodes-ai-langfuse`  
**Version:** `1.0.0`  
**Location:** `C:\Users\ChrisBlokland\projects\copperiq\n8n-nodes-ai-langfuse`

**Nodes:**
- `aiAgentLangfuse` - AI Agent Langfuse
- `lmChatOpenAiLangfuse` - OpenAI Chat Model Langfuse

**Credentials:**
- `langfuseApi` - Langfuse API (standalone)
- `openAiApiWithLangfuseApi` - OpenAI API with Langfuse (unified)

## 🎯 What to Test

1. **Prompt Management**
   - Fetch prompt from Langfuse ✓
   - Variable substitution ✓
   - Different prompt versions ✓

2. **Tracing**
   - Session grouping ✓
   - Token usage tracking ✓
   - Prompt linking ✓
   - User ID and tags ✓

3. **Different Models**
   - GPT-4o ✓
   - GPT-4o Mini ✓
   - GPT-3.5 Turbo ✓

4. **Error Handling**
   - Invalid credentials
   - Non-existent prompt
   - API rate limits

## 📚 Related Documentation

- [Implementation Briefing](./IMPLEMENTATION-BRIEFING.md)
- [README](./README.md)
- [Langfuse Findings](../LANGFUSE-V4-N8N-INTEGRATION-FINDINGS.md)
