import type { FineliUnit, PortionConversionResult } from '@/types';

export const UNIT_ALIASES: Record<string, string> = {
  // Direct grams
  'g': 'G', 'grammaa': 'G', 'gram': 'G',
  'kg': 'KG',
  // Volume
  'dl': 'DL', 'desi': 'DL', 'desilitra': 'DL',
  'ml': 'ML', 'millilitra': 'ML',
  'l': 'L', 'litra': 'L',
  // Pieces
  'kpl': 'KPL_M', 'kappaletta': 'KPL_M', 'piece': 'KPL_M', 'pcs': 'KPL_M',
  // Sizes
  'pieni': 'KPL_S', 'small': 'KPL_S',
  'keskikokoinen': 'KPL_M', 'medium': 'KPL_M',
  'iso': 'KPL_L', 'large': 'KPL_L', 'suuri': 'KPL_L',
  // Portions
  'annos': 'PORTM', 'portion': 'PORTM',
  'pieni annos': 'PORTS', 'small portion': 'PORTS',
  'iso annos': 'PORTL', 'large portion': 'PORTL',
  // Household
  'rkl': 'RKL', 'ruokalusikka': 'RKL', 'tbsp': 'RKL',
  'tl': 'TL', 'teelusikka': 'TL', 'tsp': 'TL',
  'kuppi': 'CUP', 'cup': 'CUP',
  'lasi': 'GLASS', 'glass': 'GLASS',
  'viipale': 'SLICE', 'slice': 'SLICE', 'viipaletta': 'SLICE',
};

export const DENSITY_TABLE: Record<string, number> = {
  // g per ml
  'default_liquid': 1.0,
  'milk': 1.03,
  'cream': 1.01,
  'oil': 0.92,
  'honey': 1.42,
  'flour': 0.53,
  'sugar': 0.85,
  'oats': 0.40,
  'rice_raw': 0.85,
};

const STANDARD_UNIT_LABELS: Record<string, string> = {
  'G': 'g',
  'KG': 'kg',
  'DL': 'dl',
  'ML': 'ml',
  'L': 'l',
};

export class PortionConverter {
  /**
   * Convert a user-provided portion to grams.
   * @param amount - numeric value (e.g., 2)
   * @param unitInput - what user said (e.g., "dl", "medium", "kpl"). Can be null/undefined for unitless amounts.
   * @param fineliUnits - available units from Fineli for this food
   * @returns PortionConversionResult or null if conversion not possible
   */
  convert(
    amount: number,
    unitInput: string | null | undefined,
    fineliUnits: FineliUnit[]
  ): PortionConversionResult | null {
    if (amount <= 0 || !Number.isFinite(amount)) {
      return null;
    }

    // 6. Unitless: treat as grams
    if (unitInput == null || unitInput === '') {
      return {
        grams: amount,
        unitCode: 'G',
        unitLabel: 'g',
        method: 'direct_grams',
      };
    }

    const code = this.resolveUnitCode(unitInput);
    if (code === null) {
      return null;
    }

    // 1. Direct grams
    if (code === 'G') {
      return {
        grams: amount,
        unitCode: 'G',
        unitLabel: 'g',
        method: 'direct_grams',
      };
    }

    // 2. Direct kg
    if (code === 'KG') {
      return {
        grams: amount * 1000,
        unitCode: 'KG',
        unitLabel: 'kg',
        method: 'direct_grams',
      };
    }

    // 4. Volume conversion with Fineli DL unit
    const dlUnit = this.findFineliUnit('DL', fineliUnits);
    if (dlUnit && (code === 'ML' || code === 'DL' || code === 'L')) {
      let grams: number;
      if (code === 'ML') {
        grams = (dlUnit.massGrams / 100) * amount;
      } else if (code === 'DL') {
        grams = dlUnit.massGrams * amount;
      } else {
        grams = dlUnit.massGrams * 10 * amount;
      }
      return {
        grams,
        unitCode: code,
        unitLabel: dlUnit.labelFi,
        method: 'fineli_unit',
      };
    }

    // 5. Volume without Fineli unit: use density table
    if (code === 'ML' || code === 'DL' || code === 'L') {
      const density = DENSITY_TABLE['default_liquid'] ?? 1.0;
      let grams: number;
      if (code === 'ML') {
        grams = amount * density;
      } else if (code === 'DL') {
        grams = amount * 100 * density;
      } else {
        grams = amount * 1000 * density;
      }
      return {
        grams,
        unitCode: code,
        unitLabel: STANDARD_UNIT_LABELS[code] ?? code,
        method: 'volume_density',
      };
    }

    // 3. Fineli unit match (pieces, sizes, portions, household)
    const fineliUnit = this.findFineliUnit(code, fineliUnits);
    if (fineliUnit) {
      return {
        grams: fineliUnit.massGrams * amount,
        unitCode: code,
        unitLabel: fineliUnit.labelFi,
        method: 'fineli_unit',
      };
    }

    // 7. No conversion possible
    return null;
  }

  /**
   * Find the best matching Fineli unit for a given unit code.
   */
  private findFineliUnit(code: string, fineliUnits: FineliUnit[]): FineliUnit | undefined {
    return fineliUnits.find(u => u.code === code);
  }

  /**
   * Resolve user input to a Fineli unit code.
   */
  private resolveUnitCode(unitInput: string): string | null {
    const normalized = unitInput.toLowerCase().trim();
    return UNIT_ALIASES[normalized] ?? null;
  }
}

export const portionConverter = new PortionConverter();
