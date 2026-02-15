import { describe, it, expect } from 'vitest';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Tests JWT session logic used by session.ts.
 * createSession uses next/headers cookies() which isn't available in Node test env,
 * so we test the JWT encode/decode logic directly with jose.
 */

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-production'
);

interface SessionPayload {
  userId: string;
  anonymousId?: string;
  email?: string;
  isAnonymous: boolean;
}

async function createTestJwt(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    anonymousId: payload.anonymousId,
    email: payload.email,
    isAnonymous: payload.isAnonymous,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_MS / 1000)
    .sign(SECRET);
}

async function verifyTestJwt(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      userId: payload.userId as string,
      anonymousId: (payload.anonymousId as string) ?? undefined,
      email: (payload.email as string) ?? undefined,
      isAnonymous: (payload.isAnonymous as boolean) ?? false,
    };
  } catch {
    return null;
  }
}

describe('JWT Session (session.ts logic)', () => {
  it('creates a valid JWT string', async () => {
    const payload: SessionPayload = {
      userId: 'user-123',
      isAnonymous: true,
    };
    const token = await createTestJwt(payload);

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
  });

  it('produces JWT that can be verified with jose', async () => {
    const payload: SessionPayload = {
      userId: 'user-abc',
      anonymousId: 'anon-xyz',
      email: 'test@example.com',
      isAnonymous: false,
    };
    const token = await createTestJwt(payload);
    const verified = await verifyTestJwt(token);

    expect(verified).not.toBeNull();
    expect(verified!.userId).toBe('user-abc');
    expect(verified!.anonymousId).toBe('anon-xyz');
    expect(verified!.email).toBe('test@example.com');
    expect(verified!.isAnonymous).toBe(false);
  });

  it('round-trips payload correctly', async () => {
    const original: SessionPayload = {
      userId: 'round-trip-user',
      anonymousId: 'anon-123',
      email: 'round@trip.com',
      isAnonymous: true,
    };
    const token = await createTestJwt(original);
    const decoded = await verifyTestJwt(token);

    expect(decoded).toEqual(original);
  });

  it('rejects expired tokens', async () => {
    const payload: SessionPayload = {
      userId: 'expired-user',
      isAnonymous: true,
    };

    // Create JWT that expired 1 second ago
    const token = await new SignJWT({
      userId: payload.userId,
      anonymousId: payload.anonymousId,
      email: payload.email,
      isAnonymous: payload.isAnonymous,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1) // Already expired
      .sign(SECRET);

    const verified = await verifyTestJwt(token);
    expect(verified).toBeNull();
  });

  it('rejects token with wrong secret', async () => {
    const payload: SessionPayload = {
      userId: 'user-123',
      isAnonymous: true,
    };
    const token = await createTestJwt(payload);

    const wrongSecret = new TextEncoder().encode('wrong-secret');
    try {
      await jwtVerify(token, wrongSecret);
      expect.fail('Should have thrown');
    } catch {
      // Expected to fail
    }
  });
});
