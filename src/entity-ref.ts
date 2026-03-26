/**
 * Minimal entityRef utilities — replaces @backstage/catalog-model dependency.
 * Backstage entityRef format: "kind:namespace/name"
 */

export const DEFAULT_NAMESPACE = "default";

export interface ParsedEntityRef {
  kind: string;
  namespace: string;
  name: string;
}

/**
 * Parse an entityRef string into its component parts.
 * Handles: "kind:namespace/name", "kind:name", "name"
 */
export function parseEntityRef(
  ref: string,
  defaults?: { defaultKind?: string; defaultNamespace?: string }
): ParsedEntityRef {
  const defaultKind = defaults?.defaultKind ?? "Component";
  const defaultNamespace = defaults?.defaultNamespace ?? DEFAULT_NAMESPACE;

  // Full form: "kind:namespace/name"
  const colonIdx = ref.indexOf(":");
  const slashIdx = ref.indexOf("/");

  if (colonIdx !== -1 && slashIdx > colonIdx) {
    return {
      kind: ref.slice(0, colonIdx),
      namespace: ref.slice(colonIdx + 1, slashIdx),
      name: ref.slice(slashIdx + 1),
    };
  }

  // "kind:name" (no namespace)
  if (colonIdx !== -1) {
    return {
      kind: ref.slice(0, colonIdx),
      namespace: defaultNamespace,
      name: ref.slice(colonIdx + 1),
    };
  }

  // "name" only
  return {
    kind: defaultKind,
    namespace: defaultNamespace,
    name: ref,
  };
}

/**
 * Minimal Entity type subset used by our tools.
 */
export interface Entity {
  kind: string;
  apiVersion: string;
  metadata: {
    name: string;
    namespace?: string;
    title?: string;
    description?: string;
    tags?: string[];
    annotations?: Record<string, string>;
    labels?: Record<string, string>;
    uid?: string;
  };
  spec?: Record<string, unknown>;
  relations?: Array<{ type: string; targetRef: string }>;
}
