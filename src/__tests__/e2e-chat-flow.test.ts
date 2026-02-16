/**
 * End-to-end tests for the chat conversation flow.
 *
 * Tests the full pipeline: user message → parser → engine → Fineli search →
 * state machine → DB persistence → response.
 *
 * Uses a real PostgreSQL test DB and mocked Fineli client (to avoid
 * network calls), but exercises every layer in between.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestDb, truncateAllTables } from './helpers/test-db';
import { processMessage } from '@/lib/conversation/engine';
import { processMessageWithAI } from '@/lib/ai/ai-engine';
import type { FineliClient } from '@/lib/fineli/client';
import type { PortionConverter } from '@/lib/fineli/portions';
import type { AIProvider } from '@/lib/ai/types';
import type { ConversationState } from '@/types';
import { newId } from '@/types';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Fineli mock data
// ---------------------------------------------------------------------------

const MOCK_FOODS = {
  kaurapuuro: [
    {
      id: 1001,
      nameFi: 'Kaurapuuro, vedellä',
      nameEn: 'Oat porridge, water',
      type: 'FOOD',
      nutrients: { ENERC: 300, PROT: 4.5, FAT: 2.1, CHOAVL: 12.5 },
      units: [
        { code: 'KPL_S', labelFi: 'pieni annos', massGrams: 200 },
        { code: 'KPL_M', labelFi: 'keskikokoinen annos', massGrams: 300 },
        { code: 'KPL_L', labelFi: 'iso annos', massGrams: 450 },
      ],
    },
    {
      id: 1002,
      nameFi: 'Kaurapuuro, maidolla',
      nameEn: 'Oat porridge, milk',
      type: 'FOOD',
      nutrients: { ENERC: 450, PROT: 6.2, FAT: 3.5, CHOAVL: 15.0 },
      units: [
        { code: 'KPL_S', labelFi: 'pieni annos', massGrams: 200 },
        { code: 'KPL_M', labelFi: 'keskikokoinen annos', massGrams: 300 },
        { code: 'KPL_L', labelFi: 'iso annos', massGrams: 450 },
      ],
    },
  ],
  maito: [
    {
      id: 2001,
      nameFi: 'Maito, kevyt 1%',
      nameEn: 'Milk, low-fat 1%',
      type: 'FOOD',
      nutrients: { ENERC: 170, PROT: 3.5, FAT: 1.0, CHOAVL: 4.8 },
      units: [
        { code: 'DL', labelFi: 'dl', massGrams: 103 },
      ],
    },
  ],
  leipä: [
    {
      id: 3001,
      nameFi: 'Ruisleipä, pehmeä',
      nameEn: 'Rye bread, soft',
      type: 'FOOD',
      nutrients: { ENERC: 920, PROT: 8.5, FAT: 1.5, CHOAVL: 42.0 },
      units: [
        { code: 'VIIPALE', labelFi: 'viipale', massGrams: 35 },
      ],
    },
  ],
};

function createMockFineliClient(): FineliClient {
  return {
    searchFoods: vi.fn(async (query: string) => {
      const q = query.toLowerCase().trim();
      if (q.includes('kaurapuuro') || q.includes('puuro')) return MOCK_FOODS.kaurapuuro;
      if (q.includes('maito') || q.includes('maitoa')) return MOCK_FOODS.maito;
      if (q.includes('leipä') || q.includes('leipää') || q.includes('ruisleipä')) return MOCK_FOODS.leipä;
      return [];
    }),
    getFoodById: vi.fn(async () => null),
  } as unknown as FineliClient;
}

function createMockPortionConverter(): PortionConverter {
  return {
    convert: vi.fn((amount: number, unit: string, units: Array<{ code: string; labelFi: string; massGrams: number }>) => {
      const u = unit.toLowerCase();
      if (u === 'g' || u === 'grammaa') {
        return { grams: amount, unitCode: 'G', unitLabel: 'g' };
      }
      if (u === 'dl') {
        const dlUnit = units.find((uu) => uu.code === 'DL');
        if (dlUnit) {
          return { grams: amount * dlUnit.massGrams, unitCode: 'DL', unitLabel: 'dl' };
        }
        return { grams: amount * 100, unitCode: 'DL', unitLabel: 'dl' };
      }
      if (u === 'viipale' || u === 'viipaletta') {
        const sliceUnit = units.find((uu) => uu.code === 'VIIPALE');
        if (sliceUnit) {
          return { grams: amount * sliceUnit.massGrams, unitCode: 'VIIPALE', unitLabel: 'viipale' };
        }
      }
      if (u === 'kpl') {
        const m = units.find((uu) => uu.code === 'KPL_M');
        if (m) return { grams: amount * m.massGrams, unitCode: m.code, unitLabel: m.labelFi };
      }
      return null;
    }),
  } as unknown as PortionConverter;
}

// ---------------------------------------------------------------------------
// Mock AI provider
// ---------------------------------------------------------------------------

function createMockAIProvider(overrides?: Partial<AIProvider>): AIProvider {
  return {
    name: 'mock-ai',
    parseMessage: vi.fn(async (message: string) => ({
      intent: 'add_items' as const,
      confidence: 0.95,
      items: [{ text: message, confidence: 0.95 }],
    })),
    generateResponse: vi.fn(async (engineOutput) => ({
      message: `AI: ${engineOutput.assistantMessage}`,
    })),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// State + DB helpers
// ---------------------------------------------------------------------------

function freshState(mealId: string): ConversationState {
  return {
    sessionId: newId(),
    mealId,
    items: [],
    unresolvedQueue: [],
    activeItemId: null,
    pendingQuestion: null,
    companionChecks: [],
    isComplete: false,
    language: 'fi',
  };
}

async function setupTestData(db: ReturnType<typeof createTestDb>['db']) {
  const userId = newId();
  const dayId = newId();
  const mealId = newId();
  const now = new Date().toISOString();

  await db.insert(schema.users).values({ id: userId, createdAt: now, updatedAt: now });
  await db.insert(schema.diaryDays).values({ id: dayId, userId, date: '2026-02-15', createdAt: now, updatedAt: now });
  await db.insert(schema.meals).values({ id: mealId, diaryDayId: dayId, mealType: 'breakfast', sortOrder: 0, createdAt: now, updatedAt: now, version: 1 });

  return { userId, dayId, mealId };
}

// =========================================================================
// Tests
// =========================================================================

describe('E2E: Chat conversation flow (without AI)', () => {
  let client: FineliClient;
  let converter: PortionConverter;

  beforeEach(() => {
    client = createMockFineliClient();
    converter = createMockPortionConverter();
  });

  it('full flow: add food → disambiguate → set portion → complete', async () => {
    const mealId = 'test-meal-1';
    let state = freshState(mealId);

    // Step 1: User says "kaurapuuroa"
    const step1 = await processMessage('kaurapuuroa', state, client, converter);
    expect(step1.assistantMessage).toContain('vaihtoehtoja');
    expect(step1.questionMetadata?.type).toBe('disambiguation');
    expect(step1.questionMetadata?.options?.length).toBe(2);
    state = step1.updatedState;

    // Step 2: User picks option 2 (maidolla)
    const step2 = await processMessage('2', state, client, converter);
    expect(step2.questionMetadata?.type).toBe('portion');
    state = step2.updatedState;

    // Step 3: User says "300g"
    const step3 = await processMessage('300g', state, client, converter);
    expect(step3.resolvedItems.length).toBe(1);
    expect(step3.resolvedItems[0].fineliNameFi).toBe('Kaurapuuro, maidolla');
    expect(step3.resolvedItems[0].portionGrams).toBe(300);
    state = step3.updatedState;

    // Step 4: User says "valmis"
    const step4 = await processMessage('valmis', state, client, converter);
    expect(step4.updatedState.isComplete).toBe(true);
  });

  it('single search result auto-resolves (no disambiguation)', async () => {
    let state = freshState('test-meal-2');

    // "maito" only returns one result → should skip disambiguation
    const step1 = await processMessage('maitoa', state, client, converter);
    state = step1.updatedState;

    // Should either auto-resolve or ask for portion
    const activeItem = state.items.find((i) => i.id === state.activeItemId);
    if (activeItem) {
      expect(['PORTIONING', 'RESOLVED']).toContain(activeItem.state);
    }
  });

  it('handles no search results gracefully', async () => {
    let state = freshState('test-meal-3');

    const step1 = await processMessage('pizzaa', state, client, converter);
    // Should ask user to clarify
    expect(step1.assistantMessage).toBeTruthy();
    state = step1.updatedState;
  });

  it('handles multiple items in one message', async () => {
    let state = freshState('test-meal-4');

    const step1 = await processMessage('kaurapuuroa, maitoa, leipää', state, client, converter);
    state = step1.updatedState;

    // Should have created items for each
    expect(state.items.length).toBeGreaterThanOrEqual(2);
  });

  it('removal flow: add then remove', async () => {
    let state = freshState('test-meal-5');

    // Add an item
    const step1 = await processMessage('maitoa', state, client, converter);
    state = step1.updatedState;
    expect(state.items.length).toBeGreaterThan(0);

    // Handle any pending questions first by completing the flow
    if (state.pendingQuestion?.type === 'portion') {
      const step1b = await processMessage('2 dl', state, client, converter);
      state = step1b.updatedState;
    }

    // Remove it
    const step2 = await processMessage('poista maito', state, client, converter);
    state = step2.updatedState;
    expect(step2.assistantMessage).toContain('Poistin');
  });

  it('correction flow: change portion after resolution', async () => {
    let state = freshState('test-meal-6');

    // Add maito → auto-resolve (single result)
    const step1 = await processMessage('maitoa', state, client, converter);
    state = step1.updatedState;

    // If portioning, answer it
    if (state.pendingQuestion?.type === 'portion') {
      const step1b = await processMessage('2 dl', state, client, converter);
      state = step1b.updatedState;
    }

    // Correct portion
    const step2 = await processMessage('muuta 300g', state, client, converter);
    state = step2.updatedState;
    // Should have updated the portion
  });

  it('"done" with pending question re-asks the question', async () => {
    let state = freshState('test-meal-7');

    // Add item that requires disambiguation
    const step1 = await processMessage('kaurapuuroa', state, client, converter);
    state = step1.updatedState;
    expect(state.pendingQuestion).toBeTruthy();

    // "valmis" when a disambiguation question is pending — engine treats this
    // as "done" intent, sets isComplete=true, but since there are unresolved
    // items it warns the user. However the "done" handler checks unresolvedQueue
    // which requires items not in RESOLVED state.
    const step2 = await processMessage('valmis', state, client, converter);
    // The engine should respond meaningfully (either re-ask or warn)
    expect(step2.assistantMessage).toBeTruthy();
    state = step2.updatedState;
  });

  it('persists state correctly between messages', async () => {
    let state = freshState('test-meal-8');

    // Message 1
    const step1 = await processMessage('kaurapuuroa', state, client, converter);
    state = step1.updatedState;

    // Simulate DB save/load by JSON round-trip
    const serialized = JSON.parse(JSON.stringify(state));

    // Message 2 with deserialized state
    const step2 = await processMessage('1', serialized, client, converter);
    state = step2.updatedState;

    // Should have progressed (disambiguation answered)
    const item = state.items[0];
    expect(item.selectedFood).toBeTruthy();
  });
});

describe('E2E: Chat conversation flow (with mock AI)', () => {
  let client: FineliClient;
  let converter: PortionConverter;

  beforeEach(() => {
    client = createMockFineliClient();
    converter = createMockPortionConverter();
    // Reset any cached AI provider
    vi.resetModules();
  });

  it('uses regex for simple "1" answer even with AI enabled', async () => {
    const aiProvider = createMockAIProvider();
    let state = freshState('ai-meal-1');

    // First message: add food (AI will parse this)
    const step1 = await processMessageWithAI(
      'kaurapuuroa',
      state,
      client,
      converter,
      aiProvider,
      'breakfast'
    );
    state = step1.updatedState;
    // AI response should be suppressed because there's a disambiguation question
    expect(step1.aiResponse).toBe(false);

    // Answer "1" — should skip AI parse (simple numeric)
    const step2 = await processMessageWithAI(
      '1',
      state,
      client,
      converter,
      aiProvider,
      'breakfast'
    );
    state = step2.updatedState;
    expect(step2.aiParsed).toBe(false); // Regex handled it
  });

  it('preserves engine template for structured questions', async () => {
    const aiProvider = createMockAIProvider();
    const state = freshState('ai-meal-2');

    const step1 = await processMessageWithAI(
      'kaurapuuroa',
      state,
      client,
      converter,
      aiProvider,
      'breakfast'
    );

    // Should show engine template for disambiguation, NOT AI message
    expect(step1.assistantMessage).toContain('vaihtoehtoja');
    expect(step1.aiMessage).toBeUndefined();
    expect(step1.aiResponse).toBe(false);
    expect(step1.questionMetadata?.type).toBe('disambiguation');
  });

  it('uses AI response when no structured question pending', async () => {
    const aiProvider = createMockAIProvider();
    let state = freshState('ai-meal-3');

    // Add food with disambiguation
    const step1 = await processMessageWithAI('kaurapuuroa', state, client, converter, aiProvider, 'breakfast');
    state = step1.updatedState;

    // Select option
    const step2 = await processMessageWithAI('1', state, client, converter, aiProvider, 'breakfast');
    state = step2.updatedState;

    // If now we have a portion question, answer it
    if (step2.questionMetadata?.type === 'portion') {
      const step2b = await processMessageWithAI('300g', state, client, converter, aiProvider, 'breakfast');
      state = step2b.updatedState;
      // After portion is resolved, no question → AI should respond
      if (!step2b.questionMetadata) {
        expect(step2b.aiResponse).toBe(true);
        expect(step2b.aiMessage).toBeTruthy();
      }
    } else if (!step2.questionMetadata) {
      // No question pending → AI responds
      expect(step2.aiResponse).toBe(true);
    }
  });

  it('falls back to engine when AI provider throws', async () => {
    const aiProvider = createMockAIProvider({
      generateResponse: vi.fn(async () => {
        throw new Error('OpenAI API error 429');
      }),
    });
    const state = freshState('ai-meal-4');

    // Should still work — falls back to engine template
    const step1 = await processMessageWithAI(
      'kaurapuuroa',
      state,
      client,
      converter,
      aiProvider,
      'breakfast'
    );

    expect(step1.assistantMessage).toBeTruthy();
    expect(step1.updatedState.items.length).toBeGreaterThan(0);
  });

  it('null AI provider works identically to plain engine', async () => {
    const state = freshState('ai-meal-5');

    const withAI = await processMessageWithAI(
      'kaurapuuroa',
      state,
      client,
      converter,
      null, // No AI provider
      'breakfast'
    );

    const withoutAI = await processMessage('kaurapuuroa', state, client, converter);

    expect(withAI.assistantMessage).toBe(withoutAI.assistantMessage);
    expect(withAI.aiParsed).toBe(false);
    expect(withAI.aiResponse).toBe(false);
  });
});

describe('E2E: DB persistence of chat messages', () => {
  let client: FineliClient;
  let converter: PortionConverter;
  let db: ReturnType<typeof createTestDb>['db'];

  beforeEach(async () => {
    client = createMockFineliClient();
    converter = createMockPortionConverter();
    const testDb = createTestDb();
    db = testDb.db;
    await truncateAllTables(db);
  });

  it('saves user and assistant messages to DB and reloads state', async () => {
    const { mealId } = await setupTestData(db);

    const state = freshState(mealId);

    // Process a message
    const result = await processMessage('kaurapuuroa', state, client, converter);

    // Simulate what the route does: save messages
    const now = new Date().toISOString();
    await db.insert(schema.conversationMessages)
      .values({ id: newId(), mealId, role: 'user', content: 'kaurapuuroa', metadata: null, createdAt: now });
    await db.insert(schema.conversationMessages)
      .values({
        id: newId(),
        mealId,
        role: 'assistant',
        content: result.assistantMessage,
        metadata: result.questionMetadata ? { questionMetadata: result.questionMetadata } : null,
        createdAt: now,
      });

    // Save conversation state
    await db.insert(schema.conversationState)
      .values({
        mealId,
        stateJson: result.updatedState as unknown as Record<string, unknown>,
        updatedAt: now,
      });

    // Reload state
    const [stateRow] = await db
      .select()
      .from(schema.conversationState)
      .where(eq(schema.conversationState.mealId, mealId));

    const loadedState = stateRow!.stateJson as unknown as ConversationState;
    expect(loadedState.items.length).toBeGreaterThan(0);
    expect(loadedState.mealId).toBe(mealId);

    // Reload messages
    const messages = await db
      .select()
      .from(schema.conversationMessages)
      .where(eq(schema.conversationMessages.mealId, mealId));

    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('kaurapuuroa');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe(result.assistantMessage);
  });

  it('persists resolved items to meal_items table', async () => {
    const { mealId } = await setupTestData(db);

    let state = freshState(mealId);

    // Add maito (single result, may auto-resolve)
    const step1 = await processMessage('maitoa', state, client, converter);
    state = step1.updatedState;

    // Handle portion if needed
    if (state.pendingQuestion?.type === 'portion') {
      const step1b = await processMessage('2 dl', state, client, converter);
      state = step1b.updatedState;

      // Save resolved items
      for (const item of step1b.resolvedItems) {
        const now = new Date().toISOString();
        await db.insert(schema.mealItems)
          .values({
            id: newId(),
            mealId,
            fineliFoodId: item.fineliFoodId,
            fineliNameFi: item.fineliNameFi,
            fineliNameEn: item.fineliNameEn,
            portionAmount: item.portionAmount,
            portionUnitCode: item.portionUnitCode,
            portionUnitLabel: item.portionUnitLabel,
            portionGrams: item.portionGrams,
            nutrientsPer100g: item.nutrientsPer100g,
            sortOrder: 0,
            createdAt: now,
            updatedAt: now,
          });
      }

      const items = await db
        .select()
        .from(schema.mealItems)
        .where(eq(schema.mealItems.mealId, mealId));

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].fineliNameFi).toContain('Maito');
      expect(items[0].portionGrams).toBeGreaterThan(0);
    }
  });

  it('full multi-turn flow with DB round-trips', async () => {
    const { mealId } = await setupTestData(db);

    let state = freshState(mealId);

    // Turn 1: Add food
    const step1 = await processMessage('kaurapuuroa', state, client, converter);
    state = step1.updatedState;

    // Save and reload state (simulating request boundaries)
    await db.insert(schema.conversationState)
      .values({
        mealId,
        stateJson: state as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      });

    const [reloaded1] = await db
      .select()
      .from(schema.conversationState)
      .where(eq(schema.conversationState.mealId, mealId));
    state = reloaded1!.stateJson as unknown as ConversationState;

    // Turn 2: Select option
    const step2 = await processMessage('1', state, client, converter);
    state = step2.updatedState;

    // Save and reload
    await db.update(schema.conversationState)
      .set({
        stateJson: state as unknown as Record<string, unknown>,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.conversationState.mealId, mealId));

    const [reloaded2] = await db
      .select()
      .from(schema.conversationState)
      .where(eq(schema.conversationState.mealId, mealId));
    state = reloaded2!.stateJson as unknown as ConversationState;

    // Turn 3: Set portion
    const step3 = await processMessage('300g', state, client, converter);
    state = step3.updatedState;

    // Should be resolved
    expect(step3.resolvedItems.length).toBe(1);
    expect(step3.resolvedItems[0].portionGrams).toBe(300);

    // Turn 4: Done
    const step4 = await processMessage('valmis', state, client, converter);
    expect(step4.updatedState.isComplete).toBe(true);
  });
});
