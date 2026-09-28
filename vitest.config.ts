import { defineConfig } from 'vitest/config';

/**
 * Unit tests run under Electron's own Node (`ELECTRON_RUN_AS_NODE=1`, see the
 * `test` script) so native modules like better-sqlite3 load with the same ABI
 * the app uses — one rebuild, no separate system-Node build to keep in sync.
 * The Anthropic client is always faked; no test spends real API credit.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
    pool: 'forks',
    restoreMocks: true,
  },
});
