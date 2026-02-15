import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for browser-based UI tests.
 *
 * These tests exercise the full stack through the actual browser:
 *   Auth → UI interaction → API calls → DB → rendered results
 *
 * Usage:
 *   pnpm test:e2e:ui          (requires running dev server on port 3000)
 *   pnpm test:e2e:ui --headed (watch the browser)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sequential — tests share browser state within a describe
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30_000,

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Don't start a webServer — we expect `pnpm dev` to be running already */
});
