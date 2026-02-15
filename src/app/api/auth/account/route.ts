import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireSession } from '@/lib/auth/session';
import { getDbUnified } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { handleRouteError } from '@/lib/utils/api-error';

/**
 * DELETE /api/auth/account
 *
 * GDPR Art. 17 — Right to erasure ("right to be forgotten").
 * Permanently deletes the user record and all associated data
 * (diary days, meals, items, conversations, auth tokens) via CASCADE,
 * then clears the session cookie.
 */
export async function DELETE() {
  try {
    const session = await requireSession();
    const db = await getDbUnified();
    const raw = db.raw;
    const s = db.schema;

    // Delete user — ON DELETE CASCADE removes all child records:
    // auth_tokens, diary_days → meals → meal_items, conversation_messages, conversation_state
    await db.run(
      raw.delete(s.users).where(eq(s.users.id, session.userId))
    );

    // Clear session cookie
    const cookieStore = await cookies();
    cookieStore.set('fineli_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return NextResponse.json({
      data: { message: 'Account and all associated data deleted' },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * GET /api/auth/account
 *
 * GDPR Art. 15 — Right of access.
 * Returns the user's stored personal data summary.
 */
export async function GET() {
  try {
    const session = await requireSession();
    const db = await getDbUnified();
    const raw = db.raw;
    const s = db.schema;

    const user = await db.selectOne(
      raw.select({
        id: s.users.id,
        email: s.users.email,
        emailVerifiedAt: s.users.emailVerifiedAt,
        createdAt: s.users.createdAt,
      }).from(s.users).where(eq(s.users.id, session.userId))
    ) as { id: string; email: string | null; emailVerifiedAt: string | null; createdAt: string } | undefined;

    if (!user) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          emailVerifiedAt: user.emailVerifiedAt,
          createdAt: user.createdAt,
        },
        isAnonymous: session.isAnonymous,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
