import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getDbUnified } from '@/lib/db/client';
import { getSession } from '@/lib/auth/session';
import { chatMessageSchema, conversationStateSchema } from '@/lib/utils/validation';
import { handleRouteError } from '@/lib/utils/api-error';
import { processMessageWithAI } from '@/lib/ai/ai-engine';
import { getAIProvider } from '@/lib/ai';
import { fineliClient, portionConverter } from '@/lib/fineli/singleton';
import { newId } from '@/types';
import type { ConversationState, MealType } from '@/types';

export async function POST(request: NextRequest) {
  try {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    );
  }

  const body = await request.json();
  const parsed = chatMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        },
      },
      { status: 400 }
    );
  }

  const { mealId, message } = parsed.data;
  const db = await getDbUnified();
  const raw = db.raw;
  const s = db.schema;

  const meal = (await db.selectOne(
    raw.select().from(s.meals).where(
      and(eq(s.meals.id, mealId), isNull(s.meals.deletedAt))
    )
  )) as { id: string; diaryDayId: string; version: number; mealType: string | null } | undefined;

  if (!meal) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Meal not found' } },
      { status: 404 }
    );
  }

  const day = (await db.selectOne(
    raw.select().from(s.diaryDays).where(eq(s.diaryDays.id, meal.diaryDayId))
  )) as { id: string; userId: string } | undefined;

  if (!day || day.userId !== session.userId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Access denied' } },
      { status: 403 }
    );
  }

  const stateRow = (await db.selectOne(
    raw.select().from(s.conversationState).where(eq(s.conversationState.mealId, mealId))
  )) as { stateJson: unknown } | undefined;

  let currentState: ConversationState;

  if (stateRow) {
    const parsed = conversationStateSchema.safeParse(stateRow.stateJson);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Conversation state in database is invalid or migrated',
            details: parsed.error.flatten(),
          },
        },
        { status: 500 }
      );
    }
    currentState = parsed.data as ConversationState;
  } else {
    currentState = {
      sessionId: newId(),
      mealId,
      items: [],
      unresolvedQueue: [],
      activeItemId: null,
      pendingQuestion: null,
      companionChecks: [],
      isComplete: false,
      language: 'fi',
    };
  }

  // Use AI-enhanced engine if an AI provider is configured
  const aiProvider = getAIProvider();
  const mealType = (meal.mealType ?? 'other') as MealType;
  const result = await processMessageWithAI(
    message,
    currentState,
    fineliClient,
    portionConverter,
    aiProvider,
    mealType
  );

  const now = new Date().toISOString();

  // Optimistic concurrency: only one writer per meal at a time
  await db.run(
    raw.update(s.meals)
      .set({ version: meal.version + 1, updatedAt: now })
      .where(and(eq(s.meals.id, mealId), eq(s.meals.version, meal.version)))
  );

  const updatedMeal = (await db.selectOne(
    raw.select({ id: s.meals.id }).from(s.meals).where(
      and(eq(s.meals.id, mealId), eq(s.meals.version, meal.version + 1))
    )
  )) as { id: string } | undefined;

  if (!updatedMeal) {
    return NextResponse.json(
      {
        error: {
          code: 'CONFLICT',
          message: 'This meal was updated by another request. Please try again.',
        },
      },
      { status: 409 }
    );
  }

  // Determine the final displayed message — AI-generated or engine template
  const displayedMessage = result.aiMessage ?? result.assistantMessage;

  await db.run(
    raw.insert(s.conversationMessages).values({
      id: newId(),
      mealId,
      role: 'user',
      content: message,
      metadata: null,
      createdAt: now,
    })
  );

  await db.run(
    raw.insert(s.conversationMessages).values({
      id: newId(),
      mealId,
      role: 'assistant',
      content: displayedMessage,
      metadata: result.questionMetadata
        ? { questionMetadata: result.questionMetadata }
        : null,
      createdAt: now,
    })
  );

  if (result.resolvedItems.length > 0) {
    const existingItems = (await db.selectAll(
      raw.select({ sortOrder: s.mealItems.sortOrder })
        .from(s.mealItems)
        .where(and(eq(s.mealItems.mealId, mealId), isNull(s.mealItems.deletedAt)))
    )) as { sortOrder: number }[];

    let sortOrder =
      existingItems.length > 0
        ? Math.max(...existingItems.map((i) => i.sortOrder)) + 1
        : 0;

    for (const item of result.resolvedItems) {
      await db.run(
        raw.insert(s.mealItems).values({
          id: newId(),
          mealId,
          userText: null,
          fineliFoodId: item.fineliFoodId,
          fineliNameFi: item.fineliNameFi,
          fineliNameEn: item.fineliNameEn,
          portionAmount: item.portionAmount,
          portionUnitCode: item.portionUnitCode,
          portionUnitLabel: item.portionUnitLabel,
          portionGrams: item.portionGrams,
          nutrientsPer100g: item.nutrientsPer100g,
          sortOrder: sortOrder++,
          createdAt: now,
          updatedAt: now,
        })
      );
    }
  }

  if (stateRow) {
    await db.run(
      raw.update(s.conversationState)
        .set({
          stateJson: result.updatedState as unknown as Record<string, unknown>,
          updatedAt: now,
        })
        .where(eq(s.conversationState.mealId, mealId))
    );
  } else {
    await db.run(
      raw.insert(s.conversationState).values({
        mealId,
        stateJson: result.updatedState as unknown as Record<string, unknown>,
        updatedAt: now,
      })
    );
  }

  return NextResponse.json({
    data: {
      assistantMessage: displayedMessage,
      questionMetadata: result.questionMetadata,
      // AI metadata for the frontend
      ai: {
        parsed: result.aiParsed,
        responded: result.aiResponse,
        suggestions: result.suggestions ?? [],
      },
    },
  });
  } catch (error) {
    return handleRouteError(error);
  }
}
