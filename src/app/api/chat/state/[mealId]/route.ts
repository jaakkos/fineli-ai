import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDbUnified } from '@/lib/db/client';
import { getSession } from '@/lib/auth/session';
import { handleRouteError } from '@/lib/utils/api-error';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mealId: string }> }
) {
  try {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    );
  }

  const { mealId } = await params;
  const db = await getDbUnified();
  const raw = db.raw as any;
  const s = db.schema as any;

  const meal = (await db.selectOne(
    raw.select().from(s.meals).where(
      and(eq(s.meals.id, mealId), isNull(s.meals.deletedAt))
    )
  )) as { id: string; diaryDayId: string } | undefined;

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

  const messages = (await db.selectAll(
    raw.select()
      .from(s.conversationMessages)
      .where(eq(s.conversationMessages.mealId, mealId))
      .orderBy(asc(s.conversationMessages.createdAt))
  )) as { id: string; role: string; content: string; metadata: unknown; createdAt: string }[];

  return NextResponse.json({
    data: {
      state: stateRow?.stateJson ?? null,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt,
      })),
    },
  });
  } catch (error) {
    return handleRouteError(error);
  }
}
