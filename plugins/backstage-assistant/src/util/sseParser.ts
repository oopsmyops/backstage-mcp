import type { SseEvent } from '../api/types';

export async function parseSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const event = parseEventBlock(part);
        if (event) onEvent(event);
      }
    }

    if (buffer.trim()) {
      const event = parseEventBlock(buffer);
      if (event) onEvent(event);
    }
  } finally {
    reader.releaseLock();
  }
}

function parseEventBlock(block: string): SseEvent | null {
  let eventType = '';
  let data = '';

  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      data += line.slice(6);
    }
  }

  if (!eventType || !data) return null;

  try {
    const parsed = JSON.parse(data);

    switch (eventType) {
      case 'text_delta':
        return { type: 'text_delta', content: parsed.content };
      case 'tool_call':
        return {
          type: 'tool_call',
          toolCallId: parsed.toolCallId,
          toolName: parsed.toolName,
          arguments: parsed.arguments,
        };
      case 'tool_result':
        return {
          type: 'tool_result',
          toolName: parsed.toolName,
          content: parsed.content,
        };
      case 'ui_render':
        return {
          type: 'ui_render',
          card: parsed.card,
        };
      case 'oauth_required':
        return {
          type: 'oauth_required',
          provider: parsed.provider,
          scopes: parsed.scopes,
        };
      case 'done':
        return { type: 'done', usage: parsed.usage };
      case 'error':
        return { type: 'error', message: parsed.message };
      default:
        return null;
    }
  } catch {
    return null;
  }
}
