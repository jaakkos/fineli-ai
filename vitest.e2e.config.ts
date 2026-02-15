/**
 * Vitest config for E2E tests only.
 * These tests require a running dev server (pnpm dev).
 *
 * Usage: pnpm test:e2e
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/e2e.test.ts'],
    testTimeout: 30_000, // E2E tests may be slow (AI calls, Fineli API)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
