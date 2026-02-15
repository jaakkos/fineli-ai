import { describe, it, expect } from 'vitest';
import {
  createInitialItem,
  resolveItemState,
  applyDisambiguation,
  applyPortion,
  revertToParsed,
} from '../resolver';
import type { FineliFood, ParsedItem, ParsedMealItem } from '@/types';

// Helper factories
function makeFood(id: number, nameFi: string): FineliFood {
  return {
    id,
    nameFi,
    nameEn: null,
    nameSv: null,
    type: 'FOOD',
    preparationMethods: [],
    units: [],
    nutrients: { ENERC: 500 },
    energyKj: 500,
    energyKcal: 120,
    fat: 5,
    protein: 10,
    carbohydrate: 20,
  };
}

function makeParsed(overrides: Partial<ParsedMealItem> = {}): ParsedMealItem {
  return {
    text: 'kaurapuuro',
    ...overrides,
  };
}

function makeItem(overrides: Partial<ParsedItem> = {}): ParsedItem {
  return {
    id: 'item-1',
    rawText: 'kaurapuuro',
    state: 'PARSED',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

// =========================================================================
// createInitialItem
// =========================================================================

describe('createInitialItem', () => {
  it('creates item with PARSED state', () => {
    const item = createInitialItem(makeParsed());
    expect(item.state).toBe('PARSED');
    expect(item.rawText).toBe('kaurapuuro');
  });

  it('generates unique ID', () => {
    const a = createInitialItem(makeParsed());
    const b = createInitialItem(makeParsed());
    expect(a.id).not.toBe(b.id);
  });

  it('infers amount with unit', () => {
    const item = createInitialItem(makeParsed({ text: 'maito', amount: 2, unit: 'dl' }));
    expect(item.inferredAmount).toEqual({ value: 2, unit: 'dl' });
  });

  it('infers amount without unit defaults to "g"', () => {
    const item = createInitialItem(makeParsed({ text: 'kanaa', amount: 120 }));
    expect(item.inferredAmount).toEqual({ value: 120, unit: 'g' });
  });

  it('no inferredAmount when no amount provided', () => {
    const item = createInitialItem(makeParsed({ text: 'kahvi' }));
    expect(item.inferredAmount).toBeUndefined();
  });

  it('sets timestamps', () => {
    const before = Date.now();
    const item = createInitialItem(makeParsed());
    const after = Date.now();
    expect(item.createdAt).toBeGreaterThanOrEqual(before);
    expect(item.createdAt).toBeLessThanOrEqual(after);
    expect(item.updatedAt).toBe(item.createdAt);
  });
});

// =========================================================================
// resolveItemState
// =========================================================================

describe('resolveItemState', () => {
  it('NO_MATCH when 0 results', () => {
    const item = makeItem();
    const resolved = resolveItemState(item, [], []);
    expect(resolved.state).toBe('NO_MATCH');
    expect(resolved.fineliCandidates).toEqual([]);
  });

  it('auto-resolves with 1 result + grams known', () => {
    const item = makeItem({
      inferredAmount: { value: 120, unit: 'g' },
    });
    const food = makeFood(1, 'Kaurapuuro');
    const resolved = resolveItemState(item, [food], [food]);
    expect(resolved.state).toBe('RESOLVED');
    expect(resolved.selectedFood).toBe(food);
    expect(resolved.portionGrams).toBe(120);
    expect(resolved.portionUnitCode).toBe('G');
  });

  it('PORTIONING with 1 result but no grams', () => {
    const item = makeItem(); // no inferredAmount
    const food = makeFood(1, 'Kaurapuuro');
    const resolved = resolveItemState(item, [food], [food]);
    expect(resolved.state).toBe('PORTIONING');
    expect(resolved.selectedFood).toBe(food);
  });

  it('PORTIONING with 1 result and non-gram unit', () => {
    const item = makeItem({
      inferredAmount: { value: 2, unit: 'dl' },
    });
    const food = makeFood(1, 'Maito');
    const resolved = resolveItemState(item, [food], [food]);
    expect(resolved.state).toBe('PORTIONING');
  });

  it('DISAMBIGUATING with 2+ results', () => {
    const item = makeItem();
    const foods = [
      makeFood(1, 'Kaurapuuro, vedellä'),
      makeFood(2, 'Kaurapuuro, maidolla'),
      makeFood(3, 'Kaurapuuro, pikakuiva'),
    ];
    const resolved = resolveItemState(item, foods, foods);
    expect(resolved.state).toBe('DISAMBIGUATING');
    expect(resolved.fineliCandidates).toHaveLength(3);
  });

  it('preserves item ID and rawText', () => {
    const item = makeItem({ id: 'my-id', rawText: 'test' });
    const resolved = resolveItemState(item, [], []);
    expect(resolved.id).toBe('my-id');
    expect(resolved.rawText).toBe('test');
  });

  it('updates updatedAt timestamp', () => {
    const item = makeItem({ updatedAt: 0 });
    const resolved = resolveItemState(item, [], []);
    expect(resolved.updatedAt).toBeGreaterThan(0);
  });
});

// =========================================================================
// applyDisambiguation
// =========================================================================

describe('applyDisambiguation', () => {
  it('transitions to PORTIONING when no grams known', () => {
    const item = makeItem({ state: 'DISAMBIGUATING' });
    const food = makeFood(1, 'Kaurapuuro, vedellä');
    const result = applyDisambiguation(item, food);
    expect(result.state).toBe('PORTIONING');
    expect(result.selectedFood).toBe(food);
  });

  it('transitions to RESOLVED when grams known', () => {
    const item = makeItem({
      state: 'DISAMBIGUATING',
      inferredAmount: { value: 200, unit: 'g' },
    });
    const food = makeFood(1, 'Kaurapuuro, vedellä');
    const result = applyDisambiguation(item, food);
    expect(result.state).toBe('RESOLVED');
    expect(result.selectedFood).toBe(food);
    expect(result.portionGrams).toBe(200);
    expect(result.portionUnitCode).toBe('G');
  });

  it('does not auto-resolve if unit is not "g"', () => {
    const item = makeItem({
      state: 'DISAMBIGUATING',
      inferredAmount: { value: 2, unit: 'dl' },
    });
    const food = makeFood(1, 'Maito');
    const result = applyDisambiguation(item, food);
    expect(result.state).toBe('PORTIONING');
  });
});

// =========================================================================
// applyPortion
// =========================================================================

describe('applyPortion', () => {
  it('transitions to RESOLVED with grams', () => {
    const item = makeItem({ state: 'PORTIONING' });
    const result = applyPortion(item, 150);
    expect(result.state).toBe('RESOLVED');
    expect(result.portionGrams).toBe(150);
    expect(result.portionUnitCode).toBe('G');
    expect(result.portionUnitLabel).toBe('g');
  });

  it('uses provided unit code and label', () => {
    const item = makeItem({ state: 'PORTIONING' });
    const result = applyPortion(item, 80, 'KPL_M', 'keskikokoinen');
    expect(result.portionUnitCode).toBe('KPL_M');
    expect(result.portionUnitLabel).toBe('keskikokoinen');
  });

  it('preserves other item fields', () => {
    const item = makeItem({
      state: 'PORTIONING',
      selectedFood: makeFood(1, 'Maito'),
      rawText: 'maito',
    });
    const result = applyPortion(item, 200);
    expect(result.rawText).toBe('maito');
    expect(result.selectedFood?.nameFi).toBe('Maito');
  });
});

// =========================================================================
// revertToParsed
// =========================================================================

describe('revertToParsed', () => {
  it('sets state back to PARSED', () => {
    const item = makeItem({
      state: 'DISAMBIGUATING',
      fineliCandidates: [makeFood(1, 'A'), makeFood(2, 'B')],
      selectedFood: makeFood(1, 'A'),
      portionGrams: 100,
      portionUnitCode: 'G',
      portionUnitLabel: 'g',
    });
    const result = revertToParsed(item);
    expect(result.state).toBe('PARSED');
    expect(result.fineliCandidates).toBeUndefined();
    expect(result.selectedFood).toBeUndefined();
    expect(result.portionGrams).toBeUndefined();
    expect(result.portionUnitCode).toBeUndefined();
    expect(result.portionUnitLabel).toBeUndefined();
  });

  it('preserves id, rawText, inferredAmount', () => {
    const item = makeItem({
      id: 'keep-me',
      rawText: 'keep-text',
      inferredAmount: { value: 100, unit: 'g' },
      state: 'RESOLVED',
    });
    const result = revertToParsed(item);
    expect(result.id).toBe('keep-me');
    expect(result.rawText).toBe('keep-text');
    expect(result.inferredAmount).toEqual({ value: 100, unit: 'g' });
  });

  it('updates updatedAt timestamp', () => {
    const item = makeItem({ updatedAt: 0 });
    const result = revertToParsed(item);
    expect(result.updatedAt).toBeGreaterThan(0);
  });
});

// =========================================================================
// Edge cases across resolver
// =========================================================================

describe('resolver edge cases', () => {
  it('resolveItemState does not mutate original item', () => {
    const item = makeItem();
    const original = { ...item };
    resolveItemState(item, [], []);
    expect(item.state).toBe(original.state);
  });

  it('applyDisambiguation does not mutate original item', () => {
    const item = makeItem({ state: 'DISAMBIGUATING' });
    const original = { ...item };
    applyDisambiguation(item, makeFood(1, 'Test'));
    expect(item.state).toBe(original.state);
  });

  it('applyPortion does not mutate original item', () => {
    const item = makeItem({ state: 'PORTIONING' });
    const original = { ...item };
    applyPortion(item, 100);
    expect(item.state).toBe(original.state);
  });

  it('revertToParsed does not mutate original item', () => {
    const item = makeItem({ state: 'RESOLVED', portionGrams: 200 });
    const original = { ...item };
    revertToParsed(item);
    expect(item.portionGrams).toBe(original.portionGrams);
  });

  it('createInitialItem with zero amount still stores it', () => {
    const item = createInitialItem({ text: 'test', amount: 0 });
    // amount 0 with no unit → inferredAmount = { value: 0, unit: 'g' }
    expect(item.inferredAmount).toEqual({ value: 0, unit: 'g' });
  });

  it('resolveItemState with 1 result + non-zero grams auto-resolves', () => {
    const item = makeItem({
      inferredAmount: { value: 1, unit: 'g' },
    });
    const food = makeFood(1, 'Test food');
    const result = resolveItemState(item, [food], [food]);
    expect(result.state).toBe('RESOLVED');
    expect(result.portionGrams).toBe(1);
  });

  it('resolveItemState with 1 result + 0 grams goes to PORTIONING', () => {
    const item = makeItem({
      inferredAmount: { value: 0, unit: 'g' },
    });
    const food = makeFood(1, 'Test food');
    const result = resolveItemState(item, [food], [food]);
    expect(result.state).toBe('PORTIONING');
  });
});
