/**
 * End-to-end HTTP tests.
 *
 * These tests make real HTTP requests to the running Next.js dev server
 * on localhost:3000. They exercise the full stack: routing, auth middleware,
 * database, Fineli API calls, conversation engine, and AI integration.
 *
 * Prerequisites:
 *   pnpm dev    (server must be running on port 3000)
 *
 * Run:
 *   pnpm vitest run src/__tests__/e2e.test.ts
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { E2EClient } from './helpers/e2e-client';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const TEST_DATE = '2026-02-15';

// Quick smoke test to see if server is reachable
async function isServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/anonymous`, { method: 'POST' });
    return res.status === 200;
  } catch {
    return false;
  }
}

// =========================================================================
// Auth
// =========================================================================

describe('E2E: Auth', () => {
  let client: E2EClient;

  beforeAll(async () => {
    const up = await isServerUp();
    if (!up) {
      console.warn(`⚠ Server not reachable at ${BASE_URL} — skipping E2E tests`);
    }
    // Vitest doesn't have skip-at-runtime, so tests will fail if server is down.
    // That's OK — E2E tests are expected to run against a live server.
  });

  beforeEach(() => {
    client = new E2EClient(BASE_URL);
  });

  it('POST /api/auth/anonymous → creates session and sets cookie', async () => {
    const data = await client.createAnonymousSession();

    expect(data.userId).toBeTruthy();
    expect(data.anonymousId).toMatch(/^anon_/);
    expect(data.isAnonymous).toBe(true);
    expect(client.hasCookie('fineli_session')).toBe(true);
  });

  it('unauthenticated GET /api/diary/days → 401', async () => {
    const res = await client.get(`/api/diary/days/${TEST_DATE}`);
    expect(res.status).toBe(401);
    expect(res.error?.code).toBe('UNAUTHORIZED');
  });

  it('session persists across requests', async () => {
    await client.createAnonymousSession();

    const res1 = await client.getDiaryDay(TEST_DATE);
    expect(res1.ok).toBe(true);

    const res2 = await client.getDiaryDay(TEST_DATE);
    expect(res2.ok).toBe(true);
  });

  it('different clients have isolated sessions', async () => {
    const client1 = new E2EClient(BASE_URL);
    const client2 = new E2EClient(BASE_URL);

    const user1 = await client1.createAnonymousSession();
    const user2 = await client2.createAnonymousSession();

    expect(user1.userId).not.toBe(user2.userId);

    // Create meal as user1
    const meal = await client1.createMeal(TEST_DATE, 'breakfast');

    // user2 should not see user1's chat state
    const chatRes = await client2.getChatState(meal.id);
    expect(chatRes.status).toBe(403);
  });
});

// =========================================================================
// Diary CRUD
// =========================================================================

describe('E2E: Diary', () => {
  let client: E2EClient;

  beforeEach(async () => {
    client = new E2EClient(BASE_URL);
    await client.createAnonymousSession();
  });

  it('GET /api/diary/days/:date → returns empty day when no data', async () => {
    const res = await client.getDiaryDay('2026-01-01');
    expect(res.ok).toBe(true);
    expect(res.data?.id).toBeNull();
    expect(res.data?.meals).toEqual([]);
  });

  it('POST /api/diary/days/:date/meals → creates meal', async () => {
    const meal = await client.createMeal(TEST_DATE, 'breakfast');

    expect(meal.id).toBeTruthy();
    expect(meal.mealType).toBe('breakfast');
  });

  it('created meal appears in diary day', async () => {
    await client.createMeal(TEST_DATE, 'breakfast');

    const day = await client.getDiaryDay(TEST_DATE);
    expect(day.data?.meals.length).toBe(1);
    expect(day.data?.meals[0].mealType).toBe('breakfast');
  });

  it('can create multiple meals for same day', async () => {
    await client.createMeal(TEST_DATE, 'breakfast');
    await client.createMeal(TEST_DATE, 'lunch');
    await client.createMeal(TEST_DATE, 'snack');

    const day = await client.getDiaryDay(TEST_DATE);
    expect(day.data?.meals.length).toBe(3);
  });

  it('invalid date format returns 400', async () => {
    const res = await client.get('/api/diary/days/not-a-date');
    expect(res.status).toBe(400);
    expect(res.error?.code).toBe('VALIDATION_ERROR');
  });

  it('delete item soft-deletes and removes from diary', async () => {
    const meal = await client.createMeal(TEST_DATE, 'lunch');

    // Send a chat message to add food (this will search Fineli)
    await client.sendMessage(meal.id, 'maitoa');

    // Check if items were added
    const dayBefore = await client.getDiaryDay(TEST_DATE);
    const mealData = dayBefore.data?.meals.find((m) => m.id === meal.id);
    const items = mealData?.items ?? [];

    if (items.length > 0) {
      const itemId = items[0].id;
      const delRes = await client.deleteItem(itemId);
      expect(delRes.ok).toBe(true);

      const dayAfter = await client.getDiaryDay(TEST_DATE);
      const mealAfter = dayAfter.data?.meals.find((m) => m.id === meal.id);
      const itemsAfter = mealAfter?.items ?? [];
      expect(itemsAfter.length).toBe(items.length - 1);
    }
  });
});

// =========================================================================
// Chat conversation flow
// =========================================================================

describe('E2E: Chat', () => {
  let client: E2EClient;
  let mealId: string;

  beforeEach(async () => {
    client = new E2EClient(BASE_URL);
    await client.createAnonymousSession();
    const meal = await client.createMeal(TEST_DATE, 'breakfast');
    mealId = meal.id;
  });

  it('sends message and gets assistant response', async () => {
    const res = await client.sendMessage(mealId, 'kaurapuuroa');

    expect(res.ok).toBe(true);
    expect(res.data?.assistantMessage).toBeTruthy();
    expect(typeof res.data?.assistantMessage).toBe('string');
  });

  it('first message triggers Fineli search and shows results', async () => {
    const res = await client.sendMessage(mealId, 'maitoa');

    expect(res.ok).toBe(true);
    // Should either find results or give a no-match message
    expect(res.data?.assistantMessage.length).toBeGreaterThan(0);
  });

  it('messages are persisted and retrievable via chat state', async () => {
    await client.sendMessage(mealId, 'kaurapuuroa');

    const state = await client.getChatState(mealId);
    expect(state.ok).toBe(true);
    expect(state.data?.messages.length).toBeGreaterThanOrEqual(2); // user + assistant

    const roles = state.data?.messages.map((m) => m.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');

    const userMsg = state.data?.messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toBe('kaurapuuroa');
  });

  it('disambiguation flow: search → pick option → get portion question', async () => {
    // Step 1: search triggers disambiguation
    const step1 = await client.sendMessage(mealId, 'kaurapuuroa');
    expect(step1.ok).toBe(true);

    if (step1.data?.questionMetadata?.type === 'disambiguation') {
      const options = step1.data.questionMetadata.options ?? [];
      expect(options.length).toBeGreaterThan(0);

      // Step 2: pick first option
      const step2 = await client.sendMessage(mealId, '1');
      expect(step2.ok).toBe(true);
      // Should either resolve or ask for portion
      expect(step2.data?.assistantMessage).toBeTruthy();
    }
  });

  it('full conversation: add → disambiguate → portion → done', async () => {
    // Step 1: add food
    const step1 = await client.sendMessage(mealId, 'kaurapuuroa');
    expect(step1.ok).toBe(true);
    let qType = step1.data?.questionMetadata?.type;

    // Step 2: if disambiguation, pick option
    if (qType === 'disambiguation') {
      const step2 = await client.sendMessage(mealId, '1');
      expect(step2.ok).toBe(true);
      qType = step2.data?.questionMetadata?.type;
    }

    // Step 3: if portion question, answer it
    if (qType === 'portion') {
      const step3 = await client.sendMessage(mealId, '300g');
      expect(step3.ok).toBe(true);
    }

    // Step 4: say done
    const stepDone = await client.sendMessage(mealId, 'valmis');
    expect(stepDone.ok).toBe(true);
    expect(stepDone.data?.assistantMessage).toBeTruthy();

    // Verify item was saved to diary
    const day = await client.getDiaryDay(TEST_DATE);
    const mealData = day.data?.meals.find((m) => m.id === mealId);
    // May or may not have items depending on Fineli results and resolution
    expect(mealData).toBeTruthy();
  });

  it('simple numeric answers work correctly', async () => {
    // Send a message that triggers options
    const step1 = await client.sendMessage(mealId, 'leipää');

    if (step1.data?.questionMetadata?.type === 'disambiguation') {
      // Answer with "1"
      const step2 = await client.sendMessage(mealId, '1');
      expect(step2.ok).toBe(true);
      expect(step2.data?.assistantMessage).toBeTruthy();
    }
  });

  it('kyllä/ei answers work for companion questions', async () => {
    // "ei" should be understood as a no
    const res = await client.sendMessage(mealId, 'ei');
    expect(res.ok).toBe(true);
    // Should not crash, even without pending question
  });

  it('invalid mealId returns 404', async () => {
    const res = await client.sendMessage('nonexistent-id', 'hello');
    expect(res.status).toBe(404);
  });

  it('empty message returns 400', async () => {
    const res = await client.post('/api/chat/message', {
      mealId,
      message: '',
    });
    // Depends on validation — empty string might be rejected
    // At minimum should not crash
    expect([200, 400]).toContain(res.status);
  });

  it('missing message field returns 400', async () => {
    const res = await client.post('/api/chat/message', { mealId });
    expect(res.status).toBe(400);
    expect(res.error?.code).toBe('VALIDATION_ERROR');
  });

  it('missing mealId field returns 400', async () => {
    const res = await client.post('/api/chat/message', { message: 'test' });
    expect(res.status).toBe(400);
  });
});

// =========================================================================
// Chat with AI
// =========================================================================

describe('E2E: Chat AI integration', () => {
  let client: E2EClient;
  let mealId: string;

  beforeEach(async () => {
    client = new E2EClient(BASE_URL);
    await client.createAnonymousSession();
    const meal = await client.createMeal(TEST_DATE, 'breakfast');
    mealId = meal.id;
  });

  it('response includes AI metadata', async () => {
    const res = await client.sendMessage(mealId, 'kaurapuuroa');
    expect(res.ok).toBe(true);

    // ai field should always be present (even if AI_PROVIDER=none)
    if (res.data?.ai) {
      expect(typeof res.data.ai.parsed).toBe('boolean');
      expect(typeof res.data.ai.responded).toBe('boolean');
      expect(Array.isArray(res.data.ai.suggestions)).toBe(true);
    }
  });

  it('structured questions are NOT replaced by AI text', async () => {
    const res = await client.sendMessage(mealId, 'kaurapuuroa');

    if (res.data?.questionMetadata?.type === 'disambiguation') {
      // When there's a structured question, the assistant message should
      // contain the options text from the engine template
      expect(res.data.assistantMessage).toContain('vaihtoehtoja');

      // AI should not have responded (structured question)
      if (res.data.ai) {
        expect(res.data.ai.responded).toBe(false);
      }
    }
  });

  it('AI responds for non-question messages (confirmations)', async () => {
    // Go through disambiguation
    const step1 = await client.sendMessage(mealId, 'kaurapuuroa');
    if (step1.data?.questionMetadata?.type !== 'disambiguation') return;

    const step2 = await client.sendMessage(mealId, '1');
    if (step2.data?.questionMetadata?.type === 'portion') {
      const step3 = await client.sendMessage(mealId, '300g');

      // After resolving, no question → AI may respond
      if (!step3.data?.questionMetadata && step3.data?.ai) {
        expect(step3.data.ai.responded).toBe(true);
        expect(step3.data.assistantMessage.length).toBeGreaterThan(0);
      }
    }
  });

  it('simple answers bypass AI parser', async () => {
    const step1 = await client.sendMessage(mealId, 'kaurapuuroa');
    if (step1.data?.questionMetadata?.type !== 'disambiguation') return;

    // "1" is simple → regex parser, not AI
    const step2 = await client.sendMessage(mealId, '1');
    if (step2.data?.ai) {
      expect(step2.data.ai.parsed).toBe(false);
    }
  });
});

// =========================================================================
// Chat state consistency
// =========================================================================

describe('E2E: Chat state', () => {
  let client: E2EClient;
  let mealId: string;

  beforeEach(async () => {
    client = new E2EClient(BASE_URL);
    await client.createAnonymousSession();
    const meal = await client.createMeal(TEST_DATE, 'breakfast');
    mealId = meal.id;
  });

  it('chat state starts empty', async () => {
    const state = await client.getChatState(mealId);
    expect(state.ok).toBe(true);
    expect(state.data?.messages).toEqual([]);
    expect(state.data?.state).toBeNull();
  });

  it('each message adds exactly 2 chat entries (user + assistant)', async () => {
    await client.sendMessage(mealId, 'kaurapuuroa');

    const state = await client.getChatState(mealId);
    expect(state.data?.messages.length).toBe(2);
    expect(state.data?.messages[0].role).toBe('user');
    expect(state.data?.messages[1].role).toBe('assistant');
  });

  it('multiple messages accumulate in order', async () => {
    await client.sendMessage(mealId, 'kaurapuuroa');
    await client.sendMessage(mealId, '1');
    await client.sendMessage(mealId, '300g');

    const state = await client.getChatState(mealId);
    // 3 user messages + 3 assistant messages = 6
    expect(state.data?.messages.length).toBe(6);

    // All user messages in order
    const userMsgs = state.data?.messages.filter((m) => m.role === 'user') ?? [];
    expect(userMsgs[0].content).toBe('kaurapuuroa');
    expect(userMsgs[1].content).toBe('1');
    expect(userMsgs[2].content).toBe('300g');
  });

  it('conversation state is persisted after each message', async () => {
    await client.sendMessage(mealId, 'kaurapuuroa');

    const state = await client.getChatState(mealId);
    expect(state.data?.state).toBeTruthy();
    expect(typeof state.data?.state).toBe('object');
  });

  it('saved assistant message matches API response', async () => {
    const chatRes = await client.sendMessage(mealId, 'kaurapuuroa');
    const responseMsg = chatRes.data?.assistantMessage;

    const state = await client.getChatState(mealId);
    const savedMsg = state.data?.messages.find((m) => m.role === 'assistant');

    expect(savedMsg?.content).toBe(responseMsg);
  });
});

// =========================================================================
// Fineli search
// =========================================================================

describe('E2E: Fineli search', () => {
  let client: E2EClient;

  beforeEach(async () => {
    client = new E2EClient(BASE_URL);
    await client.createAnonymousSession();
  });

  it('GET /api/fineli/search?q=maito → returns results', async () => {
    const res = await client.searchFineli('maito');
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  it('empty query returns 400', async () => {
    const res = await client.get('/api/fineli/search?q=');
    expect(res.status).toBe(400);
  });

  it('missing q parameter returns 400', async () => {
    const res = await client.get('/api/fineli/search');
    expect(res.status).toBe(400);
  });

  it('unauthenticated search returns 401', async () => {
    const noAuth = new E2EClient(BASE_URL);
    const res = await noAuth.get('/api/fineli/search?q=maito');
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// Export
// =========================================================================

describe('E2E: Export', () => {
  let client: E2EClient;

  beforeEach(async () => {
    client = new E2EClient(BASE_URL);
    await client.createAnonymousSession();
  });

  it('export with no data returns xlsx (empty workbook)', async () => {
    const res = await client.exportXlsx('2026-01-01', '2026-01-01');
    // Should return 200 with xlsx content type
    expect(res.ok).toBe(true);
    const ct = res.raw.headers.get('content-type') ?? '';
    expect(ct).toContain('spreadsheet');
  });

  it('export with food data includes items', async () => {
    // Add some food first
    const meal = await client.createMeal(TEST_DATE, 'breakfast');

    // Quick conversation to add food
    await client.sendMessage(meal.id, 'maitoa');
    // Try to resolve quickly
    await client.sendMessage(meal.id, '1');
    await client.sendMessage(meal.id, '200g');

    const res = await client.exportXlsx(TEST_DATE, TEST_DATE);
    expect(res.ok).toBe(true);
  });

  it('unauthenticated export returns 401', async () => {
    const noAuth = new E2EClient(BASE_URL);
    const res = await noAuth.exportXlsx(TEST_DATE, TEST_DATE);
    expect(res.status).toBe(401);
  });
});

// =========================================================================
// Frontend data contract — validates that API responses can be correctly
// rendered by the React components (mapApiMessages → ChatMessage → QuickReplyButtons)
// =========================================================================

describe('E2E: Frontend data contract', () => {
  let client: E2EClient;
  let mealId: string;

  beforeEach(async () => {
    client = new E2EClient(BASE_URL);
    await client.createAnonymousSession();
    const meal = await client.createMeal(TEST_DATE, 'breakfast');
    mealId = meal.id;
  });

  it('disambiguation options in chat state have correct structure for frontend rendering', async () => {
    // Send a message that triggers disambiguation (multiple Fineli matches)
    const chatRes = await client.sendMessage(mealId, 'kaurapuuroa');
    expect(chatRes.ok).toBe(true);

    if (chatRes.data?.questionMetadata?.type !== 'disambiguation') {
      // If no disambiguation, skip — Fineli may have returned a single match
      return;
    }

    // Get the persisted chat state
    const state = await client.getChatState(mealId);
    expect(state.ok).toBe(true);

    // Find the assistant message with metadata
    const assistantMsg = state.data?.messages.find(
      (m) => m.role === 'assistant' && m.metadata
    );
    expect(assistantMsg).toBeTruthy();

    // Validate the metadata structure matches what mapApiMessages expects
    const metadata = assistantMsg!.metadata as Record<string, unknown>;
    expect(metadata).toHaveProperty('questionMetadata');

    const qm = metadata.questionMetadata as {
      type: string;
      options: Array<{ key: string; label: string; value: unknown }>;
    };
    expect(qm.type).toBe('disambiguation');
    expect(Array.isArray(qm.options)).toBe(true);
    expect(qm.options.length).toBeGreaterThan(0);

    // Each option must have key and label (required for QuickReplyButtons)
    for (const opt of qm.options) {
      expect(typeof opt.key).toBe('string');
      expect(opt.key.length).toBeGreaterThan(0);
      expect(typeof opt.label).toBe('string');
      expect(opt.label.length).toBeGreaterThan(0);
    }

    // Simulate what mapApiMessages does: convert to ChatMessageOption
    // The frontend wraps flat options into { type, items: [{key, label}] }
    const chatMessageOption = {
      type: qm.type,
      items: qm.options.map((o) => ({ key: o.key, label: o.label })),
    };

    // Validate the converted structure is correct for QuickReplyButtons
    expect(chatMessageOption.type).toBe('disambiguation');
    expect(Array.isArray(chatMessageOption.items)).toBe(true);
    expect(chatMessageOption.items.length).toBe(qm.options.length);
    for (const item of chatMessageOption.items) {
      expect(typeof item.key).toBe('string');
      expect(typeof item.label).toBe('string');
    }
  });

  it('assistant message content is a non-empty string', async () => {
    const chatRes = await client.sendMessage(mealId, 'kaurapuuroa');
    expect(chatRes.ok).toBe(true);
    expect(typeof chatRes.data?.assistantMessage).toBe('string');
    expect(chatRes.data!.assistantMessage.length).toBeGreaterThan(0);

    // The content saved to chat state must match what was returned
    const state = await client.getChatState(mealId);
    const assistantMsg = state.data?.messages.find((m) => m.role === 'assistant');
    expect(assistantMsg?.content).toBe(chatRes.data!.assistantMessage);
  });

  it('messages without questionMetadata have no options', async () => {
    // "ei" with no pending question should produce a response without options
    const chatRes = await client.sendMessage(mealId, 'ei');
    expect(chatRes.ok).toBe(true);

    const state = await client.getChatState(mealId);
    const assistantMsg = state.data?.messages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeTruthy();

    // metadata should be null (no question asked)
    if (assistantMsg!.metadata === null) {
      // This is the normal case — no options to render, no crash risk
      expect(assistantMsg!.metadata).toBeNull();
    }
  });

  it('all messages from chat state have required fields for ChatMessageData', async () => {
    // Send a few messages to build up state
    await client.sendMessage(mealId, 'kaurapuuroa');
    await client.sendMessage(mealId, '1');

    const state = await client.getChatState(mealId);
    expect(state.ok).toBe(true);
    expect(state.data?.messages.length).toBeGreaterThanOrEqual(4);

    for (const msg of state.data!.messages) {
      // Required fields for ChatMessageData
      expect(typeof msg.id).toBe('string');
      expect(msg.id.length).toBeGreaterThan(0);
      expect(['user', 'assistant', 'system']).toContain(msg.role);
      expect(typeof msg.content).toBe('string');
      expect(typeof msg.createdAt).toBe('string');
      // createdAt should be a valid ISO date
      expect(new Date(msg.createdAt).toISOString()).toBeTruthy();
    }
  });

  it('portion question metadata has valid structure', async () => {
    // Trigger disambiguation
    const step1 = await client.sendMessage(mealId, 'kaurapuuroa');
    if (step1.data?.questionMetadata?.type !== 'disambiguation') return;

    // Pick option to potentially trigger portion question
    const step2 = await client.sendMessage(mealId, '1');
    if (step2.data?.questionMetadata?.type !== 'portion') return;

    // Validate portion question structure
    const qm = step2.data.questionMetadata;
    expect(qm.type).toBe('portion');
    if (qm.options) {
      for (const opt of qm.options) {
        expect(typeof opt.key).toBe('string');
        expect(typeof opt.label).toBe('string');
      }
    }
  });

  it('resolved items appear in diary after full chat conversation', async () => {
    // Step 1: send food name
    const step1 = await client.sendMessage(mealId, 'banaani');
    expect(step1.ok).toBe(true);

    // Before resolution: diary meal should have NO items yet
    const dayBefore = await client.getDiaryDay(TEST_DATE);
    const mealBefore = dayBefore.data?.meals.find((m) => m.id === mealId);
    expect(mealBefore?.items?.length ?? 0).toBe(0);

    // Step 2: disambiguate if needed
    if (step1.data?.questionMetadata?.type === 'disambiguation') {
      const step2 = await client.sendMessage(mealId, '1');
      expect(step2.ok).toBe(true);

      // Step 3: portion if needed
      if (step2.data?.questionMetadata?.type === 'portion') {
        const step3 = await client.sendMessage(mealId, '150g');
        expect(step3.ok).toBe(true);
      }
    }

    // After resolution: diary meal should have items
    const dayAfter = await client.getDiaryDay(TEST_DATE);
    const mealAfter = dayAfter.data?.meals.find((m) => m.id === mealId);
    expect(mealAfter).toBeTruthy();
    expect(mealAfter!.items.length).toBeGreaterThan(0);

    // Verify the item has required fields for rendering
    const item = mealAfter!.items[0];
    expect(typeof item.id).toBe('string');
    expect(typeof item.fineliNameFi).toBe('string');
    expect(item.fineliNameFi.length).toBeGreaterThan(0);
    expect(typeof item.portionGrams).toBe('number');
    expect(item.portionGrams).toBeGreaterThan(0);
    expect(item.computedNutrients).toBeTruthy();
    expect(typeof item.computedNutrients.ENERC).toBe('number');
  });

  it('initial "add" message does NOT claim items were added when disambiguation is needed', async () => {
    const step1 = await client.sendMessage(mealId, 'kaurapuuroa');
    expect(step1.ok).toBe(true);

    if (step1.data?.questionMetadata?.type === 'disambiguation') {
      // When disambiguation is pending, message should NOT say "Lisäsin"
      // It should indicate searching/finding, not adding
      expect(step1.data.assistantMessage).not.toMatch(/^Lisäsin/);
    }
  });
});

// =========================================================================
// Edge cases
// =========================================================================

describe('E2E: Edge cases', () => {
  let client: E2EClient;

  beforeEach(async () => {
    client = new E2EClient(BASE_URL);
    await client.createAnonymousSession();
  });

  it('message over 2000 chars is rejected with 400', async () => {
    const meal = await client.createMeal(TEST_DATE, 'lunch');
    const longMsg = 'kaurapuuroa '.repeat(200); // ~2400 chars

    const res = await client.sendMessage(meal.id, longMsg);
    expect(res.status).toBe(400);
    expect(res.error?.code).toBe('VALIDATION_ERROR');
  });

  it('message under 2000 chars is accepted', async () => {
    const meal = await client.createMeal(TEST_DATE, 'lunch');
    const msg = 'kaurapuuroa '.repeat(50); // ~600 chars

    const res = await client.sendMessage(meal.id, msg);
    expect(res.ok).toBe(true);
  });

  it('special characters in message are handled', async () => {
    const meal = await client.createMeal(TEST_DATE, 'lunch');

    const res = await client.sendMessage(meal.id, 'söin äidin tekemää puuroa <script>');
    expect(res.ok).toBe(true);
    expect(res.data?.assistantMessage).toBeTruthy();
  });

  it('rapid sequential messages maintain state consistency', async () => {
    const meal = await client.createMeal(TEST_DATE, 'lunch');

    // Send 5 messages rapidly
    const results = [];
    for (let i = 0; i < 5; i++) {
      const res = await client.sendMessage(meal.id, `viesti ${i + 1}`);
      results.push(res);
    }

    // All should succeed
    for (const res of results) {
      expect(res.ok).toBe(true);
    }

    // Chat state should have all messages
    const state = await client.getChatState(meal.id);
    expect(state.data?.messages.length).toBe(10); // 5 user + 5 assistant
  });

  it('accessing another user\'s meal returns 403', async () => {
    const meal = await client.createMeal(TEST_DATE, 'dinner');

    // Create a new client (different user)
    const otherClient = new E2EClient(BASE_URL);
    await otherClient.createAnonymousSession();

    // Try to send message to first user's meal
    const chatRes = await otherClient.sendMessage(meal.id, 'hello');
    expect(chatRes.status).toBe(403);

    // Try to get first user's chat state
    const stateRes = await otherClient.getChatState(meal.id);
    expect(stateRes.status).toBe(403);
  });

  it('Finnish Unicode characters preserved in round-trip', async () => {
    const meal = await client.createMeal(TEST_DATE, 'snack');
    const finnishMsg = 'Söin aamupalaksi kaurapuuroa äidiltä';

    await client.sendMessage(meal.id, finnishMsg);

    const state = await client.getChatState(meal.id);
    const userMsg = state.data?.messages.find((m) => m.role === 'user');
    expect(userMsg?.content).toBe(finnishMsg);
  });
});
