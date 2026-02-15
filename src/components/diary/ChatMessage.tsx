'use client';

import type { ChatMessageData } from '@/types';
import QuickReplyButtons from './QuickReplyButtons';

interface ChatMessageProps {
  message: ChatMessageData;
  onOptionSelect?: (optionKey: string) => void;
  showTimestamp?: boolean;
}

export default function ChatMessage({
  message,
  onOptionSelect,
  showTimestamp = false,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center py-1" role="status">
        <span className="text-xs text-gray-400">{message.content}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
      role="article"
      aria-label={isUser ? 'Sinun viestisi' : 'Avustajan viesti'}
    >
      <div className="max-w-[85%] space-y-1.5">
        <div
          className={`
            rounded-2xl px-3.5 py-2 text-sm leading-relaxed
            ${
              isUser
                ? 'bg-blue-600 text-white rounded-br-md'
                : 'bg-gray-100 text-gray-900 rounded-bl-md'
            }
            ${message.state === 'error' ? 'ring-2 ring-red-400' : ''}
          `}
        >
          {message.content}
        </div>

        {message.state === 'error' && (
          <p className="text-xs text-red-500" role="alert">
            Viestin lähetys epäonnistui. Yritä uudelleen.
          </p>
        )}

        {showTimestamp && (
          <p className={`text-[11px] text-gray-400 ${isUser ? 'text-right' : ''}`}>
            {new Date(message.timestamp).toLocaleTimeString('fi-FI', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}

        {message.options?.map((opt, i) => (
          <QuickReplyButtons
            key={`${opt.type ?? 'opt'}-${i}`}
            options={opt.items}
            onSelect={(key) => onOptionSelect?.(key)}
            selectedKey={opt.selected}
            disabled={!!opt.selected}
          />
        ))}
      </div>
    </div>
  );
}
