'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

export interface AccountInfo {
  user: {
    id: string;
    email: string | null;
    emailVerifiedAt: string | null;
    createdAt: string;
  };
  isAnonymous: boolean;
}

export function useAuth() {
  /** Fetch current account info (GDPR Art. 15 — right of access). */
  const account = useQuery<AccountInfo>({
    queryKey: ['auth', 'account'],
    queryFn: async () => {
      const res = await fetch('/api/auth/account');
      if (!res.ok) return null as unknown as AccountInfo;
      const data = await res.json();
      return data.data as AccountInfo;
    },
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  });

  const createAnonymousSession = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/anonymous', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403 && data?.error?.code === 'MAGIC_LINK_REQUIRED') {
          throw new Error('MAGIC_LINK_REQUIRED');
        }
        throw new Error('Auth failed');
      }
      return res.json();
    },
  });

  const sendMagicLink = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? 'Failed to send magic link');
      }
      return res.json();
    },
  });

  const logout = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Logout failed');
      return res.json();
    },
    onSuccess: () => {
      window.location.reload();
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/account', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? 'Account deletion failed');
      }
      return res.json();
    },
    onSuccess: () => {
      window.location.reload();
    },
  });

  return { account, createAnonymousSession, sendMagicLink, logout, deleteAccount };
}
