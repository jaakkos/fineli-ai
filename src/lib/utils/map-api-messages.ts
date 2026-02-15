import type { ChatMessageData } from '@/types';

/** Raw API message shape (from GET /api/chat/state/:mealId) */
export interface ApiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Convert API chat messages to the ChatMessageData format expected by React components.
 *
 * The API stores questionMetadata as:
 *   { questionMetadata: { type: "disambiguation", options: [{key, label, value}] } }
 *
 * The frontend ChatMessageOption expects:
 *   { type: "disambiguation", items: [{key, label}], selected? }
 *
 * This function bridges that gap.
 */
export function mapApiMessages(apiMessages?: ApiChatMessage[]): ChatMessageData[] {
  if (!apiMessages?.length) return [];
  return apiMessages.map((m) => {
    const qm = m.metadata?.questionMetadata as
      | {
          type: string;
          options?: Array<{ key: string; label: string; value?: unknown }>;
        }
      | undefined;

    let options: ChatMessageData['options'];
    if (qm?.options?.length) {
      options = [
        {
          type: qm.type as 'disambiguation' | 'portion' | 'confirmation',
          items: qm.options.map((o) => ({ key: o.key, label: o.label })),
        },
      ];
    }

    return {
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.createdAt,
      options,
    };
  });
}
