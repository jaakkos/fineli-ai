'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface UserMenuProps {
  email?: string;
  isAnonymous: boolean;
  onLogout: () => void;
  onDeleteAccount: () => void;
  isDeleting?: boolean;
}

/**
 * Dropdown menu for account actions: privacy policy, logout, account deletion.
 * Supports both anonymous and authenticated users.
 */
export default function UserMenu({
  email,
  isAnonymous,
  onLogout,
  onDeleteAccount,
  isDeleting,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmDelete(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setConfirmDelete(false);
      }
    }
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => {
          setOpen(!open);
          setConfirmDelete(false);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Käyttäjävalikko"
        aria-expanded={open}
        aria-haspopup="menu"
        title={email ?? 'Anonyymi käyttäjä'}
      >
        {/* Simple user icon */}
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          role="menu"
        >
          {/* User info */}
          <div className="border-b border-gray-100 px-4 py-2">
            <p className="text-xs text-gray-500">
              {isAnonymous ? 'Anonyymi käyttäjä' : email ?? 'Kirjautunut'}
            </p>
          </div>

          {/* Privacy policy link */}
          <Link
            href="/tietosuoja"
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Tietosuojaseloste
          </Link>

          {/* Logout */}
          {!isAnonymous && (
            <button
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              role="menuitem"
            >
              Kirjaudu ulos
            </button>
          )}

          {/* Delete account — GDPR right to erasure */}
          <div className="border-t border-gray-100">
            {confirmDelete ? (
              <div
                className="px-4 py-3"
                role="alertdialog"
                aria-label="Vahvista tilin poisto"
              >
                <p className="mb-2 text-xs text-red-700" aria-live="assertive">
                  Kaikki tietosi poistetaan pysyvästi. Tätä ei voi peruuttaa.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onDeleteAccount();
                      setOpen(false);
                    }}
                    disabled={isDeleting}
                    className="flex-1 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    role="menuitem"
                  >
                    {isDeleting ? 'Poistetaan…' : 'Vahvista poisto'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                  >
                    Peruuta
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                role="menuitem"
              >
                Poista tili ja tiedot
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
