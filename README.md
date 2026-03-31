# backstage-mcp

[![CI](https://github.com/oopsmyops/backstage-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/oopsmyops/backstage-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 20+](https://img.shields.io/badge/node-20%2B-brightgreen)](https://nodejs.org)

A standalone MCP server that bridges LLM clients with your Backstage developer portal.

No Backstage plugin installation required — runs as a single file (~500 KB), zero runtime dependencies, and connects to Backstage's existing REST APIs.

## Features

- **Catalog** — search components, systems, groups, users; get full entity details with resolved API relations
- **API Discovery** — list and retrieve OpenAPI, AsyncAPI, GraphQL, and gRPC specs for writing integration code
- **Scaffolder** — browse templates, inspect parameter schemas, execute templates with guided input collection and inline validation
- **TechDocs** — trigger renders and retrieve documentation as plain text
- **Diagnostics** — `check_connection` tool to verify token and connectivity

## Tools

| Tool | Description |
|------|-------------|
| `check_connection` | Verify Backstage connectivity and token identity |
| `search_catalog` | Search entities by query, kind, tags, owner |
| `get_entity` | Full entity details with resolved relations |
| `list_api_specs` | Browse API entities by type and owner |
| `get_api_spec` | Retrieve raw OpenAPI/AsyncAPI spec content |
| `list_templates` | Browse scaffolder templates |
| `get_template` | Get template parameter schema |
| `run_template` | Execute template with inline validation |
| `list_tasks` | List scaffolder task executions, filter by user |
| `get_task_status` | Poll scaffolder task progress and logs |
| `get_techdocs` | Retrieve rendered TechDocs as plain text |

## Prerequisites

- Node.js 20+
- A running Backstage instance
- A Backstage service account token (or personal token)

## Installation

### Option 1 — Download the pre-built binary (recommended)

Grab the single-file binary from the [latest release](https://github.com/oopsmyops/backstage-mcp/releases/latest):

```bash
curl -LO https://github.com/oopsmyops/backstage-mcp/releases/latest/download/backstage-mcp.mjs
chmod +x backstage-mcp.mjs
```

That's it. No `npm install`, no `node_modules` — just Node.js 20+ and the single file.

### Option 2 — Build from source

```bash
git clone https://github.com/oopsmyops/backstage-mcp.git
cd backstage-mcp
npm install
npm run build
```

This produces a **single bundled file** at `dist/backstage-mcp.mjs` (~200 KB) with all dependencies inlined. No `node_modules` needed at runtime.

## Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
BACKSTAGE_BASE_URL=https://your-backstage.example.com
BACKSTAGE_TOKEN=your-token-here
MCP_TRANSPORT=stdio         # or "http" for production
```

### Getting a Backstage Token

**Option 1 — Service account token** (recommended for production):
In your Backstage `app-config.yaml`, create a static token:
```yaml
backend:
  auth:
    externalAccess:
      - type: static
        options:
          token: ${BACKSTAGE_MCP_TOKEN}
          subject: backstage-mcp-server
```

**Option 2 — Guest token** (for demo/development):
```bash
curl -s https://your-backstage.example.com/api/auth/guest/refresh | jq -r '.backstageIdentity.token'
```

**Option 3 — User token** (for local development):
Log in to your Backstage instance, open DevTools → Application → Local Storage, and copy the `@backstage/core-plugin-api:SignInPage:token` value.

## Usage

### Claude Code CLI

The quickest way to add the server:

```bash
claude mcp add backstage-mcp \
  -e BACKSTAGE_BASE_URL=https://your-backstage.example.com \
  -e BACKSTAGE_TOKEN=your-token-here \
  -- node /absolute/path/to/backstage-mcp/dist/backstage-mcp.mjs
```

To verify it's registered:

```bash
claude mcp list
```

To remove:

```bash
claude mcp remove backstage-mcp
```

### MCP Configuration File (Generic)

Most MCP clients (Claude Desktop, Cursor, Windsurf, VS Code, etc.) support a JSON configuration. Add the following to your client's MCP config file:

```json
{
  "mcpServers": {
    "backstage-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/backstage-mcp/dist/backstage-mcp.mjs"],
      "env": {
        "BACKSTAGE_BASE_URL": "https://your-backstage.example.com",
        "BACKSTAGE_TOKEN": "your-token-here"
      }
    }
  }
}
```

Common config file locations:

| Client | Config file |
|--------|-------------|
| Claude Code | `~/.claude.json` or `.claude/mcp.json` in project |
| Cursor | `.cursor/mcp.json` in project root |
| VS Code | `.vscode/mcp.json` in project root |
| Windsurf | `~/.windsurf/mcp.json` |
| Generic | Check your client's MCP documentation |

### HTTP Transport (production)

For remote or shared deployments, use the HTTP transport:

```bash
BACKSTAGE_BASE_URL=https://your-backstage.example.com \
BACKSTAGE_TOKEN=your-token-here \
MCP_TRANSPORT=http \
PORT=3000 \
node dist/backstage-mcp.mjs
```

The server listens on `http://127.0.0.1:3000/mcp`. Health check: `GET /health`.

Point your MCP client at the HTTP endpoint:
```json
{
  "mcpServers": {
    "backstage-mcp": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Development

```bash
npm run dev   # tsx watch mode — auto-restarts on file changes
```

## Deploying the Bundle

The `dist/backstage-mcp.mjs` file is fully self-contained. To deploy:

```bash
# Copy just the single file — no node_modules needed
scp dist/backstage-mcp.mjs server:/opt/backstage-mcp/

# Run on the server (only requires Node.js 20+)
BACKSTAGE_BASE_URL=https://backstage.internal \
BACKSTAGE_TOKEN=xxx \
MCP_TRANSPORT=http \
node /opt/backstage-mcp/backstage-mcp.mjs
```

For Docker:

```dockerfile
FROM node:22-alpine
COPY dist/backstage-mcp.mjs /app/backstage-mcp.mjs
ENV MCP_TRANSPORT=http
EXPOSE 3000
CMD ["node", "/app/backstage-mcp.mjs"]
```

Image size: ~60 MB (node:alpine) + 200 KB (our code).

## Example Conversations

**Find all APIs owned by a team:**
> "What APIs does the payments team own?"

**Understand a service's dependencies:**
> "What external APIs does the checkout-service consume?"

**Create a new service:**
> "Create a new Node.js microservice using our standard template"

**Read documentation:**
> "What does the payment-service README say about authentication?"

**Write integration code:**
> "I need to integrate with the User Management API in TypeScript"

## Configuration Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BACKSTAGE_BASE_URL` | Yes | — | Base URL of your Backstage instance |
| `BACKSTAGE_TOKEN` | Yes | — | Bearer token for authentication |
| `MCP_TRANSPORT` | No | `stdio` | Transport: `stdio` or `http` |
| `PORT` | No | `3000` | HTTP port (when `MCP_TRANSPORT=http`) |
| `HOST` | No | `127.0.0.1` | HTTP host (when `MCP_TRANSPORT=http`) |
| `CACHE_TTL_SECONDS` | No | `60` | Entity cache TTL in seconds (0 = disabled) |
| `REQUEST_TIMEOUT_MS` | No | `10000` | Backstage API request timeout |

## Troubleshooting

**"Authentication failed" error:**
- Check `BACKSTAGE_TOKEN` is valid and not expired
- Ensure the token has `catalog.entity.read` permission
- Run `check_connection` tool for a detailed diagnosis

**Entity not found (404):**
- Verify the entity exists in your Backstage catalog
- Check the `entityRef` format: `kind:namespace/name` (e.g. `component:default/my-service`)
- The namespace is almost always `default`

**TechDocs returns 404:**
- The entity must have a `backstage.io/techdocs-ref` annotation in its `catalog-info.yaml`
- Example: `backstage.io/techdocs-ref: dir:.`

**Templates not showing parameters:**
- Some templates use external parameter files; `get_template` returns what Backstage has ingested
- Re-register the template location in Backstage if content seems stale

**Timeout errors:**
- Increase `REQUEST_TIMEOUT_MS` (e.g., `30000` for slow instances)
- Reduce `limit` parameter in search calls
- Check Backstage instance health

**Claude Code "Failed to reconnect":**
- Verify with `claude mcp list` that the server is registered
- Check that the path to `dist/backstage-mcp.mjs` is absolute
- Ensure env vars are set (especially `BACKSTAGE_BASE_URL` and `BACKSTAGE_TOKEN`)

## How this differs from `@backstage/plugin-mcp-actions-backend`

Backstage has an [official MCP plugin](https://www.npmjs.com/package/@backstage/plugin-mcp-actions-backend) that runs **inside** the Backstage backend. Here's when to use which:

| | `backstage-mcp` (this project) | `@backstage/plugin-mcp-actions-backend` |
|---|---|---|
| Install into Backstage? | No — fully standalone | Yes — requires backend code change |
| Backstage version | Any (uses REST APIs) | Requires new backend system |
| Auth | Static tokens | Static tokens + Dynamic Client Registration |
| Deployment | Single file, anywhere | Inside Backstage process |

**Use this project** if you can't or don't want to modify your Backstage backend. **Use the official plugin** if you control the Backstage instance and want tighter integration.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

[MIT](LICENSE)
