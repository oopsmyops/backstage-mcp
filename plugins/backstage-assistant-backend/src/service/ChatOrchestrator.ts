import type { LoggerService } from '@backstage/backend-plugin-api';
import type { LlmProvider, ConverseResponse, ConverseParams } from '../llm/types';
import type { ToolService, ToolCallContext } from './ToolService';
import type { AssistantCard, ChatCallbacks, ChatRequest, ConversationMessage } from '../types';

const MAX_ROUNDS = 10;
const MAX_TOOL_RESULT_CHARS = 50_000;

const RENDER_UI_TOOL = {
  name: 'render_ui',
  description: 'Render a structured UI card to the user. ALWAYS call this as your LAST action. Do not generate HTML. Use table cards for entity/API/template lists, form cards for template parameters, document cards for TechDocs summaries, details cards for entity details, and status cards for tasks.',
  inputSchema: {
    type: 'object',
    properties: {
      card: {
        type: 'object',
        description: 'A structured card. Supported types: text, table, details, form, document, status. Links must be objects like {"text":"payment-service","href":"/catalog/default/component/payment-service"}.',
        properties: {
          type: {
            type: 'string',
            enum: ['text', 'table', 'details', 'form', 'document', 'status'],
          },
          title: { type: 'string' },
        },
        required: ['type'],
      },
    },
    required: ['card'],
  },
};

function buildSystemPrompt(
  userEntityRef: string,
  ownershipRefs: string[],
  configuredPrompt?: string,
): string {
  const groups = ownershipRefs.filter(r => r.startsWith('group:'));
  const ownershipSection = groups.length
    ? `The user is a member of these groups: ${groups.join(', ')}
When the user asks for "my components" or "owned by me", search for entities owned by EACH of these groups (and the user directly). Combine all results and explain which group owns what.`
    : '';

  return `You are a helpful Backstage assistant. You help users explore the software catalog, find services, APIs, and documentation, create new projects from templates, and track scaffolder tasks.

The current user is: ${userEntityRef}
${ownershipSection}

RESPONSE FORMAT:
- After gathering data from tools, ALWAYS call render_ui as your FINAL action to present results.
- Your text output should be brief context only (1-2 sentences). The render_ui card is the main output.
- Do NOT output markdown tables or lists and do NOT generate HTML.
- If any response mentions a Backstage entity, make it navigable to the internal catalog route /catalog/{namespace}/{kind}/{name}. In structured cards, entity values must be link objects with display text and that internal catalog route so the frontend can route internally.
- For entity lists: render a table card with link values pointing at /catalog/{namespace}/{kind}/{name}.
- For entity details: render a details card with key metadata and relation links pointing at internal catalog routes.
- For TechDocs: render a document card with sections and optional code blocks.
- For template execution: render a form card showing parameters the user needs to fill, with select options for enumerated fields and a "Navigate to template" link as fallback.
- For task status: render a status card.

TEMPLATE WORKFLOW (when user wants to create something):
1. Call get_template to see the parameter schema and lookupHints
2. Pre-fetch options listed in lookupHints and present them as numbered lists in render_ui
3. For RepoUrlPicker fields on GitHub or GitLab, call get_vcs_groups before constructing repoUrl. Use the returned owner/group exactly. Never reuse Azure DevOps allowedOrganizations for GitHub or GitLab.
4. If get_vcs_groups says OAuth was rejected or unavailable, ask the user for the exact GitHub organization or GitLab group name before constructing repoUrl.
5. Ask the user to confirm/provide values for ALL required parameters
6. Only call run_template AFTER the user confirms values
7. After run_template, check progress with get_task_status and render the result

TECHDOCS WORKFLOW:
- When the user asks for a docs summary, call get_entity then get_techdocs.
- Summarize the actual retrieved TechDocs content in a document card with 3-6 sections.
- Do not return a document card with only a title. If the docs are empty or missing, say that explicitly.

API DOCS WORKFLOW:
- When the user asks for API docs for a component, call get_entity with relations first.
- Use providesApi and consumesApi relations to identify APIs for that component, then call get_api_spec for the relevant API entity or entities.
- Render actual API information in a table or document card. Do not return a title-only card.${
    configuredPrompt
      ? `\n\nDEPLOYMENT-SPECIFIC INSTRUCTIONS:\n${configuredPrompt}`
      : ''
  }`;
}

export class ChatOrchestrator {
  constructor(
    private readonly llmProvider: LlmProvider,
    private readonly toolService: ToolService,
    private readonly logger: LoggerService,
    private readonly configuredPrompt?: string,
  ) {}

