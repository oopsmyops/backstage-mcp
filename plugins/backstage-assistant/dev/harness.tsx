/*
 * Standalone visual harness for the assistant's rendering pipeline — no
 * Backstage backend, no app wiring. It folds scripted SSE events through the
 * REAL reducer (applySseEvent) and renders the REAL MessageList, so what you
 * see is exactly what the live plugin would render for these events.
 *
 * Build:  npx esbuild dev/harness.tsx --bundle --outfile=dev/out.js ...
 * Serve:  any static server pointed at dev/ ; open index.html
 */
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Box, CssBaseline, Typography } from '@material-ui/core';
import { UnifiedThemeProvider, themes } from '@backstage/theme';
import { MessageList } from '../src/components/MessageList/MessageList';
import { applySseEvent } from '../src/hooks/messageReducer';
import type { DisplayMessage, SseEvent } from '../src/api/types';

let seq = 0;
const userMsg = (content: string): DisplayMessage => ({
  id: `u${++seq}`,
  role: 'user',
  content,
  timestamp: 0,
});
const assistantFrom = (events: SseEvent[]): DisplayMessage =>
  events.reduce(applySseEvent, {
    id: `a${++seq}`,
    role: 'assistant',
    content: '',
    toolCalls: [],
    timestamp: 0,
  });

const catalog = (
  ref: string,
  type: string,
  owner: string,
  description: string,
) => ({ ref, name: ref.split('/').pop(), type, owner, description });

// ── Scenario 1: "list all my owned components" ───────────────────────────────
// Two group searches → two client tables WITH links. The model then ALSO emits
// a merged render_ui table (no links) — the exact duplication bug. The reducer
// must DROP that render_ui table, leaving only the linked client tables + prose.
const ownedComponents: SseEvent[] = [
  { type: 'text_delta', content: "I'll search components owned by each of your groups.\n\n" },
  { type: 'tool_call', toolCallId: 't1', toolName: 'search_catalog', arguments: { owner: 'group:default/developers' } },
  {
    type: 'tool_result',
    toolName: 'search_catalog',
    content: JSON.stringify({
      entities: [
        catalog('component:default/test-azure-vm', 'infrastructure', 'group:default/developers', 'Azure vm provisioned via the Golden Path'),
        catalog('component:default/python-dummy-app', 'service', 'group:default/developers', 'python-dummy-app service (python)'),
        catalog('component:default/sample-nginx-argocd', 'service', 'group:default/developers', 'sample-nginx-argocd on (aws)'),
      ],
    }),
  },
  { type: 'tool_call', toolCallId: 't2', toolName: 'search_catalog', arguments: { owner: 'group:default/kubernetes-team' } },
  {
    type: 'tool_result',
    toolName: 'search_catalog',
    content: JSON.stringify({
      entities: [
        catalog('component:default/dummy-java', 'service', 'group:default/kubernetes-team', 'dummy-java service (java)'),
        catalog('component:default/dummy-go-app', 'service', 'group:default/kubernetes-team', 'dummy-go-app service (go)'),
      ],
    }),
  },
  { type: 'text_delta', content: 'You own **5 components** across 2 groups — 3 owned by *developers*, 2 by *kubernetes-team*.' },
  // The model tries to re-tabulate everything (no links). This MUST be dropped.
  {
    type: 'ui_render',
    card: {
      type: 'table',
      title: 'My Owned Components (should NOT appear — duplicate)',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'type', label: 'Type' },
        { key: 'owner', label: 'Owner Group' },
      ],
      rows: [
        { name: 'test-azure-vm', type: 'infrastructure', owner: 'developers' },
        { name: 'python-dummy-app', type: 'service', owner: 'developers' },
      ],
    },
  },
];

// ── Scenario 2: TechDocs (turndown output: fenced code + a real table) ────────
const techdocsMarkdown = `# Project Structure

\`\`\`
app/
  catalog-info.yaml # Backstage catalog descriptor
  openapi.yaml      # OpenAPI 3.0 specification
  Dockerfile        # Multi-stage container build
\`\`\`

Here's a quick summary of the **java-mcp-api** docs:

| File | Purpose |
| --- | --- |
| mkdocs.yml | TechDocs configuration |
| docs/ | This documentation |
`;

const techdocs: SseEvent[] = [
  { type: 'text_delta', content: "Here's the project structure from the docs.\n\n" },
  { type: 'tool_call', toolCallId: 't3', toolName: 'get_techdocs', arguments: { entityRef: 'component:default/java-mcp-api' } },
  {
    type: 'tool_result',
    toolName: 'get_techdocs',
    content: JSON.stringify({ entityRef: 'component:default/java-mcp-api', content: techdocsMarkdown, truncated: false }),
  },
  { type: 'text_delta', content: 'The repo ships a catalog descriptor, an OpenAPI spec, and a multi-stage Dockerfile.' },
];

// ── Scenario 3: template parameter form (render_ui form is KEPT) ──────────────
const templateForm: SseEvent[] = [
  { type: 'text_delta', content: "Let's create your GitLab repository. Fill in the details:\n\n" },
  {
    type: 'ui_render',
    card: {
      type: 'form',
      title: 'Create GitLab repository',
      description: 'Parameters for the "Node.js service" template',
      fields: [
        { name: 'name', label: 'Component name', required: true, type: 'text', placeholder: 'my-service' },
        { name: 'owner', label: 'Owner', required: true, type: 'select', options: ['developers', 'kubernetes-team', 'templating-team'] },
        { name: 'group', label: 'GitLab group', required: true, type: 'select', options: ['platform', 'apps'] },
        { name: 'description', label: 'Description', type: 'text' },
      ],
      actions: [{ label: 'Create', href: '#' }],
    },
  },
];

const messages: DisplayMessage[] = [
  userMsg('list all my owned components'),
  assistantFrom(ownedComponents),
  userMsg('show me the project structure docs for java-mcp-api'),
  assistantFrom(techdocs),
  userMsg('help me create a new repo in gitlab'),
  assistantFrom(templateForm),
];

function Harness() {
  return (
    <UnifiedThemeProvider theme={themes.light}>
      <CssBaseline />
      <MemoryRouter>
        <Box style={{ maxWidth: 880, margin: '0 auto', height: '100%' }}>
          <Box p={2}>
            <Typography variant="h6">Assistant rendering harness</Typography>
            <Typography variant="caption" color="textSecondary">
              Real reducer + real components. The owned-components answer must
              show two LINKED tables and prose — and NO duplicate merged table.
            </Typography>
          </Box>
          <MessageList messages={messages} onSubmitCard={() => {}} />
        </Box>
      </MemoryRouter>
    </UnifiedThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
