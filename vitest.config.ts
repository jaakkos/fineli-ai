import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Exclude E2E tests from default `vitest run` — they need a running server.
    // Run E2E separately via `pnpm test:e2e` (after `pnpm dev`).
    exclude: [
      '**/node_modules/**',
      '**/e2e.test.ts',
      'e2e/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
