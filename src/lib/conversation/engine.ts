/**
 * Conversation engine — core state machine for processing user messages.
 * Coordinates parser, Fineli client, portion converter, and question generation.
 */

import type {
  ConversationState,
  FineliFood,
  ParsedItem,
  ResolvedItem,
  QuestionOption,
} from '@/types';
import type { FineliClient } from '@/lib/fineli/client';
import type { PortionConverter } from '@/lib/fineli/portions';
import { computeNutrients } from '@/lib/fineli/nutrients';
import { classifyIntent } from './parser';
import type { ClassifiedIntent, ParsedAnswer } from './parser';
import {
  resolveItemState,
  createInitialItem,
  applyDisambiguation,
  applyPortion,
  revertToParsed,
} from './resolver';
import {
  generateQuestion,
  generatePortionQuestion,
  generateCompletionMessage,
  generateCompanionQuestion,
  formatConfirmation,
  formatAddedNotice,
  MAX_NO_MATCH_RETRIES,
} from './questions';
import { checkCompanions } from './companions';
import { rankSearchResults } from '@/lib/fineli/search';

export interface EngineStepResult {
  assistantMessage: string;
  updatedState: ConversationState;
  resolvedItems: ResolvedItem[];
  questionMetadata?: {
    type: string;
    options?: QuestionOption[];
  };
}

/**
 * Optional callback to rerank Fineli search results.
 * When provided (e.g. by the AI engine), used instead of the heuristic ranker.
 */
export type ResultRanker = (
  results: FineliFood[],
  query: string
) => Promise<FineliFood[]>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function itemById(state: ConversationState, id: string): ParsedItem | undefined {
  return state.items.find((i) => i.id === id);
}

function updateItemInState(
  state: ConversationState,
  item: ParsedItem
): ConversationState {
  const items = state.items.map((i) => (i.id === item.id ? item : i));
  return { ...state, items };
}

function removeItemFromState(
  state: ConversationState,
  itemId: string
): ConversationState {
  const items = state.items.filter((i) => i.id !== itemId);
  const unresolvedQueue = state.unresolvedQueue.filter((id) => id !== itemId);
  const activeItemId =
    state.activeItemId === itemId
      ? unresolvedQueue[0] ?? null
      : state.activeItemId;
  return {
    ...state,
    items,
    unresolvedQueue,
    activeItemId,
  };
}

function toResolvedItem(item: ParsedItem): ResolvedItem | null {
  if (item.state !== 'RESOLVED' || !item.selectedFood || item.portionGrams == null)
    return null;

  const nutrients = item.selectedFood.nutrients ?? {};
  const computedNutrients = computeNutrients(nutrients, item.portionGrams);
  const portionAmount =
    item.portionUnitCode === 'G' ? item.portionGrams : 1;

  return {
    parsedItemId: item.id,
    fineliFoodId: item.selectedFood.id,
    fineliNameFi: item.selectedFood.nameFi,
    fineliNameEn: item.selectedFood.nameEn ?? null,
    portionGrams: item.portionGrams,
    portionUnitCode: item.portionUnitCode ?? null,
    portionUnitLabel: item.portionUnitLabel ?? null,
    portionAmount,
    nutrientsPer100g: nutrients,
    computedNutrients,
  };
}

function advanceQueue(state: ConversationState): ConversationState {
  const unresolved = state.unresolvedQueue.filter((id) => {
    const item = itemById(state, id);
    return item && item.state !== 'RESOLVED';
  });

  const activeId = unresolved[0] ?? null;
  return {
    ...state,
    unresolvedQueue: unresolved,
    activeItemId: activeId,
    pendingQuestion: null,
  };
}

