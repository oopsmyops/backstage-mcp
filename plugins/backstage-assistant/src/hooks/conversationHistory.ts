import type { ConversationMessage, DisplayMessage } from '../api/types';

/**
 * Builds the trimmed conversation history sent to the backend on each turn.
 *
 * Pure and unit-testable (no React). Critically, it drops assistant tool calls
 * that have **no result** — e.g. a `get_vcs_groups` call the backend aborted to
 * request OAuth. If such a dangling call were advertised in history, the backend
 * would fill the missing result with "No result available", and the model would
 * read that as "the tool already ran and found nothing" and give up — even after
 * the user authorizes. Omitting the unresolved call lets the OAuth retry behave
 * like a fresh ask: the model re-issues the tool, now with the token present.
 */
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CONTENT_CHARS = 4_000;
const MAX_HISTORY_TOOL_RESULT_CHARS = 1_500;
const MAX_HISTORY_TOOL_ARGUMENT_CHARS = 2_000;

export function toConversationHistory(
  messages: DisplayMessage[],
): ConversationMessage[] {
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

    // Only advertise tool calls that actually produced a result. An unresolved
    // call (aborted for OAuth, or never executed) must not appear, or the
    // backend will synthesize a "No result available" turn that poisons retries.
    const toolCalls = message.toolCalls
      ?.filter(toolCall => toolCall.id && toolCall.result !== undefined)
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
