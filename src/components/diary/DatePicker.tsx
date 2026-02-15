'use client';

import { format, addDays, subDays, isToday } from 'date-fns';
import { fi } from 'date-fns/locale';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
}

function toDate(s: string): Date {
  // Parse YYYY-MM-DD in local time
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DatePicker({ value, onChange }: DatePickerProps) {
  const date = toDate(value);
  const displayDate = format(date, 'EEEEEE d.M.yyyy', { locale: fi });
  const today = isToday(date);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(toStr(subDays(date, 1)))}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="Edellinen päivä"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="min-w-[8.5rem] text-center text-sm font-medium text-gray-900"
      >
        {displayDate}
      </span>

      <button
        onClick={() => onChange(toStr(addDays(date, 1)))}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="Seuraava päivä"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {!today && (
        <button
          onClick={() => onChange(toStr(new Date()))}
          className="ml-1 rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Siirry tähän päivään"
        >
          Tänään
        </button>
      )}
    </div>
  );
}
