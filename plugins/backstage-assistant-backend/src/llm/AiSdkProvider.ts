import {
  generateText,
  streamText,
  jsonSchema,
  tool,
  type LanguageModel,
  type ModelMessage,
  type TextPart,
  type ToolCallPart,
  type ToolSet,
  type ToolChoice,
  type FinishReason,
  type LanguageModelUsage,
  type TypedToolCall,
} from 'ai';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type {
  LlmProvider,
  ConverseParams,
  ConverseResponse,
  StreamCallbacks,
  LlmToolDefinition,
} from './types';
import type { ToolCall, ConversationMessage } from '../types';
import type { ModelRegistry } from './modelRegistry';

const DEFAULT_MAX_CONCURRENT = 5;
const SLOT_POLL_MS = 100;

/**
 * Single LlmProvider backed by the Vercel AI SDK. It targets whatever model a
 * request selects (Bedrock, Azure Foundry, or any OpenAI-compatible API) and
 * transparently falls back to the next configured model when one errors.
 */
export class AiSdkProvider implements LlmProvider {
  private activeCalls = 0;

  constructor(
    private readonly registry: ModelRegistry,
    private readonly logger: LoggerService,
    private readonly maxConcurrent: number = DEFAULT_MAX_CONCURRENT,
  ) {}

  async converse(params: ConverseParams): Promise<ConverseResponse> {
    await this.acquireSlot();
    try {
      return await this.runWithFallback(params);
    } finally {
      this.activeCalls--;
    }
  }

  async converseStream(
    params: ConverseParams,
    callbacks: StreamCallbacks,
  ): Promise<ConverseResponse> {
    await this.acquireSlot();
    try {
      return await this.runWithFallback(params, callbacks);
    } finally {
      this.activeCalls--;
    }
  }

  private async runWithFallback(
    params: ConverseParams,
    callbacks?: StreamCallbacks,
  ): Promise<ConverseResponse> {
    const chain = this.registry.resolveChain(params.modelId);
    // Shared so a streaming attempt can signal it already emitted text —
    // falling back after that would duplicate output, so we stop instead.
    const state = { emitted: false };
    let lastError: unknown;

    for (let i = 0; i < chain.length; i++) {
      try {
        return callbacks
          ? await this.doStream(chain[i].model, params, callbacks, state)
          : await this.doGenerate(chain[i].model, params);
      } catch (err) {
        lastError = err;
        if (state.emitted) break;
        if (i < chain.length - 1) {
          this.logger.warn(
            `Model "${chain[i].id}" failed, falling back to "${chain[i + 1].id}"`,
            { error: err instanceof Error ? err.message : String(err) },
          );
        }
      }
    }
    throw lastError;
  }

  private async doGenerate(
    model: LanguageModel,
    params: ConverseParams,
  ): Promise<ConverseResponse> {
    const result = await generateText({
      model,
      system: params.systemPrompt,
      messages: toModelMessages(params.messages),
      tools: toToolSet(params.tools),
      toolChoice: toToolChoice(params.toolChoice),
    });
    return toResponse(
      result.text,
      result.toolCalls,
      result.usage,
      result.finishReason,
    );
  }

  private async doStream(
    model: LanguageModel,
    params: ConverseParams,
    callbacks: StreamCallbacks,
    state: { emitted: boolean },
  ): Promise<ConverseResponse> {
    const result = streamText({
      model,
      system: params.systemPrompt,
      messages: toModelMessages(params.messages),
      tools: toToolSet(params.tools),
      toolChoice: toToolChoice(params.toolChoice),
    });

    for await (const delta of result.textStream) {
      state.emitted = true;
      callbacks.onTextDelta(delta);
    }

    const [text, toolCalls, usage, finishReason] = await Promise.all([
      result.text,
      result.toolCalls,
      result.usage,
      result.finishReason,
    ]);
    return toResponse(text, toolCalls, usage, finishReason);
  }

  private async acquireSlot(): Promise<void> {
    while (this.activeCalls >= this.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, SLOT_POLL_MS));
    }
    this.activeCalls++;
  }
}

function toResponse(
  text: string,
  rawToolCalls: ReadonlyArray<TypedToolCall<ToolSet>>,
  usage: LanguageModelUsage,
  finishReason: FinishReason,
): ConverseResponse {
  const toolCalls: ToolCall[] = rawToolCalls.map(tc => ({
    id: tc.toolCallId,
    name: tc.toolName,
    arguments: (tc.input ?? {}) as Record<string, unknown>,
  }));

  const stopReason =
    toolCalls.length > 0
      ? 'tool_use'
      : finishReason === 'length'
        ? 'max_tokens'
        : 'end_turn';

  return {
    content: text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    },
    stopReason,
  };
}

function toModelMessages(messages: ConversationMessage[]): ModelMessage[] {
  // Tool-result messages need the tool name; recover it from the assistant
  // tool-call that produced each id.
  const toolNames = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.toolCalls) {
      for (const tc of msg.toolCalls) toolNames.set(tc.id, tc.name);
    }
  }

  const result: ModelMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'user') {
      result.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      if (msg.toolCalls?.length) {
        const parts: Array<TextPart | ToolCallPart> = [];
        if (msg.content) parts.push({ type: 'text', text: msg.content });
        for (const tc of msg.toolCalls) {
          parts.push({
            type: 'tool-call',
            toolCallId: tc.id,
            toolName: tc.name,
            input: tc.arguments,
          });
        }
        result.push({ role: 'assistant', content: parts });
      } else {
        result.push({ role: 'assistant', content: msg.content });
      }
    } else {
      const toolCallId = msg.toolCallId ?? '';
      result.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId,
            toolName: toolNames.get(toolCallId) ?? 'unknown',
            output: { type: 'text', value: msg.content },
          },
        ],
      });
    }
  }
  return result;
}

function toToolSet(tools: LlmToolDefinition[]): ToolSet {
  const set: ToolSet = {};
  for (const definition of tools) {
    // No `execute`: the SDK returns the tool call for the orchestrator to run.
    set[definition.name] = tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema as any),
    });
  }
  return set;
}

function toToolChoice(
  toolChoice: ConverseParams['toolChoice'],
): ToolChoice<ToolSet> | undefined {
  if (toolChoice?.type === 'tool') {
    return { type: 'tool', toolName: toolChoice.name };
  }
  if (toolChoice?.type === 'auto') {
    return 'auto';
  }
  return undefined;
}
