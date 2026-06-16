import { applySseEvent } from './messageReducer';
import type { AssistantCard, DisplayMessage, SseEvent } from '../api/types';

function blankAssistant(): DisplayMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '',
    toolCalls: [],
    timestamp: 0,
  };
}

function fold(events: SseEvent[]): DisplayMessage {
  return events.reduce(applySseEvent, blankAssistant());
}

describe('applySseEvent', () => {
  it('appends streamed text deltas into a single text part', () => {
    const msg = fold([
      { type: 'text_delta', content: 'You own ' },
      { type: 'text_delta', content: '12 components.' },
    ]);
    expect(msg.content).toBe('You own 12 components.');
    expect(msg.parts).toEqual([
      { type: 'text', text: 'You own 12 components.' },
    ]);
  });

  it('turns a tool_result into client cards (with entity links) in order', () => {
    const result = JSON.stringify({
      entities: [{ name: 'payment-service', kind: 'Component', type: 'service' }],
    });
    const msg = fold([
      {
        type: 'tool_call',
        toolCallId: 't1',
        toolName: 'search_catalog',
        arguments: {},
      },
      { type: 'tool_result', toolName: 'search_catalog', content: result },
    ]);
    const cardParts = (msg.parts ?? []).filter(p => p.type === 'card');
    expect(cardParts).toHaveLength(1);
    const card = (cardParts[0] as { card: AssistantCard }).card;
    expect(card.type).toBe('table');
    // the tool-call is resolved (no longer pending)
    expect(msg.toolCalls?.[0].pending).toBe(false);
  });

  it('DROPS a model render_ui table card (the duplication bug)', () => {
    const tableCard: AssistantCard = {
      type: 'table',
      title: 'My Owned Components',
      columns: [{ key: 'name', label: 'Name' }],
      rows: [{ name: 'payment-service' }],
    };
    const msg = fold([
      { type: 'text_delta', content: 'Here is a summary.' },
      { type: 'ui_render', card: tableCard },
    ]);
    const cardParts = (msg.parts ?? []).filter(p => p.type === 'card');
    expect(cardParts).toHaveLength(0);
    // prose survives
    expect(msg.parts).toEqual([{ type: 'text', text: 'Here is a summary.' }]);
  });

  it('KEEPS a model render_ui form card (template parameters)', () => {
    const formCard: AssistantCard = {
      type: 'form',
      title: 'Create repo',
      fields: [{ name: 'repoName', label: 'Repository name', required: true }],
    };
    const msg = fold([{ type: 'ui_render', card: formCard }]);
    expect(msg.parts).toEqual([{ type: 'card', card: formCard }]);
  });

  it('does not mutate the input message (immutability)', () => {
    const original = blankAssistant();
    const next = applySseEvent(original, {
      type: 'text_delta',
      content: 'hi',
    });
    expect(next).not.toBe(original);
    expect(original.content).toBe('');
    expect(original.parts).toBeUndefined();
  });
});
