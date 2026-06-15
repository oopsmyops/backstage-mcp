# Backstage Assistant Backend

The backend for the Backstage Assistant plugin — it orchestrates the LLM
conversation, executes Backstage catalog/scaffolder/TechDocs tools, and streams
responses to the [frontend widget](../backstage-assistant/) over SSE.

This is the backend plugin. Pair it with the
[`@oopsmyops/backstage-plugin-assistant`](../backstage-assistant/) frontend plugin.

![Assistant answering a catalog question](./docs/assistant-backend.png)

<!-- TODO: replace ./docs/assistant-backend.png with a real screenshot (e.g. the assistant resolving "what do I own?") -->

## Features

- Multi-provider LLM via the [Vercel AI SDK](https://ai-sdk.dev) — **Amazon Bedrock** and **Azure AI Foundry** natively, plus any **OpenAI-compatible** API, with no proxy.
- Configurable model catalog (`assistant.llm.models[]`) selectable from the UI, plus an ordered **fallback chain** when a provider errors.
- Multi-round tool-use orchestration (up to 10 rounds per request) with streaming SSE responses.
- User-aware — resolves `userEntityRef` and group memberships from Backstage auth for ownership queries.
- 12 built-in tools spanning catalog, API specs, scaffolder, and TechDocs.
- Guided scaffolder template execution with an OAuth flow for VCS tokens (GitHub, GitLab, Azure DevOps).
- Concurrency limiting and conversation-history sanitization.

## Installation

Published to **npmjs.org** as a public package — no token needed. Add it to your
Backstage backend:

```bash
yarn --cwd packages/backend add @oopsmyops/backstage-plugin-assistant-backend
```

Register it in `packages/backend/src/index.ts`:

```ts
backend.add(import('@oopsmyops/backstage-plugin-assistant-backend'));
```

## Configuration

Define the selectable models under `assistant.llm.models[]` in `app-config.yaml`.
Mark one as `default: true`; list fallback model ids under `assistant.llm.fallback`.

```yaml
assistant:
  systemPrompt: 'Optional extra deployment-specific instructions.'
  llm:
    maxConcurrent: 5            # max concurrent LLM calls (default 5)
    fallback: [groq-llama]      # tried, in order, if the selected model fails
    models:
      - id: claude-bedrock
        label: Claude Sonnet (Bedrock)
        provider: bedrock
        model: anthropic.claude-sonnet-4-6
        region: us-east-1
        apiKey: ${AWS_BEARER_TOKEN_BEDROCK}   # optional; omit to use the AWS credential chain
        default: true

      - id: gpt-azure
        label: GPT-5.1 (Azure AI Foundry)
        provider: azure
        model: gpt-5.1                         # your Azure deployment name
        resourceName: my-foundry-resource      # https://my-foundry-resource.openai.azure.com
        apiKey: ${AZURE_OPENAI_API_KEY}

      - id: groq-llama
        label: Llama 3.3 70B (Groq)
        provider: openai-compatible            # any OpenAI-shaped API, no proxy
        model: llama-3.3-70b-versatile
        baseUrl: https://api.groq.com/openai/v1
        apiKey: ${GROQ_API_KEY}
```

Provider keys:

| Provider | Required | Optional |
| --- | --- | --- |
| `bedrock` | `model`, `region` | `apiKey` (a Bedrock API key / `AWS_BEARER_TOKEN_BEDROCK`; omit to use the AWS credential chain) |
| `azure` | `model` (deployment name), `apiKey`, and one of `resourceName` / `baseUrl` | `apiVersion` |
| `openai-compatible` | `model`, `baseUrl` | `apiKey` |

If `assistant.llm.models[]` is omitted, the plugin keeps reading the legacy
`assistant.llm.provider` / `bedrock` / `litellm` keys for backward compatibility,
and falls back to an offline mock model when nothing is configured.

## API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/assistant/health` | Health check + tool count (unauthenticated) |
| GET | `/api/assistant/tools` | List available tools (authenticated) |
| GET | `/api/assistant/models` | List configured models for the picker (authenticated) |
| POST | `/api/assistant/chat` | SSE streaming chat (authenticated) |

### Chat request

```json
{
  "message": "What components do I own?",
  "model": "claude-bedrock",
  "conversationHistory": [],
  "vcsTokens": { "github": "gho_..." }
}
```

### SSE events

| Event | Payload | Description |
| --- | --- | --- |
| `text_delta` | `{ content }` | Streamed text chunk |
| `tool_call` | `{ toolCallId, toolName, arguments }` | Tool invocation started |
| `tool_result` | `{ toolName, content }` | Tool execution completed |
| `ui_render` | `{ card }` | Structured result card to render |
| `oauth_required` | `{ provider, scopes }` | VCS token needed |
| `done` | `{ usage: { inputTokens, outputTokens } }` | Response complete |
| `error` | `{ message }` | Error occurred |

## Tools

| Tool | Description |
| --- | --- |
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
| `get_vcs_groups` | List the user's GitHub/GitLab orgs for repo creation |

## Development

```bash
yarn start
```

## Related packages

- [`@oopsmyops/backstage-plugin-assistant`](../backstage-assistant/) — the chat widget frontend.

## License

Released under the [MIT](../../LICENSE) license.
