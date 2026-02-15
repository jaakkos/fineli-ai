/**
 * AI-powered search result ranker for Fineli foods.
 *
 * Problem: Fineli's text search returns items where the query appears ANYWHERE
 * in the name — e.g. searching "maito" returns "Dippikastikejauhe, sisältää maitoa".
 * The heuristic ranker in search.ts handles common cases, but AI can do better
 * by understanding what the user actually meant.
 *
 * This module provides an AI reranking step that filters Fineli results to only
 * show foods that are genuinely what the user was looking for.
 */

import type { FineliFood } from '@/types';
import type { AIProvider } from './types';
import { getAnthropicApiKey, getOpenAIApiKey, getAIConfig } from './config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResultRanker = (
  results: FineliFood[],
  query: string
) => Promise<FineliFood[]>;

interface RankedResult {
  /** 0-based index into the original results array */
  index: number;
  /** 1-5 relevance score (5 = exact match, 1 = not relevant) */
  relevance: number;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function buildRankingPrompt(query: string, candidates: string[]): string {
  const list = candidates
    .map((name, i) => `${i + 1}. ${name}`)
    .join('\n');

  return `Käyttäjä etsii ruoka-ainetta: "${query}"

Fineli-tietokannasta löytyi nämä tulokset:
${list}

Arvioi JOKAINEN tulos: onko se OIKEASTI sitä mitä käyttäjä etsii?

Esimerkiksi:
- Jos käyttäjä etsii "maito", niin "Maito, kevyt" on relevantti (5), mutta "Näkkileipä, sisältää maitoa" EI ole (1).
- Jos käyttäjä etsii "kaurapuuro", niin "Kaurapuuro, vedellä" on relevantti (5), mutta "Kauramysli" on vähemmän relevantti (2).
- Jos käyttäjä etsii "kana", niin "Kana, rintafilee" on relevantti (5), mutta "Kanakeitto" on kohtalaisen relevantti (3).

Anna jokaiselle tulokselle relevanssiarvio 1-5:
5 = juuri tätä käyttäjä etsii (esim. "maito" → "Maito, kevyt")
4 = hyvin relevantti variantti (esim. "maito" → "Maito, rasvaton")
3 = liittyy mutta eri ruoka (esim. "maito" → "Maitojuoma")
2 = heikosti relevantti (esim. "maito" → "Maitosuklaalevy")
1 = ei relevantti (esim. "maito" → "Näkkileipä, sisältää maitoa")`;
}

// ---------------------------------------------------------------------------
// Tool definition for structured output
// ---------------------------------------------------------------------------

const RANK_TOOL = {
  name: 'rank_search_results',
  description: 'Arvioi hakutulosten relevanssi käyttäjän hakuun nähden.',
  input_schema: {
    type: 'object' as const,
    properties: {
      rankings: {
        type: 'array',
        description: 'Jokaisen tuloksen relevanssiarvio',
        items: {
          type: 'object',
          properties: {
            index: {
              type: 'integer',
              description: 'Tuloksen numero (1-pohjainen)',
            },
            relevance: {
              type: 'integer',
              description: 'Relevanssi 1-5 (5 = erittäin relevantti)',
              minimum: 1,
              maximum: 5,
            },
          },
          required: ['index', 'relevance'],
        },
      },
    },
    required: ['rankings'],
  },
};

const RANK_FUNCTION_OPENAI = {
  name: 'rank_search_results',
  description: 'Rate relevance of search results to user query.',
  parameters: RANK_TOOL.input_schema,
};

// ---------------------------------------------------------------------------
// AI Ranking
// ---------------------------------------------------------------------------

/**
 * Use AI to rerank Fineli search results by actual relevance.
 *
 * Returns only results with relevance >= minRelevance, ordered by score.
 * Falls back to returning all results unchanged if AI fails.
 */
async function rankWithAI(
  provider: AIProvider,
  results: FineliFood[],
  query: string,
  options: { minRelevance?: number; maxResults?: number; timeoutMs?: number } = {}
): Promise<FineliFood[]> {
  const { minRelevance = 3, maxResults = 5, timeoutMs = 4000 } = options;

  if (results.length <= 1) return results;

  // Build candidate list (cap at 15 to keep prompt small)
  const candidateLimit = 15;
  const candidates = results.slice(0, candidateLimit);
  const candidateNames = candidates.map((f) => f.nameFi);
  const prompt = buildRankingPrompt(query, candidateNames);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const ranked = await Promise.race([
      callRanking(provider, prompt, controller.signal).finally(() =>
        clearTimeout(timeoutId)
      ),
      new Promise<RankedResult[] | null>((resolve) =>
        setTimeout(() => {
          controller.abort();
          clearTimeout(timeoutId);
          resolve(null);
        }, timeoutMs)
      ),
    ]);

    if (!ranked || ranked.length === 0) {
      return results.slice(0, maxResults);
    }

    // Filter by minimum relevance and sort by score
    const relevant = ranked
      .filter((r) => r.relevance >= minRelevance && r.index >= 0 && r.index < candidates.length)
      .sort((a, b) => b.relevance - a.relevance);

    if (relevant.length === 0) {
      // AI says nothing is relevant — return top 1 as fallback
      return results.slice(0, 1);
    }

    return relevant.slice(0, maxResults).map((r) => candidates[r.index]);
  } catch (error) {
    console.warn('[AI Ranker] Failed, using heuristic fallback:', error);
    return results.slice(0, maxResults);
  }
}

