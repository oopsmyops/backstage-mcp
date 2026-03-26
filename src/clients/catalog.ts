import { parseEntityRef, DEFAULT_NAMESPACE, type Entity } from "../entity-ref.js";
import type { BackstageClient } from "./backstage.js";
import type { TtlCache } from "./cache.js";
import type { Config } from "../config.js";

export interface EntitySummary {
  ref: string;
  kind: string;
  namespace: string;
  name: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  system?: string;
  type?: string;
}

export interface EnrichedEntity {
  ref: string;
  kind: string;
  namespace: string;
  name: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  system?: string;
  type?: string;
  annotations?: Record<string, string>;
  labels?: Record<string, string>;
  spec?: Record<string, unknown>;
  relations?: ResolvedRelation[];
}

export interface ResolvedRelation {
  type: string;
  targetRef: string;
  targetName: string;
  targetKind: string;
  targetDescription?: string;
}

export interface SearchResult {
  entities: EntitySummary[];
  nextCursor?: string;
  totalCount?: number;
}

// Relation types worth surfacing to the LLM
const INTERESTING_RELATIONS = new Set([
  "providesApi",
  "consumesApi",
  "dependsOn",
  "partOf",
  "ownedBy",
  "hasPart",
  "ownerOf",
]);

interface CatalogEntitiesResponse {
  items: Entity[];
  pageInfo?: { nextCursor?: string };
  totalItems?: number;
}

export class BackstageCatalogClient {
  constructor(
    private readonly base: BackstageClient,
    private readonly config: Config,
    private readonly cache: TtlCache
  ) {}

  async searchEntities(params: {
    query?: string;
    kind?: string;
    tags?: string[];
    owner?: string;
    limit?: number;
    cursor?: string;
  }): Promise<SearchResult> {
    const cacheKey = `search:${JSON.stringify(params)}`;
    return this.cache.getOrFetch(cacheKey, async () => {
      const limit = params.limit ?? 20;
      const filters: string[] = [];

      if (params.kind) filters.push(`kind=${params.kind}`);
      if (params.owner) filters.push(`spec.owner=${params.owner}`);
      if (params.tags?.length) {
        params.tags.forEach((t) => filters.push(`metadata.tags=${t}`));
      }

      if (params.query) {
        // Try Backstage 1.20+ full-text search endpoint first
        const qs = new URLSearchParams({ fullTextFilter: params.query });
        if (filters.length) qs.set("filter", filters.join(","));
        qs.set("limit", String(limit));
        if (params.cursor) qs.set("after", params.cursor);

        const response = await this.base
          .fetchJson<CatalogEntitiesResponse>(
            `/api/catalog/entities/by-query?${qs.toString()}`
          )
          .catch(async () => {
            // Fallback: /entities endpoint + client-side name filtering
            const fallback = new URLSearchParams({ limit: String(100) });
            if (filters.length) fallback.set("filter", filters.join(","));
            const items = await this.base.fetchJson<Entity[]>(
              `/api/catalog/entities?${fallback.toString()}`
            );
            // Client-side full-text filter on name, title, description
            const q = params.query!.toLowerCase();
            const filtered = items.filter(
              (e) =>
                e.metadata.name.toLowerCase().includes(q) ||
                e.metadata.title?.toLowerCase().includes(q) ||
                e.metadata.description?.toLowerCase().includes(q) ||
                e.metadata.tags?.some((t) => t.toLowerCase().includes(q))
            );
            return {
              items: filtered.slice(0, limit),
              pageInfo: undefined,
              totalItems: filtered.length,
            };
          });

        return {
          entities: response.items.map(toEntitySummary),
          nextCursor: response.pageInfo?.nextCursor,
          totalCount: response.totalItems,
        };
      }

      // Filter-only query (no full-text)
      const qs = new URLSearchParams({ limit: String(limit) });
      if (filters.length) qs.set("filter", filters.join(","));
      if (params.cursor) qs.set("after", params.cursor);

      const response = await this.base
        .fetchJson<CatalogEntitiesResponse>(
          `/api/catalog/entities/by-query?${qs.toString()}`
        )
        .catch(async () => {
          // Fallback
          const items = await this.base.fetchJson<Entity[]>(
            `/api/catalog/entities?${qs.toString()}`
          );
          return { items, pageInfo: undefined, totalItems: undefined };
        });

      return {
        entities: response.items.map(toEntitySummary),
        nextCursor: response.pageInfo?.nextCursor,
        totalCount: response.totalItems,
      };
    });
  }

