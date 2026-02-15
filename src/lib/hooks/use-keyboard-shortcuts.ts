import { useEffect, useCallback, useRef } from 'react';

export interface KeyboardShortcut {
  /** The key to match (e.g. 'ArrowLeft', '/', '1'). Case-insensitive for letters. */
  key: string;
  /** Require Cmd (Mac) / Ctrl (Windows/Linux) modifier */
  meta?: boolean;
  /** Require Shift modifier */
  shift?: boolean;
  /** Handler to call when the shortcut fires */
  handler: () => void;
  /** Description shown in the help dialog */
  description: string;
  /** Group label for organizing in help dialog */
  group?: string;
  /** If true, the shortcut works even when an input/textarea is focused */
  allowInInput?: boolean;
}

/** Elements that should suppress global shortcuts */
const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableElement(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (INPUT_TAGS.has(el.tagName)) return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Global keyboard shortcuts hook.
 *
 * Shortcuts are ignored when the user is typing in an input/textarea
 * (unless `allowInInput` is set on the shortcut).
 *
 * @example
 * ```ts
 * useKeyboardShortcuts([
 *   { key: 'ArrowLeft', handler: prevDay, description: 'Edellinen päivä', group: 'Navigointi' },
 *   { key: '/', handler: focusChat, description: 'Kirjoita ruokia', group: 'Toiminnot' },
 * ]);
 * ```
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  // Use ref so handler always sees latest shortcuts without re-attaching listener
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const inInput = isEditableElement(e.target);

    for (const shortcut of shortcutsRef.current) {
      if (!shortcut.allowInInput && inInput) continue;

      const wantsMeta = shortcut.meta ?? false;
      const wantsShift = shortcut.shift ?? false;
      const hasMeta = e.metaKey || e.ctrlKey;

      if (wantsMeta !== hasMeta) continue;
      if (wantsShift !== e.shiftKey) continue;

      // Match key (case-insensitive for single-char keys)
      const eventKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const shortcutKey = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;

      if (eventKey === shortcutKey) {
        e.preventDefault();
        shortcut.handler();
        return;
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
