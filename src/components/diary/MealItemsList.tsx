'use client';

import type { MealItemWithNutrients } from '@/types';
import MealItemCard from './MealItemCard';

interface MealItemsListProps {
  items: MealItemWithNutrients[];
  onDeleteItem: (itemId: string) => void;
  onUpdateAmount: (itemId: string, newGrams: number) => void;
  savingItemId?: string | null;
  compact?: boolean;
}

export default function MealItemsList({
  items,
  onDeleteItem,
  onUpdateAmount,
  savingItemId,
  compact = false,
}: MealItemsListProps) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 py-8">
        <p className="text-sm text-gray-400">
          Ei vielä ruokia. Kerro chatissa mitä söit.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label="Aterian ruoat">
      {items.map((item) => (
        <div key={item.id} role="listitem">
          <MealItemCard
            item={item}
            onDelete={() => onDeleteItem(item.id)}
            onUpdateAmount={(newGrams) => onUpdateAmount(item.id, newGrams)}
            isSaving={savingItemId === item.id}
            compact={compact}
          />
        </div>
      ))}
    </div>
  );
}
