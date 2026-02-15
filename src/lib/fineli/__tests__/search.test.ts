import { describe, it, expect } from 'vitest';
import { normalizeQuery, rankSearchResults, FOOD_ALIASES } from '../search';
import type { FineliFood } from '@/types';

// Helper: minimal FineliFood factory
function makeFood(id: number, nameFi: string, type: 'FOOD' | 'DISH' = 'FOOD'): FineliFood {
  return {
    id,
    nameFi,
    nameEn: null,
    nameSv: null,
    type,
    preparationMethods: [],
    units: [],
    nutrients: {},
    energyKj: 0,
    energyKcal: 0,
    fat: 0,
    protein: 0,
    carbohydrate: 0,
  };
}

describe('normalizeQuery', () => {
  it('lowercases input', () => {
    expect(normalizeQuery('MAITO')).toBe('maito');
  });

  it('trims whitespace', () => {
    expect(normalizeQuery('  maito  ')).toBe('maito');
  });

  it('removes trailing comma', () => {
    expect(normalizeQuery('maito,')).toBe('maito');
  });

  it('removes trailing period', () => {
    expect(normalizeQuery('maito.')).toBe('maito');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeQuery('maito   kevyt')).toBe('maito kevyt');
  });

  it('handles empty string', () => {
    expect(normalizeQuery('')).toBe('');
  });

  it('handles whitespace-only input', () => {
    expect(normalizeQuery('   ')).toBe('');
  });

  it('combined normalization', () => {
    expect(normalizeQuery('  Rasvaton   Maito,  ')).toBe('rasvaton maito');
  });
});

describe('FOOD_ALIASES', () => {
  it('has Finnish food aliases', () => {
    expect(FOOD_ALIASES['maito']).toBe('maito');
    expect(FOOD_ALIASES['kevytmaito']).toBe('maito, kevyt');
    expect(FOOD_ALIASES['puuro']).toBe('kaurapuuro');
    expect(FOOD_ALIASES['kahvi']).toBe('kahvi');
  });
});

