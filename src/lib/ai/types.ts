/**
 * AI provider interface and types.
 * Supports Anthropic (Claude) and OpenAI as interchangeable backends.
 */

import type {
  ConversationState,
  MealType,
  FineliFood,
  PendingQuestion,
  QuestionOption,
} from '@/types';
import type { ParsedAnswer } from '@/lib/conversation/parser';
import type { EngineStepResult } from '@/lib/conversation/engine';

// ---------------------------------------------------------------------------
// AI Parse Result (output of AI parser)
// ---------------------------------------------------------------------------

export interface AIExtractedItem {
  /** The food name (normalized Finnish) */
  text: string;
  /** Extracted amount (e.g., 120) */
  amount?: number;
  /** Extracted unit (e.g., "g", "dl", "kpl") */
  unit?: string;
  /** AI confidence for this extraction (0-1) */
  confidence: number;
  /** Better search term for Fineli (e.g., "kevytmaito" → "maito, kevyt") */
  searchHint?: string;
  /** AI's portion estimate in grams (e.g., "kuppi kahvia" → 200) */
  portionEstimateGrams?: number;
}

export interface AIParseResult {
  intent: 'add_items' | 'answer' | 'correction' | 'removal' | 'done' | 'unclear';

  /** For add_items intent */
  items?: AIExtractedItem[];

  /** For answer intent (same types as regex parser) */
  answer?: ParsedAnswer;

  /** For correction intent */
  correction?: {
    type: 'correction' | 'update_portion';
    newText?: string;
    grams?: number;
  };

  /** For removal intent */
  removal?: { targetText: string };

  /** Overall confidence (0-1). Fall back to regex if < threshold. */
  confidence: number;

  /** Better Fineli search terms (AI may know canonical names) */
  searchHints?: Record<string, string>;

  /** AI's portion estimates per item text */
  portionEstimates?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// AI Response Result
// ---------------------------------------------------------------------------

export interface AISuggestion {
  type: 'companion' | 'portion_sanity';
  message: string;
  /** Optional structured data for the UI */
  data?: {
    companionFood?: string;
    suggestedGrams?: number;
  };
}

export interface AIResponseResult {
  /** Natural language response in Finnish */
  message: string;
  /** Optional proactive suggestions */
  suggestions?: AISuggestion[];
  /** Quick reply options for the UI */
  quickReplies?: QuestionOption[];
}

// ---------------------------------------------------------------------------
// AI Conversation Context (passed to provider)
// ---------------------------------------------------------------------------

export interface AIConversationContext {
  conversationState: ConversationState;
  mealType: MealType;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  resolvedItemNames: string[];
  pendingQuestion: PendingQuestion | null;
  fineliCandidates?: FineliFood[];
  locale: 'fi' | 'en';
}

// ---------------------------------------------------------------------------
// AI Provider Interface
// ---------------------------------------------------------------------------

export interface AIProvider {
  readonly name: string;

  /**
   * Parse user message into structured intent using AI.
   * Should use structured output (tool_use / function calling).
   */
  parseMessage(
    message: string,
    context: AIConversationContext
  ): Promise<AIParseResult>;

  /**
   * Generate a natural Finnish response from engine output.
   */
  generateResponse(
    engineOutput: EngineStepResult,
    context: AIConversationContext
  ): Promise<AIResponseResult>;

  /**
   * Stream a response for real-time chat UX.
   * Optional — falls back to non-streaming generateResponse if not implemented.
   */
  streamResponse?(
    engineOutput: EngineStepResult,
    context: AIConversationContext
  ): AsyncIterable<string>;
}

// ---------------------------------------------------------------------------
// Provider configuration
// ---------------------------------------------------------------------------

export type AIProviderType = 'anthropic' | 'openai' | 'none';

export interface AIConfig {
  provider: AIProviderType;
  /** Confidence threshold below which we fall back to regex parser */
  confidenceThreshold: number;
  /** Whether to use AI for response generation (vs template strings) */
  useAIResponses: boolean;
  /** Whether to generate proactive suggestions */
  enableSuggestions: boolean;
  /** Model to use for parsing (fast, cheap) */
  parseModel?: string;
  /** Model to use for response generation (can be different) */
  responseModel?: string;
}
