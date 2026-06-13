import type { DisplayMessage } from '../api/types';

const STORAGE_KEY = 'backstage-assistant-conversations';
const SELECTED_MODEL_KEY = 'backstage-assistant-selected-model';
const MAX_CONVERSATIONS = 5;
const MAX_MESSAGES_PER_CONVERSATION = 50;
const MAX_TOOL_RESULT_CHARS = 2048;

interface StoredConversation {
  id: string;
  messages: DisplayMessage[];
  updatedAt: number;
}

export function loadConversations(): StoredConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as StoredConversation[];
  } catch {
    return [];
  }
}

export function saveConversation(
  conversationId: string,
  messages: DisplayMessage[],
): void {
  try {
    const conversations = loadConversations();

    const trimmedMessages = messages.slice(-MAX_MESSAGES_PER_CONVERSATION).map(msg => ({
      ...msg,
      toolCalls: msg.toolCalls?.map(tc => ({
        ...tc,
        result: tc.result
          ? tc.result.slice(0, MAX_TOOL_RESULT_CHARS)
          : tc.result,
      })),
    }));

    const existing = conversations.findIndex(c => c.id === conversationId);
    const entry: StoredConversation = {
      id: conversationId,
      messages: trimmedMessages,
      updatedAt: Date.now(),
    };

    if (existing >= 0) {
      conversations[existing] = entry;
    } else {
      conversations.push(entry);
    }

    conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    const trimmed = conversations.slice(0, MAX_CONVERSATIONS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // QuotaExceededError or other storage issues — silently ignore
  }
}

export function loadSelectedModel(): string | undefined {
  try {
    return localStorage.getItem(SELECTED_MODEL_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveSelectedModel(modelId: string): void {
  try {
    localStorage.setItem(SELECTED_MODEL_KEY, modelId);
  } catch {
    // ignore storage errors
  }
}

export function deleteConversation(conversationId: string): void {
  try {
    const conversations = loadConversations().filter(
      c => c.id !== conversationId,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // ignore
  }
}
