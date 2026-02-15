/**
 * AI-first parser for the food diary.
 *
 * DESIGN: Finnish is too complex for regex (15 grammatical cases, compound words,
 * colloquial forms). The AI is the PRIMARY parser for all messages except trivially
 * structured answers (numbers, weights, yes/no). The regex parser in parser.ts is
 * only used as a last-resort fallback when AI is unavailable or fails.
 *
 * Flow:
 * 1. Trivially structured answer? → regex (save cost/latency)
 * 2. Everything else → AI (handles Finnish morphology, context, colloquial speech)
 * 3. AI fails/times out? → regex fallback (best-effort)
 */

import type { AIProvider, AIParseResult, AIConversationContext, AIConfig } from './types';
import type { ClassifiedIntent } from '@/lib/conversation/parser';
import type { ParsedMealItem, PendingQuestion } from '@/types';
import { classifyIntent, parseMealText } from '@/lib/conversation/parser';

// ---------------------------------------------------------------------------
// Structured answer detection — skip AI for these
// ---------------------------------------------------------------------------

const SIMPLE_NUMERIC = /^\d+$/;
const SIMPLE_YES_NO = /^(?:kyllä|joo|jep|yes|ok|okei|ei|no|nope|en)$/i;
const SIMPLE_DONE = /^(?:valmis|done|siinä kaikki|ei muuta|siinäpä se|seis)$/i;
const SIMPLE_WEIGHT = /^\d+(?:[.,]\d+)?\s*(?:g|grammaa?)\s*$/i;
const SIMPLE_VOLUME = /^\d+(?:[.,]\d+)?\s*(?:dl|ml|l)\s*$/i;
const SIMPLE_PORTION = /^(?:pieni|keskikokoinen|normaali|iso|suuri|small|medium|large)$/i;
const SIMPLE_FRACTION = /^(?:puolikas|puoli|half|neljännes|quarter|kolmasosa)$/i;
const SIMPLE_COUNT = /^\d+(?:[.,]\d+)?\s*(?:kpl|kappaletta?)\s*$/i;
const SIMPLE_ORDINAL = /^(?:eka|ensimmäinen|toka|toinen|kolmas|neljäs|viides|first|second|third|fourth|fifth)$/i;
const SIMPLE_REJECT = /^(?:(?:ei\s+)?mikään\s+näistä|none|ei\s+yksikään)$/i;

// Correction/removal patterns — regex handles these well
const SIMPLE_CORRECTION = /^(?:ei[,.]?\s*(?:tarkoitin|tarkoitan)|actually|vaihda)\s+/i;
const SIMPLE_REMOVAL = /^(?:poista|remove|delete)\s+/i;
const SIMPLE_PORTION_UPDATE = /^(?:vaihda|change to|muuta)\s+\d+(?:[.,]\d+)?\s*g$/i;
// "väärin" / "peru" / "poista viimeisin" — undo/remove last item
const SIMPLE_WRONG = /^(?:väärin|väärä|wrong|undo|peru|peruuta)$/i;
const SIMPLE_REMOVE_LAST = /^(?:poista|remove|delete)\s+(?:viimeisin|viiminen|viimeinen|edellinen|se|tuo|that|last)$/i;

/**
 * Check if the message is a structured input that regex handles perfectly.
 * All of these are simple, universal patterns — no Finnish morphology needed.
 */
