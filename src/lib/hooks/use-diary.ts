'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { MealType } from '@/types';

/** Get a day's data (meals + items + nutrients) */
export function useDiaryDay(date: string) {
  return useQuery({
    queryKey: ['diary', 'day', date],
    queryFn: async () => {
      const res = await fetch(`/api/diary/days/${date}`);
      if (!res.ok) throw new Error('Failed to fetch day');
      const json = await res.json();
      // API returns { data: { day } }, { data: day }, or { day }
      const day = json.data?.day ?? json.data ?? json.day;
      return day ?? { meals: [], dayTotals: {} };
    },
    enabled: !!date,
  });
}

/** Create a meal */
export function useCreateMeal(date: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      mealType: MealType;
      customName?: string;
    }) => {
      const res = await fetch(`/api/diary/days/${date}/meals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create meal');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diary', 'day', date] });
    },
  });
}

/** Update a meal item (e.g. change portion amount) */
export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      data,
    }: {
      itemId: string;
      data: { portionGrams: number; portionAmount?: number };
    }) => {
      const res = await fetch(`/api/diary/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update item');
      return res.json();
    },
    // Optimistic update: patch the cached diary data immediately so the UI
    // reflects the new grams + recalculated nutrients without waiting for refetch.
    onMutate: async ({ itemId, data }) => {
      // Cancel any in-flight diary fetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['diary'] });

      // Snapshot every diary-day cache entry that exists
      const previousData = queryClient.getQueriesData<Record<string, unknown>>({
        queryKey: ['diary', 'day'],
      });

      // Patch each cached day that contains this item
      queryClient.setQueriesData<Record<string, unknown>>(
        { queryKey: ['diary', 'day'] },
        (old) => {
          if (!old) return old;
          const meals = (old as { meals?: unknown[] }).meals;
          if (!Array.isArray(meals)) return old;

          const updatedMeals = meals.map((meal: unknown) => {
            const m = meal as Record<string, unknown>;
            const items = m.items as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(items)) return m;

            let mealTotals: Record<string, number> = {};
            const updatedItems = items.map((item: Record<string, unknown>) => {
              if (item.id !== itemId) return item;

              const oldGrams = item.portionGrams as number;
              const newGrams = data.portionGrams;
              const ratio = oldGrams > 0 ? newGrams / oldGrams : 1;

              const oldComputed = (item.computedNutrients ?? {}) as Record<string, number>;
              const newComputed: Record<string, number> = {};
              for (const [k, v] of Object.entries(oldComputed)) {
                newComputed[k] = v * ratio;
              }

              return {
                ...item,
                portionGrams: newGrams,
                portionAmount: data.portionAmount ?? newGrams,
                computedNutrients: newComputed,
              };
            });

            // Recompute meal totals
            for (const item of updatedItems) {
              const cn = (item as Record<string, unknown>).computedNutrients as Record<string, number> | undefined;
              if (cn) {
                for (const [k, v] of Object.entries(cn)) {
                  mealTotals[k] = (mealTotals[k] ?? 0) + v;
                }
              }
            }

            return { ...m, items: updatedItems, totals: mealTotals };
          });

          // Recompute day totals
          const dayTotals: Record<string, number> = {};
          for (const meal of updatedMeals) {
            const t = (meal as Record<string, unknown>).totals as Record<string, number> | undefined;
            if (t) {
              for (const [k, v] of Object.entries(t)) {
                dayTotals[k] = (dayTotals[k] ?? 0) + v;
              }
            }
          }

          return { ...old, meals: updatedMeals, dayTotals };
        }
      );

      return { previousData };
    },
    // On error, roll back to the snapshot
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    // Always refetch from server after mutation settles to ensure consistency
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['diary'] });
    },
  });
}

/** Delete a meal item */
export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const res = await fetch(`/api/diary/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete item');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diary'] });
    },
  });
}
