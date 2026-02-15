'use client';

import { useEffect, useRef, useCallback } from 'react';

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutItem[];
}

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
  groups: ShortcutGroup[];
}

/**
 * Modal dialog showing available keyboard shortcuts.
 * Opened with `?`, closed with Escape or clicking outside.
 */
export default function KeyboardShortcutsHelp({ open, onClose, groups }: KeyboardShortcutsHelpProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const prevOpen = useRef(open);

  // Sync open state with <dialog> element
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !prevOpen.current) {
      dialog.showModal();
    } else if (!open && prevOpen.current) {
      dialog.close();
    }
    prevOpen.current = open;
  }, [open]);

  // Close on Escape (native dialog handles this, but we need to sync state)
  const handleCancel = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    onClose();
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }, [onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 m-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-black/40"
      aria-label="Pikanäppäimet"
    >
      <div className="p-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Pikanäppäimet</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Sulje"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {group.title}
              </h3>
              <ul className="space-y-1.5" role="list">
                {group.shortcuts.map((shortcut) => (
                  <li
                    key={shortcut.description}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                  >
                    <span className="text-gray-700">{shortcut.description}</span>
                    <span className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          {i > 0 && <span className="mx-0.5 text-xs text-gray-400">/</span>}
                          <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-xs font-medium text-gray-600 shadow-sm">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <p className="mt-5 border-t border-gray-100 pt-4 text-center text-xs text-gray-400">
          Paina <kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-mono text-xs">?</kbd> avataksesi tämän näkymän
        </p>
      </div>
    </dialog>
  );
}

export type { ShortcutGroup, ShortcutItem };
