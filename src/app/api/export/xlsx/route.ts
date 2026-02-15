import { NextRequest, NextResponse } from 'next/server';
import { and, between, eq, isNull } from 'drizzle-orm';
import { getDbUnified } from '@/lib/db/client';
import { getSession } from '@/lib/auth/session';
import { computeNutrients } from '@/lib/fineli/nutrients';
import { generateExport } from '@/lib/export/xlsx-builder';
import { dateSchema } from '@/lib/utils/validation';
import { handleRouteError } from '@/lib/utils/api-error';
import type { ExportInput, MealType } from '@/types';

export async function GET(request: NextRequest) {
  try {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  const fromResult = dateSchema.safeParse(fromParam);
  const toResult = dateSchema.safeParse(toParam);

  if (!fromResult.success || !toResult.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query params "from" and "to" must be YYYY-MM-DD dates',
        },
      },
      { status: 400 }
    );
  }

  const from = fromResult.data;
  const to = toResult.data;
  if (from > to) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: '"from" must be before or equal to "to"',
        },
      },
      { status: 400 }
    );
  }

  const db = await getDbUnified();
  const raw = db.raw;
  const s = db.schema;

  const days = (await db.selectAll(
    raw.select().from(s.diaryDays).where(
      and(
        eq(s.diaryDays.userId, session.userId),
        between(s.diaryDays.date, from, to),
        isNull(s.diaryDays.deletedAt)
      )
    )
  )) as { id: string; date: string }[];

  const input: ExportInput = {
    days: [],
  };

  for (const day of days) {
    const meals = (await db.selectAll(
      raw.select()
        .from(s.meals)
        .where(and(eq(s.meals.diaryDayId, day.id), isNull(s.meals.deletedAt)))
        .orderBy(s.meals.sortOrder)
    )) as { id: string; mealType: string | null; customName: string | null }[];

    const dayMeals: ExportInput['days'][0]['meals'] = [];

    for (const meal of meals) {
      const items = (await db.selectAll(
        raw.select()
          .from(s.mealItems)
          .where(and(eq(s.mealItems.mealId, meal.id), isNull(s.mealItems.deletedAt)))
          .orderBy(s.mealItems.sortOrder)
      )) as { fineliNameFi: string; portionAmount: number; portionUnitLabel: string | null; portionUnitCode: string | null; portionGrams: number; nutrientsPer100g: Record<string, number> }[];

      const exportItems = items.map((item) => {
        const computedNutrients = computeNutrients(
          item.nutrientsPer100g,
          item.portionGrams
        );
        const nutrients: Record<string, number | null> = {};
        for (const [k, v] of Object.entries(computedNutrients)) {
          nutrients[k] = v;
        }
        return {
          foodName: item.fineliNameFi,
          amount: item.portionAmount,
          unit: item.portionUnitLabel ?? item.portionUnitCode ?? 'g',
          grams: item.portionGrams,
          nutrients,
        };
      });

      dayMeals.push({
        mealType: meal.mealType as MealType,
        customName: meal.customName ?? undefined,
        items: exportItems,
      });
    }

    input.days.push({
      date: day.date,
      meals: dayMeals,
    });
  }

  try {
    const buffer = await generateExport(input);
    const filename = `ruokapäiväkirja_${from}_${to}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('[Export xlsx]', err);
    return NextResponse.json(
      {
        error: {
          code: 'EXPORT_ERROR',
          message: err instanceof Error ? err.message : 'Export failed',
        },
      },
      { status: 500 }
    );
  }
  } catch (error) {
    return handleRouteError(error);
  }
}
