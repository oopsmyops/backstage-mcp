import type { AssistantCard, AssistantCardValue } from '../api/types';

/**
 * Deterministically maps an MCP tool's JSON result to declarative AssistantCards
 * — entirely on the client, with no LLM round-trip. This is the latency-free
 * "generative UI" path: the model calls tools, the structured results stream to
 * the browser via `tool_result`, and this registry renders them.
 *
 * Pure function (no React/theme) so it is trivially unit-testable. The
 * AssistantCardRenderer turns these cards into themed Backstage components.
 */
/**
 * Convenience wrapper: parse a raw `tool_result` SSE payload (JSON string) and
 * map it to cards. Returns [] if the payload isn't JSON (e.g. plain text).
 */
export function cardsFromToolResultText(
  toolName: string,
  content: string,
): AssistantCard[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  return toolResultToCard(toolName, parsed);
}

export function toolResultToCard(
  toolName: string,
  result: unknown,
): AssistantCard[] {
  if (result === null || typeof result !== 'object') return [];
  const obj = result as Record<string, unknown>;
  if (obj.error) return []; // errors surface in narration / tool strip

  switch (toolName) {
    case 'search_catalog':
    case 'list_api_specs':
    case 'list_templates':
      return entityTableCards(obj);
    case 'get_entity':
      return entityDetailCards(obj);
    case 'list_tasks':
      return taskTableCards(obj);
    case 'run_template':
    case 'get_task_status':
      return taskStatusCards(obj);
    case 'get_api_spec':
      return apiSpecCards(obj);
    case 'get_techdocs':
      return techdocsCards(obj);
    case 'check_connection':
      return statusOnly(obj, 'Backstage connection');
    case 'search_techdocs':
      return docSearchCards(obj);
    case 'get_catalog_facets':
      return facetCards(obj);
    default:
      return [];
  }
}

// ─── Entity lists (catalog / api specs / templates) ──────────────────────────

interface EntitySummary {
  ref?: string;
  kind?: string;
  name?: string;
  title?: string;
  description?: string;
  owner?: string;
  type?: string;
}

function entityTableCards(obj: Record<string, unknown>): AssistantCard[] {
  const rowsSource = firstArray(obj, ['entities', 'apis', 'templates', 'items']);
  if (!rowsSource) return [];
  const entities = rowsSource as EntitySummary[];
  // Empty result → render nothing; the model's reply explains "no results".
  if (entities.length === 0) {
    return [];
  }

  return [
    {
      type: 'table',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'type', label: 'Type' },
        { key: 'owner', label: 'Owner' },
        { key: 'description', label: 'Description' },
      ],
      rows: entities.map(e => ({
        name: link(e.title ?? e.name ?? e.ref ?? '—', entityUrl(e.ref)),
        type: e.type ?? e.kind ?? '—',
        owner: e.owner ?? '—',
        description: truncate(e.description, 80),
      })),
    },
  ];
}

function entityDetailCards(obj: Record<string, unknown>): AssistantCard[] {
  const ref = str(obj.ref);
  const name = str(obj.title) || str(obj.name) || ref || 'Entity';
  const items: Array<{ label: string; value: AssistantCardValue }> = [
    { label: 'Name', value: link(name, entityUrl(ref)) },
  ];
  pushIf(items, 'Kind', str(obj.kind));
  pushIf(items, 'Type', str(obj.type));
  pushIf(items, 'Owner', str(obj.owner));
  pushIf(items, 'System', str(obj.system));
  pushIf(items, 'Description', str(obj.description));

  const tags = obj.tags;
  if (Array.isArray(tags) && tags.length) {
    items.push({ label: 'Tags', value: tags.map(String) });
  }

  const relations = obj.relations;
  if (Array.isArray(relations)) {
    for (const rel of relations as Array<Record<string, unknown>>) {
      const targetRef = str(rel.targetRef);
      items.push({
        label: str(rel.type) || 'relation',
        value: link(str(rel.targetName) || targetRef, entityUrl(targetRef)),
      });
    }
  }

  return [{ type: 'details', title: name, items }];
}

// ─── Scaffolder tasks ────────────────────────────────────────────────────────

interface TaskRow {
  taskId?: string;
  id?: string;
  status?: string;
  createdAt?: string;
  templateRef?: string;
}

