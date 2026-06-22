import { entityUrl } from './toolResultToCard';
import { isInsideCodeBlock } from './entityLinkParser';

/**
 * Bare-name linking for assistant prose.
 *
 * `entityLinkParser` only linkifies *full* entity refs (component:default/foo).
 * The model's narration normally mentions friendly **names** (`payment-service`),
 * which would otherwise render unlinked even though the same entity is a working
 * link in the result table. This module harvests `displayName → /catalog/...`
 * from the message's own tool results (so we only ever link names we know are
 * real entities) and rewrites bare mentions into markdown links.
 */

interface NamedEntity {
  ref?: string;
  name?: string;
  title?: string;
}

const ENTITY_LIST_KEYS = ['entities', 'apis', 'templates', 'items'] as const;
const MIN_NAME_LENGTH = 2;
const MARKDOWN_LINK = /\[[^\]]*\]\([^)]*\)/g;

/** Build a display-name → catalog-url map from a message's tool-call results. */
export function collectEntityLinks(
  toolCalls: Array<{ name: string; result?: string }> | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const call of toolCalls ?? []) {
    if (!call.result) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(call.result);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    const obj = parsed as Record<string, unknown>;
    if (obj.error) continue;

    for (const key of ENTITY_LIST_KEYS) {
      const arr = obj[key];
      if (Array.isArray(arr)) {
        for (const entity of arr as NamedEntity[]) addEntity(map, entity);
      }
    }
    // Single-entity result (e.g. get_entity).
    if (typeof obj.ref === 'string') addEntity(map, obj as NamedEntity);
  }
  return map;
}

function addEntity(map: Map<string, string>, entity: NamedEntity): void {
  const url = entityUrl(entity.ref);
  if (!url) return;
  for (const label of [entity.name, entity.title]) {
    if (label && label.length >= MIN_NAME_LENGTH && !map.has(label)) {
      map.set(label, url);
    }
  }
}

/**
 * Replace bare entity-name mentions in `text` with markdown links, skipping
 * code spans/blocks and any text already inside a markdown link. Names are
 * matched on word boundaries (longest first) so `billing` never matches inside
 * `billings`, and a substring name never pre-empts a longer one.
 */
export function linkifyEntityNames(
  text: string,
  nameToUrl: Map<string, string>,
): string {
  if (nameToUrl.size === 0) return text;

  const names = [...nameToUrl.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `\\b(${names.map(escapeRegExp).join('|')})\\b`,
    'g',
  );

  const linkSpans = findLinkSpans(text);

  return text.replace(pattern, (match: string, _group: string, offset: number) => {
    if (isInsideCodeBlock(text, offset)) return match;
    if (linkSpans.some(([start, end]) => offset >= start && offset < end)) {
      return match;
    }
    const url = nameToUrl.get(match);
    return url ? `[${match}](${url})` : match;
  });
}

function findLinkSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  MARKDOWN_LINK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK.exec(text)) !== null) {
    spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
