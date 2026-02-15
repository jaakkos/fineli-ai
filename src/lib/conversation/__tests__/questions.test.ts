import { describe, it, expect } from 'vitest';
import {
  generateDisambiguationQuestion,
  generatePortionQuestion,
  generateNoMatchQuestion,
  generateCompletionMessage,
  formatConfirmation,
  formatAddedNotice,
  generateCompanionQuestion,
  generateQuestion,
} from '../questions';
import type { FineliFood, ParsedItem, FineliUnit } from '@/types';

function makeFood(id: number, nameFi: string, units: FineliUnit[] = []): FineliFood {
  return {
    id,
    nameFi,
    nameEn: null,
    nameSv: null,
    type: 'FOOD',
    preparationMethods: [],
    units,
    nutrients: {},
    energyKj: 0,
    energyKcal: 0,
    fat: 0,
    protein: 0,
    carbohydrate: 0,
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

const makeUnit = (code: string, massGrams: number, labelFi = code): FineliUnit => ({
  code,
  labelFi,
  labelEn: code,
  massGrams,
});

describe('generateDisambiguationQuestion', () => {
  it('generates numbered options message', () => {
    const item = makeItem({ rawText: 'maito' });
    const candidates = [
      makeFood(1, 'Maito, kevyt'),
      makeFood(2, 'Maito, rasvaton'),
      makeFood(3, 'Maito, täysi'),
    ];
    const { message, question } = generateDisambiguationQuestion(item, candidates);

    expect(message).toContain('"maito"');
    expect(message).toContain('1) Maito, kevyt');
    expect(message).toContain('2) Maito, rasvaton');
    expect(message).toContain('3) Maito, täysi');
    expect(message).toContain('1–3');

    expect(question.type).toBe('disambiguation');
    expect(question.itemId).toBe('item-1');
    expect(question.options).toHaveLength(3);
    expect(question.options![0].label).toBe('Maito, kevyt');
    expect(question.retryCount).toBe(0);
  });
});

describe('generatePortionQuestion', () => {
  it('shows piece sizes when available', () => {
    const food = makeFood(1, 'Omena', [
      makeUnit('KPL_S', 120, 'pieni'),
      makeUnit('KPL_M', 180, 'keskikokoinen'),
      makeUnit('KPL_L', 250, 'iso'),
    ]);
    const item = makeItem();
    const { message, question } = generatePortionQuestion(item, food);

    expect(message).toContain('pieni (120g)');
    expect(message).toContain('keskikokoinen (180g)');
    expect(message).toContain('iso (250g)');
    expect(message).toContain('grammoina');
    expect(question.type).toBe('portion');
    expect(question.options!.length).toBeGreaterThanOrEqual(3);
  });

  it('shows DL option when no piece sizes', () => {
    const food = makeFood(1, 'Maito', [
      makeUnit('DL', 103, 'dl'),
    ]);
    const item = makeItem();
    const { message } = generatePortionQuestion(item, food);

    expect(message).toContain('dl');
    expect(message).toContain('grammoina');
  });

  it('asks for grams only when no units', () => {
    const food = makeFood(1, 'Kanaa');
    const item = makeItem();
    const { message } = generatePortionQuestion(item, food);

    expect(message).toContain('grammaa');
  });
});

describe('generateNoMatchQuestion', () => {
  it('asks for clarification', () => {
    const item = makeItem({ rawText: 'xyz ruoka' });
    const { message, question } = generateNoMatchQuestion(item);

    expect(message).toContain('"xyz ruoka"');
    expect(message).toContain('Fineli');
    expect(question.type).toBe('no_match_retry');
    expect(question.itemId).toBe('item-1');
  });
});

describe('generateCompletionMessage', () => {
  it('returns Finnish completion message', () => {
    const msg = generateCompletionMessage();
    expect(msg).toContain('tallennettu');
    expect(msg).toContain('muuta');
  });
});

describe('formatConfirmation', () => {
  it('formats with portion label', () => {
    const food = makeFood(1, 'Maito, kevyt');
    const msg = formatConfirmation(food, 200, 'keskikokoinen');
    expect(msg).toBe('✓ Maito, kevyt, keskikokoinen (200g)');
  });

  it('formats without portion label (grams only)', () => {
    const food = makeFood(1, 'Kanafilee');
    const msg = formatConfirmation(food, 150);
    expect(msg).toBe('✓ Kanafilee, 150g');
  });
});

describe('formatAddedNotice', () => {
  it('formats single item', () => {
    const msg = formatAddedNotice(['maito']);
    expect(msg).toBe('Lisäsin maito listalle.');
  });

  it('formats multiple items', () => {
    const msg = formatAddedNotice(['maito', 'sokeri']);
    expect(msg).toContain('maito, sokeri');
    expect(msg).toContain('seuraavaksi');
  });
});

describe('generateCompanionQuestion', () => {
  it('generates companion question in Finnish', () => {
    const { message, question } = generateCompanionQuestion('puuro', 'maito', 'item-1');
    expect(message).toContain('maito');
    expect(message).toContain('puuro');
    expect(question.type).toBe('companion');
    expect(question.options).toHaveLength(2);
    expect(question.options![0].label).toBe('Kyllä');
    expect(question.options![1].label).toBe('Ei');
  });
});

describe('generateQuestion (router)', () => {
  it('generates disambiguation for DISAMBIGUATING state', () => {
    const item = makeItem({
      state: 'DISAMBIGUATING',
      fineliCandidates: [makeFood(1, 'A'), makeFood(2, 'B')],
    });
    const result = generateQuestion(item);
    expect(result).not.toBeNull();
    expect(result!.question.type).toBe('disambiguation');
  });

  it('generates portion for PORTIONING state', () => {
    const item = makeItem({
      state: 'PORTIONING',
      selectedFood: makeFood(1, 'Maito'),
    });
    const result = generateQuestion(item);
    expect(result).not.toBeNull();
    expect(result!.question.type).toBe('portion');
  });

  it('generates no_match for NO_MATCH state', () => {
    const item = makeItem({ state: 'NO_MATCH' });
    const result = generateQuestion(item);
    expect(result).not.toBeNull();
    expect(result!.question.type).toBe('no_match_retry');
  });

  it('returns null for PARSED state', () => {
    const item = makeItem({ state: 'PARSED' });
    expect(generateQuestion(item)).toBeNull();
  });

  it('returns null for RESOLVED state', () => {
    const item = makeItem({ state: 'RESOLVED' });
    expect(generateQuestion(item)).toBeNull();
  });

  it('returns null for DISAMBIGUATING without candidates', () => {
    const item = makeItem({ state: 'DISAMBIGUATING' });
    expect(generateQuestion(item)).toBeNull();
  });

  it('returns null for PORTIONING without selectedFood', () => {
    const item = makeItem({ state: 'PORTIONING' });
    expect(generateQuestion(item)).toBeNull();
  });
});
