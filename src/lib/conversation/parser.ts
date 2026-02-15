/**
 * Message parser — thin regex layer for structured answers and fallback parsing.
 *
 * DESIGN: Finnish is too complex for regex-based food extraction (15 grammatical
 * cases, compound words, colloquial forms). The AI parser (ai-parser.ts) is the
 * primary parser for all food-related messages. This module provides:
 *
 * 1. Type definitions shared by both AI and regex parsers
 * 2. parseAnswer — regex for structured answers (numbers, weights, yes/no)
 * 3. classifyIntent — lightweight fallback when AI is unavailable
 * 4. parseMealText — minimal fallback food splitter (no Finnish normalization)
 */

import type { ParsedMealItem, PendingQuestion, QuestionType } from '@/types';

// ---------------------------------------------------------------------------
// Answer types
// ---------------------------------------------------------------------------

interface SelectionAnswer {
  type: 'selection';
  index: number; // 0-based
}

interface ClarificationAnswer {
  type: 'clarification';
  text: string;
}

interface RejectAnswer {
  type: 'reject';
}

interface WeightAnswer {
  type: 'weight';
  grams: number;
}

interface PortionSizeAnswer {
  type: 'portion_size';
  key: string; // Fineli unit code e.g. 'KPL_M'
}

interface VolumeAnswer {
  type: 'volume';
  value: number;
  unit: string; // 'dl', 'ml', 'l'
}

interface FractionAnswer {
  type: 'fraction';
  value: number;
}

interface CountAnswer {
  type: 'count';
  value: number;
  unit: string;
}

type DisambiguationAnswer = SelectionAnswer | ClarificationAnswer | RejectAnswer;
type PortionAnswer = WeightAnswer | PortionSizeAnswer | VolumeAnswer | FractionAnswer | CountAnswer;

interface CompanionAnswer {
  type: 'companion';
  value: boolean;
}

export type ParsedAnswer = DisambiguationAnswer | PortionAnswer | CompanionAnswer;

// ---------------------------------------------------------------------------
// Intent types
// ---------------------------------------------------------------------------

interface CorrectionIntent {
  type: 'correction';
  newText: string;
}

interface RemovalIntent {
  type: 'removal';
  targetText: string;
}

interface UpdatePortionIntent {
  type: 'update_portion';
  grams: number;
}

type IntentType = 'add_items' | 'answer' | 'correction' | 'removal' | 'done' | 'unclear';

export interface ClassifiedIntent {
  type: IntentType;
  data:
    | ParsedMealItem[]
    | ParsedAnswer
    | CorrectionIntent
    | RemovalIntent
    | UpdatePortionIntent
    | null;
}

// ---------------------------------------------------------------------------
// Constants for answer parsing (these are universal, not Finnish-specific)
// ---------------------------------------------------------------------------

const ORDINALS: Record<string, number> = {
  eka: 1, ensimmäinen: 1, first: 1,
  toka: 2, toinen: 2, second: 2,
  kolmas: 3, third: 3,
  neljäs: 4, fourth: 4,
  viides: 5, fifth: 5,
};

const PORTION_SIZES: Record<string, string> = {
  // Human-readable words
  pieni: 'KPL_S', small: 'KPL_S',
  keskikokoinen: 'KPL_M', medium: 'KPL_M', normaali: 'KPL_M',
  iso: 'KPL_L', large: 'KPL_L', suuri: 'KPL_L',
  // Fineli unit codes (sent by quick-reply buttons)
  kpl_s: 'KPL_S',
  kpl_m: 'KPL_M',
  kpl_l: 'KPL_L',
};

const FRACTION_WORDS: Record<string, number> = {
  puolikas: 0.5, puoli: 0.5, half: 0.5,
  neljännes: 0.25, quarter: 0.25,
  kolmasosa: 0.333, third: 0.333,
};

const REJECT_PATTERNS = [
  /^(?:ei\s+)?mikään\s+näistä$/i,
  /^none$/i,
  /^ei\s+yksikään$/i,
  /^ohita$/i,
  /^skip$/i,
  /^ohita\s+tämä$/i,
  /^jätä\s+pois$/i,
];

