'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { ChatMessageData } from '@/types';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import Spinner from '@/components/ui/Spinner';

interface ChatPanelProps {
  messages: ChatMessageData[];
  onSendMessage: (text: string) => void;
  onOptionSelect: (optionKey: string) => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  placeholder?: string;
}

export default function ChatPanel({
  messages,
  onSendMessage,
  onOptionSelect,
  isLoading = false,
  isDisabled = false,
  placeholder,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const prevMsgCountRef = useRef(messages.length);

  /** Check if user is near the bottom of the scroll area */
  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  /** Smooth-scroll to the bottom */
  const scrollToBottom = useCallback((instant?: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: instant ? 'instant' : 'smooth',
    });
  }, []);

  // Auto-scroll on new messages — only when user is already near the bottom
  useEffect(() => {
    const isNewMessage = messages.length !== prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (isNewMessage || isLoading) {
      // For the very first load or if near bottom, scroll
      if (messages.length <= 2 || isNearBottom()) {
        // Small delay to let DOM update before scrolling
        const rafId = requestAnimationFrame(() => scrollToBottom());
        return () => cancelAnimationFrame(rafId);
      } else {
        // User scrolled up — show the scroll-to-bottom button instead
        // Defer to avoid synchronous setState in effect body
        const rafId = requestAnimationFrame(() => setShowScrollBtn(true));
        return () => cancelAnimationFrame(rafId);
      }
    }
  }, [messages.length, isLoading, isNearBottom, scrollToBottom]);

  // Track scroll position to show/hide scroll-to-bottom button
  const handleScroll = useCallback(() => {
    setShowScrollBtn(!isNearBottom());
  }, [isNearBottom]);

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="scrollbar-thin absolute inset-0 overflow-y-auto px-4 py-3 space-y-2"
          role="log"
          aria-live="polite"
          aria-label="Keskustelu"
        >
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400">
                Kerro mitä söit tällä aterialla.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              onOptionSelect={onOptionSelect}
            />
          ))}

          {isLoading && (
            <div className="flex justify-start" role="status" aria-label="Avustaja kirjoittaa vastausta">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-gray-100 px-3 py-2">
                <Spinner size="sm" />
                <span className="text-sm text-gray-500" aria-hidden="true">Kirjoittaa...</span>
              </div>
            </div>
          )}
        </div>

        {/* Scroll-to-bottom FAB */}
        {showScrollBtn && (
          <button
            onClick={() => {
              scrollToBottom();
              setShowScrollBtn(false);
            }}
            className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full
              bg-white shadow-lg border border-gray-200 text-gray-600
              transition-all hover:bg-gray-50 hover:shadow-xl
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Vieritä alas"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Input — always pinned at the bottom */}
      <ChatInput
        onSend={onSendMessage}
        disabled={isDisabled || isLoading}
        placeholder={placeholder}
      />
    </div>
  );
}
