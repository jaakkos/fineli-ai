import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getDbUnified } from '@/lib/db/client';
import { getSession } from '@/lib/auth/session';
import * as schema from '@/lib/db/schema';
import { createMealSchema } from '@/lib/utils/validation';
import { handleRouteError } from '@/lib/utils/api-error';

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
  const raw = db.raw as any;
  const s = db.schema as any;

  const meal = (await db.selectOne(
    raw.select().from(s.meals).where(
      and(eq(s.meals.id, id), isNull(s.meals.deletedAt))
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
  const parsed = createMealSchema.partial().safeParse(body);
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
  const updates: Partial<typeof meal> = { updatedAt: now };

  if (parsed.data.mealType != null) updates.mealType = parsed.data.mealType;
  if (parsed.data.customName !== undefined)
    updates.customName = parsed.data.customName ?? null;

  await db.run(raw.update(s.meals).set(updates).where(eq(s.meals.id, id)));

  const updated = (await db.selectOne(
    raw.select().from(s.meals).where(eq(s.meals.id, id))
  )) as MealRow | undefined;

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
  const raw = db.raw as any;
  const s = db.schema as any;

  const meal = (await db.selectOne(
    raw.select().from(s.meals).where(
      and(eq(s.meals.id, id), isNull(s.meals.deletedAt))
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

  const now = new Date().toISOString();
  await db.run(
    raw.update(s.meals).set({ deletedAt: now, updatedAt: now }).where(eq(s.meals.id, id))
  );

  return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return handleRouteError(error);
  }
}
