import { describe, it, expect } from 'vitest';
import { checkCompanions, FOOD_COMPANIONS } from '../companions';

describe('FOOD_COMPANIONS', () => {
  it('has companions for puuro', () => {
    expect(FOOD_COMPANIONS['puuro']).toContain('maito');
    expect(FOOD_COMPANIONS['puuro']).toContain('hunaja');
  });

  it('has companions for kahvi', () => {
    expect(FOOD_COMPANIONS['kahvi']).toContain('maito');
    expect(FOOD_COMPANIONS['kahvi']).toContain('sokeri');
  });

  it('has companions for leipä', () => {
    expect(FOOD_COMPANIONS['leipä']).toContain('voi');
    expect(FOOD_COMPANIONS['leipä']).toContain('juusto');
  });

  it('has companions for kaurapuuro', () => {
    expect(FOOD_COMPANIONS['kaurapuuro']).toContain('maito');
    expect(FOOD_COMPANIONS['kaurapuuro']).toContain('marja');
  });
});

describe('checkCompanions', () => {
  it('suggests maito for puuro', () => {
    const result = checkCompanions(['Puuro, kaurahiutale'], []);
    expect(result).not.toBeNull();
    expect(result!.companion).toBe('maito');
  });

  it('suggests maito for kaurapuuro', () => {
    const result = checkCompanions(['Kaurapuuro'], []);
    expect(result).not.toBeNull();
    expect(result!.companion).toBe('maito');
  });

  it('skips already-resolved companions', () => {
    // If maito is already in resolved items, skip it
    const result = checkCompanions(['Kaurapuuro', 'Maito'], []);
    // maito is resolved, so next companion should be marja
    expect(result).not.toBeNull();
    expect(result!.companion).toBe('marja');
  });

  it('skips already-checked companions', () => {
    const result = checkCompanions(['Kaurapuuro'], ['maito']);
    // maito was already asked, next should be marja
    expect(result).not.toBeNull();
    expect(result!.companion).toBe('marja');
  });

  it('returns null when all companions are resolved or checked', () => {
    const result = checkCompanions(
      ['Kaurapuuro', 'Maito', 'Marja', 'Hunaja'],
      []
    );
    // All of kaurapuuro's companions (maito, marja, hunaja) are in resolved items
    expect(result).toBeNull();
  });

  it('returns null for food with no companions', () => {
    const result = checkCompanions(['Broileri'], []);
    expect(result).toBeNull();
  });

  it('returns null for empty resolved items', () => {
    const result = checkCompanions([], []);
    expect(result).toBeNull();
  });

  it('suggests companion for kahvi', () => {
    const result = checkCompanions(['Kahvi, suodatin'], []);
    expect(result).not.toBeNull();
    expect(result!.companion).toBe('maito');
    expect(result!.primaryFood).toBe('Kahvi, suodatin');
  });

  it('suggests voi for leipä', () => {
    const result = checkCompanions(['Leipä, ruisleipä'], []);
    expect(result).not.toBeNull();
    expect(result!.companion).toBe('voi');
  });

  it('case-insensitive base food matching', () => {
    const result = checkCompanions(['KAHVI'], []);
    expect(result).not.toBeNull();
    expect(result!.companion).toBe('maito');
  });
});
