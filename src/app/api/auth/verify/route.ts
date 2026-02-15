import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and, isNull, gt, lt, or, isNotNull } from 'drizzle-orm';
import { getDbUnified } from '@/lib/db/client';
import { createSession } from '@/lib/auth/session';
import { handleRouteError } from '@/lib/utils/api-error';

const verifyBodySchema = z.object({
  token: z.string().min(1),
});

/**
 * Cleanup expired/used tokens older than 24h. Runs opportunistically
 * during verification to keep the table bounded without a cron job.
 */
let lastTokenCleanup = 0;
const TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function cleanupExpiredTokens(db: Awaited<ReturnType<typeof getDbUnified>>) {
  const now = Date.now();
  if (now - lastTokenCleanup < TOKEN_CLEANUP_INTERVAL_MS) return;
  lastTokenCleanup = now;

  const raw = db.raw as any;
  const s = db.schema as any;
  const cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString(); // 24h ago

  try {
    // Delete tokens that are either: expired 24h+ ago, or used 24h+ ago
    await db.run(
      raw.delete(s.authTokens).where(
        or(
          lt(s.authTokens.expiresAt, cutoff),
          and(isNotNull(s.authTokens.usedAt), lt(s.authTokens.usedAt, cutoff))
        )
      )
    );
  } catch (e) {
    // Non-critical — log and continue
    console.error('[auth] token cleanup failed', e);
  }
}

/** Verify magic link token and create session. */
export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' } },
        { status: 400 }
      );
    }

    const parsed = verifyBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid token',
            details: parsed.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const db = await getDbUnified();
    const raw = db.raw as any;
    const s = db.schema as any;
    const now = new Date().toISOString();

    const authToken = (await db.selectOne(
      raw
        .select()
        .from(s.authTokens)
        .where(
          and(
            eq(s.authTokens.token, parsed.data.token),
            isNull(s.authTokens.usedAt),
            gt(s.authTokens.expiresAt, now)
          )
        )
    )) as { id: string; userId: string; pendingEmail: string | null } | undefined;

    if (!authToken) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_TOKEN',
            message: 'Token is invalid or expired',
          },
        },
        { status: 400 }
      );
    }

    // Mark token as used atomically (WHERE usedAt IS NULL prevents double-use race)
    await db.run(
      raw.update(s.authTokens)
        .set({ usedAt: now })
        .where(and(eq(s.authTokens.id, authToken.id), isNull(s.authTokens.usedAt)))
    );

    const user = (await db.selectOne(
      raw.select().from(s.users).where(eq(s.users.id, authToken.userId))
    )) as { id: string; anonymousId: string | null; email: string | null } | undefined;

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        },
        { status: 404 }
      );
    }

    // If the token carried a pendingEmail (authenticated user changing email), set it now.
    // Also mark email as verified.
    const emailUpdate: Record<string, string> = { emailVerifiedAt: now, updatedAt: now };
    if (authToken.pendingEmail) {
      emailUpdate.email = authToken.pendingEmail;
    }
    await db.run(
      raw.update(s.users)
        .set(emailUpdate)
        .where(eq(s.users.id, user.id))
    );

    const verifiedEmail = authToken.pendingEmail ?? user.email;
    await createSession({
      userId: user.id,
      anonymousId: user.anonymousId ?? undefined,
      email: verifiedEmail ?? undefined,
      isAnonymous: false,
    });

    // Opportunistic cleanup of old tokens (non-blocking, best-effort)
    cleanupExpiredTokens(db).catch(() => {});

    return NextResponse.json({
      data: {
        userId: user.id,
        email: verifiedEmail ?? user.email,
        isAnonymous: false,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
