---
name: backstage
description: Guide for working with the Backstage MCP server — catalog search, API discovery, scaffolder templates, and TechDocs. Use this skill whenever the user wants to find services, APIs, create new projects via Backstage, or read documentation from Backstage.
triggers:
  - backstage
  - service catalog
  - scaffolder
  - techdocs
  - find component
  - find api
  - create service
  - create template
---

# Backstage MCP Skill

You have access to a Backstage developer portal via MCP tools. Use them to help the user discover services, understand APIs, create new projects, and read technical documentation.

## Available Tools

| Tool | Purpose |
|------|---------|
| `check_connection` | Verify Backstage connectivity and token validity — run first if setup is uncertain |
| `search_catalog` | Find entities by name, kind, tags, or owner |
| `get_entity` | Full entity details with resolved API relations and dependencies |
| `list_api_specs` | Browse available APIs (OpenAPI, AsyncAPI, GraphQL, gRPC) |
| `get_api_spec` | Retrieve raw API specification content |
| `list_templates` | Browse scaffolder templates |
| `get_template` | Get template parameter schema |
| `run_template` | Execute a template with user-provided values |
| `list_tasks` | List scaffolder task executions, optionally filter by user |
| `get_task_status` | Poll scaffolder task progress |
| `get_techdocs` | Retrieve rendered documentation for an entity |

## Entity Reference Format

Always use the full `kind:namespace/name` format:
- `component:default/payment-service`
- `api:default/payment-api`
- `system:default/payments-platform`
- `group:default/team-payments`
- `template:default/create-react-app`

The namespace is almost always `default` unless the Backstage instance is multi-tenant.

Entity kinds: `Component`, `API`, `System`, `Domain`, `Group`, `User`, `Resource`, `Template`

## Relation Types

When `get_entity` returns relations, these are the important ones:
- `providesApi` — this component exposes an API
- `consumesApi` — this component calls an external API
- `dependsOn` — infrastructure/resource dependency
- `partOf` — belongs to a system or domain
- `ownedBy` — owned by a team/group

## Workflow: Discovering a Service

```
1. search_catalog(query: "payment", kind: "Component")
2. get_entity(entityRef: "component:default/payment-service")
   → check relations for providesApi / consumesApi
3. get_api_spec(entityRef: "api:default/payment-api")
   → read OpenAPI spec to understand endpoints and schemas
```

## Workflow: Integrating with an Internal API

```
1. list_api_specs(type: "openapi")  — or search_catalog(kind: "API", query: "user management")
2. get_api_spec(entityRef: "api:default/user-manager")
   → returns full OpenAPI YAML/JSON
3. Write integration code based on the spec's endpoints, schemas, and auth
```

## Workflow: Creating a New Service (Scaffolder)

```
1. list_templates()  — or list_templates(tags: ["react"])
2. get_template(entityRef: "template:default/create-react-app")
   → inspect spec.parameters to understand required inputs
3. PRE-FETCH all selectable options in parallel (see rule below)
4. Present the user with numbered options for each field
5. run_template(templateRef: "...", values: { ... })
   → returns taskId
6. get_task_status(taskId: "...", includeLogs: false)
   → poll until status is "completed" or "failed"
```

### CRITICAL: Pre-fetch selectable options before asking the user

When collecting template parameters, **do NOT ask the user to type in values for fields that have a finite set of options**. Instead, proactively fetch the available options and present them as numbered lists.

After calling `get_template`, inspect each parameter's schema:
- **`ui:field: OwnerPicker`** (owner fields) → call `search_catalog(kind: "Group", limit: 50)` to list all groups
- **`ui:field: EntityPicker`** with `catalogFilter.kind: "API"` → call `list_api_specs(limit: 50)` to list all APIs
- **`ui:field: EntityPicker`** with `catalogFilter.kind: "Component"` → call `search_catalog(kind: "Component", limit: 50)`
- **`ui:field: RepoUrlPicker`** with `allowedHosts` containing `gitlab.com` / `github.com` → tell the user which hosts are allowed and ask for the group path and repo name
- **`enum` fields** (e.g., language) → show the enum values directly from the schema
- **`boolean` fields** → show as yes/no with the default pre-selected

**Fetch all lookups in parallel** (e.g., groups + APIs in one round trip) to minimize back-and-forth. Present all fields together in a single message with numbered options so the user can answer everything at once.

Example response format:
```
**Repo name:** (enter a name)
**Language:** java | node | python | go | dotnet
**Owner (pick one):**
  1. developers
  2. admins
  3. nagarro
**Consumed APIs (pick any, or "none"):**
  1. payment-api — REST API for payments (owner: team-payments)
  2. user-api — REST API for user management (owner: team-users)
**Git host:** gitlab.com, github.com — enter group/repo path
```

## Workflow: Checking Past Template Runs

```
1. list_tasks(createdBy: "user:default/ankit-singh16")
   → returns all tasks with status, template used, timestamps
2. get_task_status(taskId: "...", includeLogs: true)
   → drill into a specific task for step details and logs
```

**Important**: Always call `get_template` before `run_template`. Never guess parameter names — get the exact schema first. `run_template` validates inputs automatically and will return clear errors if something is wrong.

## Workflow: Reading Documentation

```
1. get_entity(entityRef: "component:default/payment-service")
   → check metadata.annotations["backstage.io/techdocs-ref"] exists
2. get_techdocs(entityRef: "component:default/payment-service")
   → returns plain-text documentation (stripped HTML)
```

If `get_techdocs` returns a 404, TechDocs is not configured for that entity. Tell the user and suggest checking the entity's `catalog-info.yaml` for a `backstage.io/techdocs-ref` annotation.

## Pagination

When `search_catalog` or `list_api_specs` returns a `nextCursor`, pass it as the `cursor` parameter in the next call to load more results. Present results incrementally rather than loading everything at once.

## Error Handling

- `401/403` errors → `BACKSTAGE_TOKEN` is invalid, expired, or lacks permissions
- `404` errors → entity doesn't exist or hasn't been ingested yet (check entity's catalog-info.yaml is registered)
- `408` timeout → Backstage is slow; retry or reduce result limit
- TechDocs 404 → entity missing `backstage.io/techdocs-ref` annotation

## Tips for Better Results

- Use `search_catalog` with specific `kind` filters for faster results
- For complex service maps, start with `get_entity` on a System entity — it will show all components and APIs that belong to it
- When a user asks "what APIs does X call?", use `get_entity` and look at `consumesApi` relations
- When a user asks "which teams own X?", look at `ownedBy` relations
- The `spec` field in `get_entity` output contains all Backstage-specific data (lifecycle, type, subcomponents, etc.)
