import type { BackstageScaffolderClient, TemplateParameterSchema } from "../clients/scaffolder.js";
import { toolSuccess, toolError, withToolError, type ToolResult } from "./helpers.js";

export class ScaffolderTools {
  constructor(private readonly scaffolder: BackstageScaffolderClient) {}

  async listTemplates(input: {
    tags?: string[];
    limit?: number;
  }): Promise<ToolResult> {
    return withToolError(async () => {
      const templates = await this.scaffolder.listTemplates({
        tags: input.tags,
        limit: input.limit ?? 20,
      });
      return toolSuccess({
        templates: templates.map((t) => ({
          ref: t.ref,
          name: t.name,
          title: t.title,
          description: t.description,
          owner: t.owner,
          tags: t.tags,
          parameterCount: t.parameters.length,
        })),
      });
    }, "list_templates");
  }

  async getTemplate(input: { entityRef: string }): Promise<ToolResult> {
    return withToolError(async () => {
      const template = await this.scaffolder.getTemplate(input.entityRef);
      if (!template) return toolError(`Template not found: ${input.entityRef}`);

      const lookupHints = extractLookupHints(template.parameters);

      return toolSuccess({
        ref: template.ref,
        name: template.name,
        title: template.title,
        description: template.description,
        owner: template.owner,
        tags: template.tags,
        parameters: template.parameters,
        steps: template.steps,
        lookupHints,
        usage:
          "BEFORE asking the user for values, pre-fetch all options listed in lookupHints (in parallel) " +
          "and present them as numbered lists so the user can pick. " +
          "Then call run_template with templateRef and values matching the parameters schema above.",
      });
    }, `get_template(${input.entityRef})`);
  }

  async runTemplate(input: {
    templateRef: string;
    values: Record<string, unknown>;
    createdBy?: string;
  }): Promise<ToolResult> {
    return withToolError(async () => {
      // Step 1: Fetch template to validate inputs
      const template = await this.scaffolder.getTemplate(input.templateRef);
      if (!template) return toolError(`Template not found: ${input.templateRef}`);

      // Step 2: Inline validation — check required fields without external Ajv dependency issues
      if (template.parameters.length > 0) {
        const validationErrors = validateRequiredFields(
          input.values,
          template.parameters
        );
        if (validationErrors.length > 0) {
          return toolError(
            "Template parameter validation failed. Fix the values and try again.",
            { validationErrors }
          );
        }
      }

      // Step 3: Execute
      const { taskId } = await this.scaffolder.runTemplate({
        templateRef: input.templateRef,
        values: input.values,
        createdBy: input.createdBy,
      });

      return toolSuccess({
        taskId,
        message: `Template execution started. Use get_task_status with taskId "${taskId}" to track progress.`,
      });
    }, `run_template(${input.templateRef})`);
  }

  async listTasks(input: {
    createdBy?: string;
  }): Promise<ToolResult> {
    return withToolError(async () => {
      const tasks = await this.scaffolder.listTasks({
        createdBy: input.createdBy,
      });
      return toolSuccess({
        tasks: tasks.map((t) => ({
          taskId: t.id,
          status: t.status,
          createdAt: t.createdAt,
          createdBy: t.createdBy,
          templateRef: (t as any).spec?.templateInfo?.entityRef,
        })),
        totalCount: tasks.length,
      });
    }, "list_tasks");
  }

