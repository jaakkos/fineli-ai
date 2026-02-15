/**
 * Unit tests for AI ranker: createAIResultRanker, early return for 0–1 results,
 * and timeout/abort behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAIResultRanker } from '../ai-ranker';
import type { AIProvider } from '../types';
import type { FineliFood } from '@/types';

function makeFood(id: number, nameFi: string): FineliFood {
  return {
    id,
    nameFi,
    nameEn: null,
    nameSv: null,
    type: 'FOOD',
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

const MOCK_PROVIDER: AIProvider = {
  name: 'anthropic',
  parseMessage: vi.fn(),
  generateResponse: vi.fn(),
};

describe('createAIResultRanker', () => {
  it('returns a function', () => {
    const ranker = createAIResultRanker(MOCK_PROVIDER);
    expect(typeof ranker).toBe('function');
  });

  it('returns results unchanged when 0 or 1 result (no API call)', async () => {
    const ranker = createAIResultRanker(MOCK_PROVIDER);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const empty: FineliFood[] = [];
    const one = [makeFood(1, 'Maito')];

    const outEmpty = await ranker(empty, 'maito');
    const outOne = await ranker(one, 'maito');

    expect(outEmpty).toEqual([]);
    expect(outOne).toEqual(one);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});

describe('AI ranker with fetch mock', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const envRestore: Record<string, string | undefined> = {};

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    envRestore.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests';
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    if (envRestore.ANTHROPIC_API_KEY !== undefined) {
      process.env.ANTHROPIC_API_KEY = envRestore.ANTHROPIC_API_KEY;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('falls back to heuristic when fetch fails', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));

    const ranker = createAIResultRanker(MOCK_PROVIDER, {
      maxResults: 5,
    });
    const results = [
      makeFood(1, 'Maito, kevyt'),
      makeFood(2, 'Näkkileipä, sisältää maitoa'),
    ];

    const out = await ranker(results, 'maito');

    expect(out.length).toBeLessThanOrEqual(5);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('passes AbortSignal to fetch so request can be aborted on timeout', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            name: 'rank_search_results',
            input: {
              rankings: [
                { index: 1, relevance: 5 },
                { index: 2, relevance: 1 },
              ],
            },
          },
        ],
      }),
    } as Response);

    const ranker = createAIResultRanker(MOCK_PROVIDER, { maxResults: 3 });
    const results = [
      makeFood(1, 'A'),
      makeFood(2, 'B'),
      makeFood(3, 'C'),
    ];

    await ranker(results, 'query');

    expect(fetchSpy).toHaveBeenCalled();
    const callOpts = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(callOpts?.signal).toBeDefined();
  });
});
