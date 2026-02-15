import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getDbUnified } from '@/lib/db/client';
import { getSession } from '@/lib/auth/session';
import * as schema from '@/lib/db/schema';
import { addMealItemSchema } from '@/lib/utils/validation';
import { handleRouteError } from '@/lib/utils/api-error';

type MealItemRow = typeof schema.mealItems.$inferSelect;
type MealRow = typeof schema.meals.$inferSelect;
type DiaryDayRow = typeof schema.diaryDays.$inferSelect;

export async function PUT(
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

  const { id } = await params;
  const db = await getDbUnified();
  const raw = db.raw;
  const s = db.schema;

  const item = (await db.selectOne(
    raw.select().from(s.mealItems).where(
      and(eq(s.mealItems.id, id), isNull(s.mealItems.deletedAt))
    )
  )) as MealItemRow | undefined;

  if (!item) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Item not found' } },
      { status: 404 }
    );
  }

  const meal = (await db.selectOne(
    raw.select().from(s.meals).where(
      and(
        eq(s.meals.id, item.mealId),
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
    raw.select().from(s.diaryDays).where(eq(s.diaryDays.id, meal.diaryDayId))
  )) as DiaryDayRow | undefined;

  if (!day || day.userId !== session.userId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Access denied' } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = addMealItemSchema.partial().safeParse(body);
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

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (parsed.data.fineliFoodId != null)
    updates.fineliFoodId = parsed.data.fineliFoodId;
  if (parsed.data.fineliNameFi != null)
    updates.fineliNameFi = parsed.data.fineliNameFi;
  if (parsed.data.fineliNameEn !== undefined)
    updates.fineliNameEn = parsed.data.fineliNameEn ?? null;
  if (parsed.data.userText !== undefined)
    updates.userText = parsed.data.userText ?? null;
  if (parsed.data.portionAmount != null)
    updates.portionAmount = parsed.data.portionAmount;
  if (parsed.data.portionUnitCode !== undefined)
    updates.portionUnitCode = parsed.data.portionUnitCode ?? null;
  if (parsed.data.portionUnitLabel !== undefined)
    updates.portionUnitLabel = parsed.data.portionUnitLabel ?? null;
  if (parsed.data.portionGrams != null)
    updates.portionGrams = parsed.data.portionGrams;
  if (parsed.data.nutrientsPer100g != null)
    updates.nutrientsPer100g = parsed.data.nutrientsPer100g;

  await db.run(raw.update(s.mealItems).set(updates).where(eq(s.mealItems.id, id)));

  const updated = (await db.selectOne(
    raw.select().from(s.mealItems).where(eq(s.mealItems.id, id))
  )) as MealItemRow | undefined;

  return NextResponse.json({ data: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
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

  const { id } = await params;
  const db = await getDbUnified();
  const raw = db.raw;
  const s = db.schema;

  const item = (await db.selectOne(
    raw.select().from(s.mealItems).where(
      and(eq(s.mealItems.id, id), isNull(s.mealItems.deletedAt))
    )
  )) as MealItemRow | undefined;

  if (!item) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Item not found' } },
      { status: 404 }
    );
  }

  const meal = (await db.selectOne(
    raw.select().from(s.meals).where(eq(s.meals.id, item.mealId))
  )) as MealRow | undefined;

  if (!meal) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Meal not found' } },
      { status: 404 }
    );
  }

  const day = (await db.selectOne(
    raw.select().from(s.diaryDays).where(eq(s.diaryDays.id, meal.diaryDayId))
  )) as DiaryDayRow | undefined;

  if (!day || day.userId !== session.userId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Access denied' } },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  await db.run(
    raw.update(s.mealItems).set({ deletedAt: now, updatedAt: now }).where(eq(s.mealItems.id, id))
  );

  return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}
