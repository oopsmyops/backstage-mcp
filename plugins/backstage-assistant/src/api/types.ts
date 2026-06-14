export interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatRequest {
  message: string;
  conversationHistory?: ConversationMessage[];
  vcsTokens?: VcsTokens;
  /** Id of the model to use (from GET /models). Server defaults if omitted. */
  model?: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  default?: boolean;
}

export interface VcsTokens {
  github?: string;
  gitlab?: string;
  azureDevops?: string;
  githubOwners?: string[];
  gitlabOwners?: string[];
  rejectedProviders?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type SseEvent =
  | { type: 'text_delta'; content: string }
  | {
      type: 'tool_call';
      toolCallId: string;
      toolName: string;
      arguments: Record<string, unknown>;
    }
  | { type: 'tool_result'; toolName: string; content: string }
  | { type: 'ui_render'; card: AssistantCard }
  | { type: 'oauth_required'; provider: string; scopes: string[] }
  | { type: 'done'; usage: TokenUsage }
  | { type: 'error'; message: string };

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    result?: string;
    pending?: boolean;
  }>;
  renderedCard?: AssistantCard;
  /**
   * Cards built client-side from tool results (no LLM round-trip). Rendered as
   * the primary rich output; keyed/ordered by the tool calls that produced them.
   */
  cards?: AssistantCard[];
  timestamp: number;
}

export type AssistantCard =
  | {
      type: 'text';
      title?: string;
      body: string;
    }
  | {
      type: 'table';
      title?: string;
      columns: Array<{ key?: string; label?: string; title?: string; name?: string }>;
      rows: Array<
        | Record<string, AssistantCardValue>
        | Array<AssistantCardValue>
        | { cells?: Array<AssistantCardValue>; values?: Array<AssistantCardValue> }
      >;
    }
  | {
      type: 'details';
      title?: string;
      items: Array<{ label: string; value: AssistantCardValue }>;
    }
  | {
      type: 'form';
      title?: string;
      description?: string;
      fields: Array<{
        name: string;
        label: string;
        required?: boolean;
        type?: 'text' | 'select' | 'multiselect' | 'boolean' | 'number';
        options?: Array<AssistantCardOption | string | number | boolean>;
        value?: AssistantCardValue;
        placeholder?: string;
        helperText?: string;
      }>;
      actions?: Array<{ label: string; href: string }>;
    }
  | {
      type: 'document';
      title?: string;
      sections: Array<{ heading?: string; body?: string; code?: string }>;
    }
  | {
      type: 'status';
      title?: string;
      status: string;
      items?: Array<{ label: string; value: AssistantCardValue }>;
    }
  | {
      type: 'code';
      title?: string;
      language?: string;
      code: string;
    };

export type AssistantCardValue =
  | string
  | number
  | boolean
  | null
  | { text?: string; label?: string; value?: string | number | boolean; href?: string; name?: string; title?: string; id?: string }
  | Array<string | number | boolean>;

export interface AssistantCardOption {
  label?: string;
  text?: string;
  title?: string;
  name?: string;
  value?: string | number | boolean;
  id?: string | number;
  href?: string;
}
