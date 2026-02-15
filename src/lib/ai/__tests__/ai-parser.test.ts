/**
 * Tests for the AI-enhanced parser with fallback logic.
 * Uses mock AI providers to test the parse flow without real API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWithAI } from '../ai-parser';
import type { AIProvider, AIConversationContext, AIConfig, AIParseResult } from '../types';
import type { ConversationState, PendingQuestion } from '@/types';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<AIConversationContext> = {}): AIConversationContext {
  return {
    conversationState: {
      sessionId: 'test',
      mealId: 'test-meal',
      items: [],
      unresolvedQueue: [],
      activeItemId: null,
      pendingQuestion: null,
      companionChecks: [],
      isComplete: false,
      language: 'fi',
    } as ConversationState,
    mealType: 'breakfast',
    timeOfDay: 'morning',
    resolvedItemNames: [],
    pendingQuestion: null,
    locale: 'fi',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    provider: 'anthropic',
    confidenceThreshold: 0.5,
    useAIResponses: true,
    enableSuggestions: true,
    ...overrides,
  };
}

function mockProvider(result: Partial<AIParseResult> = {}): AIProvider {
  return {
    name: 'mock',
    parseMessage: vi.fn(async () => ({
      intent: 'add_items' as const,
      confidence: 0.95,
      items: [{ text: 'kaurapuuro', confidence: 0.95 }],
      ...result,
    })),
    generateResponse: vi.fn(async () => ({ message: 'AI vastaus' })),
  };
}

function makePQ(type: PendingQuestion['type']): PendingQuestion {
  return {
    id: 'q-1',
    itemId: 'item-1',
    type,
    templateKey: type,
    templateParams: {},
    retryCount: 0,
    askedAt: Date.now(),
  };
}

// =========================================================================
// Tests
// =========================================================================

describe('parseWithAI', () => {
  describe('structured input bypass (skips AI)', () => {
    it('uses regex for numeric answer "2" with pending question', async () => {
      const provider = mockProvider();
      const pq = makePQ('disambiguation');
      const context = makeContext({ pendingQuestion: pq });

      const result = await parseWithAI('2', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('regex');
      expect(provider.parseMessage).not.toHaveBeenCalled();
      expect(result.intent.type).toBe('answer');
    });

    it('uses regex for "kyllä"', async () => {
      const provider = mockProvider();
      const pq = makePQ('companion');
      const context = makeContext({ pendingQuestion: pq });

      const result = await parseWithAI('kyllä', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('regex');
      expect(provider.parseMessage).not.toHaveBeenCalled();
    });

    it('uses regex for "valmis"', async () => {
      const provider = mockProvider();
      const context = makeContext();

      const result = await parseWithAI('valmis', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('regex');
      expect(result.intent.type).toBe('done');
    });

    it('uses regex for "120g" with portion question', async () => {
      const provider = mockProvider();
      const pq = makePQ('portion');
      const context = makeContext({ pendingQuestion: pq });

      const result = await parseWithAI('120g', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('regex');
      expect(result.intent.type).toBe('answer');
    });

    it('uses regex for "2 dl" with portion question', async () => {
      const provider = mockProvider();
      const pq = makePQ('portion');
      const context = makeContext({ pendingQuestion: pq });

      const result = await parseWithAI('2 dl', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('regex');
      expect(provider.parseMessage).not.toHaveBeenCalled();
    });

    it('uses regex for "poista kanaa" (removal)', async () => {
      const provider = mockProvider();
      const context = makeContext();

      const result = await parseWithAI('poista kanaa', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('regex');
      expect(provider.parseMessage).not.toHaveBeenCalled();
      expect(result.intent.type).toBe('removal');
    });

    it('uses regex for "vaihda 150g" (portion update)', async () => {
      const provider = mockProvider();
      const context = makeContext();

      const result = await parseWithAI('vaihda 150g', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('regex');
      expect(provider.parseMessage).not.toHaveBeenCalled();
      expect(result.intent.type).toBe('correction');
    });
  });

  describe('Finnish food text routes to AI', () => {
    it('sends Finnish food text to AI (not regex)', async () => {
      const provider = mockProvider({
        intent: 'add_items',
        confidence: 0.95,
        items: [
          { text: 'kaurapuuro', confidence: 0.95 },
          { text: 'maito', confidence: 0.9 },
          { text: 'hillo', confidence: 0.9 },
        ],
      });
      const context = makeContext();

      const result = await parseWithAI('kaurapuuroa maidolla ja hillolla', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('ai');
      expect(provider.parseMessage).toHaveBeenCalledWith(
        'kaurapuuroa maidolla ja hillolla',
        expect.anything()
      );
      const items = result.intent.data as Array<{ text: string }>;
      expect(items).toHaveLength(3);
    });

    it('sends plain food name to AI', async () => {
      const provider = mockProvider();
      const context = makeContext();

      await parseWithAI('kaurapuuro', context, {
        provider,
        config: makeConfig(),
      });

      expect(provider.parseMessage).toHaveBeenCalled();
    });

    it('sends colloquial Finnish to AI', async () => {
      const provider = mockProvider({
        intent: 'add_items',
        confidence: 0.9,
        items: [{ text: 'kahvi', confidence: 0.9, searchHint: 'kahvi' }],
      });
      const context = makeContext();

      const result = await parseWithAI('kahvit ja pullat', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('ai');
    });
  });

  describe('AI parsing with confidence', () => {
    it('uses AI result when confidence >= threshold', async () => {
      const provider = mockProvider({
        intent: 'add_items',
        confidence: 0.9,
        items: [
          {
            text: 'kaurapuuro',
            amount: 300,
            unit: 'g',
            confidence: 0.9,
            searchHint: 'kaurapuuro, vedellä',
            portionEstimateGrams: 300,
          },
        ],
      });
      const context = makeContext();

      const result = await parseWithAI(
        'söin kaurapuuroa normaalin annoksen',
        context,
        { provider, config: makeConfig() }
      );

      expect(result.source).toBe('ai');
      expect(result.intent.type).toBe('add_items');
      expect(result.aiExtras?.searchHints?.['kaurapuuro']).toBe('kaurapuuro, vedellä');
      expect(result.aiExtras?.portionEstimates?.['kaurapuuro']).toBe(300);
    });

    it('falls back to regex when confidence < threshold', async () => {
      const provider = mockProvider({
        intent: 'add_items',
        confidence: 0.3, // Below default 0.5 threshold
        items: [{ text: 'jotain', confidence: 0.3 }],
      });
      const context = makeContext();

      const result = await parseWithAI('jotain epäselvää', context, {
        provider,
        config: makeConfig({ confidenceThreshold: 0.5 }),
      });

      expect(result.source).toBe('regex');
    });

    it('falls back to regex when AI throws error', async () => {
      const provider: AIProvider = {
        name: 'mock-error',
        parseMessage: vi.fn(async () => {
          throw new Error('API timeout');
        }),
        generateResponse: vi.fn(async () => ({ message: '' })),
      };
      const context = makeContext();

      const result = await parseWithAI('kaurapuuro', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('regex');
      expect(result.intent.type).toBe('add_items');
    });
  });

  describe('AI intent mapping', () => {
    it('maps add_items with search hints', async () => {
      const provider = mockProvider({
        intent: 'add_items',
        confidence: 0.95,
        items: [
          { text: 'maito', confidence: 0.9, searchHint: 'maito, kevyt 1%' },
          { text: 'leipä', confidence: 0.85, searchHint: 'ruisleipä' },
        ],
      });
      const context = makeContext();

      const result = await parseWithAI('maitoa ja leipää', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('ai');
      expect(result.intent.type).toBe('add_items');
      // Items should use searchHint as text (for better Fineli search)
      const items = result.intent.data as Array<{ text: string }>;
      expect(items[0].text).toBe('maito, kevyt 1%');
      expect(items[1].text).toBe('ruisleipä');
    });

    it('maps answer with selection', async () => {
      const provider = mockProvider({
        intent: 'answer',
        confidence: 0.95,
        answer: { type: 'selection', index: 1 },
      });
      const pq = makePQ('disambiguation');
      const context = makeContext({ pendingQuestion: pq });

      // Need a non-simple message to reach AI
      const result = await parseWithAI('toinen vaihtoehto', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('ai');
      expect(result.intent.type).toBe('answer');
    });

    it('maps correction intent', async () => {
      const provider = mockProvider({
        intent: 'correction',
        confidence: 0.9,
        correction: { type: 'correction', newText: 'lohi' },
      });
      const context = makeContext();

      const result = await parseWithAI('ai niin tarkoitin lohta', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('ai');
      expect(result.intent.type).toBe('correction');
    });

    it('maps removal intent', async () => {
      const provider = mockProvider({
        intent: 'removal',
        confidence: 0.9,
        removal: { targetText: 'maito' },
      });
      const context = makeContext();

      const result = await parseWithAI('ota pois se maito', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('ai');
      expect(result.intent.type).toBe('removal');
    });

    it('maps done intent', async () => {
      const provider = mockProvider({
        intent: 'done',
        confidence: 0.95,
      });
      const context = makeContext();

      const result = await parseWithAI('ei mulla ollu muuta', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('ai');
      expect(result.intent.type).toBe('done');
    });

    it('maps unclear intent', async () => {
      const provider = mockProvider({
        intent: 'unclear',
        confidence: 0.8,
      });
      const context = makeContext();

      const result = await parseWithAI('mikä on elämän tarkoitus', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.source).toBe('ai');
      expect(result.intent.type).toBe('unclear');
    });
  });

  describe('portion estimates from AI', () => {
    it('passes portion estimates through aiExtras', async () => {
      const provider = mockProvider({
        intent: 'add_items',
        confidence: 0.9,
        items: [
          {
            text: 'kaurapuuro',
            confidence: 0.9,
            portionEstimateGrams: 300,
          },
          {
            text: 'kahvi',
            confidence: 0.85,
            portionEstimateGrams: 200,
          },
        ],
      });
      const context = makeContext();

      const result = await parseWithAI('puuroa ja kahvia', context, {
        provider,
        config: makeConfig(),
      });

      expect(result.aiExtras?.portionEstimates?.['kaurapuuro']).toBe(300);
      expect(result.aiExtras?.portionEstimates?.['kahvi']).toBe(200);
    });
  });
});
