'use client';

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react';
import type { MealItemWithNutrients } from '@/types';

interface MealItemCardProps {
  item: MealItemWithNutrients;
  onDelete: () => void;
  onUpdateAmount: (newGrams: number) => void;
  compact?: boolean;
  isSaving?: boolean;
}

export default function MealItemCard({
  item,
  onDelete,
  onUpdateAmount,
  compact = false,
  isSaving = false,
}: MealItemCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  // Optimistic: show the pending value while saving
  const [pendingGrams, setPendingGrams] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guard against Enter+blur double-fire
  const isSubmittingRef = useRef(false);

  const actualGrams = pendingGrams ?? item.portionGrams;
  const gramsRounded = Math.round(actualGrams);
  // Recompute energy based on optimistic grams
  const energyKcal = pendingGrams != null && item.portionGrams > 0
    ? Math.round((item.computedNutrients.ENERC ?? 0) * (pendingGrams / item.portionGrams))
    : Math.round(item.computedNutrients.ENERC ?? 0);

  // Clear optimistic state when the server data catches up.
  // Adjusting state during render is the React-recommended pattern for
  // deriving state from props (avoids an extra re-render from useEffect).
  if (pendingGrams != null && Math.round(item.portionGrams) === Math.round(pendingGrams)) {
    setPendingGrams(null);
  }

  // Focus the input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const startEditing = () => {
    setEditValue(String(Math.round(item.portionGrams)));
    setIsEditing(true);
    isSubmittingRef.current = false;
  };

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditValue('');
    isSubmittingRef.current = false;
  }, []);

  const confirmEdit = useCallback(() => {
    // Guard: prevent double-fire from Enter + blur
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const parsed = parseFloat(editValue.replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) {
      const rounded = Math.round(parsed);
      if (rounded !== Math.round(item.portionGrams)) {
        setPendingGrams(rounded);
        onUpdateAmount(rounded);
      }
    }
    setIsEditing(false);
    setEditValue('');
  }, [editValue, item.portionGrams, onUpdateAmount]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditing();
    }
  };

  const showSaving = isSaving || pendingGrams != null;

  return (
    <div
      className={`group flex items-center justify-between rounded-lg border bg-white transition-colors ${
        showSaving
          ? 'border-blue-200 bg-blue-50/30'
          : 'border-gray-200 hover:border-gray-300'
      } ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`font-medium text-gray-900 truncate ${
            compact ? 'text-sm' : 'text-sm'
          }`}
        >
          {item.fineliNameFi}
        </p>

        <div className="flex items-center gap-1 text-xs text-gray-500">
          {isEditing ? (
            <span className="inline-flex items-center gap-1">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={confirmEdit}
                className="w-16 rounded border border-blue-400 bg-blue-50 px-1.5 py-0.5 text-xs text-gray-900
                  focus:outline-none focus:ring-1 focus:ring-blue-500"
                aria-label="Muokkaa grammamäärää"
              />
              <span>g</span>
            </span>
          ) : (
            <button
              onClick={startEditing}
              disabled={showSaving}
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 -ml-1 text-xs text-gray-500
                transition-colors hover:bg-blue-50 hover:text-blue-700
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
                disabled:opacity-50 disabled:pointer-events-none"
              aria-label={`Muokkaa annosta: ${gramsRounded}g`}
              title="Klikkaa muokataksesi"
            >
              <span className="underline decoration-dotted underline-offset-2">
                {gramsRounded}g
              </span>
              <span> &middot; {energyKcal} kcal</span>
              {showSaving ? (
                <span className="ml-1 text-blue-500">tallentaa...</span>
              ) : (
                <svg
                  className="ml-0.5 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      <button
        onClick={onDelete}
        className="ml-2 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-400
          opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500
          focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        aria-label={`Poista ${item.fineliNameFi}`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
