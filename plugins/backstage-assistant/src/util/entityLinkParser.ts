export interface EntityReference {
  kind: string;
  namespace: string;
  name: string;
  raw: string;
  url: string;
}

const ENTITY_REF_PATTERN =
  /\b(component|api|system|domain|group|user|resource|template):(?:([a-z0-9-]+)\/)?([a-z0-9_.-]+)\b/gi;

export function extractEntityRefs(text: string): EntityReference[] {
  const refs: EntityReference[] = [];
  const seen = new Set<string>();

  let match;
  ENTITY_REF_PATTERN.lastIndex = 0;
  while ((match = ENTITY_REF_PATTERN.exec(text)) !== null) {
    const kind = match[1].toLowerCase();
    const namespace = match[2] ?? 'default';
    const name = match[3];
    const raw = match[0];

    const key = `${kind}:${namespace}/${name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    refs.push({
      kind,
      namespace,
      name,
      raw,
      url: `/catalog/${namespace}/${kind}/${name}`,
    });
  }

  return refs;
}

export function isInsideCodeBlock(
  text: string,
  position: number,
): boolean {
  let inCode = false;
  let inFencedBlock = false;
  let i = 0;

  while (i < position) {
    if (text.startsWith('```', i)) {
      inFencedBlock = !inFencedBlock;
      i += 3;
      continue;
    }
    if (!inFencedBlock && text[i] === '`') {
      inCode = !inCode;
    }
    i++;
  }

  return inCode || inFencedBlock;
}

export function replaceEntityRefsWithLinks(text: string): string {
  ENTITY_REF_PATTERN.lastIndex = 0;
  return text.replace(ENTITY_REF_PATTERN, (match, ...args) => {
    const offset = args[args.length - 2] as number;
    if (isInsideCodeBlock(text, offset)) return match;

    const kind = (args[0] as string).toLowerCase();
    const namespace = (args[1] as string) ?? 'default';
    const name = args[2] as string;
    const url = `/catalog/${namespace}/${kind}/${name}`;
    return `[${match}](${url})`;
  });
}
