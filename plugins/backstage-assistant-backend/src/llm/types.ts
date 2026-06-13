import type { ConversationMessage, ToolCall, TokenUsage } from '../types';

export interface StreamCallbacks {
  onTextDelta: (text: string) => void;
}

export interface LlmProvider {
  converse(params: ConverseParams): Promise<ConverseResponse>;
  converseStream?(
    params: ConverseParams,
    callbacks: StreamCallbacks,
  ): Promise<ConverseResponse>;
}

export interface ConverseParams {
  /** Model id selected for this request; falls back to the registry default. */
  modelId?: string;
  systemPrompt: string;
  messages: ConversationMessage[];
  tools: LlmToolDefinition[];
  toolChoice?: { type: 'auto' } | { type: 'tool'; name: string };
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ConverseResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}
