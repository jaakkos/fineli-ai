import { NextResponse } from 'next/server';
import { getDb, getDbUnified, isPostgres } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { createSession } from '@/lib/auth/session';
import { handleRouteError } from '@/lib/utils/api-error';
import { newId } from '@/types';

/** When REQUIRE_MAGIC_LINK is set (e.g. on Render), only magic link login is allowed. */
export async function POST() {
  try {
  if (process.env.REQUIRE_MAGIC_LINK === 'true') {
    return NextResponse.json(
      {
        error: {
          code: 'MAGIC_LINK_REQUIRED',
          message: 'Magic link login is required. Enter your email to receive a sign-in link.',
        },
      },
      { status: 403 }
    );
  }

  const anonymousId = `anon_${newId()}`;
  const userId = newId();
  const now = new Date().toISOString();

  if (isPostgres()) {
    const db = await getDbUnified();
    const raw = db.raw as any;
    const s = db.schema as any;
    await db.run(
      raw.insert(s.users).values({
        id: userId,
        anonymousId,
        email: null,
        emailVerifiedAt: null,
        createdAt: now,
        updatedAt: now,
      })
    );
  } else {
    const db = getDb();
    db.insert(schema.users)
      .values({
        id: userId,
        anonymousId,
        email: null,
        emailVerifiedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  await createSession({
    userId,
    anonymousId,
    isAnonymous: true,
  });

  return NextResponse.json({
    data: {
      userId,
      anonymousId,
      isAnonymous: true,
    },
  });
  } catch (error) {
    return handleRouteError(error);
  }
}
