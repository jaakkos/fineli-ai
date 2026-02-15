/**
 * Anthropic (Claude) AI provider implementation.
 * Uses tool_use for structured parsing, messages API for response generation.
 */

import type {
  AIProvider,
  AIParseResult,
  AIResponseResult,
  AIConversationContext,
  AIExtractedItem,
} from './types';
import type { EngineStepResult } from '@/lib/conversation/engine';
import { getAnthropicApiKey } from './config';
import {
  buildParserSystemPrompt,
  buildResponderSystemPrompt,
  PARSE_TOOL_ANTHROPIC,
} from './prompts';

// ---------------------------------------------------------------------------
// Anthropic API types (minimal, no SDK dependency)
// ---------------------------------------------------------------------------

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private apiKey: string;
  private parseModel: string;
  private responseModel: string;

  constructor(parseModel?: string, responseModel?: string) {
    this.apiKey = getAnthropicApiKey();
    this.parseModel = parseModel ?? 'claude-sonnet-4-20250514';
    this.responseModel = responseModel ?? this.parseModel;
  }

  async parseMessage(
    message: string,
    context: AIConversationContext
  ): Promise<AIParseResult> {
    const systemPrompt = buildParserSystemPrompt(context);

    const response = await this.callAPI(this.parseModel, systemPrompt, message, {
      tools: [PARSE_TOOL_ANTHROPIC],
      tool_choice: { type: 'tool', name: 'parse_food_message' },
    });

    // Extract tool_use result
    const toolUse = response.content.find(
      (b) => b.type === 'tool_use' && b.name === 'parse_food_message'
    );

    if (!toolUse?.input) {
      return { intent: 'unclear', confidence: 0 };
    }

    return this.mapToolResult(toolUse.input);
  }

  async generateResponse(
    engineOutput: EngineStepResult,
    context: AIConversationContext
  ): Promise<AIResponseResult> {
    const systemPrompt = buildResponderSystemPrompt(context);

    const userPrompt = this.buildResponsePrompt(engineOutput, context);

    const response = await this.callAPI(
      this.responseModel,
      systemPrompt,
      userPrompt
    );

    const text =
      response.content.find((b) => b.type === 'text')?.text ?? '';

    return {
      message: text.trim() || engineOutput.assistantMessage,
    };
  }

  async *streamResponse(
    engineOutput: EngineStepResult,
    context: AIConversationContext
  ): AsyncIterable<string> {
    const systemPrompt = buildResponderSystemPrompt(context);
    const userPrompt = this.buildResponsePrompt(engineOutput, context);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.responseModel,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      yield engineOutput.assistantMessage;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const event = JSON.parse(data);
            if (
              event.type === 'content_block_delta' &&
              event.delta?.type === 'text_delta'
            ) {
              yield event.delta.text;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async callAPI(
    model: string,
    system: string,
    userMessage: string,
    extra?: Record<string, unknown>
  ): Promise<AnthropicResponse> {
    const body: Record<string, unknown> = {
      model,
      max_tokens: 500,
      system,
      messages: [{ role: 'user', content: userMessage }],
      ...extra,
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${errText}`);
    }

    return (await res.json()) as AnthropicResponse;
  }

  private mapToolResult(input: Record<string, unknown>): AIParseResult {
    const intent = (input.intent as string) ?? 'unclear';
    const confidence = (input.confidence as number) ?? 0;

    const result: AIParseResult = {
      intent: intent as AIParseResult['intent'],
      confidence,
    };

    // Map items
    if (intent === 'add_items' && Array.isArray(input.items)) {
      result.items = (input.items as Record<string, unknown>[]).map(
        (item): AIExtractedItem => ({
          text: (item.text as string) ?? '',
          amount: item.amount as number | undefined,
          unit: item.unit as string | undefined,
          confidence: confidence,
          searchHint: item.searchHint as string | undefined,
          portionEstimateGrams: item.portionEstimateGrams as number | undefined,
        })
      );
    }

    // Map answer
    if (intent === 'answer') {
      if (input.answerIndex != null) {
        result.answer = {
          type: 'selection',
          index: (input.answerIndex as number) - 1, // Convert 1-based to 0-based
        };
      } else if (input.answerGrams != null) {
        result.answer = {
          type: 'weight',
          grams: input.answerGrams as number,
        };
      } else if (input.answerUnit && input.answerValue != null) {
        result.answer = {
          type: 'volume',
          value: input.answerValue as number,
          unit: input.answerUnit as string,
        };
      } else if (input.answerPortionSize) {
        const sizeMap: Record<string, string> = {
          pieni: 'KPL_S',
          normaali: 'KPL_M',
          iso: 'KPL_L',
        };
        result.answer = {
          type: 'portion_size',
          key: sizeMap[input.answerPortionSize as string] ?? 'KPL_M',
        };
      } else if (input.companionResponse != null) {
        result.answer = {
          type: 'companion',
          value: input.companionResponse as boolean,
        };
      }
    }

    // Map correction
    if (intent === 'correction') {
      if (input.correctionGrams != null) {
        result.correction = {
          type: 'update_portion',
          grams: input.correctionGrams as number,
        };
      } else if (input.correctionText) {
        result.correction = {
          type: 'correction',
          newText: input.correctionText as string,
        };
      }
    }

    // Map removal
    if (intent === 'removal' && input.removalTarget) {
      result.removal = { targetText: input.removalTarget as string };
    }

    return result;
  }

  private buildResponsePrompt(
    engineOutput: EngineStepResult,
    context: AIConversationContext
  ): string {
    const parts: string[] = [];

    parts.push(`KONEEN TUOTOS: ${engineOutput.assistantMessage}`);

    if (engineOutput.resolvedItems.length > 0) {
      const items = engineOutput.resolvedItems
        .map(
          (ri) =>
            `- ${ri.fineliNameFi}: ${ri.portionGrams}g (${Math.round(
              (ri.computedNutrients.ENERC ?? 0) / 4.184
            )} kcal)`
        )
        .join('\n');
      parts.push(`LISÄTYT RUUAT:\n${items}`);
    }

    if (engineOutput.questionMetadata) {
      parts.push(
        `ODOTTAVA KYSYMYS: tyyppi=${engineOutput.questionMetadata.type}`
      );
      if (engineOutput.questionMetadata.options) {
        const opts = engineOutput.questionMetadata.options
          .map((o) => `- ${o.label}`)
          .join('\n');
        parts.push(`VAIHTOEHDOT:\n${opts}`);
      }
    }

    parts.push(
      'Generoi luonnollinen suomenkielinen vastaus. Jos on kysymys, sisällytä se. Ole lyhyt ja ystävällinen.'
    );

    return parts.join('\n\n');
  }
}
