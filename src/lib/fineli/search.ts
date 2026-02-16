import type { FineliFood } from '@/types';
import { getMediumPortion } from './local-index';

export function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[,.]$/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Common Finnish food name aliases → Fineli search-friendly terms.
 * Maps colloquial names to the naming convention used in Fineli data.
 */
export const FOOD_ALIASES: Record<string, string> = {
  // Dairy
  'kevytmaito': 'maito, kevyt',
  'rasvaton maito': 'maito, rasvaton',
  'täysmaito': 'maito, täysi',
  'piimä': 'piimä',
  'kerma': 'kerma',
  'jogurtti': 'jogurtti',
  'rahka': 'rahka',
  'viili': 'viili',

  // Grains & bread
  'ruisleipä': 'ruisleipä',
  'sekaleipä': 'ruisleipä, ruissekaleipä',
  'paahtoleipä': 'paahtoleipä',
  'näkkileipä': 'näkkileipä',
  'kauraleipä': 'kauraleipä',
  'graham': 'sämpylä, graham',
  'sämpylä': 'sämpylä',
  'leipä': 'leipä',
  'pasta': 'pasta',
  'riisi': 'riisi',
  'puuro': 'puuro',
  'kaurapuuro': 'kaurapuuro',

  // Spreads & toppings
  'voi': 'voi',
  'margariini': 'margariini',
  'levite': 'levite',
  'juusto': 'juusto',
  'kinkku': 'kinkku',
  'leikkele': 'leikkele',

  // Cheese varieties
  'edam': 'juusto, edam',
  'emmental': 'juusto, emmental',
  'kermajuusto': 'juusto, kerma',
  'tuorejuusto': 'tuorejuusto',

  // Meat & protein
  'kana': 'kana',
  'broileri': 'broileri',
  'porsas': 'porsaanliha',
  'nauta': 'naudanliha',
  'jauheliha': 'jauheliha',
  'kala': 'kala',
  'lohi': 'lohi',
  'kirjolohi': 'kirjolohi',
  'tonnikala': 'tonnikala',
  'kananmuna': 'kananmuna',
  'muna': 'kananmuna',

  // Prepared dishes
  'kana curry': 'curry, kananliha',
  'kanacurry': 'kanacurry',
  'lihakeitto': 'lihakeitto',
  'jauhelihakeitto': 'jauhelihakeitto',
  'hernekeitto': 'hernekeitto',
  'kalakeitto': 'kalakeitto',
  'lohikeitto': 'lohikeitto',
  'hampurilainen': 'hampurilainen',
  'pizza': 'pizza',
  'kebab': 'kebab',
  'makaronilaatikko': 'makaronilaatikko',
  'lasagne': 'lasagne',
  'pinaattikeitto': 'pinaattikeitto',
  'perunasose': 'perunasose',
  'perunamuusi': 'perunasose',
  'pannukakku': 'pannukakku',
  'lettu': 'lettu',
  'lihapullat': 'lihapulla',
  'lihapulla': 'lihapulla',

  // Vegetables & fruits
  'peruna': 'peruna',
  'tomaatti': 'tomaatti',
  'kurkku': 'kurkku',
  'salaatti': 'salaatti',
  'porkkana': 'porkkana',
  'omena': 'omena',
  'banaani': 'banaani',
  'appelsiini': 'appelsiini',

  // Beverages
  'kahvi': 'kahvi',
  'tee': 'tee',
  'mehu': 'mehu',
  'olut': 'olut',
  'viini': 'viini',
};

// ---------------------------------------------------------------------------
// Scoring helpers for ranking Fineli search results
// ---------------------------------------------------------------------------

function scoreResult(food: FineliFood, query: string): number {
  const name = food.nameFi.toLowerCase();
  const primary = name.split(',')[0].trim();
  const qWords = query.split(/\s+/);

  let score = 0;

  if (name === query) score = 100;
  else if (primary === query) score = 90;
  else if (primary.startsWith(query)) score += 60;
  else if (name.startsWith(query)) score += 50;
  else if (primary.includes(query)) score += 35;
  else if (name.includes(query)) score += 20;

  if (qWords.length > 1) {
    const matchCount = qWords.filter((w) => name.includes(w)).length;
    score += matchCount * 8;
  }

  // Prefer raw ingredients (FOOD) over composite dishes (DISH) for general queries
  if (food.type === 'FOOD') score += 10;

  // Prefer shorter names (more specific foods)
  if (name.length < 40) score += 3;
  if (name.length < 25) score += 2;

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

  const minScore = 10;
  const filtered = scored.filter((s) => s.score > minScore);
  const finalList = filtered.length > 0 ? filtered : scored.slice(0, 1);

  return finalList.slice(0, limit).map(({ food }) => food);
}

/**
 * Get the real Fineli medium portion size for a food, if available.
 */
export function getRealPortionGrams(foodId: number): number | null {
  try {
    return getMediumPortion(foodId);
  } catch {
    return null;
  }
}