function taskTableCards(obj: Record<string, unknown>): AssistantCard[] {
  const tasks = firstArray(obj, ['tasks']) as TaskRow[] | undefined;
  if (!tasks || tasks.length === 0) return [];
  return [
    {
      type: 'table',
      columns: [
        { key: 'task', label: 'Task' },
        { key: 'status', label: 'Status' },
        { key: 'template', label: 'Template' },
        { key: 'created', label: 'Created' },
      ],
      rows: tasks.map(t => ({
        task: shortId(t.taskId ?? t.id),
        status: t.status ?? 'unknown',
        template: t.templateRef ?? '—',
        created: formatDate(t.createdAt),
      })),
    },
  ];
}

function taskStatusCards(obj: Record<string, unknown>): AssistantCard[] {
  const status = str(obj.status);
  if (!status) return [];
  const items: Array<{ label: string; value: AssistantCardValue }> = [];
  pushIf(items, 'Task ID', shortId(str(obj.taskId) || str(obj.id)));
  pushIf(items, 'Template', str(obj.templateRef));
  pushIf(items, 'Created', formatDate(str(obj.createdAt)));

  const cards: AssistantCard[] = [
    { type: 'status', title: 'Scaffolder task', status, items },
  ];

  const logs = obj.logs;
  if (Array.isArray(logs) && logs.length) {
    cards.push({
      type: 'code',
      title: 'Task log',
      language: 'text',
      code: logs.map(line => String(line)).join('\n'),
    });
  }
  return cards;
}

// ─── API spec / TechDocs ─────────────────────────────────────────────────────

function apiSpecCards(obj: Record<string, unknown>): AssistantCard[] {
  const spec = str(obj.spec);
  if (!spec) return [];
  return [{ type: 'code', title: 'API specification', language: detectSpecLanguage(spec), code: spec }];
}

function techdocsCards(obj: Record<string, unknown>): AssistantCard[] {
  const content = str(obj.content);
  if (!content) return [];
  return [
    {
      type: 'document',
      title: 'Documentation',
      sections: [{ body: content }],
    },
  ];
}

// ─── New tools ───────────────────────────────────────────────────────────────

function docSearchCards(obj: Record<string, unknown>): AssistantCard[] {
  const results = firstArray(obj, ['results']) as
    | Array<Record<string, unknown>>
    | undefined;
  if (!results || results.length === 0) {
    return [];
  }
  return [
    {
      type: 'table',
      title: 'Documentation matches',
      columns: [
        { key: 'title', label: 'Title' },
        { key: 'snippet', label: 'Snippet' },
      ],
      rows: results.map(r => ({
        title: link(
          str(r.title) || str(r.location) || 'Result',
          str(r.location) || str(r.url),
        ),
        snippet: truncate(str(r.text) || str(r.snippet), 120),
      })),
    },
  ];
}

function facetCards(obj: Record<string, unknown>): AssistantCard[] {
  const facets = obj.facets;
  if (!facets || typeof facets !== 'object') return [];
  const cards: AssistantCard[] = [];
  for (const [facetName, values] of Object.entries(
    facets as Record<string, unknown>,
  )) {
    if (!Array.isArray(values) || values.length === 0) continue;
    cards.push({
      type: 'table',
      title: facetName,
      columns: [
        { key: 'value', label: 'Value' },
        { key: 'count', label: 'Count' },
      ],
      rows: (values as Array<Record<string, unknown>>).map(v => ({
        value: str(v.value) || '—',
        count: typeof v.count === 'number' ? v.count : str(v.count),
      })),
    });
  }
  return cards;
}

function statusOnly(
  obj: Record<string, unknown>,
  title: string,
): AssistantCard[] {
  const status = str(obj.status) || 'ok';
  const items: Array<{ label: string; value: AssistantCardValue }> = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'status') continue;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      items.push({ label: key, value });
    }
  }
  return [{ type: 'status', title, status, items }];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function entityUrl(ref?: string): string | undefined {
  if (!ref) return undefined;
  const match = ref.match(/^(\w+):(?:([^/]+)\/)?(.+)$/);
  if (!match) return undefined;
  const [, kind, ns, name] = match;
  return `/catalog/${ns ?? 'default'}/${kind.toLowerCase()}/${name}`;
}

function link(text: string, href?: string): AssistantCardValue {
  return href ? { text, href } : text;
}

function firstArray(
  obj: Record<string, unknown>,
  keys: string[],
): unknown[] | undefined {
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return undefined;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function pushIf(
  items: Array<{ label: string; value: AssistantCardValue }>,
  label: string,
  value: string,
): void {
  if (value) items.push({ label, value });
}

function truncate(text: string | undefined, max: number): string {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function shortId(id?: string): string {
  if (!id) return '—';
  return id.length > 8 ? id.slice(0, 8) : id;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function detectSpecLanguage(spec: string): string {
  const trimmed = spec.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  return 'yaml';
}
