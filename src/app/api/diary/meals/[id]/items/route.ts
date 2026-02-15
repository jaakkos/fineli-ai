import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getDbUnified } from '@/lib/db/client';
import { getSession } from '@/lib/auth/session';
import * as schema from '@/lib/db/schema';
import { addMealItemSchema } from '@/lib/utils/validation';
import { handleRouteError } from '@/lib/utils/api-error';
import { newId } from '@/types';

type MealRow = typeof schema.meals.$inferSelect;
type DiaryDayRow = typeof schema.diaryDays.$inferSelect;
type MealItemRow = typeof schema.mealItems.$inferSelect;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    );
  }

  const { id: mealId } = await params;
  const db = await getDbUnified();
  const raw = db.raw;
  const s = db.schema;

  const meal = (await db.selectOne(
    raw.select().from(s.meals).where(
      and(
        eq(s.meals.id, mealId),
        isNull(s.meals.deletedAt)
      )
    )
  )) as MealRow | undefined;

  if (!meal) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Meal not found' } },
      { status: 404 }
    );
  }

  const day = (await db.selectOne(
    raw.select().from(s.diaryDays).where(
      and(
        eq(s.diaryDays.id, meal.diaryDayId),
        isNull(s.diaryDays.deletedAt)
      )
    )
  )) as DiaryDayRow | undefined;

  if (!day || day.userId !== session.userId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Access denied' } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = addMealItemSchema.safeParse(body);
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

  const existingItems = (await db.selectAll(
    raw.select({ sortOrder: s.mealItems.sortOrder }).from(s.mealItems).where(
      and(
        eq(s.mealItems.mealId, mealId),
        isNull(s.mealItems.deletedAt)
      )
    )
  )) as { sortOrder: number }[];

  const sortOrder =
    existingItems.length > 0
      ? Math.max(...existingItems.map((i) => i.sortOrder)) + 1
      : 0;

  const now = new Date().toISOString();
  const itemId = newId();

  await db.run(
    raw.insert(s.mealItems).values({
      id: itemId,
      mealId,
      userText: parsed.data.userText ?? null,
      fineliFoodId: parsed.data.fineliFoodId,
      fineliNameFi: parsed.data.fineliNameFi,
      fineliNameEn: parsed.data.fineliNameEn ?? null,
      portionAmount: parsed.data.portionAmount,
      portionUnitCode: parsed.data.portionUnitCode ?? null,
      portionUnitLabel: parsed.data.portionUnitLabel ?? null,
      portionGrams: parsed.data.portionGrams,
      nutrientsPer100g: parsed.data.nutrientsPer100g,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    })
  );

  const item = (await db.selectOne(
    raw.select().from(s.mealItems).where(eq(s.mealItems.id, itemId))
  )) as MealItemRow | undefined;

  return NextResponse.json({ data: item });
  } catch (error) {
    return handleRouteError(error);
  }
}
