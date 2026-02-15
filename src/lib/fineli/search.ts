import type { FineliFood } from '@/types';

export function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[,.]$/g, '')
    .replace(/\s+/g, ' ');
}

export const FOOD_ALIASES: Record<string, string> = {
  maito: 'maito',
  kevytmaito: 'maito, kevyt',
  'rasvaton maito': 'maito, rasvaton',
  täysmaito: 'maito, täysi',
  puuro: 'kaurapuuro',
  omena: 'omena',
  kahvi: 'kahvi',
  leipä: 'leipä',
  voi: 'voi',
  juusto: 'juusto',
};

/**
 * Score how well a Fineli result matches the user's query.
 *
 * Key insight: the user searching for "maito" wants *milk*, not
 * "Näkkileipä, sisältää maitoa" (crispbread containing milk).
 *
 * Scoring strategy:
 *   - Exact match on primary name              → 100
 *   - Name starts with query                   → 60
 *   - First word(s) before comma match query   → 50
 *   - Query matches a significant word in name → 20
 *   - Query only in a parenthetical/descriptor → 5  (penalized)
 *   - FOOD type bonus                          → 10
 *   - Short name bonus (likely a base food)    → 0-8
 */
function scoreResult(food: FineliFood, normalizedQuery: string): number {
  let score = 0;
  const nameFi = food.nameFi.toLowerCase();
  const queryWords = normalizedQuery.split(/\s+/);

  // Exact match
  if (nameFi === normalizedQuery) {
    score += 100;
  }
  // Name starts with query (e.g., "maito, kevyt" starts with "maito")
  else if (nameFi.startsWith(normalizedQuery + ',') || nameFi.startsWith(normalizedQuery + ' ')) {
    score += 60;
  }
  // Primary part before comma matches (e.g., "Kaurapuuro, vedellä" → "kaurapuuro")
  else if (nameFi.includes(',')) {
    const primary = nameFi.split(',')[0].trim();
    if (primary === normalizedQuery) {
      score += 55;
    } else if (primary.startsWith(normalizedQuery)) {
      score += 45;
    } else if (primary.includes(normalizedQuery)) {
      score += 30;
    }
  }
  // Name starts with query (no comma case)
  else if (nameFi.startsWith(normalizedQuery)) {
    score += 50;
  }

  // Check if query appears only as a secondary descriptor — strong penalty
  // Patterns like "sisältää X", "sis. X", "kanssa X", "sisältävä X"
  const secondaryPatterns = [
    /\bsis(?:\.|ältää|ältävä)\b/i,
    /\bkanssa\b/i,
    /\bmaku(?:inen|a)?\b/i,
  ];
  const isSecondary = secondaryPatterns.some((p) => p.test(nameFi)) &&
    !nameFi.startsWith(normalizedQuery);
  if (isSecondary && score < 30) {
    // This result mentions the query but isn't primarily about it
    score = Math.min(score, 5);
  }

  // If we still haven't scored, check basic inclusion
  if (score === 0) {
    if (nameFi.includes(normalizedQuery)) {
      score += 15;
    } else {
      // Check individual query words
      const matchCount = queryWords.filter((w) => nameFi.includes(w)).length;
      score += matchCount * 5;
    }
  }

  // FOOD type bonus (prefer plain foods over prepared dishes)
  if (food.type === 'FOOD') score += 10;

  // Short name bonus — "Maito, kevyt" is more likely what user wants than
  // "Kastikejauhe, maitorahkateema, erikoishieno, erikoisvoimakas"
  if (nameFi.length < 30) score += 8;
  else if (nameFi.length < 50) score += 4;

  return score;
}

/**
 * Rank and filter search results by relevance to the user's query.
 * Returns at most `limit` results, filtered to exclude clearly irrelevant ones.
 */
export function rankSearchResults(
  results: FineliFood[],
  query: string,
  limit: number = 5
): FineliFood[] {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return results.slice(0, limit);

  const scored = results.map((food) => ({
    food,
    score: scoreResult(food, normalizedQuery),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Filter out very low-relevance results (score <= 10 means only incidental mention)
  const minScore = 10;
  const filtered = scored.filter((s) => s.score > minScore);

  // If filtering removed everything, keep at least the top result
  const finalList = filtered.length > 0 ? filtered : scored.slice(0, 1);

  return finalList.slice(0, limit).map(({ food }) => food);
}
