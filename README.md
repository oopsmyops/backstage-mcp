# backstage-mcp

[![CI](https://github.com/oopsmyops/backstage-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/oopsmyops/backstage-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 20+](https://img.shields.io/badge/node-20%2B-brightgreen)](https://nodejs.org)

Bring your Backstage developer portal to AI — two ways:

- **🤖 Backstage Assistant plugins** — an in-portal AI chat widget (frontend + backend Backstage plugins) with multi-provider LLM support, a UI model picker, and the full catalog / scaffolder / TechDocs toolset.
- **🔌 Standalone MCP server** — a single ~550 KB file exposing the same Backstage tools to external MCP clients (Claude, Cursor, VS Code, Windsurf) with no changes to your Backstage instance.

---

## 🤖 Backstage Assistant plugins

An AI assistant embedded directly in your Backstage UI.

| Package | Role | |
| --- | --- | --- |
| [`@oopsmyops/backstage-plugin-assistant`](plugins/backstage-assistant/) | Frontend | Floating chat widget + model picker |
| [`@oopsmyops/backstage-plugin-assistant-backend`](plugins/backstage-assistant-backend/) | Backend | LLM orchestration + Backstage tools |

![Backstage Assistant chat widget](plugins/backstage-assistant/docs/assistant-widget.png)

<!-- TODO: replace with a real screenshot of the open chat widget -->

**Highlights**

- Native **Amazon Bedrock** and **Azure AI Foundry**, plus any **OpenAI-compatible** API (no proxy), with an ordered fallback chain — all via the [Vercel AI SDK](https://ai-sdk.dev).
- Pick the model from the UI; the choice is remembered per browser.
- Streaming responses, structured result cards, internal entity links, and guided scaffolder runs with an OAuth popup for VCS tokens.

### Install the plugins

Published to the **oopsmyops GitHub Packages** registry. Add the registry auth to
your Backstage app's `.npmrc` (template: [`.npmrc.example`](./.npmrc.example)):

```ini
@oopsmyops:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Provide `GITHUB_TOKEN` via the GitHub CLI (`gh auth refresh -h github.com -s read:packages && export GITHUB_TOKEN=$(gh auth token)`) or a PAT with `read:packages`. Then:

```bash
yarn --cwd packages/app add @oopsmyops/backstage-plugin-assistant
yarn --cwd packages/backend add @oopsmyops/backstage-plugin-assistant-backend
```

```ts
// packages/backend/src/index.ts
backend.add(import('@oopsmyops/backstage-plugin-assistant-backend'));

// packages/app/src/App.tsx — new frontend system
import assistantPlugin from '@oopsmyops/backstage-plugin-assistant';
// add `assistantPlugin` to createApp({ features: [...] })
```

### Configure models

```yaml
assistant:
  llm:
    fallback: [groq-llama]          # tried, in order, if the selected model fails
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
        model: gpt-5.1                         # Azure deployment name
        resourceName: my-foundry-resource
        apiKey: ${AZURE_OPENAI_API_KEY}
      - id: groq-llama
        label: Llama 3.3 70B (Groq)
        provider: openai-compatible
        model: llama-3.3-70b-versatile
        baseUrl: https://api.groq.com/openai/v1
        apiKey: ${GROQ_API_KEY}
```

📖 **Full documentation:** [frontend plugin README](plugins/backstage-assistant/README.md) · [backend plugin README](plugins/backstage-assistant-backend/README.md)

---

## 🔌 Standalone MCP server

A single-file MCP server exposing 11 Backstage tools (catalog search, entity
details, API specs, scaffolder templates + tasks, TechDocs) to any MCP client.
No Backstage install required — it connects through Backstage's REST APIs.

```bash
# Download the latest binary and run it
curl -LO https://github.com/oopsmyops/backstage-mcp/releases/latest/download/backstage-mcp.mjs
BACKSTAGE_BASE_URL=https://your-backstage.example.com \
BACKSTAGE_TOKEN=your-token \
node backstage-mcp.mjs
```

Build from source instead: `npm install && npm run build` → `dist/backstage-mcp.mjs`.
Need a token? Use a static service-account token (recommended) or a guest token.

**Connect an MCP client** (Claude Desktop, Cursor, VS Code, Windsurf):

```json
{
  "mcpServers": {
    "backstage-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/backstage-mcp.mjs"],
      "env": {
        "BACKSTAGE_BASE_URL": "https://your-backstage.example.com",
        "BACKSTAGE_TOKEN": "your-token"
      }
    }
  }
}
```

For remote/shared use, run with `MCP_TRANSPORT=http` and point clients at
`http://localhost:3000/mcp` (health: `/health`).

**Environment variables**

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `BACKSTAGE_BASE_URL` | yes | — | Base URL of your Backstage instance |
| `BACKSTAGE_TOKEN` | yes | — | Bearer token for authentication |
| `MCP_TRANSPORT` | no | `stdio` | `stdio` or `http` |
| `PORT` | no | `3000` | HTTP port (when `MCP_TRANSPORT=http`) |
| `HOST` | no | `127.0.0.1` | HTTP host (when `MCP_TRANSPORT=http`) |
| `CACHE_TTL_SECONDS` | no | `60` | Entity cache TTL in seconds (0 = disabled) |
| `REQUEST_TIMEOUT_MS` | no | `10000` | Backstage API request timeout |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
