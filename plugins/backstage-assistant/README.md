# Backstage Assistant

The frontend for the Backstage Assistant plugin — a floating AI chat widget that
lets users explore the catalog, read docs, and run scaffolder templates in
natural language, right inside Backstage.

This is the frontend plugin. It requires the
[`@oopsmyops/backstage-plugin-assistant-backend`](../backstage-assistant-backend/)
backend plugin to be installed and configured.

![Backstage Assistant chat widget](./docs/assistant-widget.png)

<!-- TODO: replace ./docs/assistant-widget.png with a real screenshot of the open chat widget -->

## Features

- Floating, draggable chat panel — resize from any edge or corner, fullscreen toggle, translucent backdrop that inherits the Backstage theme.
- Streaming responses (SSE) rendered token-by-token.
- **Model picker** — switch between the models configured in the backend; the choice is remembered per browser.
- Structured result cards (tables, details, forms, documents, status) instead of raw JSON.
- Entity references auto-linked to catalog pages with internal SPA navigation.
- Tool-call status indicators (spinner while running, check on completion).
- Conversation persistence across page navigation (localStorage).
- Guided scaffolder template execution, including an OAuth popup for VCS-authenticated templates.

## Installation

These plugins are published to the **oopsmyops GitHub Packages** registry. Add
the registry auth to your app's `.npmrc` first — see
[the repository README](../../README.md#install-the-plugins) for the one-time
`.npmrc` and token setup.

Then add the package to your Backstage app:

```bash
yarn --cwd packages/app add @oopsmyops/backstage-plugin-assistant
```

### New Frontend System (default)

The plugin auto-discovers via `AppRootElementBlueprint`, so the widget renders as
a fixed overlay on every page — no route or sidebar registration needed. Add it to
your app features in `packages/app/src/App.tsx`:

```ts
import assistantPlugin from '@oopsmyops/backstage-plugin-assistant';

export const app = createApp({
  features: [
    // ...other features
    assistantPlugin,
  ],
});
```

Make sure the [backend plugin](../backstage-assistant-backend/) is installed too —
the widget talks to it via `discoveryApi.getBaseUrl('assistant')`.

## Configuration

No frontend configuration is required. The available models and the default
selection come from the backend (`assistant.llm.models[]`), surfaced through
`GET /api/assistant/models`. When more than one model is configured, the picker
appears in the widget header.

## Screenshots

<!-- TODO: capture and add these screenshots under ./docs/ -->

| | |
| --- | --- |
| ![Chat with streaming response](./docs/assistant-streaming.png) | ![Model picker](./docs/assistant-model-picker.png) |
| ![Catalog result card](./docs/assistant-card.png) | ![Template OAuth prompt](./docs/assistant-oauth.png) |

## Development

This plugin can be served in isolation for fast iteration:

```bash
yarn start
```

Or run it inside a Backstage app via the app's `yarn dev`.

## Related packages

- [`@oopsmyops/backstage-plugin-assistant-backend`](../backstage-assistant-backend/) — the required backend plugin (LLM orchestration + tools).

## License

Released under the [MIT](../../LICENSE) license.
