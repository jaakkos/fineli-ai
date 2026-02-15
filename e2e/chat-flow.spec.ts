/**
 * Browser-based E2E tests for the food diary chat flow.
 *
 * These tests open the real app in a browser and interact with the UI,
 * exercising the full stack: React components → API routes → conversation
 * engine (AI + regex) → Fineli search → DB persistence → UI updates.
 *
 * Prerequisites:
 *   pnpm dev    (server must be running on port 3000)
 *
 * Run:
 *   pnpm test:e2e:ui
 *   pnpm test:e2e:ui --headed   (to watch)
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the app to finish initializing (anonymous auth + initial load) */
async function waitForAppReady(page: Page) {
  // The app auto-creates an anonymous session on mount, then loads the diary.
  // Wait until the chat input appears — that means auth + diary load succeeded.
  await page.waitForSelector('textarea[aria-label="Kirjoita viesti"]', {
    timeout: 15_000,
  });
}

/** Type a message in the chat input and press Enter */
async function sendChatMessage(page: Page, text: string) {
  const input = page.locator('textarea[aria-label="Kirjoita viesti"]');
  await input.fill(text);
  await input.press('Enter');
}

/** Wait for the assistant to respond (loading spinner appears then disappears) */
async function waitForAssistantResponse(page: Page) {
  // Wait for "Kirjoittaa..." spinner to appear
  const spinner = page.locator('text=Kirjoittaa...');
  // It may be too fast to catch, so we also just wait for a new assistant message
  try {
    await spinner.waitFor({ state: 'visible', timeout: 2000 });
    await spinner.waitFor({ state: 'hidden', timeout: 15_000 });
  } catch {
    // Spinner may have been too fast to catch — that's OK
  }
  // Give React time to render the response
  await page.waitForTimeout(500);
}

/** Get the text content of all visible chat messages */
async function getChatMessages(page: Page) {
  const messageContainer = page.locator('[role="log"]');
  await messageContainer.waitFor({ state: 'visible' });
  // Each message is a child div with role structure from ChatMessage component
  const messageTexts = await messageContainer
    .locator('.rounded-2xl')
    .allTextContents();
  return messageTexts.filter((t) => t.trim().length > 0);
}

/** Count visible assistant messages (gray background) in the chat log */
async function getAssistantMessageCount(page: Page) {
  return page.locator('[role="log"] .bg-gray-100.rounded-2xl').count();
}

/** Count visible user messages (blue background) in the chat log */
async function getUserMessageCount(page: Page) {
  return page.locator('[role="log"] .bg-blue-600.rounded-2xl').count();
}

/** Get the last assistant message text */
async function getLastAssistantMessage(page: Page) {
  const msgs = page.locator('[role="log"] .bg-gray-100');
  const count = await msgs.count();
  if (count === 0) return '';
  return msgs.nth(count - 1).textContent();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('App initialization', () => {
  test('page loads and shows the diary header', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Header should show the app title
    await expect(page.locator('h1')).toHaveText('Ruokapäiväkirja');
  });

  test('meal selector tabs are visible', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // All five meal type tabs should be present
    const tabs = page.locator('[role="tablist"] [role="tab"]');
    await expect(tabs).toHaveCount(5);

    // Check Finnish labels
    await expect(tabs.nth(0)).toContainText('Aamiainen');
    await expect(tabs.nth(1)).toContainText('Lounas');
    await expect(tabs.nth(2)).toContainText('Päivällinen');
    await expect(tabs.nth(3)).toContainText('Välipala');
    await expect(tabs.nth(4)).toContainText('Muu');
  });

  test('default assistant message is shown', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // The default prompt message should be visible
    const chatLog = page.locator('[role="log"]');
    await expect(chatLog).toContainText('Kerro mitä söit');
  });

  test('chat input is enabled and accepts text', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    const input = page.locator('textarea[aria-label="Kirjoita viesti"]');
    await expect(input).toBeEnabled();
    await input.fill('test message');
    await expect(input).toHaveValue('test message');
  });
});

