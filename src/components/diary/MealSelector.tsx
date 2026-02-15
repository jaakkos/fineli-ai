'use client';

import { type MealType, MEAL_TYPES, MEAL_TYPE_LABELS } from '@/types';

interface MealSelectorProps {
  value: MealType;
  onChange: (meal: MealType) => void;
  itemCounts: Record<MealType, number>;
}

export default function MealSelector({
  value,
  onChange,
  itemCounts,
}: MealSelectorProps) {
  return (
    <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Ateriat">
      {MEAL_TYPES.map((type) => {
        const active = type === value;
        const count = itemCounts[type] ?? 0;
        return (
          <button
            key={type}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(type)}
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
