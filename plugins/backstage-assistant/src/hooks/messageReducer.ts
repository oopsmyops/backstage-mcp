import type { DisplayMessage, MessagePart, SseEvent } from '../api/types';
import { cardsFromToolResultText } from '../util/toolResultToCard';

/** Append streamed text to the trailing text part (or start a new one). */
export function appendTextPart(
  parts: MessagePart[] | undefined,
  text: string,
): MessagePart[] {
  const arr = parts ? [...parts] : [];
  const last = arr[arr.length - 1];
  if (last && last.type === 'text') {
    arr[arr.length - 1] = { type: 'text', text: last.text + text };
  } else {
    arr.push({ type: 'text', text });
  }
  return arr;
}

/**
 * Pure reduction of one SSE event onto an assistant message. Returns a NEW
 * message (never mutates the input). Side-effect-only events (oauth_required,
 * done) leave the message unchanged — the caller handles those.
 *
 * This is the single source of truth for how stream events become rendered
 * parts, so both the live hook and the dev harness exercise identical logic.
 */
export function applySseEvent(
  message: DisplayMessage,
  event: SseEvent,
): DisplayMessage {
  switch (event.type) {
    case 'text_delta':
      return {
        ...message,
        content: message.content + event.content,
        parts: appendTextPart(message.parts, event.content),
      };

    case 'tool_call':
      return {
        ...message,
        toolCalls: [
          ...(message.toolCalls ?? []),
          {
            id: event.toolCallId,
            name: event.toolName,
            arguments: event.arguments,
            pending: true,
          },
        ],
      };

    case 'tool_result': {
      const calls = [...(message.toolCalls ?? [])];
      const idx = calls.findIndex(
        tc => tc.name === event.toolName && tc.pending,
      );
      if (idx >= 0) {
        calls[idx] = { ...calls[idx], result: event.content, pending: false };
      }
      // Build rich cards client-side from the tool result — no LLM round-trip —
      // and append them as parts in arrival order.
      const built = cardsFromToolResultText(event.toolName, event.content);
      const parts = built.length
        ? [
            ...(message.parts ?? []),
            ...built.map(card => ({ type: 'card' as const, card })),
          ]
        : message.parts;
      return { ...message, toolCalls: calls, parts };
    }

    case 'ui_render':
      // Tool data is rendered client-side as cards (with links). The ONLY
      // model-emitted card we accept is an interactive form; every other
      // render_ui card (table/text/details/…) just duplicates a tool-result
      // card, so drop it.
      if (event.card.type !== 'form') return message;
      return {
        ...message,
        parts: [...(message.parts ?? []), { type: 'card', card: event.card }],
      };

    case 'error':
      return {
        ...message,
        content: `${message.content}\n\n**Error:** ${event.message}`,
        parts: appendTextPart(
          message.parts,
          `\n\n**Error:** ${event.message}`,
        ),
      };

    case 'done':
    case 'oauth_required':
    default:
      return message;
  }
}
