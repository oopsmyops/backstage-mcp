import { parseEntityRef, DEFAULT_NAMESPACE } from "../entity-ref.js";
import type { BackstageClient } from "./backstage.js";
import type { TtlCache } from "./cache.js";

export interface TemplateEntity {
  ref: string;
  name: string;
  namespace: string;
  title?: string;
  description?: string;
  owner?: string;
  tags?: string[];
  parameters: TemplateParameterSchema[];
  steps?: TemplateStep[];
}

export interface TemplateParameterSchema {
  title?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TemplateStep {
  id: string;
  name: string;
  action: string;
}

export interface ScaffolderTask {
  id: string;
  status: "open" | "processing" | "completed" | "failed" | "cancelled";
  createdAt?: string;
  lastHeartbeatAt?: string;
  createdBy?: string;
  spec?: {
    steps?: Array<{ id: string; name: string; action: string }>;
    parameters?: Record<string, unknown>;
    output?: Record<string, unknown>;
  };
}

export interface ScaffolderTaskEvent {
  id: number;
  taskId: string;
  body: {
    message?: string;
    stepId?: string;
    status?: string;
    output?: Record<string, unknown>;
    error?: { name?: string; message?: string };
  };
  type: "log" | "completion";
  createdAt: string;
}

// Raw catalog entity shape for Template kind
interface RawTemplateEntity {
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    title?: string;
    description?: string;
    tags?: string[];
    annotations?: Record<string, string>;
  };
  spec?: {
    owner?: string;
    parameters?: TemplateParameterSchema | TemplateParameterSchema[];
    steps?: Array<{ id: string; name: string; action: string }>;
  };
}

export class BackstageScaffolderClient {
  constructor(
    private readonly base: BackstageClient,
    private readonly cache: TtlCache
  ) {}

  async listTemplates(params: {
    tags?: string[];
    limit?: number;
  }): Promise<TemplateEntity[]> {
    const cacheKey = `templates:list:${JSON.stringify(params)}`;
    return this.cache.getOrFetch(cacheKey, async () => {
      const qs = new URLSearchParams({ "filter[kind]": "Template" });
      if (params.limit) qs.set("limit", String(params.limit));
      if (params.tags?.length) {
        params.tags.forEach((t) => qs.append("filter[metadata.tags]", t));
      }

      const response = await this.base.fetchJson<{ items: RawTemplateEntity[] }>(
        `/api/catalog/entities/by-query?${qs.toString()}`
      ).catch(async () => {
        // Fallback for older Backstage
        const items = await this.base.fetchJson<RawTemplateEntity[]>(
          `/api/catalog/entities?filter=kind=Template&limit=${params.limit ?? 50}`
        );
        return { items };
      });

      return response.items.map(toTemplateEntity);
    });
  }

  async getTemplate(entityRef: string): Promise<TemplateEntity | undefined> {
    const cacheKey = `template:${entityRef}`;
    return this.cache.getOrFetch(cacheKey, async () => {
      const parsed = parseEntityRef(entityRef, { defaultKind: "Template" });
      const { kind, namespace = DEFAULT_NAMESPACE, name } = parsed;

      const entity = await this.base
        .fetchJson<RawTemplateEntity>(
          `/api/catalog/entities/by-name/${kind}/${namespace}/${name}`
        )
        .catch(() => undefined);

      return entity ? toTemplateEntity(entity) : undefined;
    });
  }

  async runTemplate(params: {
    templateRef: string;
    values: Record<string, unknown>;
    createdBy?: string;
  }): Promise<{ taskId: string }> {
    const body: Record<string, unknown> = {
      templateRef: params.templateRef,
      values: params.values,
    };
    if (params.createdBy) {
      body.createdBy = params.createdBy;
    }
    const response = await this.base.fetchJson<{ id: string }>(
      "/api/scaffolder/v2/tasks",
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );
    return { taskId: response.id };
  }

  async listTasks(params: {
    createdBy?: string;
  }): Promise<ScaffolderTask[]> {
    const qs = new URLSearchParams();
    if (params.createdBy) qs.set("createdBy", params.createdBy);
    const query = qs.toString();
    const path = `/api/scaffolder/v2/tasks${query ? `?${query}` : ""}`;
    const response = await this.base.fetchJson<{ tasks: ScaffolderTask[] }>(path);
    return response.tasks;
  }

  async getTaskStatus(taskId: string): Promise<ScaffolderTask> {
    return this.base.fetchJson<ScaffolderTask>(
      `/api/scaffolder/v2/tasks/${taskId}`
    );
  }

  async getTaskLogs(taskId: string): Promise<ScaffolderTaskEvent[]> {
    return this.base.fetchJson<ScaffolderTaskEvent[]>(
      `/api/scaffolder/v2/tasks/${taskId}/events?after=0`
    );
  }
}

function toTemplateEntity(raw: RawTemplateEntity): TemplateEntity {
  const rawParams = raw.spec?.parameters;
  const parameters: TemplateParameterSchema[] = rawParams
    ? Array.isArray(rawParams)
      ? rawParams
      : [rawParams]
    : [];

  return {
    ref: `template:${raw.metadata.namespace ?? DEFAULT_NAMESPACE}/${raw.metadata.name}`,
    name: raw.metadata.name,
    namespace: raw.metadata.namespace ?? DEFAULT_NAMESPACE,
    title: raw.metadata.title,
    description: raw.metadata.description,
    owner: raw.spec?.owner,
    tags: raw.metadata.tags,
    parameters,
    steps: raw.spec?.steps,
  };
}