const WEIGHT_PATTERN = /^(\d+(?:[.,]\d+)?)\s*(?:g|grammaa?|gramma)\s*$/i;
const COMPANION_YES = /^(?:kyllä|joo|jep|yes|yeah|ok|okei)$/i;
const COMPANION_NO = /^(?:ei|no|nope|en)$/i;

// Fallback intent patterns
const CORRECTION_PATTERN = /^(?:ei[,.]?\s*(?:tarkoitin|tarkoitan)|actually|vaihda)\s+(.+)$/i;
const REMOVAL_PATTERN = /^(?:poista|remove|delete)\s+(.+)$/i;
const UPDATE_PORTION_PATTERN = /^(?:vaihda|change to|muuta)\s+(\d+(?:[.,]\d+)?)\s*g$/i;
const DONE_PATTERN = /^(?:valmis|siinä kaikki|done|that's all|ei muuta|no more|siinäpä se|seis)$/i;

// Minimal fallback splitter (no Finnish normalization)
const ITEM_SPLITTERS = /(?:\s*,\s*|\s+ja\s+|\s+sekä\s+|\s+and\s+|\s+with\s+|\s*\+\s*)/i;
const AMOUNT_PATTERN = /^(\d+(?:[.,]\d+)?)\s*(g|kg|dl|ml|l|kpl|rkl|tl|annos|viipale(?:tta)?)\s+(.+)$/i;
const AMOUNT_SUFFIX_PATTERN = /^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(g|kg|dl|ml|l)$/i;

// ---------------------------------------------------------------------------
// parseAnswer — structured answer parsing (regex is fine here)
// ---------------------------------------------------------------------------

function parseDisambiguationAnswer(text: string): DisambiguationAnswer | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;

  for (const re of REJECT_PATTERNS) {
    if (re.test(trimmed)) return { type: 'reject' };
  }

  const ordKey = trimmed.replace(/[.,!?]/g, '').trim();
  if (ORDINALS[ordKey] !== undefined) {
    return { type: 'selection', index: ORDINALS[ordKey] - 1 };
  }

  const numMatch = trimmed.match(/^(\d+)$/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n >= 1) return { type: 'selection', index: n - 1 };
  }

  return { type: 'clarification', text: text.trim() };
}

function parsePortionAnswer(text: string): PortionAnswer | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;

  const weightMatch = trimmed.match(WEIGHT_PATTERN);
  if (weightMatch) {
    return { type: 'weight', grams: parseFloat(weightMatch[1].replace(',', '.')) };
  }

  const sizeKey = trimmed.replace(/[.,!?]/g, '').trim();
  if (PORTION_SIZES[sizeKey]) {
    return { type: 'portion_size', key: PORTION_SIZES[sizeKey] };
  }

  const volumeMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(dl|ml|l)\s*$/i);
  if (volumeMatch) {
    return {
      type: 'volume',
      value: parseFloat(volumeMatch[1].replace(',', '.')),
      unit: volumeMatch[2].toLowerCase(),
    };
  }

  const fracKey = trimmed.replace(/[.,!?]/g, '').trim();
  if (FRACTION_WORDS[fracKey] !== undefined) {
    return { type: 'fraction', value: FRACTION_WORDS[fracKey] };
  }

  const countMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(kpl|kappaletta?)\s*$/i);
  if (countMatch) {
    const unit = (countMatch[2] || 'kpl').toLowerCase();
    return {
      type: 'count',
      value: parseFloat(countMatch[1].replace(',', '.')),
      unit: unit.startsWith('kappale') ? 'kpl' : unit,
    };
  }

  return null;
}

/**
 * Parse a user reply as a structured answer to a pending question.
 * This uses regex because answer formats are well-defined (numbers, weights, yes/no).
 */
