import { describe, it, expect } from 'vitest';
import {
  computeNutrients,
  sumNutrients,
  mapDataToComponents,
  kjToKcal,
  getNutrientSummary,
} from '../nutrients';
import { COMPONENT_ORDER } from '@/types';

describe('computeNutrients', () => {
  it('scales nutrients by portion grams', () => {
    const per100g = { ENERC: 200, FAT: 10, PROT: 5 };
    const result = computeNutrients(per100g, 150);
    expect(result.ENERC).toBe(300);
    expect(result.FAT).toBe(15);
    expect(result.PROT).toBe(7.5);
  });

  it('returns zero for zero grams', () => {
    const per100g = { ENERC: 200, FAT: 10 };
    const result = computeNutrients(per100g, 0);
    expect(result.ENERC).toBe(0);
    expect(result.FAT).toBe(0);
  });

  it('handles 100g portion (identity)', () => {
    const per100g = { ENERC: 837, FAT: 12.5, PROT: 3.7 };
    const result = computeNutrients(per100g, 100);
    expect(result.ENERC).toBe(837);
    expect(result.FAT).toBe(12.5);
    expect(result.PROT).toBe(3.7);
  });

  it('rounds to 4 decimal places', () => {
    const per100g = { ENERC: 333 };
    const result = computeNutrients(per100g, 33);
    // 333 * 33 / 100 = 109.89
    expect(result.ENERC).toBe(109.89);
  });

  it('handles fractional grams', () => {
    const per100g = { FAT: 10 };
    const result = computeNutrients(per100g, 0.5);
    expect(result.FAT).toBe(0.05);
  });

  it('returns empty record for empty input', () => {
    const result = computeNutrients({}, 100);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('sumNutrients', () => {
  it('sums matching keys across maps', () => {
    const a = { ENERC: 100, FAT: 5 };
    const b = { ENERC: 200, FAT: 10 };
    const result = sumNutrients(a, b);
    expect(result.ENERC).toBe(300);
    expect(result.FAT).toBe(15);
  });

  it('handles disjoint keys', () => {
    const a = { ENERC: 100 };
    const b = { FAT: 10 };
    const result = sumNutrients(a, b);
    expect(result.ENERC).toBe(100);
    expect(result.FAT).toBe(10);
  });

  it('sums three maps', () => {
    const a = { ENERC: 100 };
    const b = { ENERC: 200 };
    const c = { ENERC: 300 };
    const result = sumNutrients(a, b, c);
    expect(result.ENERC).toBe(600);
  });

  it('returns empty for no arguments', () => {
    const result = sumNutrients();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('returns empty for empty maps', () => {
    const result = sumNutrients({}, {});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('ignores NaN and Infinity values', () => {
    const a = { ENERC: NaN, FAT: Infinity };
    const b = { ENERC: 100, FAT: 5 };
    const result = sumNutrients(a, b);
    expect(result.ENERC).toBe(100);
    expect(result.FAT).toBe(5);
  });
});

describe('mapDataToComponents', () => {
  it('maps first few elements to correct codes', () => {
    const data = [837, 12.5, 45.2, 8.1]; // ENERC, FAT, CHOAVL, PROT
    const result = mapDataToComponents(data);
    expect(result.ENERC).toBe(837);
    expect(result.FAT).toBe(12.5);
    expect(result.CHOAVL).toBe(45.2);
    expect(result.PROT).toBe(8.1);
  });

  it('maps all 55 components when full array provided', () => {
    const data = Array.from({ length: 55 }, (_, i) => i * 1.1);
    const result = mapDataToComponents(data);
    expect(Object.keys(result)).toHaveLength(55);
    expect(result[COMPONENT_ORDER[0]]).toBe(0);
    expect(result[COMPONENT_ORDER[54]]).toBeCloseTo(54 * 1.1);
  });

  it('handles shorter data array (partial mapping)', () => {
    const data = [100, 5];
    const result = mapDataToComponents(data);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result.ENERC).toBe(100);
    expect(result.FAT).toBe(5);
  });

  it('handles empty data array', () => {
    const result = mapDataToComponents([]);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('kjToKcal', () => {
  it('converts kJ to kcal (rounded)', () => {
    expect(kjToKcal(4184)).toBe(1000);
  });

  it('converts zero', () => {
    expect(kjToKcal(0)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    // 837 / 4.184 ≈ 200.047... → 200
    expect(kjToKcal(837)).toBe(200);
  });

  it('handles small values', () => {
    expect(kjToKcal(1)).toBe(0);
  });

  it('handles large values', () => {
    expect(kjToKcal(10000)).toBe(2390);
  });
});

describe('getNutrientSummary', () => {
  it('returns summary with kcal conversion', () => {
    const nutrients = {
      ENERC: 837, // kJ
      PROT: 8.123,
      FAT: 12.567,
      CHOAVL: 45.234,
      FIBC: 3.789,
    };
    const summary = getNutrientSummary(nutrients);
    expect(summary.energyKcal).toBe(200); // 837/4.184
    expect(summary.protein).toBe(8.1);    // rounded to 1dp
    expect(summary.fat).toBe(12.6);
    expect(summary.carbs).toBe(45.2);
    expect(summary.fiber).toBe(3.8);
  });

  it('returns zeros for empty nutrients', () => {
    const summary = getNutrientSummary({});
    expect(summary.energyKcal).toBe(0);
    expect(summary.protein).toBe(0);
    expect(summary.fat).toBe(0);
    expect(summary.carbs).toBe(0);
    expect(summary.fiber).toBe(0);
  });

  it('handles partial nutrients', () => {
    const summary = getNutrientSummary({ ENERC: 418.4, PROT: 20 });
    expect(summary.energyKcal).toBe(100);
    expect(summary.protein).toBe(20);
    expect(summary.fat).toBe(0);
    expect(summary.carbs).toBe(0);
    expect(summary.fiber).toBe(0);
  });
});

describe('edge cases across nutrient module', () => {
  it('computeNutrients with negative grams returns negative values', () => {
    // Negative grams shouldn't happen in practice but shouldn't crash
    const result = computeNutrients({ ENERC: 100 }, -50);
    expect(result.ENERC).toBe(-50);
  });

  it('sumNutrients with single map is identity', () => {
    const map = { ENERC: 42, FAT: 3.14 };
    const result = sumNutrients(map);
    expect(result.ENERC).toBe(42);
    expect(result.FAT).toBe(3.14);
  });

  it('mapDataToComponents ignores extra data beyond 55 elements', () => {
    const data = Array.from({ length: 100 }, (_, i) => i);
    const result = mapDataToComponents(data);
    // Should only map 55 elements
    expect(Object.keys(result)).toHaveLength(55);
  });

  it('kjToKcal handles negative values', () => {
    // Shouldn't happen but shouldn't crash
    expect(kjToKcal(-100)).toBe(-24);
  });

  it('computeNutrients preserves all keys from input', () => {
    const per100g = { A: 1, B: 2, C: 3, CUSTOM: 100 };
    const result = computeNutrients(per100g, 50);
    expect(Object.keys(result)).toHaveLength(4);
    expect(result.CUSTOM).toBe(50);
  });
});
