import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDbUnified } from '@/lib/db/client';
import { getSession } from '@/lib/auth/session';
import { Resend } from 'resend';
import { handleRouteError } from '@/lib/utils/api-error';
import { newId } from '@/types';

const magicLinkBodySchema = z.object({
  email: z.string().email(),
});

/** Resend client (only used when RESEND_API_KEY is set). */
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

/** Base URL for magic link (must match the deployed app URL on Render). */
function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000'
  );
}

/**
 * Create magic link token and send it by email (or log in dev).
 * Works with or without a session: with session, updates current user's email;
 * without session (e.g. production magic-link-only), finds or creates user by email.
 */
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
    const parsed = magicLinkBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid email',
            details: parsed.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const { email } = parsed.data;
    const db = await getDbUnified();
    const raw = db.raw;
    const s = db.schema;

    let userId: string;
    let pendingEmail: string | null = null;

    const session = await getSession();
    if (session) {
      // Authenticated user wants to add/change email.
      // DON'T update user record now — defer until link is clicked (verification).
      userId = session.userId;
      pendingEmail = email;
    } else {
      // Unauthenticated: find or create user by email
      // Rate limiting (10/min per IP in middleware) prevents mass phantom user creation.
      // Users created here have emailVerifiedAt=null until they click the magic link.
      const existing = await db.selectOne(
        raw.select().from(s.users).where(eq(s.users.email, email))
      ) as { id: string } | undefined;
      if (existing) {
        userId = existing.id;
      } else {
        userId = newId();
        const now = new Date().toISOString();
        await db.run(
          raw.insert(s.users).values({
            id: userId,
            anonymousId: null,
            email,
            emailVerifiedAt: null,
            createdAt: now,
            updatedAt: now,
          })
        );
      }
    }

    const token = newId();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await db.run(
      raw.insert(s.authTokens).values({
        id: newId(),
        userId,
        token,
        pendingEmail,  // set only for authenticated users changing email
        expiresAt,
        usedAt: null,
        createdAt: new Date().toISOString(),
      })
    );

    const baseUrl = getBaseUrl().replace(/\/$/, '');
    const link = `${baseUrl}/auth/verify?token=${token}`;

    const resend = getResend();
    if (resend) {
      const from = process.env.RESEND_FROM ?? 'Ruokapäiväkirja <onboarding@resend.dev>';
      const { error } = await resend.emails.send({
        from,
        to: [email],
        subject: 'Kirjautumislinkki – Ruokapäiväkirja',
        html: `
          <p>Hei,</p>
          <p>Klikkaa alla olevaa linkkiä kirjautuaksesi:</p>
          <p><a href="${link}">${link}</a></p>
          <p>Linkki vanhenee 15 minuutissa.</p>
        `,
      });
      if (error) {
        console.error('[Magic Link] Resend error', error);
        return NextResponse.json(
          {
            error: {
              code: 'EMAIL_FAILED',
              message: 'Could not send email. Please try again.',
            },
          },
          { status: 500 }
        );
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Magic Link]', { email, link });
      } else {
        return NextResponse.json(
          {
            error: {
              code: 'EMAIL_NOT_CONFIGURED',
              message: 'Magic link email is not configured (RESEND_API_KEY).',
            },
          },
          { status: 503 }
        );
      }
    }

    return NextResponse.json({
      data: {
        message: resend
          ? 'Check your email for the sign-in link.'
          : 'Magic link created (dev: check server logs).',
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
