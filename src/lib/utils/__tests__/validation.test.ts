import { describe, it, expect } from 'vitest';
import {
  chatMessageSchema,
  conversationStateSchema,
  createMealSchema,
  dateSchema,
} from '../validation';

describe('chatMessageSchema', () => {
  it('accepts valid mealId and message', () => {
    const result = chatMessageSchema.safeParse({
      mealId: 'meal-1',
      message: 'kaurapuuro',
    });
    expect(result.success).toBe(true);
  });

  it('rejects message over 2000 chars', () => {
    const result = chatMessageSchema.safeParse({
      mealId: 'meal-1',
      message: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty mealId or message', () => {
    expect(chatMessageSchema.safeParse({ mealId: '', message: 'hi' }).success).toBe(false);
    expect(chatMessageSchema.safeParse({ mealId: 'm', message: '' }).success).toBe(false);
  });
});

describe('conversationStateSchema', () => {
  it('accepts minimal valid state', () => {
    const state = {
      sessionId: 's1',
      mealId: 'm1',
      items: [],
      unresolvedQueue: [],
      activeItemId: null,
      pendingQuestion: null,
      companionChecks: [],
      isComplete: false,
      language: 'fi' as const,
    };
    expect(conversationStateSchema.safeParse(state).success).toBe(true);
  });

  it('accepts state with items and pending question', () => {
    const state = {
      sessionId: 's1',
      mealId: 'm1',
      items: [
        {
          id: 'i1',
          rawText: 'maito',
          state: 'RESOLVED',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      unresolvedQueue: [] as string[],
      activeItemId: null,
      pendingQuestion: {
        id: 'q1',
        itemId: 'i1',
        type: 'portion' as const,
        templateKey: 'portion',
        templateParams: { foodName: 'Maito' },
        retryCount: 0,
        askedAt: 3,
      },
      companionChecks: [] as string[],
      isComplete: false,
      language: 'en' as const,
    };
    expect(conversationStateSchema.safeParse(state).success).toBe(true);
  });

  it('rejects invalid language', () => {
    const state = {
      sessionId: 's1',
      mealId: 'm1',
      items: [],
      unresolvedQueue: [],
      activeItemId: null,
      pendingQuestion: null,
      companionChecks: [],
      isComplete: false,
      language: 'de',
    };
    expect(conversationStateSchema.safeParse(state).success).toBe(false);
  });

  it('rejects invalid item state', () => {
    const state = {
      sessionId: 's1',
      mealId: 'm1',
      items: [
        {
          id: 'i1',
          rawText: 'maito',
          state: 'INVALID_STATE',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      unresolvedQueue: [] as string[],
      activeItemId: null,
      pendingQuestion: null,
      companionChecks: [] as string[],
      isComplete: false,
      language: 'fi' as const,
    };
    expect(conversationStateSchema.safeParse(state).success).toBe(false);
  });
});

describe('createMealSchema', () => {
  it('accepts valid meal type and optional customName', () => {
    expect(
      createMealSchema.safeParse({ mealType: 'breakfast' }).success
    ).toBe(true);
    expect(
      createMealSchema.safeParse({
        mealType: 'lunch',
        customName: 'Lounas',
      }).success
    ).toBe(true);
  });

  it('rejects invalid meal type', () => {
    expect(
      createMealSchema.safeParse({ mealType: 'brunch' }).success
    ).toBe(false);
  });
});

describe('dateSchema', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(dateSchema.safeParse('2026-02-15').success).toBe(true);
  });

  it('rejects invalid format', () => {
    expect(dateSchema.safeParse('15.02.2026').success).toBe(false);
    expect(dateSchema.safeParse('2026/02/15').success).toBe(false);
    expect(dateSchema.safeParse('').success).toBe(false);
  });
});
