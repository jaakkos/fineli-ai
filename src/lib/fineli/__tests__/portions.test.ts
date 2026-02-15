import { describe, it, expect } from 'vitest';
import { PortionConverter, UNIT_ALIASES, DENSITY_TABLE } from '../portions';
import type { FineliUnit } from '@/types';

describe('PortionConverter', () => {
  const converter = new PortionConverter();

  // Helper: create Fineli units
  const makeUnit = (code: string, massGrams: number, labelFi = code): FineliUnit => ({
    code,
    labelFi,
    labelEn: code,
    massGrams,
  });

  const sampleUnits: FineliUnit[] = [
    makeUnit('KPL_S', 50, 'pieni'),
    makeUnit('KPL_M', 80, 'keskikokoinen'),
    makeUnit('KPL_L', 120, 'iso'),
    makeUnit('DL', 60, 'dl'),
  ];

  describe('invalid inputs', () => {
    it('returns null for zero amount', () => {
      expect(converter.convert(0, 'g', [])).toBeNull();
    });

    it('returns null for negative amount', () => {
      expect(converter.convert(-5, 'g', [])).toBeNull();
    });

    it('returns null for NaN', () => {
      expect(converter.convert(NaN, 'g', [])).toBeNull();
    });

    it('returns null for Infinity', () => {
      expect(converter.convert(Infinity, 'g', [])).toBeNull();
    });

    it('returns null for unknown unit', () => {
      expect(converter.convert(1, 'xyz_unknown', [])).toBeNull();
    });
  });

  describe('unitless (null/undefined/empty)', () => {
    it('treats null unit as grams', () => {
      const result = converter.convert(120, null, []);
      expect(result).toEqual({
        grams: 120,
        unitCode: 'G',
        unitLabel: 'g',
        method: 'direct_grams',
      });
    });

    it('treats undefined unit as grams', () => {
      const result = converter.convert(50, undefined, []);
      expect(result).toEqual({
        grams: 50,
        unitCode: 'G',
        unitLabel: 'g',
        method: 'direct_grams',
      });
    });

    it('treats empty string unit as grams', () => {
      const result = converter.convert(75, '', []);
      expect(result).toEqual({
        grams: 75,
        unitCode: 'G',
        unitLabel: 'g',
        method: 'direct_grams',
      });
    });
  });

  describe('direct grams (g)', () => {
    it('converts "g" to grams', () => {
      const result = converter.convert(120, 'g', []);
      expect(result).toEqual({
        grams: 120,
        unitCode: 'G',
        unitLabel: 'g',
        method: 'direct_grams',
      });
    });

    it('converts "grammaa" to grams', () => {
      const result = converter.convert(200, 'grammaa', []);
      expect(result).toEqual({
        grams: 200,
        unitCode: 'G',
        unitLabel: 'g',
        method: 'direct_grams',
      });
    });

    it('converts "gram" to grams', () => {
      const result = converter.convert(50, 'gram', []);
      expect(result).toEqual({
        grams: 50,
        unitCode: 'G',
        unitLabel: 'g',
        method: 'direct_grams',
      });
    });
  });

  describe('kilograms (kg)', () => {
    it('converts kg to grams', () => {
      const result = converter.convert(1.5, 'kg', []);
      expect(result).toEqual({
        grams: 1500,
        unitCode: 'KG',
        unitLabel: 'kg',
        method: 'direct_grams',
      });
    });

    it('converts 0.5 kg', () => {
      const result = converter.convert(0.5, 'kg', []);
      expect(result?.grams).toBe(500);
    });
  });

  describe('volume with Fineli DL unit', () => {
    it('converts dl using Fineli DL mass', () => {
      // DL unit: 60g per dl → 2dl = 120g
      const result = converter.convert(2, 'dl', sampleUnits);
      expect(result).toEqual({
        grams: 120,
        unitCode: 'DL',
        unitLabel: 'dl',
        method: 'fineli_unit',
      });
    });

    it('converts ml using Fineli DL mass', () => {
      // DL = 60g → 1ml = 60/100 = 0.6g → 100ml = 60g
      const result = converter.convert(100, 'ml', sampleUnits);
      expect(result).toEqual({
        grams: 60,
        unitCode: 'ML',
        unitLabel: 'dl',
        method: 'fineli_unit',
      });
    });

    it('converts L using Fineli DL mass', () => {
      // DL = 60g → 1L = 60 * 10 = 600g
      const result = converter.convert(1, 'l', sampleUnits);
      expect(result).toEqual({
        grams: 600,
        unitCode: 'L',
        unitLabel: 'dl',
        method: 'fineli_unit',
      });
    });

    it('converts Finnish alias "desilitra"', () => {
      const result = converter.convert(3, 'desilitra', sampleUnits);
      expect(result?.grams).toBe(180); // 3 * 60g
    });
  });

  describe('volume without Fineli DL unit (density fallback)', () => {
    const noUnits: FineliUnit[] = [];

    it('converts dl using default liquid density (1.0)', () => {
      // 1 dl = 100ml = 100g (density 1.0)
      const result = converter.convert(2, 'dl', noUnits);
      expect(result).toEqual({
        grams: 200,
        unitCode: 'DL',
        unitLabel: 'dl',
        method: 'volume_density',
      });
    });

    it('converts ml using default liquid density', () => {
      const result = converter.convert(250, 'ml', noUnits);
      expect(result?.grams).toBe(250);
      expect(result?.method).toBe('volume_density');
    });

    it('converts L using default liquid density', () => {
      const result = converter.convert(1, 'l', noUnits);
      expect(result?.grams).toBe(1000);
      expect(result?.method).toBe('volume_density');
    });
  });

  describe('Fineli piece/portion units', () => {
    it('converts "kpl" to KPL_M', () => {
      const result = converter.convert(2, 'kpl', sampleUnits);
      expect(result).toEqual({
        grams: 160, // 2 * 80g
        unitCode: 'KPL_M',
        unitLabel: 'keskikokoinen',
        method: 'fineli_unit',
      });
    });

    it('converts "pieni" to KPL_S', () => {
      const result = converter.convert(1, 'pieni', sampleUnits);
      expect(result).toEqual({
        grams: 50,
        unitCode: 'KPL_S',
        unitLabel: 'pieni',
        method: 'fineli_unit',
      });
    });

    it('converts "iso" to KPL_L', () => {
      const result = converter.convert(3, 'iso', sampleUnits);
      expect(result).toEqual({
        grams: 360, // 3 * 120g
        unitCode: 'KPL_L',
        unitLabel: 'iso',
        method: 'fineli_unit',
      });
    });

    it('returns null when Fineli unit not found', () => {
      // No SLICE unit in sampleUnits
      const result = converter.convert(2, 'viipale', sampleUnits);
      expect(result).toBeNull();
    });
  });

  describe('household measures', () => {
    it('converts tbsp/rkl when Fineli unit present', () => {
      const units = [makeUnit('RKL', 15, 'ruokalusikka')];
      const result = converter.convert(2, 'rkl', units);
      expect(result).toEqual({
        grams: 30,
        unitCode: 'RKL',
        unitLabel: 'ruokalusikka',
        method: 'fineli_unit',
      });
    });

    it('converts tl/tsp when Fineli unit present', () => {
      const units = [makeUnit('TL', 5, 'teelusikka')];
      const result = converter.convert(3, 'tl', units);
      expect(result?.grams).toBe(15);
    });
  });
});

