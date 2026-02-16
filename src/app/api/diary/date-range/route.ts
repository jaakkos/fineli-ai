import { NextResponse } from 'next/server';
import { and, eq, isNull, min, max } from 'drizzle-orm';
import { getDbUnified } from '@/lib/db/client';
import { getSession } from '@/lib/auth/session';
import { handleRouteError } from '@/lib/utils/api-error';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 }
      );
    }

    const db = await getDbUnified();
    const raw = db.raw;
    const s = db.schema;

    const rows = await db.selectAll(
      raw
        .select({
          minDate: min(s.diaryDays.date),
          maxDate: max(s.diaryDays.date),
        })
        .from(s.diaryDays)
        .where(
          and(
            eq(s.diaryDays.userId, session.userId),
            isNull(s.diaryDays.deletedAt)
          )
        )
    );

    const row = rows[0] as { minDate: string | null; maxDate: string | null } | undefined;

    return NextResponse.json({
      minDate: row?.minDate ?? null,
      maxDate: row?.maxDate ?? null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