function isStructuredInput(message: string, pendingQuestion: PendingQuestion | null): boolean {
  const trimmed = message.trim();
  if (!trimmed) return true; // empty → regex handles it

  // Structured answers to pending questions
  if (pendingQuestion) {
    if (SIMPLE_NUMERIC.test(trimmed)) return true;
    if (SIMPLE_WEIGHT.test(trimmed)) return true;
    if (SIMPLE_VOLUME.test(trimmed)) return true;
    if (SIMPLE_PORTION.test(trimmed)) return true;
    if (SIMPLE_FRACTION.test(trimmed)) return true;
    if (SIMPLE_COUNT.test(trimmed)) return true;
    if (SIMPLE_ORDINAL.test(trimmed)) return true;
    if (SIMPLE_REJECT.test(trimmed)) return true;
  }

  // Universal patterns that work regardless of context
  if (SIMPLE_YES_NO.test(trimmed)) return true;
  if (SIMPLE_DONE.test(trimmed)) return true;
  if (SIMPLE_WRONG.test(trimmed)) return true;
  if (SIMPLE_REMOVE_LAST.test(trimmed)) return true;
  if (SIMPLE_CORRECTION.test(trimmed)) return true;
  if (SIMPLE_REMOVAL.test(trimmed)) return true;
  if (SIMPLE_PORTION_UPDATE.test(trimmed)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// AI → ClassifiedIntent mapping
// ---------------------------------------------------------------------------

// Portion estimate bounds — reject clearly unreasonable AI estimates
const MIN_PORTION_GRAMS = 1;
const MAX_PORTION_GRAMS = 2000;

function isReasonablePortionEstimate(grams: number): boolean {
  return grams >= MIN_PORTION_GRAMS && grams <= MAX_PORTION_GRAMS;
}

/**
 * Convert AI parse result to the ClassifiedIntent type used by the engine.
 */
function aiResultToClassifiedIntent(
  aiResult: AIParseResult,
  originalMessage: string
): ClassifiedIntent {
  switch (aiResult.intent) {
    case 'add_items': {
      const items: ParsedMealItem[] =
        aiResult.items?.map((item) => {
          // When the AI provides a gram estimate for descriptive quantities
          // (e.g. "kaksi siivua juustoa" → portionEstimateGrams: 30),
          // use it directly so the engine can auto-resolve without asking
          // the user for a portion. Only apply when the unit isn't already 'g'
          // and the estimate is within reasonable bounds.
          if (
            item.portionEstimateGrams != null &&
            item.portionEstimateGrams > 0 &&
            item.unit !== 'g' &&
            isReasonablePortionEstimate(item.portionEstimateGrams)
          ) {
            return {
              text: item.searchHint ?? item.text,
              amount: item.portionEstimateGrams,
              unit: 'g',
            };
          }
          return {
            text: item.searchHint ?? item.text,
            amount: item.amount,
            unit: item.unit,
          };
        }) ?? parseMealText(originalMessage);
      return { type: 'add_items', data: items };
    }

    case 'answer':
      return { type: 'answer', data: aiResult.answer ?? null };

    case 'correction':
      return { type: 'correction', data: (aiResult.correction ?? null) as ClassifiedIntent['data'] };

    case 'removal':
      return {
        type: 'removal',
        data: aiResult.removal
          ? { type: 'removal' as const, targetText: aiResult.removal.targetText }
          : null,
      };

    case 'done':
      return { type: 'done', data: null };

    case 'unclear':
    default:
      return { type: 'unclear', data: null };
  }
}

// ---------------------------------------------------------------------------
// Main AI parser
// ---------------------------------------------------------------------------

export interface AIParserOptions {
  provider: AIProvider;
  config: AIConfig;
}

/**
 * Parse a user message using AI as the primary parser.
 *
 * Priority:
 * 1. Structured input (numbers, weights, yes/no) → regex (fast, free)
 * 2. Everything else → AI (handles Finnish morphology)
 * 3. AI fails or low confidence → regex fallback (best-effort)
 */
export async function parseWithAI(
  message: string,
  context: AIConversationContext,
  options: AIParserOptions
): Promise<{
  intent: ClassifiedIntent;
  aiExtras?: {
    searchHints?: Record<string, string>;
    portionEstimates?: Record<string, number>;
    items?: AIParseResult['items'];
  };
  source: 'ai' | 'regex';
}> {
  const { provider, config } = options;
  const pendingQuestion = context.pendingQuestion;

  // 1. Skip AI for structured inputs that regex handles perfectly
  if (isStructuredInput(message, pendingQuestion)) {
    const intent = classifyIntent(message, pendingQuestion);
    return { intent, source: 'regex' };
  }

  // 2. Everything else → AI (this is the primary path for Finnish text)
  try {
    const aiResult = await provider.parseMessage(message, context);

    if (aiResult.confidence >= config.confidenceThreshold) {
      const intent = aiResultToClassifiedIntent(aiResult, message);

      // Collect AI extras
      const searchHints: Record<string, string> = {};
      const portionEstimates: Record<string, number> = {};

      if (aiResult.items) {
        for (const item of aiResult.items) {
          if (item.searchHint) {
            searchHints[item.text] = item.searchHint;
          }
          if (item.portionEstimateGrams != null) {
            portionEstimates[item.text] = item.portionEstimateGrams;
          }
        }
      }

      return {
        intent,
        aiExtras: {
          searchHints: Object.keys(searchHints).length > 0 ? searchHints : undefined,
          portionEstimates: Object.keys(portionEstimates).length > 0 ? portionEstimates : undefined,
          items: aiResult.items,
        },
        source: 'ai',
      };
    }

    console.warn(`[AI Parser] Low confidence (${aiResult.confidence}), falling back to regex`);
  } catch (error) {
    console.error('[AI Parser] Error, falling back to regex:', error);
  }

  // 3. Regex fallback (no Finnish normalization — just best-effort splitting)
  const intent = classifyIntent(message, pendingQuestion);
  return { intent, source: 'regex' };
}