export function parseAnswer(
  text: string,
  expectedType: QuestionType
): ParsedAnswer | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  switch (expectedType) {
    case 'disambiguation':
    case 'no_match_retry':
      return parseDisambiguationAnswer(text);
    case 'portion':
      return parsePortionAnswer(text);
    case 'companion': {
      const t = trimmed.toLowerCase();
      if (COMPANION_YES.test(t)) return { type: 'companion', value: true };
      if (COMPANION_NO.test(t)) return { type: 'companion', value: false };
      return null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// parseMealText — MINIMAL fallback (no Finnish normalization)
// ---------------------------------------------------------------------------

/**
 * Minimal fallback food splitter. Only used when AI is unavailable.
 * Splits on conjunctions and commas, extracts amounts. Does NOT attempt
 * Finnish morphological normalization — that's the AI's job.
 */
export function parseMealText(text: string): ParsedMealItem[] {
  const raw = text.trim();
  if (!raw) return [];

  const segments = raw.split(ITEM_SPLITTERS).filter((s) => s.trim().length > 0);
  return segments.map(parseAmountFromSegment).filter((item) => item.text);
}

function parseAmountFromSegment(segment: string): ParsedMealItem {
  const trimmed = segment.trim();
  if (!trimmed) return { text: '' };

  // Try prefix pattern: "120g kanaa", "2 dl maitoa"
  const prefixMatch = trimmed.match(AMOUNT_PATTERN);
  if (prefixMatch) {
    return {
      text: prefixMatch[3].trim(),
      amount: parseFloat(prefixMatch[1].replace(',', '.')),
      unit: prefixMatch[2].toLowerCase(),
    };
  }

  // Try suffix pattern: "kanaa 120 g"
  const suffixMatch = trimmed.match(AMOUNT_SUFFIX_PATTERN);
  if (suffixMatch) {
    return {
      text: suffixMatch[1].trim(),
      amount: parseFloat(suffixMatch[2].replace(',', '.')),
      unit: suffixMatch[3].toLowerCase(),
    };
  }

  return { text: trimmed };
}

// ---------------------------------------------------------------------------
// classifyIntent — lightweight fallback when AI is unavailable
// ---------------------------------------------------------------------------

/**
 * Classify user intent using regex patterns. Used as fallback when AI
 * is not available. For Finnish food text, AI should be the primary parser.
 */
export function classifyIntent(
  message: string,
  pendingQuestion: PendingQuestion | null
): ClassifiedIntent {
  const trimmed = message.trim();
  if (!trimmed) {
    return { type: pendingQuestion ? 'answer' : 'unclear', data: null };
  }

  // 1. If pending question, try structured answer first
  if (pendingQuestion) {
    const answer = parseAnswer(trimmed, pendingQuestion.type);
    if (answer) return { type: 'answer', data: answer };
  }

  // 2. Update portion: "vaihda 150g"
  const updateMatch = trimmed.match(UPDATE_PORTION_PATTERN);
  if (updateMatch) {
    return {
      type: 'correction',
      data: { type: 'update_portion', grams: parseFloat(updateMatch[1].replace(',', '.')) },
    };
  }

  // 3. Correction: "ei, tarkoitin lohta"
  const correctionMatch = trimmed.match(CORRECTION_PATTERN);
  if (correctionMatch) {
    return { type: 'correction', data: { type: 'correction', newText: correctionMatch[1].trim() } };
  }

  // 4. Removal: "poista kanaa"
  const removalMatch = trimmed.match(REMOVAL_PATTERN);
  if (removalMatch) {
    return { type: 'removal', data: { type: 'removal', targetText: removalMatch[1].trim() } };
  }

  // 5. Done: "valmis", "siinä kaikki"
  if (DONE_PATTERN.test(trimmed)) {
    return { type: 'done', data: null };
  }

  // 6. Anything else → treat as food text (minimal splitting, no Finnish normalization)
  const items = parseMealText(trimmed);
  if (items.length > 0) {
    return { type: 'add_items', data: items };
  }

  // 7. Default fallback
  if (pendingQuestion) {
    if (pendingQuestion.type === 'disambiguation' || pendingQuestion.type === 'no_match_retry') {
      return { type: 'answer', data: { type: 'clarification', text: trimmed } };
    }
    return { type: 'answer', data: null };
  }

  return { type: 'unclear', data: null };
}
