/**
 * Food companion detection.
 * Suggests common accompaniments when primary foods are resolved.
 */

export const FOOD_COMPANIONS: Record<string, string[]> = {
  puuro: ['maito', 'marja', 'hunaja'],
  kaurapuuro: ['maito', 'marja', 'hunaja'],
  kahvi: ['maito', 'sokeri'],
  tee: ['hunaja', 'sokeri'],
  leipä: ['voi', 'juusto', 'leikkele'],
  salaatti: ['kastike', 'öljy'],
  pasta: ['kastike'],
  riisi: ['kastike', 'liha'],
};

/** Base food name for companion lookup (e.g. "Kaurapuuro, kylmä" → "kaurapuuro") */
function baseFoodKey(name: string): string {
  return name.split(',')[0].trim().toLowerCase();
}

/** Check if resolved name matches a companion key (exact or starts-with) */
function matchesCompanionKey(resolvedName: string, key: string): boolean {
  const base = baseFoodKey(resolvedName);
  return base === key || base.startsWith(key) || key.startsWith(base);
}

/**
 * Finds the first unchecked companion for a resolved food.
 * @param resolvedItems - food names already in the meal (e.g. from Fineli nameFi)
 * @param alreadyChecked - companions we've already asked about
 * @returns { primaryFood, companion } or null if nothing to ask
 */
export function checkCompanions(
  resolvedItems: string[],
  alreadyChecked: string[]
): { primaryFood: string; companion: string } | null {
  const resolvedSet = new Set(
    resolvedItems.map((n) => baseFoodKey(n))
  );
  const checkedSet = new Set(alreadyChecked.map((n) => n.toLowerCase()));

  for (const name of resolvedItems) {
    for (const [key, companions] of Object.entries(FOOD_COMPANIONS)) {
      if (!matchesCompanionKey(name, key)) continue;

      for (const companion of companions) {
        const cLower = companion.toLowerCase();
        if (resolvedSet.has(cLower)) continue;
        if (checkedSet.has(cLower)) continue;
        return { primaryFood: name, companion };
      }
    }
  }

  return null;
}
