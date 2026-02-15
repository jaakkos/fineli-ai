/**
 * AI provider configuration from environment variables.
 */

import type { AIConfig, AIProviderType } from './types';

export function getAIConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER ?? 'none') as AIProviderType;

  return {
    provider,
    confidenceThreshold: parseFloat(
      process.env.AI_CONFIDENCE_THRESHOLD ?? '0.5'
    ),
    useAIResponses: process.env.AI_USE_RESPONSES !== 'false',
    enableSuggestions: process.env.AI_ENABLE_SUGGESTIONS !== 'false',
    parseModel:
      provider === 'anthropic'
        ? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514'
        : process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    responseModel:
      provider === 'anthropic'
        ? process.env.ANTHROPIC_RESPONSE_MODEL ??
          process.env.ANTHROPIC_MODEL ??
          'claude-sonnet-4-20250514'
        : process.env.OPENAI_RESPONSE_MODEL ??
          process.env.OPENAI_MODEL ??
          'gpt-4o-mini',
  };
}

export function getAnthropicApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic');
  return key;
}

export function getOpenAIApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
  return key;
}
