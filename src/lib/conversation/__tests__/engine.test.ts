/**
 * Conversation engine integration tests.
 * Uses mock FineliClient and PortionConverter to test processMessage flows end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processMessage, type EngineStepResult } from '../engine';
import type { ConversationState, FineliFood, FineliUnit } from '@/types';
import { newId } from '@/types';

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
  } as any;
}

// Mock PortionConverter
function mockPortionConverter() {
  return {
    convert: vi.fn((amount: number, unit: string | null | undefined, fineliUnits: FineliUnit[]) => {
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
      if (code === 'KPL') {
        const fUnit = fineliUnits.find((u) => u.code === 'KPL_M');
        if (fUnit) {
          return { grams: fUnit.massGrams * amount, unitCode: 'KPL_M', unitLabel: fUnit.labelFi, method: 'fineli_unit' };
        }
      }
      return null;
    }),
  } as any;
}

// ---------------------------------------------------------------------------
// Fixture: common foods
// ---------------------------------------------------------------------------

const KAURAPUURO_VEDELLA = makeFood(1, 'Kaurapuuro, vedellä', [
  makeUnit('KPL_S', 150, 'pieni annos'),
  makeUnit('KPL_M', 250, 'keskikokoinen annos'),
  makeUnit('KPL_L', 400, 'iso annos'),
  makeUnit('DL', 60, 'dl'),
]);

const KAURAPUURO_MAIDOLLA = makeFood(2, 'Kaurapuuro, maidolla', [
  makeUnit('KPL_M', 300, 'annos'),
]);

const MAITO_KEVYT = makeFood(10, 'Maito, kevyt 1%', [
  makeUnit('DL', 103, 'dl'),
]);

const KANAA = makeFood(20, 'Kananpojan rintafilee, kypsä', []);

// =========================================================================
// Tests
// =========================================================================

describe('processMessage — conversation engine', () => {
  let client: ReturnType<typeof mockFineliClient>;
  let converter: ReturnType<typeof mockPortionConverter>;

  beforeEach(() => {
    client = mockFineliClient({
      'kaurapuuro': [KAURAPUURO_VEDELLA, KAURAPUURO_MAIDOLLA],
      'maito': [MAITO_KEVYT],
      'kana': [KANAA],
      'kanaa': [KANAA], // fallback for raw text
    });
    converter = mockPortionConverter();
  });

  // -----------------------------------------------------------------------
  // Adding items
  // -----------------------------------------------------------------------

  describe('add_items intent', () => {
    it('adds single item and triggers disambiguation for 2+ results', async () => {
      const state = makeState();
      const result = await processMessage('kaurapuuro', state, client, converter);

      // When disambiguation is needed, message should say "Haen tietoja" (not "Lisäsin")
      expect(result.assistantMessage).toContain('Haen tietoja');
      // 2 search results → 1 item with 2 fineliCandidates, state = DISAMBIGUATING
      expect(result.updatedState.items).toHaveLength(1);
      const item = result.updatedState.items[0];
      expect(item.rawText).toBe('kaurapuuro');
      expect(item.state).toBe('DISAMBIGUATING');
      expect(item.fineliCandidates).toHaveLength(2);
      // Should generate disambiguation question
      expect(result.updatedState.pendingQuestion).not.toBeNull();
      expect(result.updatedState.pendingQuestion?.type).toBe('disambiguation');
    });

    it('auto-resolves single result with grams', async () => {
      const state = makeState();
      const result = await processMessage('120g kanaa', state, client, converter);

      expect(client.searchFoods).toHaveBeenCalledWith('kanaa', 'fi');
      // Single result + grams → auto-resolve (rawText is 'kanaa' — regex fallback does not normalize)
      const item = result.updatedState.items.find((i) => i.rawText === 'kanaa');
      expect(item?.state).toBe('RESOLVED');
      expect(item?.portionGrams).toBe(120);
      expect(result.resolvedItems).toHaveLength(1);
      expect(result.resolvedItems[0].portionGrams).toBe(120);
    });

    it('moves to PORTIONING for single result without grams', async () => {
      const state = makeState();
      const result = await processMessage('maito', state, client, converter);

      // "maito" is already nominative, stays as "maito"
      const item = result.updatedState.items.find((i) => i.rawText === 'maito');
      expect(item?.state).toBe('PORTIONING');
      expect(result.updatedState.pendingQuestion?.type).toBe('portion');
    });

    it('handles NO_MATCH for unknown food', async () => {
      const state = makeState();
      const result = await processMessage('xyzfood', state, client, converter);

      const item = result.updatedState.items.find((i) => i.rawText === 'xyzfood');
      expect(item?.state).toBe('NO_MATCH');
      expect(result.updatedState.pendingQuestion?.type).toBe('no_match_retry');
      expect(result.assistantMessage).toContain('Fineli');
    });

    it('adds multiple items at once', async () => {
      client = mockFineliClient({
        'kana': [KANAA],
        'kanaa': [KANAA],
        'maito': [MAITO_KEVYT],
      });

      const state = makeState();
      const result = await processMessage('kanaa ja maito', state, client, converter);

      expect(result.updatedState.items.length).toBeGreaterThanOrEqual(2);
    });

    // NOTE: Compound Finnish descriptions like "kaurapuuroa maidolla ja hillolla"
    // require AI for proper parsing. The regex fallback only splits on "ja",
    // giving 2 items: ["kaurapuuroa maidolla", "hillolla"]. AI splits into 3.
    // See ai-engine.test.ts for the AI-powered compound food test.
  });

  // -----------------------------------------------------------------------
  // Disambiguation flow
  // -----------------------------------------------------------------------

  describe('disambiguation flow', () => {
    async function setupDisambiguation() {
      const state = makeState();
      const step1 = await processMessage('kaurapuuro', state, client, converter);
      expect(step1.updatedState.pendingQuestion?.type).toBe('disambiguation');
      return step1;
    }

    it('resolves disambiguation with numeric selection', async () => {
      const step1 = await setupDisambiguation();
      // User selects "1" (first option = Kaurapuuro, vedellä)
      const result = await processMessage('1', step1.updatedState, client, converter);

      const item = result.updatedState.items.find((i) => i.rawText === 'kaurapuuro');
      expect(item?.selectedFood?.nameFi).toBe('Kaurapuuro, vedellä');
      // Should move to PORTIONING since no grams given
      expect(item?.state).toBe('PORTIONING');
      expect(result.updatedState.pendingQuestion?.type).toBe('portion');
    });

    it('handles rejection (none of these)', async () => {
      const step1 = await setupDisambiguation();
      const result = await processMessage('ei mikään näistä', step1.updatedState, client, converter);

      // Item should be removed and skipped
      expect(result.assistantMessage.toLowerCase()).toContain('ohitetaan');
    });

    it('handles clarification text', async () => {
      const step1 = await setupDisambiguation();

      // Add "vesipuuro" to mock so clarification finds something
      client.searchFoods.mockImplementation(async (query: string) => {
        if (query.toLowerCase().includes('vesipuuro')) return [KAURAPUURO_VEDELLA];
        return [KAURAPUURO_VEDELLA, KAURAPUURO_MAIDOLLA];
      });

      const result = await processMessage('vesipuuro', step1.updatedState, client, converter);
      expect(client.searchFoods).toHaveBeenCalledWith('vesipuuro', 'fi');
    });

    it('handles invalid selection number', async () => {
      const step1 = await setupDisambiguation();
      // Select "99" which is out of range — but since classifyIntent sees it as answer with selection index 98
      // The engine should handle this as invalid selection
      const result = await processMessage('99', step1.updatedState, client, converter);
      expect(result.assistantMessage).toContain('Virheellinen valinta');
    });
  });

  // -----------------------------------------------------------------------
  // Portion flow
  // -----------------------------------------------------------------------

  describe('portion flow', () => {
    async function setupPortioning() {
      const state = makeState();
      // maito → single result → PORTIONING
      const step1 = await processMessage('maito', state, client, converter);
      expect(step1.updatedState.pendingQuestion?.type).toBe('portion');
      return step1;
    }

    it('resolves with weight answer', async () => {
      const step1 = await setupPortioning();
      const result = await processMessage('200g', step1.updatedState, client, converter);

      // "maito" is already nominative
      const item = result.updatedState.items.find((i) => i.rawText === 'maito');
      expect(item?.state).toBe('RESOLVED');
      expect(item?.portionGrams).toBe(200);
      expect(result.resolvedItems).toHaveLength(1);
    });

    it('resolves with volume answer', async () => {
      const step1 = await setupPortioning();
      const result = await processMessage('2 dl', step1.updatedState, client, converter);

      // The mock converter handles 'dl' → amount * 100
      const item = result.updatedState.items.find((i) => i.rawText === 'maito');
      expect(item?.state).toBe('RESOLVED');
    });

    it('resolves with portion size answer', async () => {
      const step1 = await setupPortioning();
      // "pieni" maps to KPL_S but MAITO_KEVYT only has DL unit
      // parseAnswer returns { type: 'portion_size', key: 'KPL_S' }
      // resolvePortionGrams checks food.units for KPL_S — not found on milk
      // So it returns null → engine reprompts
      const result = await processMessage('pieni', step1.updatedState, client, converter);
      // Since milk doesn't have KPL_S, this should fail and reprompt
      expect(result.assistantMessage).toContain('En ymmärtänyt määrää');
    });
  });

  // -----------------------------------------------------------------------
  // Done intent
  // -----------------------------------------------------------------------

  describe('done intent', () => {
    it('completes when all items resolved', async () => {
      const state = makeState();
      const step1 = await processMessage('120g kanaa', state, client, converter);
      // Item is auto-resolved
      expect(step1.resolvedItems).toHaveLength(1);

      const result = await processMessage('valmis', step1.updatedState, client, converter);
      expect(result.updatedState.isComplete).toBe(true);
      expect(result.assistantMessage).toContain('tallennettu');
    });

    it('warns about unresolved items', async () => {
      const state = makeState();
      // maito → PORTIONING (unresolved)
      const step1 = await processMessage('maito', state, client, converter);

      const result = await processMessage('valmis', step1.updatedState, client, converter);
      expect(result.assistantMessage).toContain('ratkaisematta');
    });
  });

  // -----------------------------------------------------------------------
  // Removal intent
  // -----------------------------------------------------------------------

  describe('removal intent', () => {
    it('removes item by name', async () => {
      const state = makeState();
      const step1 = await processMessage('120g kanaa', state, client, converter);
      expect(step1.updatedState.items).toHaveLength(1);

      // "poista kanaa" — removal pattern extracts "kanaa", which matches rawText "kana" (partial match)
      const result = await processMessage('poista kanaa', step1.updatedState, client, converter);
      expect(result.assistantMessage).toContain('Poistin');
      expect(result.updatedState.items).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Correction intent
  // -----------------------------------------------------------------------

  describe('correction intent', () => {
    it('updates portion with "vaihda 150g"', async () => {
      const state = makeState();
      // Add item with auto-resolve
      const step1 = await processMessage('120g kanaa', state, client, converter);

      // Set up state so kanaa is active (rawText stays 'kanaa' — no normalization)
      const kanaItem = step1.updatedState.items.find((i) => i.rawText === 'kanaa');
      const activeState = {
        ...step1.updatedState,
        activeItemId: kanaItem?.id ?? null,
      };

      const result = await processMessage('vaihda 150g', activeState, client, converter);
      const updated = result.updatedState.items.find((i) => i.rawText === 'kanaa');
      expect(updated?.portionGrams).toBe(150);
    });
  });

  // -----------------------------------------------------------------------
  // Unclear intent
  // -----------------------------------------------------------------------

  describe('unclear intent', () => {
    it('responds with help message when no pending question', async () => {
      const state = makeState();
      const result = await processMessage('', state, client, converter);
      expect(result.assistantMessage).toContain('Mitä söit');
    });

    it('re-asks question when pending question exists', async () => {
      const state = makeState();
      const step1 = await processMessage('maito', state, client, converter);
      // maito → PORTIONING with pending portion question

      // Send something that doesn't parse as a portion answer
      // Actually "xyz" would be classified as add_items, not unclear...
      // Let's test with truly empty input
      const result = await processMessage('', step1.updatedState, client, converter);
      // Empty string with pending portion → answer with null data → reprompt
      expect(result.assistantMessage).toContain('ymmärtänyt');
    });
  });

  // -----------------------------------------------------------------------
  // Companion flow
  // -----------------------------------------------------------------------

  describe('companion flow', () => {
    it('asks next companion after user answers "ei" to first companion', async () => {
      // Setup: kaurapuuro resolved, isComplete=true, companion question pending for maito
      const resolvedItem = {
        id: 'item-puuro',
        rawText: 'kaurapuuro',
        state: 'RESOLVED' as const,
        selectedFood: KAURAPUURO_VEDELLA,
        portionGrams: 200,
        portionUnitCode: 'G',
        portionUnitLabel: 'g',
        createdAt: 1000,
        updatedAt: 1000,
      };
      // NOTE: Engine requires activeItemId to be set for answer processing,
      // even for companion questions. This is a design quirk — companion
      // answers don't actually use activeItem, but the guard check demands it.
      const state = makeState({
        isComplete: true,
        items: [resolvedItem],
        unresolvedQueue: [],
        activeItemId: 'item-puuro', // Required for answer handler guard
        companionChecks: [],
        pendingQuestion: {
          id: 'comp-q',
          itemId: '',
          type: 'companion',
          templateKey: 'companion',
          templateParams: { primaryFood: 'Kaurapuuro, vedellä', companion: 'maito' },
          options: [
            { key: 'yes', label: 'Kyllä', value: true },
            { key: 'no', label: 'Ei', value: false },
          ],
          retryCount: 0,
          askedAt: 1000,
        },
      });

      // User says "ei" to maito companion
      const result = await processMessage('ei', state, client, converter);
      // After declining maito, companionChecks should include maito
      expect(result.updatedState.companionChecks).toContain('maito');
      // Next companion for kaurapuuro after maito is marja
      expect(result.updatedState.pendingQuestion?.type).toBe('companion');
      expect(result.assistantMessage).toContain('marja');
    });

    it('adds companion item when user says "kyllä"', async () => {
      client = mockFineliClient({
        'maito': [MAITO_KEVYT],
      });

      const resolvedItem = {
        id: 'item-puuro',
        rawText: 'kaurapuuro',
        state: 'RESOLVED' as const,
        selectedFood: KAURAPUURO_VEDELLA,
        portionGrams: 200,
        portionUnitCode: 'G',
        portionUnitLabel: 'g',
        createdAt: 1000,
        updatedAt: 1000,
      };
      const state = makeState({
        isComplete: true,
        items: [resolvedItem],
        unresolvedQueue: [],
        activeItemId: 'item-puuro', // Required for answer handler guard
        pendingQuestion: {
          id: 'comp-q',
          itemId: '',
          type: 'companion',
          templateKey: 'companion',
          templateParams: { primaryFood: 'Kaurapuuro, vedellä', companion: 'maito' },
          options: [
            { key: 'yes', label: 'Kyllä', value: true },
            { key: 'no', label: 'Ei', value: false },
          ],
          retryCount: 0,
          askedAt: 1000,
        },
      });

      const result = await processMessage('kyllä', state, client, converter);
      // Should have searched for maito and added it as an item
      expect(client.searchFoods).toHaveBeenCalledWith('maito', 'fi');
      const maitoItem = result.updatedState.items.find((i) => i.rawText === 'maito');
      expect(maitoItem).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles empty message with no state', async () => {
      const state = makeState();
      const result = await processMessage('', state, client, converter);
      expect(result.assistantMessage).toBeTruthy();
    });

    it('handles Fineli client search returning empty', async () => {
      client = mockFineliClient({}); // all searches return []
      const state = makeState();
      const result = await processMessage('kaurapuuro', state, client, converter);
      expect(result.updatedState.items[0].state).toBe('NO_MATCH');
    });

    it('preserves session and meal IDs through state transitions', async () => {
      const state = makeState({ sessionId: 'my-session', mealId: 'my-meal' });
      const result = await processMessage('120g kanaa', state, client, converter);
      expect(result.updatedState.sessionId).toBe('my-session');
      expect(result.updatedState.mealId).toBe('my-meal');
    });

    it('resolved items have computed nutrients', async () => {
      const state = makeState();
      const result = await processMessage('120g kanaa', state, client, converter);
      expect(result.resolvedItems).toHaveLength(1);
      const ri = result.resolvedItems[0];
      expect(ri.computedNutrients).toBeDefined();
      // Nutrients should be scaled: nutrientPer100g * 120 / 100
      expect(ri.computedNutrients.ENERC).toBeCloseTo(600, 0); // 500 * 120 / 100
      expect(ri.computedNutrients.FAT).toBeCloseTo(6, 0); // 5 * 120 / 100
    });

    it('removal works when no pending question', async () => {
      // Directly set up an item without pending question
      const item = {
        id: 'item-kana',
        rawText: 'kana',
        state: 'RESOLVED' as const,
        selectedFood: KANAA,
        portionGrams: 120,
        portionUnitCode: 'G',
        portionUnitLabel: 'g',
        createdAt: 1000,
        updatedAt: 1000,
      };
      const state = makeState({
        items: [item],
        activeItemId: null,
        pendingQuestion: null,
      });

      // "poista kanaa" — targetText "kanaa" includes rawText "kana"
      const removeResult = await processMessage('poista kanaa', state, client, converter);
      expect(removeResult.assistantMessage).toContain('Poistin');
      expect(removeResult.updatedState.items).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Full multi-step flow
  // -----------------------------------------------------------------------

  describe('full conversation flow', () => {
    it('add → disambiguate → select → portion → resolve → done', async () => {
      let state = makeState();

      // Step 1: User says "kaurapuuro"
      let result = await processMessage('kaurapuuro', state, client, converter);
      state = result.updatedState;
      expect(state.pendingQuestion?.type).toBe('disambiguation');

      // Step 2: User selects "1" (Kaurapuuro, vedellä)
      result = await processMessage('1', state, client, converter);
      state = result.updatedState;
      expect(state.pendingQuestion?.type).toBe('portion');

      // Step 3: User says "200g"
      result = await processMessage('200g', state, client, converter);
      state = result.updatedState;
      expect(result.resolvedItems).toHaveLength(1);
      expect(result.resolvedItems[0].portionGrams).toBe(200);
      expect(result.resolvedItems[0].fineliNameFi).toBe('Kaurapuuro, vedellä');

      // Step 4: User says "valmis"
      result = await processMessage('valmis', state, client, converter);
      state = result.updatedState;
      expect(state.isComplete).toBe(true);
    });

    it('auto-resolve → add more → done', async () => {
      let state = makeState();

      // Step 1: "120g kanaa" → auto-resolved
      let result = await processMessage('120g kanaa', state, client, converter);
      state = result.updatedState;
      expect(result.resolvedItems).toHaveLength(1);

      // Step 2: "maito" → single result, needs portion
      result = await processMessage('maito', state, client, converter);
      state = result.updatedState;
      expect(state.pendingQuestion?.type).toBe('portion');

      // Step 3: "2 dl"
      result = await processMessage('2 dl', state, client, converter);
      state = result.updatedState;
      expect(result.resolvedItems).toHaveLength(1);

      // Step 4: done
      result = await processMessage('valmis', state, client, converter);
      state = result.updatedState;
      expect(state.isComplete).toBe(true);
      expect(state.items.filter((i) => i.state === 'RESOLVED')).toHaveLength(2);
    });
  });
});
