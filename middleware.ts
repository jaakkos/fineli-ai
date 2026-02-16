import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * In-memory rate limit: key -> { count, resetAt }.
 * Note: per-instance only — does not share state across serverless/edge instances.
 * For production at scale, consider Redis/Upstash or WAF-level rate limiting.
 */
const store = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();

const WINDOW_MS = 60 * 1000; // 1 minute
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Sweep expired entries every 5 min

/** Max requests per window per IP for sensitive routes */
const LIMITS: Record<string, number> = {
  '/api/auth/anonymous': 20,
  '/api/auth/verify': 30,
  '/api/auth/magic-link': 10,
  '/api/chat/message': 60,
  '/api/chat/stream': 30,
  '/api/fineli/search': 120,
};

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Evict expired entries to prevent memory leak over time. */
function cleanupStore() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key);
  }
}

function rateLimit(pathname: string, ip: string): { ok: boolean; remaining: number } {
  const limit = LIMITS[pathname];
  if (limit == null) return { ok: true, remaining: limit ?? 999 };

  cleanupStore();

  const now = Date.now();
  const key = `${pathname}:${ip}`;
  let entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, entry);
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  const ok = entry.count <= limit;

  return { ok, remaining };
}

export function middleware(request: NextRequest) {
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  const limit = LIMITS[pathname];
  if (limit == null) {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const { ok, remaining } = rateLimit(pathname, ip);

  if (!ok) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  return response;
}

export const config = {
  matcher: [
    '/api/auth/anonymous',
    '/api/auth/verify',
    '/api/auth/magic-link',
    '/api/chat/message',
    '/api/chat/stream',
    '/api/fineli/search',
  ],
};
