import type { BackstageCatalogClient } from "../clients/catalog.js";
import { toolSuccess, toolError, withToolError, type ToolResult } from "./helpers.js";

export class CatalogTools {
  constructor(private readonly catalog: BackstageCatalogClient) {}

  async searchCatalog(input: {
    query?: string;
    kind?: string;
    tags?: string[];
    owner?: string;
    limit?: number;
    cursor?: string;
  }): Promise<ToolResult> {
    return withToolError(async () => {
      const result = await this.catalog.searchEntities({
        query: input.query,
        kind: input.kind,
        tags: input.tags,
        owner: input.owner,
        limit: input.limit ?? 20,
        cursor: input.cursor,
      });
      return toolSuccess(result);
    }, "search_catalog");
  }

  async getEntity(input: {
    entityRef: string;
    includeRelations?: boolean;
  }): Promise<ToolResult> {
    return withToolError(async () => {
      const entity = await this.catalog.getEnrichedEntity(
        input.entityRef,
        input.includeRelations ?? true
      );
      if (!entity) return toolError(`Entity not found: ${input.entityRef}`);
      return toolSuccess(entity);
    }, `get_entity(${input.entityRef})`);
  }

  async listApiSpecs(input: {
    type?: string;
    owner?: string;
    limit?: number;
  }): Promise<ToolResult> {
    return withToolError(async () => {
      const searchResult = await this.catalog.searchEntities({
        kind: "API",
        owner: input.owner,
        limit: input.limit ?? 20,
      });

      let entities = searchResult.entities;
      if (input.type) {
        entities = entities.filter(
          (e) => e.type?.toLowerCase() === input.type!.toLowerCase()
        );
      }

      return toolSuccess({
        apis: entities.map((e) => ({
          ref: e.ref,
          name: e.name,
          title: e.title,
          description: e.description,
          type: e.type,
          owner: e.owner,
          tags: e.tags,
          system: e.system,
        })),
        totalCount: searchResult.totalCount,
        nextCursor: searchResult.nextCursor,
      });
    }, "list_api_specs");
  }

  async getApiSpec(input: { entityRef: string }): Promise<ToolResult> {
    return withToolError(async () => {
      const spec = await this.catalog.getEntitySpec(input.entityRef);
      if (spec === undefined) {
        return toolError(
          `No API spec found for ${input.entityRef}. The entity may not exist or may not have a spec.definition field.`
        );
      }
      return toolSuccess({ entityRef: input.entityRef, spec });
    }, `get_api_spec(${input.entityRef})`);
  }
}
