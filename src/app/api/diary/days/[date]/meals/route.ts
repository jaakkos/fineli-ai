import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getDbUnified } from '@/lib/db/client';
import { getSession } from '@/lib/auth/session';
import * as schema from '@/lib/db/schema';
import { createMealSchema, dateSchema } from '@/lib/utils/validation';
import { handleRouteError } from '@/lib/utils/api-error';
import { newId } from '@/types';

type DiaryDayRow = typeof schema.diaryDays.$inferSelect;
type MealRow = typeof schema.meals.$inferSelect;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    );
  }

  const { date } = await params;
  const dateResult = dateSchema.safeParse(date);
  if (!dateResult.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid date format (use YYYY-MM-DD)',
        },
      },
      { status: 400 }
    );
  }

  const body = await request.json();
  const parsed = createMealSchema.safeParse(body);
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

  const db = await getDbUnified();
  const raw = db.raw;
  const s = db.schema;
  const now = new Date().toISOString();

  let day = (await db.selectOne(
    raw.select().from(s.diaryDays).where(
      and(
        eq(s.diaryDays.userId, session.userId),
        eq(s.diaryDays.date, dateResult.data),
        isNull(s.diaryDays.deletedAt)
      )
    )
  )) as DiaryDayRow | undefined;

  if (!day) {
    const dayId = newId();
    await db.run(
      raw.insert(s.diaryDays).values({
        id: dayId,
        userId: session.userId,
        date: dateResult.data,
        createdAt: now,
        updatedAt: now,
      })
    );
    day = (await db.selectOne(
      raw.select().from(s.diaryDays).where(eq(s.diaryDays.id, dayId))
    )) as DiaryDayRow | undefined;
    if (!day) throw new Error('Failed to create diary day');
  }

  const existingMeals = (await db.selectAll(
    raw.select({ sortOrder: s.meals.sortOrder }).from(s.meals).where(
      and(
        eq(s.meals.diaryDayId, day.id),
        isNull(s.meals.deletedAt)
      )
    )
  )) as { sortOrder: number }[];

  const sortOrder =
    existingMeals.length > 0
      ? Math.max(...existingMeals.map((m) => m.sortOrder)) + 1
      : 0;

  const mealId = newId();
  await db.run(
    raw.insert(s.meals).values({
      id: mealId,
      diaryDayId: day.id,
      mealType: parsed.data.mealType,
      customName: parsed.data.customName ?? null,
      sortOrder,
      createdAt: now,
      updatedAt: now,
      version: 1,
    })
  );

  const meal = (await db.selectOne(
    raw.select().from(s.meals).where(eq(s.meals.id, mealId))
  )) as MealRow | undefined;

  return NextResponse.json({ data: meal });
  } catch (error) {
    return handleRouteError(error);
  }
}
