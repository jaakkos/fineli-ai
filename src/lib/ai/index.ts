/**
 * AI module entry point.
 * Creates and exports the configured AI provider (or null if AI is disabled).
 */

export type { AIProvider, AIConfig, AIConversationContext, AIParseResult, AIResponseResult } from './types';
export { parseWithAI } from './ai-parser';
export { getAIConfig } from './config';
export { createAIResultRanker } from './ai-ranker';
export type { ResultRanker } from './ai-ranker';

import type { AIProvider } from './types';
import { getAIConfig } from './config';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';

let _provider: AIProvider | null | undefined;

/**
 * Get the configured AI provider singleton.
 * Returns null if AI_PROVIDER=none (default).
 */
export function getAIProvider(): AIProvider | null {
  if (_provider !== undefined) return _provider;

  const config = getAIConfig();

  switch (config.provider) {
    case 'anthropic':
      _provider = new AnthropicProvider(config.parseModel, config.responseModel);
      break;
    case 'openai':
      _provider = new OpenAIProvider(config.parseModel, config.responseModel);
      break;
    case 'none':
    default:
      _provider = null;
      break;
  }

  return _provider;
}

/**
 * Reset the provider singleton (useful for testing).
 */
export function resetAIProvider(): void {
  _provider = undefined;
}
