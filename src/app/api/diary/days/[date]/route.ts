import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { getDbUnified } from '@/lib/db/client';
import { getSession } from '@/lib/auth/session';
import * as schema from '@/lib/db/schema';
import { computeNutrients, sumNutrients } from '@/lib/fineli/nutrients';
import { dateSchema } from '@/lib/utils/validation';
import { handleRouteError } from '@/lib/utils/api-error';
import type { MealItemWithNutrients, MealWithItems } from '@/types';

type DayRow = typeof schema.diaryDays.$inferSelect;
type MealRow = typeof schema.meals.$inferSelect;
type MealItemRow = typeof schema.mealItems.$inferSelect;

export async function GET(
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

  const db = await getDbUnified();
  const raw = db.raw;
  const s = db.schema;
  const day = (await db.selectOne(
    raw.select().from(s.diaryDays).where(
      and(
        eq(s.diaryDays.userId, session.userId),
        eq(s.diaryDays.date, dateResult.data),
        isNull(s.diaryDays.deletedAt)
      )
    )
  )) as DayRow | undefined;

  if (!day) {
    return NextResponse.json({
      data: {
        id: null,
        date: dateResult.data,
        meals: [],
        dayTotals: {},
      },
    });
  }

  const meals = (await db.selectAll(
    raw.select().from(s.meals).where(
      and(eq(s.meals.diaryDayId, day.id), isNull(s.meals.deletedAt))
    ).orderBy(s.meals.sortOrder)
  )) as MealRow[];

  const mealsWithItems: MealWithItems[] = [];
  const dayTotals: Record<string, number> = {};

  for (const meal of meals) {
    const items = (await db.selectAll(
      raw.select().from(s.mealItems).where(
        and(eq(s.mealItems.mealId, meal.id), isNull(s.mealItems.deletedAt))
      ).orderBy(s.mealItems.sortOrder)
    )) as MealItemRow[];

    const itemsWithNutrients: MealItemWithNutrients[] = items.map((item) => {
      const computedNutrients = computeNutrients(
        item.nutrientsPer100g,
        item.portionGrams
      );
      return {
        ...item,
        computedNutrients,
      };
    });

    const totals = sumNutrients(
      ...itemsWithNutrients.map((i) => i.computedNutrients)
    );

    mealsWithItems.push({
      ...meal,
      items: itemsWithNutrients,
      totals,
    });

    for (const [k, v] of Object.entries(totals)) {
      dayTotals[k] = (dayTotals[k] ?? 0) + v;
    }
  }

  return NextResponse.json({
    data: {
      ...day,
      meals: mealsWithItems,
      dayTotals,
    },
  });
  } catch (error) {
    return handleRouteError(error);
  }
}
