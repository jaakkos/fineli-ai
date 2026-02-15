'use client';

import { useCallback, useRef, type KeyboardEvent } from 'react';
import { type MealType, MEAL_TYPES, MEAL_TYPE_LABELS } from '@/types';

interface MealSelectorProps {
  value: MealType;
  onChange: (meal: MealType) => void;
  itemCounts: Record<MealType, number>;
}

/**
 * Tablist for selecting meal type. Follows WAI-ARIA Tabs pattern:
 * - Arrow keys navigate between tabs
 * - Only the active tab is in the tab order (tabIndex 0)
 * - Home/End jump to first/last tab
 */
export default function MealSelector({
  value,
  onChange,
  itemCounts,
}: MealSelectorProps) {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const idx = MEAL_TYPES.indexOf(value);
      let nextIdx: number | null = null;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          nextIdx = (idx + 1) % MEAL_TYPES.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          nextIdx = (idx - 1 + MEAL_TYPES.length) % MEAL_TYPES.length;
          break;
        case 'Home':
          nextIdx = 0;
          break;
        case 'End':
          nextIdx = MEAL_TYPES.length - 1;
          break;
        default:
          return;
      }

      e.preventDefault();
      onChange(MEAL_TYPES[nextIdx]);
      tabsRef.current[nextIdx]?.focus();
    },
    [value, onChange],
  );

  return (
    <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Ateriat">
      {MEAL_TYPES.map((type, i) => {
        const active = type === value;
        const count = itemCounts[type] ?? 0;
        return (
          <button
            key={type}
            ref={(el) => { tabsRef.current[i] = el; }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(type)}
            onKeyDown={handleKeyDown}
            className={`
              flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1
              ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }
            `}
          >
            {MEAL_TYPE_LABELS[type]}
            {count > 0 && (
              <span
                aria-label={`${count} ruokaa`}
                className={`ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs font-semibold ${
                  active
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
