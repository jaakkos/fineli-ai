/**
 * Tests for the AI-enhanced engine (processMessageWithAI).
 * Verifies that AI-parsed intents are wired directly to the engine
 * instead of being re-parsed by the regex parser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processMessageWithAI } from '../ai-engine';
import type { AIProvider, AIParseResult } from '../types';
import type { ConversationState, FineliFood, FineliUnit } from '@/types';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeFood(
  id: number,
  nameFi: string,
  units: FineliUnit[] = [],
  nutrients: Record<string, number> = { ENERC: 500, FAT: 5, PROT: 10, CHOAVL: 20 }
): FineliFood {
  return {
    id,
    nameFi,
    nameEn: null,
    nameSv: null,
    type: 'FOOD',
    preparationMethods: [],
    units,
    nutrients,
    energyKj: nutrients.ENERC ?? 0,
    energyKcal: (nutrients.ENERC ?? 0) / 4.184,
    fat: nutrients.FAT ?? 0,
    protein: nutrients.PROT ?? 0,
    carbohydrate: nutrients.CHOAVL ?? 0,
  };
}

const makeUnit = (code: string, massGrams: number, labelFi = code): FineliUnit => ({
  code,
  labelFi,
  labelEn: code,
  massGrams,
});

function makeState(overrides: Partial<ConversationState> = {}): ConversationState {
  return {
    sessionId: 'test-session',
    mealId: 'test-meal',
    items: [],
    unresolvedQueue: [],
    activeItemId: null,
    pendingQuestion: null,
    companionChecks: [],
    isComplete: false,
    language: 'fi',
    ...overrides,
  };
}

// Mock FineliClient
function mockFineliClient(searchResults: Record<string, FineliFood[]> = {}) {
  return {
    searchFoods: vi.fn(async (query: string): Promise<FineliFood[]> => {
      const normalized = query.toLowerCase().trim();
      return searchResults[normalized] ?? [];
    }),
    getFood: vi.fn(),
    getComponents: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock of FineliClient
  } as any;
}

// Mock PortionConverter
function mockPortionConverter() {
  return {
    convert: vi.fn((amount: number, unit: string | null | undefined, _fineliUnits: FineliUnit[]) => {
      if (unit === null || unit === undefined || unit === '') {
        return { grams: amount, unitCode: 'G', unitLabel: 'g', method: 'direct_grams' };
      }
      const code = unit.toUpperCase();
      if (code === 'G') {
        return { grams: amount, unitCode: 'G', unitLabel: 'g', method: 'direct_grams' };
      }
      if (code === 'DL') {
        return { grams: amount * 100, unitCode: 'DL', unitLabel: 'dl', method: 'volume_density' };
      }
      return null;
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock of PortionConverter
  } as any;
}

// Mock AI Provider
function mockAIProvider(parseResult: Partial<AIParseResult> = {}): AIProvider {
  return {
    name: 'mock-ai',
    parseMessage: vi.fn(async () => ({
      intent: 'add_items' as const,
      confidence: 0.95,
      items: [{ text: 'kaurapuuro', confidence: 0.95 }],
      ...parseResult,
    })),
    generateResponse: vi.fn(async () => ({ message: 'AI response' })),
  };
}

// Fixtures
const KAURAPUURO = makeFood(1, 'Kaurapuuro, vedellä', [
  makeUnit('KPL_M', 250, 'annos'),
]);
const MAITO = makeFood(10, 'Maito, kevyt 1%', [
  makeUnit('DL', 103, 'dl'),
]);
const HILLO = makeFood(20, 'Mansikkahillo', [
  makeUnit('KPL_M', 20, 'rkl'),
]);

// =========================================================================
// Tests
// =========================================================================

describe('processMessageWithAI — AI intent wiring', () => {
  let client: ReturnType<typeof mockFineliClient>;
  let converter: ReturnType<typeof mockPortionConverter>;

  beforeEach(() => {
    client = mockFineliClient({
      'kaurapuuro': [KAURAPUURO],
      'maito': [MAITO],
      'hillo': [HILLO],
    });
    converter = mockPortionConverter();
  });

  it('uses AI-extracted items directly instead of re-parsing with regex', async () => {
    // AI returns 3 separate items from "kaurapuuroa maidolla ja hillolla"
    const provider = mockAIProvider({
      intent: 'add_items',
      confidence: 0.95,
      items: [
        { text: 'kaurapuuro', confidence: 0.95, searchHint: 'kaurapuuro' },
        { text: 'maito', confidence: 0.9, searchHint: 'maito' },
        { text: 'hillo', confidence: 0.9, searchHint: 'hillo' },
      ],
    });

    const state = makeState();
    const result = await processMessageWithAI(
      'kaurapuuroa maidolla ja hillolla',
      state,
      client,
      converter,
      provider,
      'breakfast'
    );

    // Verify that Fineli was searched with AI-extracted terms
    expect(client.searchFoods).toHaveBeenCalledWith('kaurapuuro', 'fi');
    expect(client.searchFoods).toHaveBeenCalledWith('maito', 'fi');
    expect(client.searchFoods).toHaveBeenCalledWith('hillo', 'fi');

    // Should have 3 separate items
    expect(result.updatedState.items).toHaveLength(3);
    expect(result.aiParsed).toBe(true);
  });

  it('applies searchHints to override item text for better Fineli search', async () => {
    const provider = mockAIProvider({
      intent: 'add_items',
      confidence: 0.95,
      items: [
        { text: 'maito', confidence: 0.9, searchHint: 'maito, kevyt 1%' },
      ],
    });

    // Add the searchHint form to mock results
    client = mockFineliClient({
      'maito, kevyt 1%': [MAITO],
    });

    const state = makeState();
    const result = await processMessageWithAI(
      'maitoa',
      state,
      client,
      converter,
      provider,
      'breakfast'
    );

    // Should search with the improved hint, not the raw text
    expect(client.searchFoods).toHaveBeenCalledWith('maito, kevyt 1%', 'fi');
    expect(result.aiParsed).toBe(true);
  });

  it('falls back to regex engine when AI fails', async () => {
    const provider: AIProvider = {
      name: 'mock-failing',
      parseMessage: vi.fn(async () => {
        throw new Error('API timeout');
      }),
      generateResponse: vi.fn(async () => ({ message: '' })),
    };

    const state = makeState();
    const result = await processMessageWithAI(
      'maito',
      state,
      client,
      converter,
      provider,
      'breakfast'
    );

    // Regex parser normalizes 'maito' and searches Fineli
    expect(client.searchFoods).toHaveBeenCalledWith('maito', 'fi');
    expect(result.updatedState.items).toHaveLength(1);
    expect(result.aiParsed).toBe(false);
  });

  it('falls back to regex when AI confidence is too low', async () => {
    const provider = mockAIProvider({
      intent: 'add_items',
      confidence: 0.2, // Below threshold
      items: [{ text: 'kaurapuuro', confidence: 0.2 }],
    });

    const state = makeState();
    const result = await processMessageWithAI(
      'kaurapuuro',
      state,
      client,
      converter,
      provider,
      'breakfast'
    );

    // Should still find kaurapuuro via regex fallback
    expect(client.searchFoods).toHaveBeenCalledWith('kaurapuuro', 'fi');
    expect(result.aiParsed).toBe(false);
  });

  it('works without AI provider (null)', async () => {
    const state = makeState();
    const result = await processMessageWithAI(
      'maito',
      state,
      client,
      converter,
      null, // no AI provider
      'breakfast'
    );

    expect(result.updatedState.items).toHaveLength(1);
    expect(result.aiParsed).toBe(false);
    expect(result.aiResponse).toBe(false);
  });
});
