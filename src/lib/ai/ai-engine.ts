/**
 * AI-enhanced conversation engine.
 *
 * Wraps the existing processMessage function, adding:
 * 1. AI parsing (structured extraction via LLM — handles Finnish morphology)
 * 2. AI result ranking (filters irrelevant Fineli matches)
 * 3. AI response generation (natural Finnish)
 *
 * Search hints and portion estimates are applied in ai-parser.ts before reaching
 * this module. Falls back to the original regex-based engine when AI fails.
 */

import type {
  ConversationState,
  MealType,
  FineliFood,
} from '@/types';
import type { FineliClient } from '@/lib/fineli/client';
import type { PortionConverter } from '@/lib/fineli/portions';
import type { EngineStepResult } from '@/lib/conversation/engine';
import { processMessage, processWithIntent } from '@/lib/conversation/engine';
import type {
  AIProvider,
  AIConversationContext,
  AISuggestion,
} from './types';
import { parseWithAI } from './ai-parser';
import { getAIConfig } from './config';
import { createAIResultRanker } from './ai-ranker';

// ---------------------------------------------------------------------------
// Enhanced result type
// ---------------------------------------------------------------------------

export interface AIEngineStepResult extends EngineStepResult {
  /** Natural AI-generated response (if AI responses enabled, else same as assistantMessage) */
  aiMessage?: string;
  /** Proactive suggestions from AI */
  suggestions?: AISuggestion[];
  /** Whether AI was used for parsing this message */
  aiParsed: boolean;
  /** Whether AI was used for response generation */
  aiResponse: boolean;
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

function buildContext(
  state: ConversationState,
  mealType: MealType
): AIConversationContext {
  const hour = new Date().getHours();
  let timeOfDay: AIConversationContext['timeOfDay'] = 'morning';
  if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
  else if (hour >= 21 || hour < 5) timeOfDay = 'night';

  const resolvedItemNames = state.items
    .filter((i) => i.state === 'RESOLVED' && i.selectedFood)
    .map((i) => i.selectedFood!.nameFi);

  // Get Fineli candidates if in disambiguation state
  let fineliCandidates: FineliFood[] | undefined;
  if (state.pendingQuestion?.type === 'disambiguation' && state.activeItemId) {
    const activeItem = state.items.find((i) => i.id === state.activeItemId);
    fineliCandidates = activeItem?.fineliCandidates ?? undefined;
  }

  return {
    conversationState: state,
    mealType,
    timeOfDay,
    resolvedItemNames,
    pendingQuestion: state.pendingQuestion,
    fineliCandidates,
    locale: state.language,
  };
}

// ---------------------------------------------------------------------------
// AI-enhanced processMessage
// ---------------------------------------------------------------------------

/**
 * Process a user message with optional AI enhancement.
 *
 * When aiProvider is provided and configured:
 * 1. Uses AI for message parsing (with confidence-based fallback to regex)
 * 2. Passes AI search hints and portion estimates to the engine
 * 3. Optionally uses AI for natural response generation
 *
 * When aiProvider is null:
 * - Behaves identically to the original processMessage
 */
export async function processMessageWithAI(
  userMessage: string,
  currentState: ConversationState,
  fineliClient: FineliClient,
  portionConverter: PortionConverter,
  aiProvider: AIProvider | null,
  mealType: MealType = 'other'
): Promise<AIEngineStepResult> {
  // No AI provider → use original engine
  if (!aiProvider) {
    const result = await processMessage(
      userMessage,
      currentState,
      fineliClient,
      portionConverter
    );
    return { ...result, aiParsed: false, aiResponse: false };
  }

  const config = getAIConfig();
  const context = buildContext(currentState, mealType);

  // --- Phase 1: Parse with AI (primary) or regex (fallback) ---
  //
  // parseWithAI always returns a ClassifiedIntent — either from AI (for
  // Finnish food text) or from regex (for structured answers like numbers,
  // weights, yes/no). We always use processWithIntent to avoid double-parsing.
  //
  let aiParsed = false;
  let parsedIntent: import('@/lib/conversation/parser').ClassifiedIntent | null = null;

  try {
    const parseController = new AbortController();
    const parseTimeout = setTimeout(() => parseController.abort(), 5000);

    const parseResult = await Promise.race([
      parseWithAI(userMessage, context, {
        provider: aiProvider,
        config,
      }).finally(() => clearTimeout(parseTimeout)),
      new Promise<never>((_, reject) => {
        parseController.signal.addEventListener('abort', () =>
          reject(new Error('AI parse timeout'))
        );
      }),
    ]);

    aiParsed = parseResult.source === 'ai';
    parsedIntent = parseResult.intent;
    // Note: searchHints and portionEstimates are already applied inside
    // ai-parser.ts (item.text = searchHint, amount = portionEstimateGrams).
    // No further processing needed here.
  } catch (err) {
    // AI parse failed or timed out — engine will use regex fallback
    if (err instanceof Error && err.message === 'AI parse timeout') {
      console.warn('[AI Engine] Parse timed out after 5s, falling back to regex');
    }
  }

  // --- Phase 2: Run state machine with parsed intent ---
  //
  // When AI is available, create an AI-powered result ranker so the engine
  // filters Fineli search results by actual relevance (e.g., "maito" returns
  // actual milk, not "Näkkileipä, sisältää maitoa").
  //
  const aiResultRanker = createAIResultRanker(aiProvider, {
    minRelevance: 3,
    maxResults: 5,
  });

  const engineResult = parsedIntent
    ? await processWithIntent(parsedIntent, currentState, fineliClient, portionConverter, aiResultRanker)
    : await processMessage(userMessage, currentState, fineliClient, portionConverter);

  // --- Phase 3: AI response generation ---
  //
  // IMPORTANT: When the engine is presenting a structured question
  // (disambiguation, portion, companion), we must NOT replace the message
  // with AI-generated text. The engine's template messages contain the
  // exact options the user needs to see. AI can only enhance the response
  // when there is no pending question (e.g., confirmations, completions).
  //
  let aiMessage: string | undefined;
  let aiResponse = false;
  let suggestions: AISuggestion[] | undefined;

  const hasStructuredQuestion = engineResult.questionMetadata != null;

  if (config.useAIResponses && !hasStructuredQuestion) {
    try {
      const respController = new AbortController();
      const respTimeout = setTimeout(() => respController.abort(), 5000);

      const updatedContext = buildContext(engineResult.updatedState, mealType);
      const responseResult = await Promise.race([
        aiProvider.generateResponse(engineResult, updatedContext)
          .finally(() => clearTimeout(respTimeout)),
        new Promise<never>((_, reject) => {
          respController.signal.addEventListener('abort', () =>
            reject(new Error('AI response timeout'))
          );
        }),
      ]);
      aiMessage = responseResult.message;
      suggestions = responseResult.suggestions;
      aiResponse = true;
    } catch (err) {
      // AI response failed or timed out — use engine's template response
      if (err instanceof Error && err.message === 'AI response timeout') {
        console.warn('[AI Engine] Response generation timed out after 5s');
      }
    }
  }

  return {
    ...engineResult,
    aiMessage,
    suggestions,
    aiParsed,
    aiResponse,
  };
}
