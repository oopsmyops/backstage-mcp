# Contributing to backstage-mcp

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- A running Backstage instance (or access to [demo.backstage.io](https://demo.backstage.io))

### Setup

```bash
git clone https://github.com/anthropics/backstage-mcp.git
cd backstage-mcp
npm install
npm run build
```

### Development

```bash
# Watch mode with auto-restart
npm run dev

# Type checking
npm run typecheck

# Build the bundle
npm run build
```

### Testing against a Backstage instance

```bash
# Set environment variables
export BACKSTAGE_BASE_URL=https://demo.backstage.io
export BACKSTAGE_TOKEN=your-token-here

# Run the server
npm run dev
```

## What We Accept

- Bug fixes with clear reproduction steps
- Performance improvements
- New tools that interact with existing Backstage REST APIs
- Documentation improvements
- Test coverage improvements

## What We Don't Accept

- Features that require installing plugins into the Backstage backend
- Large dependency additions (we aim to stay under 5 runtime dependencies)
- Changes that break the single-file bundle

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run build` to ensure the bundle builds cleanly
4. Run `npm run typecheck` to verify types
5. Test against a real Backstage instance if possible
6. Update documentation if your change affects the public API or tool behavior
7. Submit a PR with a clear description of the change and motivation

### Commit Messages

Use clear, descriptive commit messages:

```
fix: handle missing steps array in scaffolder task response
feat: add list_tasks tool for scaffolder task history
docs: add Docker deployment instructions
```

### PR Title

Keep PR titles short (under 70 characters) and descriptive.

## Code Style

- TypeScript strict mode
- No `any` types unless unavoidable (and document why)
- Prefer `const` over `let`
- Use descriptive variable names
- No unnecessary abstractions — three similar lines > one premature helper

## Architecture

```
src/
  index.ts          # Entry point, transport selection
  mcp.ts            # Hand-rolled MCP protocol (JSON-RPC 2.0)
  server.ts         # Tool registration, wires clients to tools
  config.ts         # Environment variable parsing (zod)
  entity-ref.ts     # Backstage entity ref parser
  clients/
    backstage.ts    # Base HTTP client (auth, timeout)
    cache.ts        # In-memory TTL cache
    catalog.ts      # Catalog API client
    scaffolder.ts   # Scaffolder API client
    techdocs.ts     # TechDocs API client
  tools/
    helpers.ts      # toolSuccess/toolError utilities
    catalog.ts      # Catalog tool handlers
    scaffolder.ts   # Scaffolder tool handlers
    techdocs.ts     # TechDocs tool handler
```

## Reporting Issues

- Use GitHub Issues
- Include your Node.js version, Backstage version, and transport type (stdio/http)
- Include the error output and steps to reproduce

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
