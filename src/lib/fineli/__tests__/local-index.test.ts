import { describe, it, expect } from 'vitest';
import {
  localSearch,
  findWholeDish,
  getRecipe,
  getPortionSizes,
  getMediumPortion,
  getFoodMeta,
  isDish,
} from '../local-index';

describe('Fineli local index', () => {
  describe('localSearch', () => {
    it('finds exact match for "voi"', () => {
      const results = localSearch('voi', 3);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].food.name).toBe('VOI');
      expect(results[0].score).toBe(100);
      expect(results[0].matchType).toBe('exact');
    });

    it('finds primary name matches', () => {
      const results = localSearch('lihakeitto', 5);
      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results.every((r) => r.food.name.toLowerCase().includes('lihakeitto'))).toBe(true);
    });

    it('finds composite dishes like hampurilainen', () => {
      const results = localSearch('hampurilainen', 5);
      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results.every((r) => r.food.type === 'DISH')).toBe(true);
    });

    it('handles multi-word queries', () => {
      const results = localSearch('kana curry', 5);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for empty query', () => {
      expect(localSearch('')).toHaveLength(0);
      expect(localSearch('  ')).toHaveLength(0);
    });

    it('respects limit parameter', () => {
      const results = localSearch('maito', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('findWholeDish', () => {
    it('finds lihakeitto as whole dish', () => {
      const dish = findWholeDish('lihakeitto');
      expect(dish).not.toBeNull();
      expect(dish!.type).toBe('DISH');
      expect(dish!.name.toLowerCase()).toContain('lihakeitto');
    });

    it('finds makaronilaatikko as whole dish', () => {
      const dish = findWholeDish('makaronilaatikko');
      expect(dish).not.toBeNull();
      expect(dish!.type).toBe('DISH');
    });

    it('returns null for unknown food', () => {
      const dish = findWholeDish('xyznonexistent');
      expect(dish).toBeNull();
    });
  });

  describe('getRecipe', () => {
    it('returns recipe ingredients for a composite dish', () => {
      // ID 29279 = HAMPURILAINEN, NAUDANLIHAPIHVI JA VEHNÄSÄMPYLÄ
      const recipe = getRecipe(29279);
      expect(recipe).not.toBeNull();
      expect(recipe!.length).toBeGreaterThanOrEqual(3);
      expect(recipe!.every((i) => i.grams > 0)).toBe(true);
      expect(recipe!.every((i) => i.name.length > 0)).toBe(true);
    });

    it('returns null for raw ingredient without recipe', () => {
      // ID 500 = VOI (raw food, not a recipe)
      const recipe = getRecipe(500);
      expect(recipe).toBeNull();
    });
  });

  describe('getPortionSizes', () => {
    it('returns portion sizes for a common food', () => {
      // ID 1513 = KAURAPUURO, VESI, SUOLAA
      const portions = getPortionSizes(1513);
      expect(portions).not.toBeNull();
      expect(portions!.length).toBeGreaterThanOrEqual(3);
      expect(portions!.some((p) => p.unit === 'PORTM')).toBe(true);
    });

    it('returns null for unknown food ID', () => {
      expect(getPortionSizes(999999)).toBeNull();
    });
  });

  describe('getMediumPortion', () => {
    it('returns PORTM grams for kaurapuuro', () => {
      // ID 1513 = KAURAPUURO, VESI, SUOLAA — PORTM = 230g
      const grams = getMediumPortion(1513);
      expect(grams).toBe(230);
    });

    it('returns null for unknown food', () => {
      expect(getMediumPortion(999999)).toBeNull();
    });
  });

  describe('getFoodMeta', () => {
    it('returns metadata for a known food', () => {
      const meta = getFoodMeta(500); // VOI
      expect(meta).not.toBeNull();
      expect(meta!.name).toBe('VOI');
      expect(meta!.type).toBe('FOOD');
    });

    it('returns null for unknown food', () => {
      expect(getFoodMeta(999999)).toBeNull();
    });
  });

  describe('isDish', () => {
    it('returns true for a dish', () => {
      // ID 7163 = LIHAKEITTO, NAUDANLAPA
      expect(isDish(7163)).toBe(true);
    });

    it('returns false for a raw ingredient', () => {
      // ID 500 = VOI
      expect(isDish(500)).toBe(false);
    });
  });
});