describe('UNIT_ALIASES', () => {
  it('maps Finnish aliases correctly', () => {
    expect(UNIT_ALIASES['g']).toBe('G');
    expect(UNIT_ALIASES['dl']).toBe('DL');
    expect(UNIT_ALIASES['kpl']).toBe('KPL_M');
    expect(UNIT_ALIASES['pieni']).toBe('KPL_S');
    expect(UNIT_ALIASES['iso']).toBe('KPL_L');
    expect(UNIT_ALIASES['rkl']).toBe('RKL');
    expect(UNIT_ALIASES['tl']).toBe('TL');
    expect(UNIT_ALIASES['viipale']).toBe('SLICE');
    expect(UNIT_ALIASES['viipaletta']).toBe('SLICE');
    expect(UNIT_ALIASES['annos']).toBe('PORTM');
  });
});

describe('DENSITY_TABLE', () => {
  it('has expected default densities', () => {
    expect(DENSITY_TABLE['default_liquid']).toBe(1.0);
    expect(DENSITY_TABLE['milk']).toBe(1.03);
    expect(DENSITY_TABLE['oil']).toBe(0.92);
    expect(DENSITY_TABLE['honey']).toBe(1.42);
  });
});

describe('PortionConverter edge cases', () => {
  const converter = new PortionConverter();

  it('handles very large amounts', () => {
    const result = converter.convert(10000, 'g', []);
    expect(result?.grams).toBe(10000);
  });

  it('handles fractional grams', () => {
    const result = converter.convert(0.5, 'g', []);
    expect(result?.grams).toBe(0.5);
  });

  it('handles case-insensitive unit input', () => {
    const result = converter.convert(100, 'G', []);
    expect(result?.grams).toBe(100);
  });

  it('handles "Grammaa" with capital letter', () => {
    const result = converter.convert(100, 'Grammaa', []);
    expect(result?.grams).toBe(100);
  });

  it('trims whitespace in unit input', () => {
    const result = converter.convert(100, '  g  ', []);
    expect(result?.grams).toBe(100);
  });

  it('handles "kappaletta" alias', () => {
    const units = [
      { code: 'KPL_M', massGrams: 80, labelFi: 'kpl', labelEn: 'pcs' },
    ];
    const result = converter.convert(3, 'kappaletta', units as any);
    expect(result?.grams).toBe(240); // 3 * 80
  });

  it('handles "piece" alias', () => {
    const units = [
      { code: 'KPL_M', massGrams: 80, labelFi: 'kpl', labelEn: 'pcs' },
    ];
    const result = converter.convert(1, 'piece', units as any);
    expect(result?.grams).toBe(80);
  });

  it('prefers Fineli DL unit over density fallback for volume', () => {
    // With Fineli DL unit: 2dl = 2 * 60g = 120g (not 200g from density)
    const units = [
      { code: 'DL', massGrams: 60, labelFi: 'dl', labelEn: 'dl' },
    ];
    const result = converter.convert(2, 'dl', units as any);
    expect(result?.grams).toBe(120); // Fineli unit, not density
    expect(result?.method).toBe('fineli_unit');
  });
});
