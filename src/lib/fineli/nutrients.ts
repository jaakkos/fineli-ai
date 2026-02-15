import { COMPONENT_ORDER } from '@/types';

/**
 * Compute nutrients for a specific portion from per-100g values.
 * Formula: nutrientValue = nutrientPer100g * portionGrams / 100
 *
 * @param nutrientsPer100g - Record<componentCode, valuePer100g>
 * @param portionGrams - weight of the portion in grams
 * @returns Record<componentCode, computedValue> (rounded to 4 decimal places)
 */
export function computeNutrients(
  nutrientsPer100g: Record<string, number>,
  portionGrams: number
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [code, valuePer100g] of Object.entries(nutrientsPer100g)) {
    result[code] =
      Math.round((valuePer100g * portionGrams) / 100 * 10000) / 10000;
  }
  return result;
}

/**
 * Sum nutrients across multiple nutrient maps.
 * Null/undefined values are skipped (not treated as zero).
 * If all values for a code are null/undefined, the sum is also null.
 *
 * @param maps - array of nutrient maps
 * @returns Record<componentCode, summedValue>
 */
export function sumNutrients(
  ...maps: Record<string, number>[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const map of maps) {
    for (const [code, value] of Object.entries(map)) {
      if (value != null && isFinite(value)) {
        result[code] = (result[code] ?? 0) + value;
      }
    }
  }
  return result;
}

/**
 * Map a Fineli data[] array (55 numbers, per 100g) to a Record<code, number>.
 * Uses COMPONENT_ORDER from shared types to map index → code.
 *
 * @param data - array of 55 numbers from Fineli food detail API
 * @returns Record<componentCode, valuePer100g>
 */
export function mapDataToComponents(data: number[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (let i = 0; i < COMPONENT_ORDER.length && i < data.length; i++) {
    result[COMPONENT_ORDER[i]] = data[i];
  }
  return result;
}

/**
 * Convert energy from kJ to kcal.
 * 1 kJ = 1/4.184 kcal
 */
export function kjToKcal(kj: number): number {
  return Math.round(kj / 4.184);
}

/**
 * Get a summary of key nutrients for display.
 * Returns { energyKcal, protein, fat, carbs, fiber } in a display-friendly format.
 */
export function getNutrientSummary(nutrients: Record<string, number>): {
  energyKcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
} {
  return {
    energyKcal: kjToKcal(nutrients['ENERC'] ?? 0),
    protein: Math.round((nutrients['PROT'] ?? 0) * 10) / 10,
    fat: Math.round((nutrients['FAT'] ?? 0) * 10) / 10,
    carbs: Math.round((nutrients['CHOAVL'] ?? 0) * 10) / 10,
    fiber: Math.round((nutrients['FIBC'] ?? 0) * 10) / 10,
  };
}