  async chat(
    request: ChatRequest,
    context: ToolCallContext,
    callbacks: ChatCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const tools = [
      ...this.toolService.listTools().map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
      RENDER_UI_TOOL,
    ];

    const messages: ConversationMessage[] = [
      ...this.sanitizeHistory(request.conversationHistory ?? []),
      { role: 'user', content: request.message },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const systemPrompt = buildSystemPrompt(
      context.userEntityRef,
      context.ownershipRefs,
      this.configuredPrompt,
    );

    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (signal?.aborted) return;

      try {
        const params: ConverseParams = {
          modelId: request.model,
          systemPrompt,
          messages,
          tools,
        };
        let response: ConverseResponse;

        if (this.llmProvider.converseStream) {
          response = await this.llmProvider.converseStream(params, {
            onTextDelta: text => callbacks.onTextDelta(text),
          });
        } else {
          response = await this.llmProvider.converse(params);
          if (response.content) {
            callbacks.onTextDelta(response.content);
          }
        }

        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;

        if (
          response.stopReason !== 'tool_use' ||
          !response.toolCalls?.length
        ) {
          callbacks.onUiRender({
            type: 'text',
            body:
              response.content ||
              'I could not produce a structured response for this request.',
          });

          callbacks.onDone({
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          });
          return;
        }

        messages.push({
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          if (signal?.aborted) return;

          // Intercept render_ui — don't execute via ToolService
          if (toolCall.name === 'render_ui') {
            const card = normalizeCard(toolCall.arguments.card);
            const validationError = getCardValidationError(card);
            if (validationError) {
              messages.push({
                role: 'tool',
                content:
                  `Rejected render_ui card: ${validationError}. ` +
                  'Call render_ui again with actual content from the tool results. Do not render title-only cards.',
                toolCallId: toolCall.id,
              });
              continue;
            }

            callbacks.onUiRender(card);
            messages.push({
              role: 'tool',
              content: 'Rendered successfully.',
              toolCallId: toolCall.id,
            });
            callbacks.onDone({
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            });
            return;
          }

          callbacks.onToolCall(toolCall.id, toolCall.name, toolCall.arguments);

          if (
            toolCall.name === 'get_vcs_groups' &&
            this.needsVcsAuthForGroups(toolCall.arguments, context)
          ) {
            messages.push({
              role: 'tool',
              content: 'Aborted: OAuth token required to list VCS groups.',
              toolCallId: toolCall.id,
            });
            callbacks.onOAuthRequired(
              this.getVcsProvider(toolCall.arguments),
              this.getVcsScopes(this.getVcsProvider(toolCall.arguments)),
            );
            callbacks.onDone({
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            });
            return;
          }

          if (
            toolCall.name === 'run_template' &&
            this.needsVcsToken(toolCall.arguments) &&
            !context.vcsTokens?.github &&
            !context.vcsTokens?.gitlab &&
            !this.vcsAuthRejected(context)
          ) {
            for (const remaining of response.toolCalls.slice(
              response.toolCalls.indexOf(toolCall),
            )) {
              messages.push({
                role: 'tool',
                content: 'Aborted: OAuth token required.',
                toolCallId: remaining.id,
              });
            }
            callbacks.onOAuthRequired(
              this.getProviderForRepoUrl(toolCall.arguments),
              this.getVcsScopes(this.getProviderForRepoUrl(toolCall.arguments)),
            );
            callbacks.onDone({
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            });
            return;
          }

          let resultText: string;
          try {
            const result = await this.toolService.callTool(
              toolCall.name,
              toolCall.arguments,
              context,
            );
            resultText = result.content.map(c => c.text).join('\n');
          } catch (toolErr) {
            resultText = `Tool execution failed: ${toolErr instanceof Error ? toolErr.message : String(toolErr)}`;
            this.logger.warn(`Tool ${toolCall.name} threw`, { error: resultText });
          }

          if (resultText.length > MAX_TOOL_RESULT_CHARS) {
            resultText =
              resultText.slice(0, MAX_TOOL_RESULT_CHARS) +
              '\n\n[...result truncated]';
          }

          callbacks.onToolResult(toolCall.name, resultText);

          messages.push({
            role: 'tool',
            content: resultText,
            toolCallId: toolCall.id,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        this.logger.error(`Chat round ${round} failed`, { error: String(err) });

        if (message.includes('401') || message.includes('403')) {
          callbacks.onError('Session expired. Please refresh and try again.');
        } else {
          callbacks.onError(`Error: ${message}`);
        }
        callbacks.onDone({
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        });
        return;
      }
    }

    callbacks.onTextDelta(
      '\n\nI reached the maximum number of tool-use rounds. Please continue with a follow-up message.',
    );
    callbacks.onDone({
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });
  }

  private sanitizeHistory(history: ConversationMessage[]): ConversationMessage[] {
    const result: ConversationMessage[] = [];
    for (let i = 0; i < history.length; i++) {
      const msg = history[i];
      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        result.push(msg);
        const expectedIds = new Set(msg.toolCalls.map(tc => tc.id));
        // Collect following tool results
        while (i + 1 < history.length && history[i + 1].role === 'tool') {
          i++;
          result.push(history[i]);
          if (history[i].toolCallId) expectedIds.delete(history[i].toolCallId!);
        }
        // Fill missing tool results
        for (const missingId of expectedIds) {
          result.push({ role: 'tool', content: 'No result available.', toolCallId: missingId });
        }
      } else {
        result.push(msg);
      }
    }
    return result;
  }

  private needsVcsToken(args: Record<string, unknown>): boolean {
    const values = args.values as Record<string, unknown> | undefined;
    if (!values) return false;
    const repoUrl = values.repoUrl as string | undefined;
    return !!repoUrl && (repoUrl.includes('github.com') || repoUrl.includes('gitlab.com'));
  }

  private needsVcsAuthForGroups(
    args: Record<string, unknown>,
    context: ToolCallContext,
  ): boolean {
    if (this.vcsAuthRejected(context)) return false;
    const provider = this.getVcsProvider(args);
    if (provider === 'gitlab') {
      return !context.vcsTokens?.gitlab && !context.vcsTokens?.gitlabOwners?.length;
    }
    return !context.vcsTokens?.github && !context.vcsTokens?.githubOwners?.length;
  }

  private vcsAuthRejected(context: ToolCallContext): boolean {
    return !!context.vcsTokens?.rejectedProviders?.length;
  }

  private getProviderForRepoUrl(args: Record<string, unknown>): 'github' | 'gitlab' {
    const values = args.values as Record<string, unknown> | undefined;
    const repoUrl = values?.repoUrl as string | undefined;
    return repoUrl?.includes('gitlab') ? 'gitlab' : 'github';
  }

  private getVcsProvider(args: Record<string, unknown>): 'github' | 'gitlab' {
    return args.provider === 'gitlab' ? 'gitlab' : 'github';
  }

  private getVcsScopes(provider: 'github' | 'gitlab'): string[] {
    return provider === 'gitlab' ? ['api'] : ['repo', 'workflow', 'read:org'];
  }
}

function normalizeCard(card: unknown): AssistantCard {
  if (card && typeof card === 'object' && 'type' in card) {
    const candidate = card as Record<string, unknown>;
    if (candidate.type === 'document' && !Array.isArray(candidate.sections)) {
      if (typeof candidate.body !== 'string' || !candidate.body.trim()) {
        return {
          type: 'document',
          title:
            typeof candidate.title === 'string'
              ? candidate.title
              : 'Document',
          sections: [],
        };
      }
      return {
        type: 'text',
        title:
          typeof candidate.title === 'string'
            ? candidate.title
            : 'TechDocs summary',
        body: candidate.body,
      };
    }
    return card as AssistantCard;
  }
  return {
    type: 'text',
    title: 'Assistant response',
    body: 'The assistant returned an invalid UI card.',
  };
}

function getCardValidationError(card: AssistantCard): string | undefined {
  switch (card.type) {
    case 'text':
      return card.body.trim() ? undefined : 'text cards require a non-empty body';
    case 'table':
      return card.columns.length > 0 && card.rows.length > 0
        ? undefined
        : 'table cards require at least one column and one row';
    case 'details':
      return card.items.length > 0
        ? undefined
        : 'details cards require at least one item';
    case 'form':
      return card.fields.length > 0
        ? undefined
        : 'form cards require at least one field';
    case 'document':
      return hasDocumentContent(card.sections)
        ? undefined
        : 'document cards require at least one section with body or code';
    case 'status':
      return card.status.trim() ? undefined : 'status cards require a status';
    default:
      return 'unknown card type';
  }
}

function hasDocumentContent(sections: unknown): boolean {
  return Array.isArray(sections) && sections.some(section => {
    if (!section || typeof section !== 'object') return false;
    const candidate = section as Record<string, unknown>;
    return (
      (typeof candidate.body === 'string' && candidate.body.trim().length > 0) ||
      (typeof candidate.code === 'string' && candidate.code.trim().length > 0)
    );
  });
}
