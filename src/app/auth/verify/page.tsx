'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

// Prevent token leakage in Referer headers
if (typeof document !== 'undefined') {
  const meta = document.querySelector('meta[name="referrer"]');
  if (!meta) {
    const m = document.createElement('meta');
    m.name = 'referrer';
    m.content = 'no-referrer';
    document.head.appendChild(m);
  }
}

/**
 * Magic link verification. Reads token from ?token=..., calls
 * POST /api/auth/verify, then redirects to / on success.
 */
function AuthVerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>(() => token ? 'loading' : 'error');
  const [message, setMessage] = useState<string>(() => token ? '' : 'Linkki puutteellinen.');

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setStatus('error');
          // Localize error codes to Finnish — don't show raw server messages
          const code = data?.error?.code;
          const msg =
            code === 'INVALID_TOKEN'
              ? 'Linkki on vanhentunut tai virheellinen.'
              : code === 'VALIDATION_ERROR'
                ? 'Linkki puutteellinen.'
                : code === 'USER_NOT_FOUND'
                  ? 'Käyttäjää ei löytynyt.'
                  : 'Jotain meni pieleen. Yritä uudelleen.';
          setMessage(msg);
          return;
        }
        setStatus('ok');
        router.replace('/');
      } catch {
        if (!cancelled) {
          setStatus('error');
          setMessage('Verkkovirhe. Yritä uudelleen.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (status === 'loading') {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-50">
        <p className="text-gray-600">Kirjaudutaan…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-50">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center max-w-sm">
          <p className="text-sm font-medium text-red-800">{message}</p>
          <Link
            href="/"
            className="mt-4 inline-block text-sm text-blue-600 hover:underline"
          >
            Takaisin etusivulle
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

export default function AuthVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-gray-50">
          <p className="text-gray-600">Kirjaudutaan…</p>
        </div>
      }
    >
      <AuthVerifyContent />
    </Suspense>
  );
}
