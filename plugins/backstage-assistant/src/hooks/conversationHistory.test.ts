import { toConversationHistory } from './conversationHistory';
import type { DisplayMessage } from '../api/types';

function userMsg(content: string): DisplayMessage {
  return { id: 'u', role: 'user', content, timestamp: 0 };
}

describe('toConversationHistory', () => {
  it('emits a user turn verbatim', () => {
    expect(toConversationHistory([userMsg('create a repo')])).toEqual([
      { role: 'user', content: 'create a repo' },
    ]);
  });

  it('keeps resolved tool calls with their result turn', () => {
    const messages: DisplayMessage[] = [
      userMsg('list my groups'),
      {
        id: 'a',
        role: 'assistant',
        content: 'Here you go.',
        timestamp: 0,
        toolCalls: [
          {
            id: 't1',
            name: 'get_vcs_groups',
            arguments: { provider: 'github' },
            result: '{"owners":["acme"]}',
          },
        ],
      },
    ];
    const history = toConversationHistory(messages);
    const assistant = history.find(m => m.role === 'assistant');
    const tool = history.find(m => m.role === 'tool');
    expect(assistant?.toolCalls).toHaveLength(1);
    expect(tool?.toolCallId).toBe('t1');
    expect(tool?.content).toBe('{"owners":["acme"]}');
  });

  it('DROPS an unresolved (OAuth-aborted) tool call so retries are not poisoned', () => {
    const messages: DisplayMessage[] = [
      userMsg('create a gitlab repo'),
      {
        id: 'a',
        role: 'assistant',
        content: '',
        timestamp: 0,
        toolCalls: [
          {
            id: 't1',
            name: 'get_vcs_groups',
            arguments: { provider: 'gitlab' },
            pending: true,
            // result is intentionally undefined — aborted for OAuth
          },
        ],
      },
    ];
    const history = toConversationHistory(messages);
    // No tool turn, and the assistant turn advertises no tool call.
    expect(history.some(m => m.role === 'tool')).toBe(false);
    const assistant = history.find(m => m.role === 'assistant');
    expect(assistant?.toolCalls).toBeUndefined();
  });

  it('keeps resolved calls while dropping an unresolved sibling', () => {
    const messages: DisplayMessage[] = [
      userMsg('do two things'),
      {
        id: 'a',
        role: 'assistant',
        content: '',
        timestamp: 0,
        toolCalls: [
          {
            id: 't1',
            name: 'search_catalog',
            arguments: {},
            result: '{"entities":[]}',
          },
          {
            id: 't2',
            name: 'get_vcs_groups',
            arguments: { provider: 'github' },
            pending: true,
          },
        ],
      },
    ];
    const history = toConversationHistory(messages);
    const assistant = history.find(m => m.role === 'assistant');
    expect(assistant?.toolCalls?.map(t => t.id)).toEqual(['t1']);
    expect(history.filter(m => m.role === 'tool').map(m => m.toolCallId)).toEqual(
      ['t1'],
    );
  });
});
