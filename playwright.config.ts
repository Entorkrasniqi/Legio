import { defineConfig } from '@playwright/test';

/**
 * End-to-end smoke tests against the built Electron app (docs/DEVOPS.md).
 * Run with `npm run test:e2e`, which builds first. No real API calls: the
 * Settings test call goes to a local stub server (see tests/e2e/stubAnthropic.ts).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
});
