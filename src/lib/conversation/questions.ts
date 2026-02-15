/**
 * Question template generator for the conversation engine.
 * Finnish language templates for disambiguation, portion, no-match, and companion questions.
 */

import type { FineliFood, QuestionOption, ParsedItem, PendingQuestion } from '@/types';
import { newId } from '@/types';

// ---------------------------------------------------------------------------
// Disambiguation question
// ---------------------------------------------------------------------------

export function generateDisambiguationQuestion(
  item: ParsedItem,
  candidates: FineliFood[]
): { message: string; question: PendingQuestion } {
  const n = candidates.length;
  const lines = candidates.map(
    (c, i) => `  ${i + 1}) ${c.nameFi}`
  ).join('\n');
  const message = `Löysin useita vaihtoehtoja hakusanalle "${item.rawText}":\n${lines}\n\nKumman tarkoitat? Vastaa numerolla 1–${n}.`;

  const options: QuestionOption[] = candidates.map((c, i) => ({
    key: String(i + 1),
    label: c.nameFi,
    value: c.id,
  }));

  const question: PendingQuestion = {
    id: newId(),
    itemId: item.id,
    type: 'disambiguation',
    templateKey: 'disambiguation',
    templateParams: { rawText: item.rawText, count: n },
    options,
    retryCount: 0,
    askedAt: Date.now(),
  };

  return { message, question };
}

// ---------------------------------------------------------------------------
// Portion question
// ---------------------------------------------------------------------------

const KPL_S = 'KPL_S';
const KPL_M = 'KPL_M';
const KPL_L = 'KPL_L';

function findUnit(food: FineliFood, code: string) {
  return food.units?.find((u) => u.code === code);
}

export function generatePortionQuestion(
  item: ParsedItem,
  food: FineliFood
): { message: string; question: PendingQuestion } {
  const s = findUnit(food, KPL_S);
  const m = findUnit(food, KPL_M);
  const l = findUnit(food, KPL_L);

  const dlUnit = food.units?.find((u) => u.code === 'DL');

  let message: string;
  const options: QuestionOption[] = [];

  if (s || m || l) {
    const parts: string[] = [];
    if (s) {
      parts.push(`• pieni (${s.massGrams}g)`);
      options.push({ key: 'KPL_S', label: `Pieni (${s.massGrams}g)`, sublabel: `${s.massGrams}g`, value: s.massGrams });
    }
    if (m) {
      parts.push(`• keskikokoinen (${m.massGrams}g)`);
      options.push({ key: 'KPL_M', label: `Keskikokoinen (${m.massGrams}g)`, sublabel: `${m.massGrams}g`, value: m.massGrams });
    }
    if (l) {
      parts.push(`• iso (${l.massGrams}g)`);
      options.push({ key: 'KPL_L', label: `Iso (${l.massGrams}g)`, sublabel: `${l.massGrams}g`, value: l.massGrams });
    }
    parts.push('• tai grammoina (esim. 120g)');
    message = `Kuinka paljon: ${food.nameFi}?\n${parts.join('\n')}`;
  } else if (dlUnit) {
    message = `Kuinka paljon: ${food.nameFi}?\nVastaa tilavuutena (esim. 2 dl) tai grammoina.`;
    options.push(
      { key: 'dl', label: 'Desilitroina', value: 'dl' },
      { key: 'g', label: 'Grammoina', value: 'g' }
    );
  } else {
    message = `Kuinka monta grammaa: ${food.nameFi}?`;
    options.push({ key: 'g', label: 'Grammoina', value: 'g' });
  }

  const question: PendingQuestion = {
    id: newId(),
    itemId: item.id,
    type: 'portion',
    templateKey: 'portion',
    templateParams: { foodName: food.nameFi },
    options: options.length > 0 ? options : undefined,
    retryCount: 0,
    askedAt: Date.now(),
  };

  return { message, question };
}

// ---------------------------------------------------------------------------
// No match question
// ---------------------------------------------------------------------------

/** Maximum number of no-match retries before auto-skipping the item */
export const MAX_NO_MATCH_RETRIES = 2;

export function generateNoMatchQuestion(
  item: ParsedItem,
  retryCount: number = 0
): { message: string; question: PendingQuestion } {
  const isRetry = retryCount > 0;
  const message = isRetry
    ? `En löytänyt "${item.rawText}" myöskään. Kokeile toista nimeä tai ohita.`
    : `En löytänyt "${item.rawText}" Fineli-tietokannasta. Kokeile toista nimeä tai ohita.`;

  const options: QuestionOption[] = [
    { key: 'ohita', label: 'Ohita', value: 'skip' },
  ];

  const question: PendingQuestion = {
    id: newId(),
    itemId: item.id,
    type: 'no_match_retry',
    templateKey: 'no_match_retry',
    templateParams: { rawText: item.rawText },
    options,
    retryCount,
    askedAt: Date.now(),
  };

  return { message, question };
}

// ---------------------------------------------------------------------------
// Completion message
// ---------------------------------------------------------------------------

export function generateCompletionMessage(): string {
  return 'Kaikki tallennettu! Söitkö muuta tällä aterialla?';
}

// ---------------------------------------------------------------------------
// Item confirmation (inline, not a question)
// ---------------------------------------------------------------------------

export function formatConfirmation(
  food: FineliFood,
  portionGrams: number,
  portionLabel?: string
): string {
  if (portionLabel) {
    return `✓ ${food.nameFi}, ${portionLabel} (${portionGrams}g)`;
  }
  return `✓ ${food.nameFi}, ${portionGrams}g`;
}

// ---------------------------------------------------------------------------
// Notice when adding items mid-conversation
// ---------------------------------------------------------------------------

export function formatAddedNotice(itemTexts: string[]): string {
  if (itemTexts.length === 1) {
    return `Lisäsin ${itemTexts[0]} listalle.`;
  }
  return `Lisäsin ${itemTexts.join(', ')} listalle. Palaan niihin seuraavaksi.`;
}

// ---------------------------------------------------------------------------
// Companion question
// ---------------------------------------------------------------------------

export function generateCompanionQuestion(
  primaryFood: string,
  companion: string,
  primaryItemId: string
): { message: string; question: PendingQuestion } {
  const message = `Käytitkö ${companion} ${primaryFood} kanssa?`;

  const question: PendingQuestion = {
    id: newId(),
    itemId: primaryItemId,
    type: 'companion',
    templateKey: 'companion',
    templateParams: { primaryFood, companion },
    options: [
      { key: 'yes', label: 'Kyllä', value: true },
      { key: 'no', label: 'Ei', value: false },
    ],
    retryCount: 0,
    askedAt: Date.now(),
  };

  return { message, question };
}

// ---------------------------------------------------------------------------
// Router: generate question based on item state
// ---------------------------------------------------------------------------

export function generateQuestion(
  item: ParsedItem,
  previousRetryCount?: number
): { message: string; question: PendingQuestion } | null {
  switch (item.state) {
    case 'DISAMBIGUATING':
      if (item.fineliCandidates && item.fineliCandidates.length >= 2) {
        return generateDisambiguationQuestion(item, item.fineliCandidates);
      }
      return null;
    case 'PORTIONING':
      if (item.selectedFood) {
        return generatePortionQuestion(item, item.selectedFood);
      }
      return null;
    case 'NO_MATCH':
      return generateNoMatchQuestion(item, previousRetryCount ?? 0);
    default:
      return null;
  }
}