/** Get grams from a portion answer using PortionConverter */
function resolvePortionGrams(
  answer: ParsedAnswer,
  food: ParsedItem['selectedFood'],
  portionConverter: PortionConverter
): { grams: number; unitCode: string; unitLabel: string; amount?: number } | null {
  if (!food) return null;
  const units = food.units ?? [];

  if (answer.type === 'weight') {
    return {
      grams: answer.grams,
      unitCode: 'G',
      unitLabel: 'g',
      amount: answer.grams,
    };
  }

  if (answer.type === 'portion_size') {
    // Try exact code first, then equivalent (PORTS↔KPL_S, PORTM↔KPL_M, PORTL↔KPL_L)
    const equivalents: Record<string, string[]> = {
      PORTS: ['PORTS', 'KPL_S'], KPL_S: ['KPL_S', 'PORTS'],
      PORTM: ['PORTM', 'KPL_M'], KPL_M: ['KPL_M', 'PORTM'],
      PORTL: ['PORTL', 'KPL_L'], KPL_L: ['KPL_L', 'PORTL'],
    };
    const codesToTry = equivalents[answer.key] ?? [answer.key];
    for (const code of codesToTry) {
      const unit = units.find((u) => u.code === code);
      if (unit) {
        return {
          grams: unit.massGrams,
          unitCode: unit.code,
          unitLabel: unit.labelFi,
          amount: 1,
        };
      }
    }
    return null;
  }

  if (answer.type === 'volume') {
    const result = portionConverter.convert(answer.value, answer.unit, units);
    if (result) {
      return {
        grams: result.grams,
        unitCode: result.unitCode,
        unitLabel: result.unitLabel,
        amount: answer.value,
      };
    }
  }

  if (answer.type === 'fraction') {
    const refUnit = units.find(
      (u) => u.code === 'KPL_M' || u.code === 'KPL_L' || u.code === 'KPL_S'
    );
    if (refUnit) {
      const grams = refUnit.massGrams * answer.value;
      return {
        grams,
        unitCode: refUnit.code,
        unitLabel: refUnit.labelFi,
        amount: answer.value,
      };
    }
    return null;
  }

  if (answer.type === 'count') {
    const result = portionConverter.convert(answer.value, answer.unit, units);
    if (result) {
      return {
        grams: result.grams,
        unitCode: result.unitCode,
        unitLabel: result.unitLabel,
        amount: answer.value,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Intent handlers
// ---------------------------------------------------------------------------

async function handleAddItems(
  state: ConversationState,
  items: { text: string; amount?: number; unit?: string }[],
  fineliClient: FineliClient,
  resultRanker?: ResultRanker
): Promise<{ state: ConversationState; message: string; resolved: ResolvedItem[] }> {
  const resolved: ResolvedItem[] = [];
  const addedTexts: string[] = [];
  const newItems: ParsedItem[] = [];
  const hasActiveItem = state.activeItemId != null;

  const searchInputs = items.filter((p) => p.text.trim());
  const searchResults = await Promise.all(
    searchInputs.map((parsed) => fineliClient.searchFoods(parsed.text.trim(), 'fi'))
  );

  // Rank results: skip expensive AI ranker for items that have gram estimates
  // (they will auto-resolve with the top heuristic result anyway).
  // For items without grams, use AI ranker if available. Run all in parallel.
  const topResultsList = await Promise.all(
    searchInputs.map((parsed, i) => {
      const results = searchResults[i];
      const hasGrams = parsed.amount != null && parsed.amount > 0 &&
        (parsed.unit === 'g' || parsed.unit == null);
      // Only invoke costly AI ranker when disambiguation is needed (no grams)
      if (resultRanker && !hasGrams) {
        return resultRanker(results, parsed.text);
      }
      return Promise.resolve(rankSearchResults(results, parsed.text));
    })
  );

  for (let i = 0; i < searchInputs.length; i++) {
    const parsed = searchInputs[i];
    const results = searchResults[i];
    const initial = createInitialItem(parsed);
    const topResults = topResultsList[i];
    const resolvedItem = resolveItemState(initial, results, topResults);

    newItems.push(resolvedItem);
    addedTexts.push(parsed.text);

    if (resolvedItem.state === 'RESOLVED') {
      const ri = toResolvedItem(resolvedItem);
      if (ri) resolved.push(ri);
    }
  }

  const itemsById = new Map(state.items.map((i) => [i.id, i]));
  for (const item of newItems) {
    itemsById.set(item.id, item);
  }

  const unresolvedQueue = [...state.unresolvedQueue];
  for (const item of newItems) {
    if (item.state !== 'RESOLVED') {
      unresolvedQueue.push(item.id);
    }
  }

  let activeItemId = state.activeItemId;
  if (!activeItemId && unresolvedQueue.length > 0) {
    activeItemId = unresolvedQueue[0];
  }

  const updatedState: ConversationState = {
    ...state,
    items: Array.from(itemsById.values()),
    unresolvedQueue,
    activeItemId,
  };

  // Build the message based on how many items were fully resolved vs pending
  const resolvedCount = resolved.length;
  const pendingCount = newItems.filter((i) => i.state !== 'RESOLVED').length;
  const count = addedTexts.length;
  let message = '';

  // Correction hint shown when items are auto-resolved so users know they can fix mistakes
  const correctionHint = 'Väärin? Kerro niin korjaan.';

  if (resolvedCount > 0 && pendingCount === 0) {
    // All items resolved immediately (exact match with default portion)
    if (resolvedCount === 1) {
      const ri = resolved[0];
      message = `✓ ${ri.fineliNameFi} (${ri.portionGrams}g). ${correctionHint} `;
    } else {
      // List each resolved item with portion for clear feedback
      const details = resolved
        .map((ri) => `${ri.fineliNameFi} ${ri.portionGrams}g`)
        .join(', ');
      message = `✓ Lisäsin: ${details}. ${correctionHint} `;
    }
  } else if (resolvedCount > 0 && pendingCount > 0) {
    // Some resolved, some need disambiguation/portion
    const details = resolved
      .map((ri) => `${ri.fineliNameFi} ${ri.portionGrams}g`)
      .join(', ');
    message = `✓ ${details}. ${correctionHint} `;
  } else {
    // None resolved yet — searching/need disambiguation
    message = count === 1
      ? `Haen tietoja: ${addedTexts[0]}. `
      : `Haen tietoja ${count} ruuasta. `;
  }

  if (hasActiveItem && addedTexts.length > 0) {
    message += formatAddedNotice(addedTexts) + ' ';
  }

  return { state: updatedState, message, resolved };
}

// ---------------------------------------------------------------------------
// processMessage
// ---------------------------------------------------------------------------

/**
 * Process a user message by first classifying intent with the regex parser,
 * then delegating to processWithIntent.
 */
export async function processMessage(
  userMessage: string,
  currentState: ConversationState,
  fineliClient: FineliClient,
  portionConverter: PortionConverter
): Promise<EngineStepResult> {
  const intent = classifyIntent(
    userMessage,
    currentState.pendingQuestion
  ) as ClassifiedIntent;

  return processWithIntent(intent, currentState, fineliClient, portionConverter);
}

/**
 * Process a pre-classified intent through the state machine.
 * This is the core engine entry point — it accepts a ClassifiedIntent
 * so callers (regex parser, AI parser, tests) can all feed intents directly.
 *
 * @param resultRanker — optional AI-powered ranker to rerank Fineli search results
 */
export async function processWithIntent(
  intent: ClassifiedIntent,
  currentState: ConversationState,
  fineliClient: FineliClient,
  portionConverter: PortionConverter,
  resultRanker?: ResultRanker
): Promise<EngineStepResult> {
  let state = { ...currentState };
  let assistantMessage = '';
  let resolvedItems: ResolvedItem[] = [];
  let questionMetadata: EngineStepResult['questionMetadata'];

  const pq = state.pendingQuestion;
  const activeItem = state.activeItemId
    ? itemById(state, state.activeItemId)
    : null;

  switch (intent.type) {
    case 'add_items': {
      const items = intent.data as {
        text: string;
        amount?: number;
        unit?: string;
      }[];
      const addResult = await handleAddItems(state, items, fineliClient, resultRanker);
      state = addResult.state;
      assistantMessage = addResult.message;
      resolvedItems = addResult.resolved;
      break;
    }

    case 'answer': {
      if (!pq || !activeItem) {
        assistantMessage = 'En ymmärtänyt. Mitä söit?';
        break;
      }

      const answer = intent.data as ParsedAnswer;
      if (!answer) {
        assistantMessage =
          'En ymmärtänyt vastaustasi. Voisitko yrittää uudelleen?';
        questionMetadata = pq.options
          ? { type: pq.type, options: pq.options }
          : undefined;
        break;
      }

      if (pq.type === 'disambiguation' || pq.type === 'no_match_retry') {
        if (answer.type === 'reject') {
          // Skip/remove the item entirely — don't revert to PARSED (which keeps it in queue)
          state = removeItemFromState(state, activeItem.id);
          state = { ...state, pendingQuestion: null };
          assistantMessage = `Ohitetaan "${activeItem.rawText}". `;
        } else if (answer.type === 'clarification') {
          const reverted = revertToParsed(activeItem);
          const initial = { ...reverted, rawText: answer.text };
          const results = await fineliClient.searchFoods(answer.text, 'fi');
          const topResults = resultRanker
            ? await resultRanker(results, answer.text)
            : rankSearchResults(results, answer.text);
          const resolved = resolveItemState(initial, results, topResults);
          state = updateItemInState(state, resolved);

          // If still NO_MATCH after clarification and exceeded retry limit, auto-skip
          const nextRetryCount = (pq.retryCount ?? 0) + 1;
          if (resolved.state === 'NO_MATCH' && nextRetryCount >= MAX_NO_MATCH_RETRIES) {
            state = removeItemFromState(state, resolved.id);
            assistantMessage = `En löytänyt "${answer.text}" Finelistä. Ohitetaan. `;
          }
          // Otherwise (still NO_MATCH but under limit, or found match): let the
          // question generation block below handle it — retryCount is propagated
          // via the captured pq variable.
          state = { ...state, pendingQuestion: null };
          if (!assistantMessage) assistantMessage = '';
        } else if (answer.type === 'selection') {
          const candidates = activeItem.fineliCandidates ?? [];
          const selected = candidates[answer.index];
          if (selected) {
            const updated = applyDisambiguation(activeItem, selected);
            state = updateItemInState(state, updated);
            resolvedItems = [];
            if (updated.state === 'RESOLVED') {
              const ri = toResolvedItem(updated);
              if (ri) resolvedItems.push(ri);
            }
            if (updated.selectedFood && updated.state === 'RESOLVED') {
              assistantMessage =
                formatConfirmation(
                  updated.selectedFood,
                  updated.portionGrams!,
                  updated.portionUnitLabel
                ) + ' ';
            }
            state = { ...state, pendingQuestion: null };
          } else {
            assistantMessage =
              'Virheellinen valinta. Valitse numerolla 1–' + candidates.length;
            state = {
              ...state,
              pendingQuestion: { ...pq, options: pq.options },
            };
            questionMetadata = pq.options
              ? { type: pq.type, options: pq.options }
              : undefined;
          }
        }
      } else if (pq.type === 'portion') {
        const res = resolvePortionGrams(
          answer,
          activeItem.selectedFood,
          portionConverter
        );
        if (res) {
          const updated = applyPortion(
            activeItem,
            res.grams,
            res.unitCode,
            res.unitLabel
          );
          state = updateItemInState(state, updated);
          const ri = toResolvedItem(updated);
          if (ri) resolvedItems.push(ri);
          assistantMessage =
            formatConfirmation(
              updated.selectedFood!,
              res.grams,
              res.unitLabel
            ) + ' ';
          state = { ...state, pendingQuestion: null };
        } else {
          const nextQ = generatePortionQuestion(
            activeItem,
            activeItem.selectedFood!
          );
          assistantMessage = 'En ymmärtänyt määrää. ' + nextQ.message;
          questionMetadata = nextQ.question.options
            ? { type: 'portion', options: nextQ.question.options }
            : undefined;
          state = {
            ...state,
            pendingQuestion: {
              ...nextQ.question,
              retryCount: (pq.retryCount ?? 0) + 1,
            },
          };
        }
      } else if (pq.type === 'companion') {
        const companionText = pq.templateParams?.companion
          ? String(pq.templateParams.companion)
          : null;
        if (companionText) {
          state.companionChecks = [...(state.companionChecks ?? []), companionText];
        }
        const saidYes = answer.type === 'companion' && answer.value === true;
        if (saidYes && companionText) {
          const companionItem = createInitialItem({ text: companionText });
          const results = await fineliClient.searchFoods(companionText, 'fi');
          const top = resultRanker
            ? await resultRanker(results, companionText)
            : rankSearchResults(results, companionText);
          const resolved = resolveItemState(companionItem, results, top);
          state = {
            ...state,
            items: [...state.items, resolved],
            unresolvedQueue:
              resolved.state === 'RESOLVED'
                ? state.unresolvedQueue
                : [...state.unresolvedQueue, resolved.id],
            activeItemId:
              resolved.state === 'RESOLVED'
                ? state.activeItemId
                : state.activeItemId ?? resolved.id,
          };
          if (resolved.state === 'RESOLVED') {
            const ri = toResolvedItem(resolved);
            if (ri) resolvedItems.push(ri);
            assistantMessage =
              formatConfirmation(
                resolved.selectedFood!,
                resolved.portionGrams!,
                resolved.portionUnitLabel
              ) + ' ';
          }
        }
        state = { ...state, pendingQuestion: null };
      }
      break;
    }

    case 'correction': {
      const data = intent.data as {
        type: string;
        newText?: string;
        grams?: number;
      };
      if (!data) break;

      if (data.type === 'update_portion' && data.grams != null && activeItem) {
        if (
          activeItem.state === 'PORTIONING' ||
          activeItem.state === 'RESOLVED'
        ) {
          const updated = applyPortion(activeItem, data.grams, 'G', 'g');
          state = updateItemInState(state, updated);
          resolvedItems = [];
          const ri = toResolvedItem(updated);
          if (ri) resolvedItems.push(ri);
          assistantMessage =
            formatConfirmation(activeItem.selectedFood!, data.grams, 'g') + ' ';
        }
        state = { ...state, pendingQuestion: null };
      } else if (data.type === 'correction' && data.newText) {
        const newLower = data.newText.toLowerCase();
        const target =
          state.items.find((i) => i.rawText.toLowerCase() === newLower) ??
          state.items.find(
            (i) =>
              i.rawText.toLowerCase().includes(newLower) ||
              newLower.includes(i.rawText.toLowerCase())
          ) ?? activeItem;

        if (target) {
          const reverted = revertToParsed({ ...target, rawText: data.newText });
          const results = await fineliClient.searchFoods(data.newText, 'fi');
          const top = resultRanker
            ? await resultRanker(results, data.newText)
            : rankSearchResults(results, data.newText);
          const resolved = resolveItemState(reverted, results, top);
          state = updateItemInState(state, resolved);
          state = { ...state, pendingQuestion: null };
          assistantMessage = '';
        }
      }
      break;
    }

    case 'removal': {
      const data = intent.data as { type: string; targetText?: string };
      if (data?.targetText) {
        let target: typeof state.items[number] | undefined;

        if (data.targetText === '__LAST__') {
          // "väärin" / "poista viimeisin" → remove the most recently added item
          // Search backwards through items for the last RESOLVED or most recent item
          for (let i = state.items.length - 1; i >= 0; i--) {
            if (state.items[i].state === 'RESOLVED') {
              target = state.items[i];
              break;
            }
          }
          // If no resolved item, take the very last item
          if (!target && state.items.length > 0) {
            target = state.items[state.items.length - 1];
          }
        } else {
          target = state.items.find(
            (i) =>
              i.rawText.toLowerCase().includes(data.targetText!.toLowerCase()) ||
              data.targetText!.toLowerCase().includes(i.rawText.toLowerCase())
          );
        }

        if (target) {
          const displayName = target.selectedFood?.nameFi ?? target.rawText;
          state = removeItemFromState(state, target.id);
          assistantMessage = `Poistin "${displayName}" listalta. `;
          state = { ...state, pendingQuestion: null };
        } else {
          assistantMessage = 'Ei poistettavia ruokia. ';
        }
      }
      break;
    }

    case 'done': {
      state = { ...state, isComplete: true, pendingQuestion: null };
      const unresolved = state.unresolvedQueue.filter(
        (id) => itemById(state, id)?.state !== 'RESOLVED'
      );
      if (unresolved.length > 0) {
        assistantMessage = `Sinulla on vielä ${unresolved.length} kohdetta ratkaisematta. Haluatko jatkaa vai ohittaa? `;
      } else {
        assistantMessage = generateCompletionMessage();
      }
      break;
    }

    case 'unclear':
    default: {
      if (pq) {
        const retryCount = (pq.retryCount ?? 0) + 1;
        // If a no_match_retry exceeded the limit, auto-skip instead of looping
        if (pq.type === 'no_match_retry' && retryCount >= MAX_NO_MATCH_RETRIES) {
          const item = itemById(state, pq.itemId);
          if (item) {
            state = removeItemFromState(state, item.id);
            assistantMessage = `Ohitetaan "${item.rawText}". `;
          }
          state = { ...state, pendingQuestion: null };
        } else {
          const item = itemById(state, pq.itemId);
          if (item) {
            const next = generateQuestion(item, retryCount);
            if (next) {
              assistantMessage = `En ymmärtänyt. ${next.message}`;
              state = {
                ...state,
                pendingQuestion: {
                  ...next.question,
                  retryCount,
                },
              };
              questionMetadata = next.question.options
                ? { type: next.question.type, options: next.question.options }
                : undefined;
            }
          }
        }
      } else {
        assistantMessage =
          'En ymmärtänyt. Mitä söit? Kerro ruuat luettelona.';
      }
      break;
    }
  }

  state = advanceQueue(state);

  // Generate next question when we have an active item needing one
  if (state.pendingQuestion == null && state.activeItemId) {
    const active = itemById(state, state.activeItemId);
    if (active) {
      // Propagate retryCount for NO_MATCH items that were just re-searched
      const retryCarry =
        active.state === 'NO_MATCH' &&
        pq?.type === 'no_match_retry' &&
        pq.itemId === active.id
          ? (pq.retryCount ?? 0) + 1
          : 0;
      const q = generateQuestion(active, retryCarry);
      if (q) {
        state = {
          ...state,
          pendingQuestion: q.question,
        };
        questionMetadata = q.question.options
          ? { type: q.question.type, options: q.question.options }
          : undefined;
        assistantMessage = assistantMessage
          ? assistantMessage + q.message
          : q.message;
      }
    }
  }

  if (
    assistantMessage === '' &&
    state.pendingQuestion == null &&
    state.unresolvedQueue.length === 0 &&
    !state.isComplete
  ) {
    assistantMessage = generateCompletionMessage();
  }

  if (
    assistantMessage === '' &&
    state.pendingQuestion == null &&
    state.isComplete
  ) {
    const resolvedNames = state.items
      .filter((i) => i.state === 'RESOLVED')
      .map((i) => i.selectedFood!.nameFi);
    const companion = checkCompanions(
      resolvedNames,
      state.companionChecks ?? []
    );
    if (companion) {
      const primaryItem = state.items.find(
        (i) =>
          i.selectedFood?.nameFi === companion.primaryFood ||
          i.rawText === companion.primaryFood
      );
      const q = generateCompanionQuestion(
        companion.primaryFood,
        companion.companion,
        primaryItem?.id ?? ''
      );
      assistantMessage = q.message;
      state = {
        ...state,
        pendingQuestion: q.question,
      };
      questionMetadata = q.question.options
        ? { type: 'companion', options: q.question.options }
        : undefined;
    } else {
      assistantMessage = generateCompletionMessage();
    }
  }

  return {
    assistantMessage: assistantMessage.trim(),
    updatedState: state,
    resolvedItems,
    questionMetadata,
  };
}
