/**
 * OpenAI AI provider implementation.
 * Uses function calling for structured parsing, chat API for response generation.
 */

import type {
  AIProvider,
  AIParseResult,
  AIResponseResult,
  AIConversationContext,
  AIExtractedItem,
} from './types';
import type { EngineStepResult } from '@/lib/conversation/engine';
import { getOpenAIApiKey } from './config';
import {
  buildParserSystemPrompt,
  buildResponderSystemPrompt,
  PARSE_FUNCTION_OPENAI,
} from './prompts';

// ---------------------------------------------------------------------------
// OpenAI API types (minimal, no SDK dependency)
// ---------------------------------------------------------------------------

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string | null;
  function_call?: { name: string; arguments: string };
}

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string | null;
      function_call?: { name: string; arguments: string };
      tool_calls?: Array<{
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private apiKey: string;
  private parseModel: string;
  private responseModel: string;

  constructor(parseModel?: string, responseModel?: string) {
    this.apiKey = getOpenAIApiKey();
    this.parseModel = parseModel ?? 'gpt-4o-mini';
    this.responseModel = responseModel ?? this.parseModel;
  }

  async parseMessage(
    message: string,
    context: AIConversationContext
  ): Promise<AIParseResult> {
    const systemPrompt = buildParserSystemPrompt(context);

    const response = await this.callAPI(this.parseModel, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ], {
      tools: [
        {
          type: 'function',
          function: PARSE_FUNCTION_OPENAI,
        },
      ],
      tool_choice: {
        type: 'function',
        function: { name: 'parse_food_message' },
      },
    });

    const choice = response.choices[0];
    const toolCall = choice?.message.tool_calls?.[0];
    const fnCall = toolCall?.function ?? choice?.message.function_call;

    if (!fnCall) {
      return { intent: 'unclear', confidence: 0 };
    }

    try {
      const args = JSON.parse(fnCall.arguments);
      return this.mapFunctionResult(args);
    } catch {
      return { intent: 'unclear', confidence: 0 };
    }
  }

  async generateResponse(
    engineOutput: EngineStepResult,
    context: AIConversationContext
  ): Promise<AIResponseResult> {
    const systemPrompt = buildResponderSystemPrompt(context);
    const userPrompt = this.buildResponsePrompt(engineOutput, context);

    const response = await this.callAPI(this.responseModel, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    const text = response.choices[0]?.message.content ?? '';

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

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.responseModel,
        max_tokens: 300,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
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
            const delta = event.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // Skip malformed JSON
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
    messages: OpenAIChatMessage[],
    extra?: Record<string, unknown>
  ): Promise<OpenAIChatResponse> {
    const body: Record<string, unknown> = {
      model,
      max_tokens: 500,
      messages,
      ...extra,
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${errText}`);
    }

    return (await res.json()) as OpenAIChatResponse;
  }

  private mapFunctionResult(args: Record<string, unknown>): AIParseResult {
    const intent = (args.intent as string) ?? 'unclear';
    const confidence = (args.confidence as number) ?? 0;

    const result: AIParseResult = {
      intent: intent as AIParseResult['intent'],
      confidence,
    };

    // Map items
    if (intent === 'add_items' && Array.isArray(args.items)) {
      result.items = (args.items as Record<string, unknown>[]).map(
        (item): AIExtractedItem => ({
          text: (item.text as string) ?? '',
          amount: item.amount as number | undefined,
          unit: item.unit as string | undefined,
          confidence,
          searchHint: item.searchHint as string | undefined,
          portionEstimateGrams: item.portionEstimateGrams as number | undefined,
        })
      );
    }

    // Map answer (same logic as Anthropic)
    if (intent === 'answer') {
      if (args.answerIndex != null) {
        result.answer = {
          type: 'selection',
          index: (args.answerIndex as number) - 1,
        };
      } else if (args.answerGrams != null) {
        result.answer = {
          type: 'weight',
          grams: args.answerGrams as number,
        };
      } else if (args.answerUnit && args.answerValue != null) {
        result.answer = {
          type: 'volume',
          value: args.answerValue as number,
          unit: args.answerUnit as string,
        };
      } else if (args.answerPortionSize) {
        const sizeMap: Record<string, string> = {
          pieni: 'KPL_S',
          normaali: 'KPL_M',
          iso: 'KPL_L',
        };
        result.answer = {
          type: 'portion_size',
          key: sizeMap[args.answerPortionSize as string] ?? 'KPL_M',
        };
      } else if (args.companionResponse != null) {
        result.answer = {
          type: 'companion',
          value: args.companionResponse as boolean,
        };
      }
    }

    // Map correction
    if (intent === 'correction') {
      if (args.correctionGrams != null) {
        result.correction = {
          type: 'update_portion',
          grams: args.correctionGrams as number,
        };
      } else if (args.correctionText) {
        result.correction = {
          type: 'correction',
          newText: args.correctionText as string,
        };
      }
    }

    // Map removal
    if (intent === 'removal' && args.removalTarget) {
      result.removal = { targetText: args.removalTarget as string };
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
