/**
 * Item state transitions for the conversation engine.
 * Handles PARSED → DISAMBIGUATING | PORTIONING | RESOLVED | NO_MATCH and subsequent transitions.
 */

import type { ParsedItem, FineliFood, ParsedMealItem } from '@/types';
import { newId } from '@/types';

// ---------------------------------------------------------------------------
// createInitialItem
// ---------------------------------------------------------------------------

export function createInitialItem(parsed: ParsedMealItem): ParsedItem {
  const now = Date.now();
  const inferredAmount =
    parsed.amount != null && parsed.unit
      ? { value: parsed.amount, unit: parsed.unit }
      : parsed.amount != null
        ? { value: parsed.amount, unit: 'g' }
        : undefined;

  return {
    id: newId(),
    rawText: parsed.text,
    inferredAmount,
    state: 'PARSED',
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// resolveItemState
// ---------------------------------------------------------------------------

/**
 * Determines item state based on search results and applies it.
 * 0 results → NO_MATCH
 * grams known (inferredAmount 'g') + any results → RESOLVED with best match (auto-resolve)
 * 1 result + no grams → PORTIONING
 * 2+ results + no grams → DISAMBIGUATING with candidates
 */
export function resolveItemState(
  item: ParsedItem,
  searchResults: FineliFood[],
  topResults: FineliFood[]
): ParsedItem {
  const now = Date.now();
  const updated: ParsedItem = { ...item, updatedAt: now };

  if (topResults.length === 0) {
    updated.state = 'NO_MATCH';
    updated.fineliCandidates = [];
    return updated;
  }

  const hasGrams =
    item.inferredAmount?.unit === 'g' && item.inferredAmount?.value > 0;

  // When grams are known (e.g. AI provided portionEstimateGrams), auto-resolve
  // with the best match regardless of how many candidates there are.
  // This avoids tedious disambiguation for sandwich toppings, spreads, etc.
  if (hasGrams) {
    const best = topResults[0];
    updated.selectedFood = best;
    updated.portionGrams = item.inferredAmount!.value;
    updated.portionUnitCode = 'G';
    updated.portionUnitLabel = 'g';
    updated.state = 'RESOLVED';
    updated.fineliCandidates = topResults;
    return updated;
  }

  if (topResults.length === 1) {
    updated.state = 'PORTIONING';
    updated.selectedFood = topResults[0];
    updated.fineliCandidates = [topResults[0]];
    return updated;
  }

  // 2+ results, no grams → need user input
  updated.state = 'DISAMBIGUATING';
  updated.fineliCandidates = topResults;
  return updated;
}

// ---------------------------------------------------------------------------
// applyDisambiguation
// ---------------------------------------------------------------------------

/**
 * Applies user's disambiguation selection.
 * Sets selectedFood, transitions to PORTIONING (or RESOLVED if grams already known).
 */
export function applyDisambiguation(
  item: ParsedItem,
  selectedFood: FineliFood
): ParsedItem {
  const now = Date.now();
  const hasGrams =
    item.inferredAmount?.unit === 'g' && item.inferredAmount?.value > 0;

  if (hasGrams) {
    return {
      ...item,
      selectedFood,
      portionGrams: item.inferredAmount!.value,
      portionUnitCode: 'G',
      portionUnitLabel: 'g',
      state: 'RESOLVED',
      updatedAt: now,
    };
  }

  return {
    ...item,
    selectedFood,
    fineliCandidates: item.fineliCandidates ? [selectedFood] : undefined,
    state: 'PORTIONING',
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// applyPortion
// ---------------------------------------------------------------------------

/**
 * Applies user's portion answer.
 * Sets portionGrams, portionUnitCode, portionUnitLabel, state → RESOLVED.
 */
export function applyPortion(
  item: ParsedItem,
  grams: number,
  unitCode?: string,
  unitLabel?: string
): ParsedItem {
  const now = Date.now();
  return {
    ...item,
    portionGrams: grams,
    portionUnitCode: unitCode ?? 'G',
    portionUnitLabel: unitLabel ?? 'g',
    state: 'RESOLVED',
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// revertToParsed
// ---------------------------------------------------------------------------

/**
 * Reverts item back to PARSED for a new search (correction / no_match_retry).
 * Clears candidates, selectedFood, and portion data.
 */
export function revertToParsed(item: ParsedItem): ParsedItem {
  const now = Date.now();
  return {
    ...item,
    state: 'PARSED',
    fineliCandidates: undefined,
    selectedFood: undefined,
    portionGrams: undefined,
    portionUnitCode: undefined,
    portionUnitLabel: undefined,
    updatedAt: now,
  };
}
