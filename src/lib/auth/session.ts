import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'fineli_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Random per-process fallback for dev (never use a static known secret). */
const DEV_FALLBACK = typeof crypto !== 'undefined'
  ? Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')
  : Math.random().toString(36).repeat(4);

function getSessionSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'production' && !raw) {
    throw new Error('SESSION_SECRET is required in production');
  }
  if (!raw) {
    console.warn('[session] SESSION_SECRET not set — using random per-process fallback. Sessions will not survive restarts.');
  }
  return new TextEncoder().encode(raw || DEV_FALLBACK);
}

let SECRET: Uint8Array | null = null;
function secret(): Uint8Array {
  if (!SECRET) SECRET = getSessionSecret();
  return SECRET;
}

export interface SessionPayload {
  userId: string;
  anonymousId?: string;
  email?: string;
  isAnonymous: boolean;
}

export async function createSession(payload: SessionPayload): Promise<string> {
  const token = await new SignJWT({
    userId: payload.userId,
    anonymousId: payload.anonymousId,
    email: payload.email,
    isAnonymous: payload.isAnonymous,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_MS / 1000)
    .sign(secret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
    path: '/',
  });

  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: payload.userId as string,
      anonymousId: (payload.anonymousId as string) ?? undefined,
      email: (payload.email as string) ?? undefined,
      isAnonymous: (payload.isAnonymous as boolean) ?? false,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('SESSION_SECRET is required')) {
      throw err;
    }
    return null;
  }
}

/** Custom error for authentication failures — handled by handleRouteError. */
export class AuthError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  constructor(message = 'Not authenticated', code = 'UNAUTHORIZED', statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new AuthError();
  }
  return session;
}