  async getEntity(entityRef: string): Promise<Entity | undefined> {
    const cacheKey = `entity:${entityRef}`;
    return this.cache.getOrFetch(cacheKey, async () => {
      const parsed = parseEntityRef(entityRef);
      const { kind, namespace = DEFAULT_NAMESPACE, name } = parsed;
      return this.base
        .fetchJson<Entity>(
          `/api/catalog/entities/by-name/${kind}/${namespace}/${name}`
        )
        .catch(() => undefined);
    });
  }

  async getEnrichedEntity(
    entityRef: string,
    includeRelations: boolean
  ): Promise<EnrichedEntity | undefined> {
    const entity = await this.getEntity(entityRef);
    if (!entity) return undefined;

    const spec = entity.spec as Record<string, unknown> | undefined;

    const enriched: EnrichedEntity = {
      ref: entityRef,
      kind: entity.kind,
      namespace: entity.metadata.namespace ?? DEFAULT_NAMESPACE,
      name: entity.metadata.name,
      title: entity.metadata.title,
      description: entity.metadata.description,
      owner: spec?.owner as string | undefined,
      tags: entity.metadata.tags,
      system: spec?.system as string | undefined,
      type: spec?.type as string | undefined,
      annotations: entity.metadata.annotations,
      labels: entity.metadata.labels,
      spec,
    };

    if (includeRelations && entity.relations?.length) {
      const interesting = entity.relations.filter((r) =>
        INTERESTING_RELATIONS.has(r.type)
      );

      const CONCURRENCY = 10;
      const resolved: ResolvedRelation[] = [];
      for (let i = 0; i < interesting.length; i += CONCURRENCY) {
        const batch = interesting.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (rel) => {
            const targetEntity = await this.getEntity(rel.targetRef);
            const parsed = parseEntityRef(rel.targetRef);
            return {
              type: rel.type,
              targetRef: rel.targetRef,
              targetName: parsed.name,
              targetKind: parsed.kind,
              targetDescription: targetEntity?.metadata.description,
            } satisfies ResolvedRelation;
          })
        );
        for (const result of results) {
          if (result.status === "fulfilled") resolved.push(result.value);
        }
      }
      enriched.relations = resolved;
    }

    return enriched;
  }

  async getEntitySpec(entityRef: string): Promise<string | undefined> {
    const entity = await this.getEntity(entityRef);
    if (!entity) return undefined;
    const spec = entity.spec as Record<string, unknown> | undefined;
    if (!spec) return undefined;

    const definition = spec["definition"];
    if (typeof definition === "string") {
      if (definition.startsWith("$text:") || definition.startsWith("$yaml:")) {
        const ref = definition.replace(/^\$\w+:\s*/, "").trim();
        try {
          const content = await this.base.fetchText(ref);
          return content.slice(0, 50_000);
        } catch {
          return `[Could not fetch external spec from: ${ref}]`;
        }
      }
      return definition.slice(0, 50_000);
    }

    return undefined;
  }
}

function toEntitySummary(entity: Entity): EntitySummary {
  const spec = entity.spec as Record<string, unknown> | undefined;
  return {
    ref: `${entity.kind.toLowerCase()}:${entity.metadata.namespace ?? DEFAULT_NAMESPACE}/${entity.metadata.name}`,
    kind: entity.kind,
    namespace: entity.metadata.namespace ?? DEFAULT_NAMESPACE,
    name: entity.metadata.name,
    title: entity.metadata.title,
    description: entity.metadata.description,
    owner: spec?.owner as string | undefined,
    tags: entity.metadata.tags,
    system: spec?.system as string | undefined,
    type: spec?.type as string | undefined,
  };
}
