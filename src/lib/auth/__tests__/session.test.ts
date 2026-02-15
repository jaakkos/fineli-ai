import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for session module: production SESSION_SECRET requirement.
 * getSession uses next/headers cookies(); we mock it so getSession runs and triggers secret().
 */

const originalEnv = process.env;

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

describe('session — production SESSION_SECRET', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as any);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when NODE_ENV is production and SESSION_SECRET is missing', async () => {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;

    const { cookies } = await import('next/headers');
    vi.mocked(cookies).mockResolvedValue({
      get: () => ({ name: 'fineli_session', value: 'dummy-token-so-secret-is-called' }),
    } as any);

    const { getSession } = await import('../session');

    await expect(getSession()).rejects.toThrow(
      'SESSION_SECRET is required in production'
    );
  });

  it('returns null when no cookie and SESSION_SECRET is set in production', async () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'test-secret-at-least-32-chars-long';

    const { getSession } = await import('../session');
    const result = await getSession();
    expect(result).toBeNull();
  });
});