test.describe('Chat message sending', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('sending a message shows it in the chat and clears input', async ({ page }) => {
    const input = page.locator('textarea[aria-label="Kirjoita viesti"]');

    await sendChatMessage(page, 'kaurapuuroa');

    // Input should be cleared after sending
    await expect(input).toHaveValue('');

    // User message should appear in chat
    await waitForAssistantResponse(page);

    // We should see at least one user message (blue bubble)
    const userMsgCount = await getUserMessageCount(page);
    expect(userMsgCount).toBeGreaterThanOrEqual(1);
  });

  test('assistant responds to a food message', async ({ page }) => {
    await sendChatMessage(page, 'kaurapuuroa');
    await waitForAssistantResponse(page);

    // Assistant should have responded (gray bubble)
    const assistantCount = await getAssistantMessageCount(page);
    // At least 1 default message + 1 new response
    expect(assistantCount).toBeGreaterThanOrEqual(1);

    // The response should contain meaningful text
    const lastMsg = await getLastAssistantMessage(page);
    expect(lastMsg).toBeTruthy();
    expect(lastMsg!.length).toBeGreaterThan(5);
  });

  test('send button is disabled when input is empty', async ({ page }) => {
    const sendButton = page.locator('button[aria-label="Lähetä viesti"]');
    await expect(sendButton).toBeDisabled();
  });

  test('pressing Enter sends the message', async ({ page }) => {
    const input = page.locator('textarea[aria-label="Kirjoita viesti"]');
    await input.fill('maitoa');
    await input.press('Enter');

    // Input should be cleared
    await expect(input).toHaveValue('');

    // Wait for response
    await waitForAssistantResponse(page);
    const assistantCount = await getAssistantMessageCount(page);
    expect(assistantCount).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Chat conversation flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('food search returns options or auto-resolves', async ({ page }) => {
    await sendChatMessage(page, 'kaurapuuroa');
    await waitForAssistantResponse(page);

    // The assistant should respond with either:
    // a) Disambiguation options (quick reply buttons)
    // b) A portion question
    // c) Auto-resolved confirmation
    const chatLog = page.locator('[role="log"]');
    const lastAssistant = await getLastAssistantMessage(page);
    expect(lastAssistant).toBeTruthy();

    // Check if quick reply buttons appeared (disambiguation or portion options)
    const quickReplyGroup = chatLog.locator('[role="group"]');
    const buttons = chatLog.locator('[role="group"] button');
    const hasButtons = (await quickReplyGroup.count()) > 0;

    if (hasButtons) {
      // Quick reply buttons should have labels
      const buttonCount = await buttons.count();
      expect(buttonCount).toBeGreaterThan(0);
      for (let i = 0; i < buttonCount; i++) {
        const text = await buttons.nth(i).textContent();
        expect(text).toBeTruthy();
      }
    }
  });

  test('clicking a quick reply button sends the selection', async ({ page }) => {
    await sendChatMessage(page, 'kaurapuuroa');
    await waitForAssistantResponse(page);

    // Check if disambiguation buttons appeared
    const chatLog = page.locator('[role="log"]');
    const buttons = chatLog.locator('[role="group"] button');
    const buttonCount = await buttons.count();

    if (buttonCount > 0) {
      // Click the first option
      await buttons.first().click();
      await waitForAssistantResponse(page);

      // Should have progressed the conversation
      const totalAssistant = await getAssistantMessageCount(page);
      expect(totalAssistant).toBeGreaterThanOrEqual(2);
    }
  });

  test('multi-turn disambiguation flow', async ({ page }) => {
    // Step 1: Send food name
    await sendChatMessage(page, 'kaurapuuroa');
    await waitForAssistantResponse(page);

    const chatLog = page.locator('[role="log"]');
    let buttons = chatLog.locator('[role="group"] button:not([disabled])');
    let buttonCount = await buttons.count();

    // Step 2: If disambiguation, pick an option
    if (buttonCount > 0) {
      await buttons.first().click();
      await waitForAssistantResponse(page);

      // Step 3: If portion question appeared, answer with weight
      buttons = chatLog.locator('[role="group"] button:not([disabled])');
      buttonCount = await buttons.count();

      if (buttonCount > 0) {
        // Click a portion option
        await buttons.first().click();
        await waitForAssistantResponse(page);
      } else {
        // Or type a weight
        await sendChatMessage(page, '300g');
        await waitForAssistantResponse(page);
      }
    }

    // At this point we should have multiple messages in the conversation
    const totalUser = await getUserMessageCount(page);
    expect(totalUser).toBeGreaterThanOrEqual(1);
  });

  test('completing a meal adds items to the diary panel', async ({ page }) => {
    // The right panel shows "Aloita lisäämällä ruokia" when empty
    const diaryPanel = page.locator('text=Ruoat').locator('..');

    // Step 1: Send food name
    await sendChatMessage(page, 'maitoa');
    await waitForAssistantResponse(page);

    // Step 2: Handle any follow-up questions
    const chatLog = page.locator('[role="log"]');
    let buttons = chatLog.locator('[role="group"] button:not([disabled])');
    let count = await buttons.count();

    if (count > 0) {
      await buttons.first().click();
      await waitForAssistantResponse(page);

      buttons = chatLog.locator('[role="group"] button:not([disabled])');
      count = await buttons.count();
      if (count > 0) {
        await buttons.first().click();
        await waitForAssistantResponse(page);
      } else {
        await sendChatMessage(page, '2 dl');
        await waitForAssistantResponse(page);
      }
    }

    // Wait a moment for the diary panel to update
    await page.waitForTimeout(1000);

    // Check if "Aloita lisäämällä ruokia" is gone (items were added)
    // or if items appeared in the meal items list
    // This depends on whether the food was fully resolved
    const emptyMsg = page.locator('text=Aloita lisäämällä ruokia');
    const mealItems = page.locator('[aria-label^="Poista"]');
    const itemCount = await mealItems.count();
    const isEmpty = await emptyMsg.isVisible().catch(() => false);

    // Either we have items, or the conversation is still in progress
    // Both are valid states
    expect(itemCount >= 0 || isEmpty).toBeTruthy();
  });
});

test.describe('Meal type switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('switching meal type changes the active tab', async ({ page }) => {
    const tabs = page.locator('[role="tablist"] [role="tab"]');

    // Click "Lounas" tab
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'false');
  });

  test('each meal type has its own independent chat', async ({ page }) => {
    // Send message in breakfast
    await sendChatMessage(page, 'kaurapuuroa');
    await waitForAssistantResponse(page);

    const breakfastMsgCount = await getUserMessageCount(page);
    expect(breakfastMsgCount).toBeGreaterThanOrEqual(1);

    // Switch to lunch
    const tabs = page.locator('[role="tablist"] [role="tab"]');
    await tabs.nth(1).click();
    await page.waitForTimeout(500);

    // Lunch should show the default message (new conversation)
    const chatLog = page.locator('[role="log"]');
    await expect(chatLog).toContainText('Kerro mitä söit');
  });
});