/**
 * Call the AI provider for ranking. Supports both Anthropic and OpenAI.
 * Pass signal to abort the request when a timeout wins.
 */
async function callRanking(
  provider: AIProvider,
  prompt: string,
  signal?: AbortSignal
): Promise<RankedResult[]> {
  if (provider.name === 'anthropic') {
    return callAnthropicRanking(prompt, signal);
  } else if (provider.name === 'openai') {
    return callOpenAIRanking(prompt, signal);
  }

  throw new Error(`Unsupported provider for ranking: ${provider.name}`);
}

async function callAnthropicRanking(
  prompt: string,
  signal?: AbortSignal
): Promise<RankedResult[]> {
  const apiKey = getAnthropicApiKey();
  const config = getAIConfig();
  const model = config.parseModel ?? 'claude-sonnet-4-20250514';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      system: 'Olet hakutulosten relevanssin arvioija. Käytä AINA rank_search_results-työkalua.',
      messages: [{ role: 'user', content: prompt }],
      tools: [RANK_TOOL],
      tool_choice: { type: 'tool', name: 'rank_search_results' },
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic ranking API error: ${res.status}`);
  }

  const data = await res.json();
  const toolUse = data.content?.find(
    (b: Record<string, unknown>) => b.type === 'tool_use' && b.name === 'rank_search_results'
  );

  if (!toolUse?.input?.rankings) return [];

  return (toolUse.input.rankings as Array<{ index: number; relevance: number }>).map(
    (r) => ({
      index: r.index - 1, // Convert 1-based to 0-based
      relevance: r.relevance,
    })
  );
}

async function callOpenAIRanking(
  prompt: string,
  signal?: AbortSignal
): Promise<RankedResult[]> {
  const apiKey = getOpenAIApiKey();
  const config = getAIConfig();
  const model = config.parseModel ?? 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    signal,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        { role: 'system', content: 'Olet hakutulosten relevanssin arvioija.' },
        { role: 'user', content: prompt },
      ],
      functions: [RANK_FUNCTION_OPENAI],
      function_call: { name: 'rank_search_results' },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI ranking API error: ${res.status}`);
  }

  const data = await res.json();
  const fnCall = data.choices?.[0]?.message?.function_call;

  if (!fnCall?.arguments) return [];

  const parsed = JSON.parse(fnCall.arguments);
  if (!Array.isArray(parsed.rankings)) return [];

  return parsed.rankings.map((r: { index: number; relevance: number }) => ({
    index: r.index - 1, // Convert 1-based to 0-based
    relevance: r.relevance,
  }));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a ResultRanker function that uses AI to rerank search results.
 * The ranker first applies heuristic ranking, then uses AI to filter irrelevant results.
 */
export function createAIResultRanker(
  provider: AIProvider,
  options?: { minRelevance?: number; maxResults?: number }
): ResultRanker {
  return async (results: FineliFood[], query: string): Promise<FineliFood[]> => {
    // Only invoke AI when there are multiple results to disambiguate
    if (results.length <= 1) return results;

    return rankWithAI(provider, results, query, options);
  };
}