  async getTaskStatus(input: {
    taskId: string;
    includeLogs?: boolean;
  }): Promise<ToolResult> {
    return withToolError(async () => {
      const [task, logs] = await Promise.all([
        this.scaffolder.getTaskStatus(input.taskId),
        input.includeLogs
          ? this.scaffolder.getTaskLogs(input.taskId)
          : Promise.resolve(undefined),
      ]);

      const output: Record<string, unknown> = {
        taskId: task.id,
        status: task.status,
        createdAt: task.createdAt,
        lastHeartbeatAt: task.lastHeartbeatAt,
        createdBy: task.createdBy,
        steps: (task.spec?.steps ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          action: s.action,
        })),
      };

      if (logs) {
        const relevantLogs = logs
          .filter(
            (e) =>
              e.type === "completion" ||
              e.body.error ||
              (e.body.status && e.body.status !== "processing")
          )
          .slice(-20)
          .map((e) => ({
            type: e.type,
            message: e.body.message,
            stepId: e.body.stepId,
            status: e.body.status,
            error: e.body.error,
            output: e.body.output,
          }));
        output.logs = relevantLogs;
      }

      return toolSuccess(output);
    }, `get_task_status(${input.taskId})`);
  }
}

interface LookupHint {
  field: string;
  description: string;
  tool: string;
  args: Record<string, unknown>;
}

function extractLookupHints(
  parameters: TemplateParameterSchema[]
): LookupHint[] {
  const hints: LookupHint[] = [];

  for (const step of parameters) {
    const props = step.properties ?? {};
    for (const [field, schema] of Object.entries(props)) {
      const s = schema as Record<string, unknown>;
      const uiField = s["ui:field"] as string | undefined;
      const uiOptions = s["ui:options"] as Record<string, unknown> | undefined;

      if (uiField === "OwnerPicker") {
        const allowedKinds = (uiOptions?.allowedKinds as string[]) ?? ["Group"];
        hints.push({
          field,
          description: `Fetch available owners (${allowedKinds.join(", ")}) to present as options`,
          tool: "search_catalog",
          args: { kind: allowedKinds[0], limit: 50 },
        });
      } else if (uiField === "EntityPicker") {
        const catalogFilter = uiOptions?.catalogFilter as Record<string, unknown> | undefined;
        const kind = (catalogFilter?.kind as string) ?? "Component";
        if (kind === "API") {
          hints.push({
            field,
            description: "Fetch available APIs to present as options",
            tool: "list_api_specs",
            args: { limit: 50 },
          });
        } else {
          hints.push({
            field,
            description: `Fetch available ${kind} entities to present as options`,
            tool: "search_catalog",
            args: { kind, limit: 50 },
          });
        }
      } else if (uiField === "RepoUrlPicker") {
        const allowedHosts = uiOptions?.allowedHosts as string[] | undefined;
        hints.push({
          field,
          description: `Ask user for repo name and group/org path. Allowed hosts: ${(allowedHosts ?? []).join(", ")}. Format: host?owner=<group>&repo=<name>`,
          tool: "none",
          args: { allowedHosts },
        });
      }

      // Items-level EntityPicker (e.g., consumesApis array)
      if (s.type === "array") {
        const items = s.items as Record<string, unknown> | undefined;
        if (items?.["ui:field"] === "EntityPicker") {
          const itemFilter = (items["ui:options"] as Record<string, unknown> | undefined)
            ?.catalogFilter as Record<string, unknown> | undefined;
          const itemKind = (itemFilter?.kind as string) ?? "Component";
          // Avoid duplicating if top-level already added
          if (!hints.some((h) => h.field === field)) {
            if (itemKind === "API") {
              hints.push({
                field,
                description: "Fetch available APIs to present as multi-select options",
                tool: "list_api_specs",
                args: { limit: 50 },
              });
            } else {
              hints.push({
                field,
                description: `Fetch available ${itemKind} entities to present as multi-select options`,
                tool: "search_catalog",
                args: { kind: itemKind, limit: 50 },
              });
            }
          }
        }
      }
    }
  }

  return hints;
}

interface ValidationError {
  field: string;
  message: string;
}

function validateRequiredFields(
  values: Record<string, unknown>,
  parameters: TemplateParameterSchema[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const step of parameters) {
    const required = step.required as string[] | undefined;
    if (!required) continue;

    for (const field of required) {
      const value = values[field];
      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        errors.push({
          field,
          message: `Required field '${field}' is missing or empty`,
        });
      }
    }
  }

  return errors;
}