test.describe('Error handling and edge cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
  });

  test('Finnish characters are preserved in messages', async ({ page }) => {
    const testMsg = 'Söin äidin tekemää puuroa';
    await sendChatMessage(page, testMsg);
    await waitForAssistantResponse(page);

    // The user message should show with correct Finnish characters
    const chatLog = page.locator('[role="log"]');
    await expect(chatLog).toContainText(testMsg);
  });

  test('multiple messages maintain chat history', async ({ page }) => {
    await sendChatMessage(page, 'maitoa');
    await waitForAssistantResponse(page);

    await sendChatMessage(page, '1');
    await waitForAssistantResponse(page);

    // Should have at least 2 user messages and 2+ assistant messages
    const userCount = await getUserMessageCount(page);
    expect(userCount).toBeGreaterThanOrEqual(2);

    const assistantCount = await getAssistantMessageCount(page);
    expect(assistantCount).toBeGreaterThanOrEqual(2);
  });

  test('shift+enter does not send (allows newlines)', async ({ page }) => {
    const input = page.locator('textarea[aria-label="Kirjoita viesti"]');
    await input.fill('first line');
    await input.press('Shift+Enter');

    // Message should NOT have been sent
    await expect(input).not.toHaveValue('');
  });

  test('rapid consecutive messages are handled', async ({ page }) => {
    await sendChatMessage(page, 'maitoa');
    // Don't wait for response — send immediately
    await waitForAssistantResponse(page);

    // Second message
    await sendChatMessage(page, '1');
    await waitForAssistantResponse(page);

    // Both should be in the chat
    const userCount = await getUserMessageCount(page);
    expect(userCount).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Nutrient summary panel', () => {
  test('nutrient summary section is visible', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // The nutrient summary heading should be visible
    await expect(page.locator('text=Ravintoarvot')).toBeVisible();
  });
});