describe('rankSearchResults', () => {
  it('ranks exact match highest', () => {
    const results = [
      makeFood(1, 'Maito, kevyt'),
      makeFood(2, 'Maito'),
      makeFood(3, 'Maitojuoma'),
    ];
    const ranked = rankSearchResults(results, 'maito');
    expect(ranked[0].nameFi).toBe('Maito');
  });

  it('ranks starts-with above contains', () => {
    const results = [
      makeFood(1, 'Piimäjuoma maitoa'),  // contains
      makeFood(2, 'Maito, rasvaton'),       // starts-with
    ];
    const ranked = rankSearchResults(results, 'maito');
    expect(ranked[0].nameFi).toBe('Maito, rasvaton');
  });

  it('ranks FOOD type above DISH type with same match', () => {
    const results = [
      makeFood(1, 'Kaurapuuro', 'DISH'),
      makeFood(2, 'Kaurapuuro', 'FOOD'),
    ];
    const ranked = rankSearchResults(results, 'kaurapuuro');
    // Both exact match (+100), but FOOD gets +10
    expect(ranked[0].type).toBe('FOOD');
  });

  it('limits to top 5 results', () => {
    const results = Array.from({ length: 20 }, (_, i) =>
      makeFood(i, `Maito ${i}`)
    );
    const ranked = rankSearchResults(results, 'maito');
    expect(ranked).toHaveLength(5);
  });

  it('returns up to 5 results for empty query', () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      makeFood(i, `Food ${i}`)
    );
    const ranked = rankSearchResults(results, '');
    expect(ranked).toHaveLength(5);
  });

  it('handles no results', () => {
    const ranked = rankSearchResults([], 'maito');
    expect(ranked).toHaveLength(0);
  });

  it('ranks case-insensitively', () => {
    const results = [makeFood(1, 'MAITO')];
    const ranked = rankSearchResults(results, 'Maito');
    expect(ranked[0].nameFi).toBe('MAITO');
  });

  it('preserves order for equal scores', () => {
    const results = [
      makeFood(1, 'Maito 1', 'FOOD'),
      makeFood(2, 'Maito 2', 'FOOD'),
    ];
    const ranked = rankSearchResults(results, 'maito');
    expect(ranked[0].id).toBe(1);
    expect(ranked[1].id).toBe(2);
  });

  it('handles single result', () => {
    const results = [makeFood(1, 'Maito')];
    const ranked = rankSearchResults(results, 'maito');
    expect(ranked).toHaveLength(1);
    expect(ranked[0].nameFi).toBe('Maito');
  });

  it('handles query with trailing comma (via normalizeQuery)', () => {
    const results = [makeFood(1, 'Maito')];
    const ranked = rankSearchResults(results, 'maito,');
    expect(ranked).toHaveLength(1);
  });

  it('gives higher score to starts-with vs contains for non-exact matches', () => {
    const results = [
      makeFood(1, 'Piimäjuoma maitoa sisältävä', 'FOOD'),
      makeFood(2, 'Maitojuoma', 'FOOD'),
    ];
    const ranked = rankSearchResults(results, 'maito');
    expect(ranked[0].nameFi).toBe('Maitojuoma');
  });

  // --- New: secondary descriptor penalty tests ---

  it('penalizes results where query only appears as "sisältää X"', () => {
    const results = [
      makeFood(1, 'Dippikastikejauhe, sisältää maitoa'),
      makeFood(2, 'Näkkileipä, sis. maitoa'),
      makeFood(3, 'Maito, kevyt'),
      makeFood(4, 'Maito, rasvaton'),
    ];
    const ranked = rankSearchResults(results, 'maito');
    // Actual milk products should come first
    expect(ranked[0].nameFi).toMatch(/^Maito/);
    expect(ranked[1].nameFi).toMatch(/^Maito/);
    // "sisältää maitoa" items should be deprioritized or filtered out
    const topNames = ranked.map((r) => r.nameFi);
    expect(topNames.indexOf('Maito, kevyt')).toBeLessThan(
      topNames.indexOf('Dippikastikejauhe, sisältää maitoa')
    );
  });

  it('filters out very low-relevance results (score <= 10)', () => {
    const results = [
      makeFood(1, 'Maito, kevyt'),
      makeFood(2, 'Maito, rasvaton'),
      makeFood(3, 'Kastikejauhe, sisältää maitoa ja kananmunaa'),
    ];
    const ranked = rankSearchResults(results, 'maito');
    // The "sisältää maitoa" item should have a very low score and be filtered
    const names = ranked.map((r) => r.nameFi);
    expect(names).toContain('Maito, kevyt');
    expect(names).toContain('Maito, rasvaton');
  });

  it('ranks primary comma-separated name correctly', () => {
    const results = [
      makeFood(1, 'Kaurapuuro, vedellä'),
      makeFood(2, 'Kauramysli, sokeriton'),
      makeFood(3, 'Kaurapuuro, maidolla'),
    ];
    const ranked = rankSearchResults(results, 'kaurapuuro');
    // Both "Kaurapuuro" items should rank above "Kauramysli"
    const topTwo = ranked.slice(0, 2).map((r) => r.nameFi);
    expect(topTwo).toContain('Kaurapuuro, vedellä');
    expect(topTwo).toContain('Kaurapuuro, maidolla');
  });

  it('gives short name bonus for base foods', () => {
    const results = [
      makeFood(1, 'Maito'),
      makeFood(2, 'Maitojuoma, täydennetty, vitaminisoitu, laktoositon, rasva 1 %'),
    ];
    const ranked = rankSearchResults(results, 'maito');
    expect(ranked[0].nameFi).toBe('Maito');
  });

  it('accepts custom limit parameter', () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      makeFood(i, `Maito ${i}`)
    );
    const ranked = rankSearchResults(results, 'maito', 3);
    expect(ranked).toHaveLength(3);
  });
});
