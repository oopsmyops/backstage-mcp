import { useState, useCallback, useEffect, useRef } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import { assistantApiRef } from '../api/AssistantApi';
import type {
  DisplayMessage,
  SseEvent,
  VcsTokens,
  ModelInfo,
} from '../api/types';
import {
  saveConversation,
  loadSelectedModel,
  saveSelectedModel,
} from '../util/storage';
import { applySseEvent } from './messageReducer';
import { toConversationHistory } from './conversationHistory';

export interface OAuthRequest {
  provider: string;
  scopes: string[];
}

interface SendOptions {
  appendUser?: boolean;
}

let messageCounter = 0;

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
            if (event.type === 'oauth_required') {
              setOauthRequest({
                provider: event.provider,
                scopes: event.scopes,
              });
            }
            setMessages(prev => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              updated[lastIndex] = applySseEvent(updated[lastIndex], event);
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

