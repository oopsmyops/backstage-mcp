# @internal/backstage-plugin-assistant

Frontend plugin providing an AI chat assistant widget for Backstage.

## Features

- Floating, draggable chat panel (resize from all edges/corners, fullscreen toggle)
- Translucent backdrop-blur design, inherits Backstage theme
- Streaming SSE responses with real-time text rendering
- Entity refs auto-linked to catalog pages (internal SPA navigation)
- Tool call status indicators (spinner while running, checkmark on complete)
- Conversation persistence across page navigations (localStorage)
- OAuth flow for VCS-authenticated template execution

## Installation

Add to your Backstage app's `packages/app/package.json`:

```json
{
  "dependencies": {
    "@internal/backstage-plugin-assistant": "link:../../plugins/backstage-assistant"
  }
}
```

The plugin uses the new frontend system with `AppRootElementBlueprint` for auto-discovery. No manual route or sidebar registration needed — the chat widget renders as a fixed overlay on all pages.

## Configuration

No frontend configuration required. The plugin discovers the backend via `discoveryApi.getBaseUrl('assistant')`.

## Architecture

```
plugin.ts          — Plugin definition with ApiBlueprint + AppRootElementBlueprint
api/AssistantApi   — Fetch-based SSE client (POST /chat, GET /tools)
hooks/useAssistant — State management, message history, abort control
components/
  ChatWidget       — Floating panel (drag, resize, fullscreen)
  MessageList      — Auto-scroll container with internal link interception
  MessageBubble    — ReactMarkdown rendering + entity link replacement
  InputBar         — Multiline input with send/cancel
util/
  sseParser        — ReadableStream SSE decoder
  entityLinkParser — Regex-based entityRef → markdown link conversion
  storage          — localStorage conversation persistence
```

## Dependencies

- `@backstage/frontend-plugin-api` — new frontend system APIs
- `@backstage/core-components` — Backstage UI primitives
- `@backstage/theme` — theme types for status colors, link colors
- `@material-ui/core` + `@material-ui/icons` — MUI v4
- `react-markdown` — markdown rendering in assistant responses
