'use client';

import React, {
  Suspense,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { useSearchParams } from 'next/navigation';
import type { MealType, ChatMessageData, MealItemWithNutrients, MealWithItems } from '@/types';

import { useAuth } from '@/lib/hooks/use-auth';
import { useDiaryDay } from '@/lib/hooks/use-diary';
import { useCreateMeal } from '@/lib/hooks/use-diary';
import { useDeleteItem } from '@/lib/hooks/use-diary';
import { useUpdateItem } from '@/lib/hooks/use-diary';
import { useChatState } from '@/lib/hooks/use-chat';
import { useSendMessage } from '@/lib/hooks/use-chat';
import { mapApiMessages } from '@/lib/utils/map-api-messages';
import { newId } from '@/types';

import DatePicker from '@/components/diary/DatePicker';
import MealSelector from '@/components/diary/MealSelector';
import ChatPanel from '@/components/diary/ChatPanel';
import MealItemsList from '@/components/diary/MealItemsList';
import NutrientSummary from '@/components/diary/NutrientSummary';
import CompactNutrientBar from '@/components/diary/CompactNutrientBar';
import ExportButton from '@/components/diary/ExportButton';
import Spinner from '@/components/ui/Spinner';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import UserMenu from '@/components/ui/UserMenu';

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Default empty message for new meal */
const DEFAULT_MESSAGES: ChatMessageData[] = [
  {
    id: 'default',
    role: 'assistant',
    content: 'Kerro mitä söit.',
    timestamp: new Date().toISOString(),
  },
];

function HomeContent() {
  const searchParams = useSearchParams();
  const urlDate = searchParams.get('date');
  const urlMealId = searchParams.get('meal');

  const [date, setDate] = useState(() => urlDate || todayStr());
  const [selectedMeal, setSelectedMeal] = useState<MealType>('breakfast');
  const [isExporting, setIsExporting] = useState(false);
  const [foodsOpen, setFoodsOpen] = useState(false);
  /** Optimistic user message shown while sending or when send failed (state: 'error') */
  const [optimisticMessage, setOptimisticMessage] = useState<{
    id: string;
    content: string;
    state: 'sending' | 'error';
  } | null>(null);

  const [magicLinkEmailSent, setMagicLinkEmailSent] = useState(false);
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [exportError, setExportError] = useState<string | null>(null);
  const { account, createAnonymousSession, sendMagicLink, logout, deleteAccount } = useAuth();
  const { data: dayData, isLoading: diaryLoading, error: diaryError } = useDiaryDay(date);
  const createMeal = useCreateMeal(date);
  const deleteItem = useDeleteItem();
  const updateItem = useUpdateItem();

  // Resolve current meal: by URL mealId or by selected meal type
  const meals = dayData?.meals ?? [];
  const currentMeal = useMemo((): MealWithItems | null => {
    const mealList = meals as MealWithItems[];
    if (urlMealId) {
      const byId = mealList.find((m) => m.id === urlMealId);
      if (byId) return byId;
    }
    return mealList.find((m) => m.mealType === selectedMeal) ?? null;
  }, [meals, selectedMeal, urlMealId]);

  const currentMealId = currentMeal?.id ?? null;
  const { data: chatState, isLoading: chatLoading } = useChatState(currentMealId);
  const sendMessage = useSendMessage(currentMealId);

  const currentItems: MealItemWithNutrients[] = currentMeal?.items ?? [];
  const currentTotals = currentMeal?.totals ?? {};
  const currentMessages = useMemo(() => {
    if (!currentMealId) return DEFAULT_MESSAGES;
    const mapped = mapApiMessages(chatState?.messages);
    const list = mapped.length ? mapped : DEFAULT_MESSAGES;
    if (!optimisticMessage) return list;
    return [
      ...list,
      {
        id: optimisticMessage.id,
        role: 'user' as const,
        content: optimisticMessage.content,
        timestamp: new Date().toISOString(),
        state: optimisticMessage.state,
      },
    ];
  }, [chatState?.messages, currentMealId, optimisticMessage]);

  const itemCounts: Record<MealType, number> = useMemo(() => {
    const counts: Record<MealType, number> = {
      breakfast: 0,
      lunch: 0,
      dinner: 0,
      snack: 0,
      other: 0,
    };
    for (const meal of meals) {
      counts[meal.mealType as MealType] = meal.items?.length ?? 0;
    }
    return counts;
  }, [meals]);

  // When deployed with magic-link only, we don't create an anonymous session
  const requireMagicLink = process.env.NEXT_PUBLIC_REQUIRE_MAGIC_LINK === 'true';
  useEffect(() => {
    if (!requireMagicLink) {
      createAnonymousSession.mutate();
    }
  }, [requireMagicLink]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync date from URL
  useEffect(() => {
    if (urlDate) setDate(urlDate);
  }, [urlDate]);

  // Auto-expand foods list when items are added
  useEffect(() => {
    if (currentItems.length > 0) {
      setFoodsOpen(true);
    }
  }, [currentItems.length]);

  const handleDateChange = useCallback((newDate: string) => {
    setDate(newDate);
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', newDate);
    params.delete('meal');
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [searchParams]);

  const handleMealChange = useCallback((meal: MealType) => {
    setSelectedMeal(meal);
    const params = new URLSearchParams(searchParams.toString());
    params.set('date', date);
    params.delete('meal');
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [searchParams, date]);

  const ensureMealAndSend = useCallback(
    async (text: string) => {
      let mealId = currentMeal?.id ?? meals.find((m: MealWithItems) => m.mealType === selectedMeal)?.id;
      if (!mealId && text.trim()) {
        const res = await createMeal.mutateAsync({
          mealType: selectedMeal,
        });
        const created = (res as Record<string, unknown>)?.data ?? res;
        mealId = (created as Record<string, unknown>)?.id as string | undefined;
        if (mealId) {
          const params = new URLSearchParams(searchParams.toString());
          params.set('date', date);
          params.set('meal', mealId);
          window.history.replaceState(null, '', `?${params.toString()}`);
        }
      }
      if (mealId) {
        await sendMessage.mutateAsync({ message: text, mealId });
      }
    },
    [meals, selectedMeal, currentMeal, createMeal, sendMessage, searchParams, date],
  );

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const id = newId();
      setOptimisticMessage({ id, content: text, state: 'sending' });
      ensureMealAndSend(text)
        .then(() => setOptimisticMessage(null))
        .catch(() => setOptimisticMessage((prev) => (prev?.id === id ? { ...prev, state: 'error' } : null)));
    },
    [ensureMealAndSend],
  );

  const handleOptionSelect = useCallback(
    (key: string) => {
      if (!currentMealId) return;
      const id = newId();
      setOptimisticMessage({ id, content: key, state: 'sending' });
      sendMessage
        .mutateAsync({ message: key, mealId: currentMealId })
        .then(() => setOptimisticMessage(null))
        .catch(() => setOptimisticMessage((prev) => (prev?.id === id ? { ...prev, state: 'error' } : null)));
    },
    [currentMealId, sendMessage],
  );

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      deleteItem.mutate(itemId);
    },
    [deleteItem],
  );

  const handleUpdateAmount = useCallback(
    (itemId: string, newGrams: number) => {
      updateItem.mutate({ itemId, data: { portionGrams: newGrams, portionAmount: newGrams } });
    },
    [updateItem],
  );

  const handleExport = useCallback(async (from: string, to: string) => {
    setIsExporting(true);
    setExportError(null);
    try {
      const res = await fetch(
        `/api/export/xlsx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ruokapaivakirja_${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Vienti epäonnistui. Yritä uudelleen.');
    } finally {
      setIsExporting(false);
    }
  }, []);

  // Only show login for auth errors (401/403), not transient API failures
  const isAuthError = requireMagicLink && diaryError != null;
  const showLoginScreen =
    requireMagicLink && !diaryLoading && (isAuthError || magicLinkEmailSent);
  const isNonAuthError =
    requireMagicLink && diaryError != null && !isAuthError;
  const isLoading =
    diaryLoading || (!requireMagicLink && createAnonymousSession.isPending && !createAnonymousSession.isSuccess);
  const hasError =
    isNonAuthError || (!requireMagicLink && (diaryError || createAnonymousSession.isError));

  if (showLoginScreen) {
    /** Map backend error messages to Finnish user-facing strings. */
    const localizeError = (msg?: string) => {
      if (!msg) return 'Jotain meni pieleen. Yritä uudelleen.';
      if (msg.includes('email') || msg.includes('VALIDATION'))
        return 'Tarkista sähköpostiosoite.';
      if (msg.includes('EMAIL_NOT_CONFIGURED'))
        return 'Sähköpostipalvelu ei ole käytettävissä.';
      if (msg.includes('EMAIL_FAILED'))
        return 'Sähköpostin lähetys epäonnistui. Yritä uudelleen.';
      return 'Jotain meni pieleen. Yritä uudelleen.';
    };

    return (
      <div className="flex h-dvh items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {magicLinkEmailSent ? (
            <div className="text-center">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">Tarkista sähköpostisi</h2>
              <p className="mb-4 text-sm text-gray-600">
                Kirjautumislinkki lähetettiin osoitteeseen{' '}
                <span className="font-medium text-gray-900">{magicLinkEmail}</span>.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sendMagicLink.mutate(magicLinkEmail);
                  }}
                  disabled={sendMagicLink.isPending}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {sendMagicLink.isPending ? 'Lähetetään…' : 'Lähetä uudelleen'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMagicLinkEmailSent(false);
                    setMagicLinkEmail('');
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Vaihda sähköpostia
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Kirjaudu
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const emailInput = form.querySelector('input[name="email"]') as HTMLInputElement;
                  const email = emailInput?.value;
                  if (email) {
                    setMagicLinkEmail(email);
                    sendMagicLink.mutate(email, {
                      onSuccess: () => setMagicLinkEmailSent(true),
                    });
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">
                    Sähköposti
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    name="email"
                    placeholder="nimi@esimerkki.fi"
                    required
                    autoComplete="email"
                    autoFocus
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sendMagicLink.isPending}
                  className="w-full rounded-md bg-blue-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {sendMagicLink.isPending ? 'Lähetetään…' : 'Lähetä kirjautumislinkki'}
                </button>
              </form>
              {sendMagicLink.isError && (
                <p className="mt-2 text-sm text-red-600" role="alert">
                  {localizeError(sendMagicLink.error?.message)}
                </p>
              )}
              <p className="mt-4 text-center text-xs text-gray-500">
                Kirjautumalla hyväksyt{' '}
                <a href="/tietosuoja" className="text-blue-600 hover:underline">
                  tietosuojaselosteen
                </a>
                .
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gray-50">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">
            {diaryError?.message ?? createAnonymousSession.error?.message ?? 'Jotain meni pieleen'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-gray-50">
      {/* ── Sticky header ── */}
      <header className="z-20 flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2">
          <h1 className="text-base font-semibold text-gray-900 sm:text-lg">
            Ruokapäiväkirja
          </h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <DatePicker value={date} onChange={handleDateChange} />
            <ExportButton
              defaultDate={date}
              onExport={handleExport}
              isExporting={isExporting}
            />
            <UserMenu
              email={account.data?.user?.email ?? undefined}
              isAnonymous={account.data?.isAnonymous ?? !requireMagicLink}
              onLogout={() => logout.mutate()}
              onDeleteAccount={() => deleteAccount.mutate()}
              isDeleting={deleteAccount.isPending}
            />
          </div>
        </div>
        {exportError && (
          <div className="mx-auto max-w-7xl px-4">
            <p className="text-xs text-red-600" role="alert">{exportError}</p>
          </div>
        )}
        <div className="mx-auto max-w-7xl px-4 pb-2">
          <MealSelector
            value={selectedMeal}
            onChange={handleMealChange}
            itemCounts={itemCounts}
          />
        </div>
      </header>

      {/* ── Compact nutrient bar (always visible) ── */}
      <CompactNutrientBar nutrients={currentTotals} />

      {/* ── Main content: fills remaining viewport height ── */}
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row lg:mx-auto lg:w-full lg:max-w-7xl">

        {/* ─── LEFT: Chat panel ─── */}
        <section className="flex min-h-0 flex-1 flex-col lg:w-1/2 lg:border-r lg:border-gray-200">
          {/* Mobile: collapsible food items above chat */}
          <div className="flex-shrink-0 lg:hidden">
            {currentItems.length > 0 && (
              <div className="border-b border-gray-200 bg-white">
                <button
                  onClick={() => setFoodsOpen(!foodsOpen)}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
                  aria-expanded={foodsOpen}
                >
                  <span>
                    Ruoat ({currentItems.length})
                  </span>
                  <svg
                    className={'h-4 w-4 text-gray-400 transition-transform ' + (foodsOpen ? 'rotate-180' : '')}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {foodsOpen && (
                  <div className="max-h-48 overflow-y-auto scrollbar-thin px-3 pb-3">
                    <MealItemsList
                      items={currentItems}
                      onDeleteItem={handleDeleteItem}
                      onUpdateAmount={handleUpdateAmount}
                      savingItemId={updateItem.isPending ? (updateItem.variables?.itemId ?? null) : null}
                      compact
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Chat */}
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner size="md" />
            </div>
          ) : (
            <ErrorBoundary>
              <ChatPanel
                messages={currentMessages}
                onSendMessage={handleSendMessage}
                onOptionSelect={handleOptionSelect}
                isLoading={chatLoading || sendMessage.isPending}
                isDisabled={false}
                placeholder={
                  !currentMealId && meals.every((m: MealWithItems) => m.mealType !== selectedMeal)
                    ? 'Aloita kirjoittamalla mitä söit...'
                    : undefined
                }
              />
            </ErrorBoundary>
          )}
        </section>

        {/* ─── RIGHT: Foods + nutrients (desktop only) ─── */}
        <section className="hidden min-h-0 overflow-y-auto scrollbar-thin lg:flex lg:w-1/2 lg:flex-col lg:gap-4 lg:p-4">
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Ruoat
            </h2>
            {isLoading ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 py-8">
                <Spinner size="sm" />
              </div>
            ) : currentItems.length === 0 && !currentMeal ? (
              <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 py-6">
                <p className="text-sm text-gray-400">Aloita lisäämällä ruokia</p>
              </div>
            ) : (
              <MealItemsList
                items={currentItems}
                onDeleteItem={handleDeleteItem}
                onUpdateAmount={handleUpdateAmount}
                savingItemId={updateItem.isPending ? (updateItem.variables?.itemId ?? null) : null}
              />
            )}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Ravintoarvot
            </h2>
            <NutrientSummary nutrients={currentTotals} />
          </div>
        </section>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <React.Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-gray-50">
          <Spinner size="lg" />
        </div>
      }
    >
      <HomeContent />
    </React.Suspense>
  );
}
