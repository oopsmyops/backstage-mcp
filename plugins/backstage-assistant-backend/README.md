# @internal/backstage-plugin-assistant-backend

Backend plugin powering the Backstage AI assistant with LLM integration and catalog tools.

## Features

- Multi-round LLM orchestration with tool use (up to 10 rounds per request)
- Streaming responses via SSE (Server-Sent Events) with per-token flushing
- User identity injection — resolves `userEntityRef` + group memberships from Backstage auth
- 11 built-in tools: catalog search, entity details, API specs, templates, scaffolder, TechDocs
- AWS Bedrock integration with bearer token auth and streaming (`ConverseStreamCommand`)
- LiteLLM proxy support for any OpenAI-compatible backend
- Throttle retry with exponential backoff
- Concurrency limiting (configurable max parallel LLM calls)
- OAuth flow for VCS-authenticated template execution (GitHub, GitLab, Azure DevOps)
- Conversation history sanitization (fills missing tool results to prevent Bedrock rejection)

## Installation

Add to your Backstage backend's `packages/backend/package.json`:

```json
{
  "dependencies": {
    "@internal/backstage-plugin-assistant-backend": "link:../../plugins/backstage-assistant-backend"
  }
}
```

Register in `packages/backend/src/index.ts`:

```typescript
backend.add(import('@internal/backstage-plugin-assistant-backend'));
```

## Configuration

In `app-config.yaml`:

```yaml
assistant:
  llm:
    provider: bedrock  # bedrock | litellm | mock

    bedrock:
      region: us-east-1
      modelId: us.anthropic.claude-sonnet-4-6
      maxConcurrent: 5
      # Optional: bearer token for cross-account or identity-center auth
      bearerToken: ${AWS_BEARER_TOKEN_BEDROCK}

    litellm:
      baseUrl: http://localhost:4000
      model: anthropic/claude-sonnet-4-6
      apiKey: ${LITELLM_API_KEY}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/assistant/health` | Health check + tool count |
| GET | `/api/assistant/tools` | List available tools (authenticated) |
| POST | `/api/assistant/chat` | SSE streaming chat (authenticated) |

### Chat Request

```json
{
  "message": "What components do I own?",
  "conversationHistory": [],
  "vcsTokens": { "github": "gho_..." }
}
```

### SSE Events

| Event | Payload | Description |
|-------|---------|-------------|
| `text_delta` | `{ content }` | Streamed text chunk |
| `tool_call` | `{ toolName, arguments }` | Tool invocation started |
| `tool_result` | `{ toolName, content }` | Tool execution completed |
| `oauth_required` | `{ provider, scopes }` | VCS token needed |
| `done` | `{ usage: { inputTokens, outputTokens } }` | Response complete |
| `error` | `{ message }` | Error occurred |

## Architecture

```
plugin.ts              — createBackendPlugin registration
router.ts              — Express routes, SSE setup, user info resolution
service/
  ChatOrchestrator     — Multi-round LLM loop, streaming, tool dispatch
  ToolService          — 11 catalog/scaffolder/techdocs tools
  BackstageApiClient   — Authenticated HTTP client for Backstage APIs
llm/
  types                — LlmProvider interface (converse + converseStream)
  BedrockProvider      — AWS Bedrock Converse + ConverseStream APIs
  LiteLlmProvider      — OpenAI-compatible proxy client
  MockProvider         — Canned responses for development
  factory              — Config-driven provider instantiation
```

## Tools

| Tool | Description |
|------|-------------|
| `check_connection` | Verify Backstage connectivity |
| `search_catalog` | Full-text search with kind/tags/owner filters |
| `get_entity` | Entity details with resolved relations |
| `list_api_specs` | Browse API entities by type |
| `get_api_spec` | Raw OpenAPI/AsyncAPI/GraphQL spec |
| `list_templates` | Browse scaffolder templates |
| `get_template` | Template parameters + lookup hints |
| `run_template` | Execute with validation + VCS token injection |
| `list_tasks` | Scaffolder task history |
| `get_task_status` | Task progress + logs |
| `get_techdocs` | Rendered docs as plain text |

## Dependencies

- `@backstage/backend-plugin-api` — backend plugin system
- `@backstage/catalog-client` — catalog API types
- `@aws-sdk/client-bedrock-runtime` — AWS Bedrock Converse/ConverseStream
- `express` + `express-promise-router` — HTTP routing