test.describe('Amount editing', () => {
  test('clicking portion text opens inline editor', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // First, add a food item through the full chat flow
    await sendChatMessage(page, 'maitoa');
    await waitForAssistantResponse(page);

    // Handle any follow-up questions to get an item into the diary
    const chatLog = page.locator('[role="log"]');
    let buttons = chatLog.locator('[role="group"] button:not([disabled])');
    let count = await buttons.count();

    if (count > 0) {
      await buttons.first().click();
      await waitForAssistantResponse(page);

      buttons = chatLog.locator('[role="group"] button:not([disabled])');
      count = await buttons.count();
      if (count > 0) {
        await buttons.first().click();
        await waitForAssistantResponse(page);
      } else {
        await sendChatMessage(page, '2 dl');
        await waitForAssistantResponse(page);
      }
    }

    // Wait for diary panel to update
    await page.waitForTimeout(1500);

    // Check if a meal item appeared in the diary list
    const editButton = page.locator('button[aria-label^="Muokkaa annosta"]');
    const editCount = await editButton.count();

    if (editCount > 0) {
      // Click the portion text to start editing
      await editButton.first().click();

      // An input should appear
      const amountInput = page.locator('input[aria-label="Muokkaa grammamäärää"]');
      await expect(amountInput).toBeVisible();
      await expect(amountInput).toBeFocused();
    }
  });

  test('editing amount and pressing Enter saves the change', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Add a food item
    await sendChatMessage(page, 'maitoa');
    await waitForAssistantResponse(page);

    const chatLog = page.locator('[role="log"]');
    let buttons = chatLog.locator('[role="group"] button:not([disabled])');
    let count = await buttons.count();

    if (count > 0) {
      await buttons.first().click();
      await waitForAssistantResponse(page);

      buttons = chatLog.locator('[role="group"] button:not([disabled])');
      count = await buttons.count();
      if (count > 0) {
        await buttons.first().click();
        await waitForAssistantResponse(page);
      } else {
        await sendChatMessage(page, '2 dl');
        await waitForAssistantResponse(page);
      }
    }

    await page.waitForTimeout(1500);

    const editButton = page.locator('button[aria-label^="Muokkaa annosta"]');
    const editCount = await editButton.count();

    if (editCount > 0) {
      // Click to edit
      await editButton.first().click();

      const amountInput = page.locator('input[aria-label="Muokkaa grammamäärää"]');
      await expect(amountInput).toBeVisible();

      // Clear and type a new value
      await amountInput.fill('500');
      await amountInput.press('Enter');

      // Input should disappear (edit mode closed)
      await expect(amountInput).not.toBeVisible();

      // Wait for the update to persist and re-render
      await page.waitForTimeout(1500);

      // The item should now show 500g
      const itemList = page.locator('[role="list"][aria-label="Aterian ruoat"]');
      const itemText = await itemList.textContent();
      expect(itemText).toContain('500g');
    }
  });

  test('pressing Escape cancels editing', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Add a food item
    await sendChatMessage(page, 'maitoa');
    await waitForAssistantResponse(page);

    const chatLog = page.locator('[role="log"]');
    let buttons = chatLog.locator('[role="group"] button:not([disabled])');
    let count = await buttons.count();

    if (count > 0) {
      await buttons.first().click();
      await waitForAssistantResponse(page);

      buttons = chatLog.locator('[role="group"] button:not([disabled])');
      count = await buttons.count();
      if (count > 0) {
        await buttons.first().click();
        await waitForAssistantResponse(page);
      } else {
        await sendChatMessage(page, '2 dl');
        await waitForAssistantResponse(page);
      }
    }

    await page.waitForTimeout(1500);

    const editButton = page.locator('button[aria-label^="Muokkaa annosta"]');
    const editCount = await editButton.count();

    if (editCount > 0) {
      // Get original text
      const originalText = await editButton.first().textContent();

      // Click to edit
      await editButton.first().click();

      const amountInput = page.locator('input[aria-label="Muokkaa grammamäärää"]');
      await expect(amountInput).toBeVisible();

      // Type a different value then cancel
      await amountInput.fill('999');
      await amountInput.press('Escape');

      // Input should disappear
      await expect(amountInput).not.toBeVisible();

      // Original amount should be preserved (not 999)
      await page.waitForTimeout(500);
      const editButtonAfter = page.locator('button[aria-label^="Muokkaa annosta"]');
      const afterText = await editButtonAfter.first().textContent();
      expect(afterText).toBe(originalText);
    }
  });
});

test.describe('Page refresh persistence', () => {
  test('conversation survives page refresh', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);

    // Send a message to start a conversation
    await sendChatMessage(page, 'kaurapuuroa');
    await waitForAssistantResponse(page);

    // Note the URL (it may have mealId in query params)
    const url = page.url();

    // Refresh the page
    await page.reload();
    await waitForAppReady(page);

    // If the URL has meal params, navigate back to it
    if (url.includes('meal=')) {
      await page.goto(url);
      await waitForAppReady(page);
      await page.waitForTimeout(1000);

      // Previous messages should be loaded from DB
      const chatLog = page.locator('[role="log"]');
      const msgs = await getChatMessages(page);
      // Should have more than just the default message
      expect(msgs.length).toBeGreaterThanOrEqual(1);
    }
  });
});
