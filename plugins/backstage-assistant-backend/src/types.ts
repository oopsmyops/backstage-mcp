export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

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

export interface ChatRequest {
  message: string;
  conversationHistory?: ConversationMessage[];
  vcsTokens?: VcsTokens;
  /** Id of the model to use, from GET /models. Defaults server-side. */
  model?: string;
}

export interface VcsTokens {
  github?: string;
  gitlab?: string;
  azureDevops?: string;
  githubOwners?: string[];
  gitlabOwners?: string[];
  rejectedProviders?: string[];
}

export interface ChatCallbacks {
  onTextDelta: (content: string) => void;
  onToolCall: (
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => void;
  onToolResult: (toolName: string, content: string) => void;
  onUiRender: (card: AssistantCard) => void;
  onOAuthRequired: (provider: string, scopes: string[]) => void;
  onDone: (usage: TokenUsage) => void;
  onError: (message: string) => void;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
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
