import { useState, useCallback, useEffect, useRef } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { assistantApiRef } from '../api/AssistantApi';
import type {
  DisplayMessage,
  SseEvent,
  VcsTokens,
  ConversationMessage,
  ModelInfo,
} from '../api/types';
import {
  saveConversation,
  loadSelectedModel,
  saveSelectedModel,
} from '../util/storage';

export interface OAuthRequest {
  provider: string;
  scopes: string[];
}

interface SendOptions {
  appendUser?: boolean;
}

let messageCounter = 0;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CONTENT_CHARS = 4_000;
const MAX_HISTORY_TOOL_RESULT_CHARS = 1_500;
const MAX_HISTORY_TOOL_ARGUMENT_CHARS = 2_000;

function nextId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

export function useAssistant(conversationId: string) {
  const api = useApi(assistantApiRef);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [oauthRequest, setOauthRequest] = useState<OAuthRequest | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModelState] = useState<string>(
    () => loadSelectedModel() ?? '',
  );
  const abortRef = useRef<AbortController | null>(null);
  const lastMessageRef = useRef<string>('');
  const selectedModelRef = useRef<string>(selectedModel);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const setSelectedModel = useCallback((modelId: string) => {
    setSelectedModelState(modelId);
    saveSelectedModel(modelId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .listModels()
      .then(list => {
        if (cancelled) return;
        setModels(list);
        // Adopt a valid default when nothing is persisted or the saved id
        // is no longer offered by the backend.
        setSelectedModelState(prev => {
          if (prev && list.some(m => m.id === prev)) return prev;
          return list.find(m => m.default)?.id ?? list[0]?.id ?? '';
        });
      })
      .catch(() => {
        // Models endpoint unavailable — fall back to server-side default.
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (messages.length > 0) {
      saveConversation(conversationId, messages);
    }
  }, [conversationId, messages]);

  const sendMessage = useCallback(
    async (text: string, vcsTokens?: VcsTokens, options?: SendOptions) => {
      if (!text.trim() || loading) return;
      lastMessageRef.current = text;
      setOauthRequest(null);
      const appendUser = options?.appendUser ?? true;

      const userMsg: DisplayMessage = {
        id: nextId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };

      const assistantMsg: DisplayMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
        toolCalls: [],
        timestamp: Date.now(),
      };

      setMessages(prev =>
        appendUser ? [...prev, userMsg, assistantMsg] : [...prev, assistantMsg],
      );
      setLoading(true);

      const conversationHistory = toConversationHistory(messages);

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        await api.chat(
          {
            message: text,
            conversationHistory,
            vcsTokens,
            model: selectedModelRef.current || undefined,
          },
          (event: SseEvent) => {
            setMessages(prev => {
              const updated = [...prev];
              const last = { ...updated[updated.length - 1] };

              switch (event.type) {
                case 'text_delta':
                  last.content += event.content;
                  break;
                case 'tool_call':
                  last.toolCalls = [
                    ...(last.toolCalls ?? []),
                    {
                      id: event.toolCallId,
                      name: event.toolName,
                      arguments: event.arguments,
                      pending: true,
                    },
                  ];
                  break;
                case 'tool_result': {
                  const calls = [...(last.toolCalls ?? [])];
                  const idx = calls.findIndex(
                    tc => tc.name === event.toolName && tc.pending,
                  );
                  if (idx >= 0) {
                    calls[idx] = {
                      ...calls[idx],
                      result: event.content,
                      pending: false,
                    };
                  }
                  last.toolCalls = calls;
                  break;
                }
                case 'ui_render':
                  last.renderedCard = event.card;
                  break;
                case 'error':
                  last.content += `\n\n**Error:** ${event.message}`;
                  break;
                case 'done':
                  break;
                case 'oauth_required':
                  setOauthRequest({ provider: event.provider, scopes: event.scopes });
                  break;
              }

              updated[updated.length - 1] = last;
              return updated;
            });
          },
          abortController.signal,
        );
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages(prev => {
            const updated = [...prev];
            const last = { ...updated[updated.length - 1] };
            last.content += `\n\n**Error:** ${(err as Error).message}`;
            updated[updated.length - 1] = last;
            return updated;
          });
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
        setMessages(prev => {
          saveConversation(conversationId, prev);
          return prev;
        });
      }
    },
    [api, messages, loading, conversationId],
  );

  const retryWithToken = useCallback(
    async (vcsTokens: VcsTokens) => {
      setOauthRequest(null);
      if (lastMessageRef.current) {
        await sendMessage(lastMessageRef.current, vcsTokens, { appendUser: false });
      }
    },
    [sendMessage],
  );

  const rejectOAuth = useCallback(
    async (vcsTokens: VcsTokens) => {
      setOauthRequest(null);
      if (lastMessageRef.current) {
        await sendMessage(
          'I declined OAuth authorization. Continue without fetching VCS groups automatically; ask me for the exact owner/group if needed.',
          vcsTokens,
        );
      }
    },
    [sendMessage],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setOauthRequest(null);
  }, []);

  return {
    messages,
    loading,
    sendMessage,
    cancel,
    clearMessages,
    setMessages,
    oauthRequest,
    retryWithToken,
    rejectOAuth,
    models,
    selectedModel,
    setSelectedModel,
  };
}

function toConversationHistory(messages: DisplayMessage[]): ConversationMessage[] {
  const history: ConversationMessage[] = [];
  const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES);

  for (const message of recentMessages) {
    if (message.role === 'user') {
      history.push({
        role: 'user',
        content: truncateForHistory(message.content, MAX_HISTORY_CONTENT_CHARS),
      });
      continue;
    }

    const toolCalls = message.toolCalls
      ?.filter(toolCall => toolCall.id)
      .map(toolCall => ({
        id: toolCall.id,
        name: toolCall.name,
        arguments: truncateToolArguments(toolCall.arguments),
      }));

    history.push({
      role: 'assistant',
      content: truncateForHistory(message.content, MAX_HISTORY_CONTENT_CHARS),
      ...(toolCalls?.length ? { toolCalls } : {}),
    });

    for (const toolCall of message.toolCalls ?? []) {
      if (!toolCall.id) continue;
      if (toolCall.result !== undefined) {
        history.push({
          role: 'tool',
          content: truncateForHistory(
            toolCall.result,
            MAX_HISTORY_TOOL_RESULT_CHARS,
          ),
          toolCallId: toolCall.id,
        });
      }
    }
  }

  return history;
}

function truncateForHistory(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[...truncated for request size]`;
}

function truncateToolArguments(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const text = JSON.stringify(args);
  if (text.length <= MAX_HISTORY_TOOL_ARGUMENT_CHARS) {
    return args;
  }
  return {
    truncated: true,
    summary: text.slice(0, MAX_HISTORY_TOOL_ARGUMENT_CHARS),
  };
}
