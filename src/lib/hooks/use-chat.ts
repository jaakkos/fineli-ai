'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/** Unwrap API response: { data: T } → T */
function unwrapData<T>(json: unknown): T {
  const obj = json as Record<string, unknown>;
  return (obj?.data ?? obj) as T;
}

/** Chat state returned by the API */
interface ChatStateResponse {
  state: unknown;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: Record<string, unknown>;
    createdAt: string;
  }>;
}

/** Chat message response from the API */
interface ChatMessageResponse {
  assistantMessage: string;
  questionMetadata?: {
    type: string;
    options?: Array<{ key: string; label: string; value: unknown }>;
  };
  ai?: {
    parsed: boolean;
    responded: boolean;
    suggestions: unknown[];
  };
}

/** Get chat messages and state for a meal */
export function useChatState(mealId: string | null) {
  return useQuery({
    queryKey: ['chat', 'state', mealId],
    queryFn: async (): Promise<ChatStateResponse | null> => {
      if (!mealId) return null;
      const res = await fetch(`/api/chat/state/${mealId}`);
      if (!res.ok) throw new Error('Failed to fetch chat state');
      const json = await res.json();
      return unwrapData<ChatStateResponse>(json);
    },
    enabled: !!mealId,
  });
}

/** Payload for sending a message - can override mealId when creating meal first */
export interface SendMessagePayload {
  message: string;
  mealId?: string | null;
}

/** Reset chat history for a meal (clears messages and conversation state) */
export function useResetChat(mealId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      if (!mealId) throw new Error('No meal selected');
      const res = await fetch(`/api/chat/state/${mealId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to reset chat');
    },
    onSuccess: () => {
      if (mealId) {
        void queryClient.invalidateQueries({
          queryKey: ['chat', 'state', mealId],
        });
      }
    },
  });
}

/** Send a chat message */
export function useSendMessage(mealId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: string | SendMessagePayload,
    ): Promise<ChatMessageResponse> => {
      const msg =
        typeof payload === 'string' ? payload : payload.message;
      const effectiveMealId =
        typeof payload === 'string' ? mealId : payload.mealId ?? mealId;
      if (!effectiveMealId) throw new Error('No meal selected');
      const res = await fetch('/api/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealId: effectiveMealId, message: msg }),
      });
      if (!res.ok) throw new Error('Failed to send message');
      const json = await res.json();
      return unwrapData<ChatMessageResponse>(json);
    },
    onSuccess: (_data, variables) => {
      const payload = typeof variables === 'string' ? null : variables;
      const effectiveMealId = payload?.mealId ?? mealId;
      if (effectiveMealId) {
        void queryClient.invalidateQueries({
          queryKey: ['chat', 'state', effectiveMealId],
        });
      }
      // Force-refetch diary data — resolved items may have been added.
      // We use refetchQueries (not just invalidateQueries) to guarantee a
      // fresh fetch even when a previous diary fetch is still in-flight
      // from meal creation.
      void queryClient.refetchQueries({ queryKey: ['diary'] });
    },
  });
}
