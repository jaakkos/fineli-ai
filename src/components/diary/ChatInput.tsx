'use client';

import { useState, useRef, useCallback, type KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Kerro mitä söit...',
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const hasContent = value.trim().length > 0;

  return (
    <div className="shrink-0 flex items-end gap-2 border-t border-gray-200 bg-white px-3 py-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm
          text-gray-900 placeholder-gray-400
          focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500
          disabled:opacity-50"
        aria-label="Kirjoita viesti"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !hasContent}
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white
          transition-all
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
          disabled:pointer-events-none
          ${hasContent
            ? 'bg-blue-600 hover:bg-blue-700 scale-100'
            : 'bg-gray-300 scale-95'
          }`}
        aria-label="Lähetä viesti"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
