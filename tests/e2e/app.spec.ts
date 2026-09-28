import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStubAnthropic, type StubServer } from './stubAnthropic';

const VALID_KEY = 'sk-ant-e2e-valid-key-0123456789';

let stub: StubServer;
let userDataDir: string;
let app: ElectronApplication;

test.beforeAll(async () => {
  stub = await startStubAnthropic();
});

test.afterAll(async () => {
  await stub.close();
});

/**
 * The parent environment, minus ELECTRON_RUN_AS_NODE: editors built on
 * Electron (VS Code's extension host, for one) export it, and if it leaks
 * into the launched app, Electron starts as plain Node instead of the app.
 */
function launchEnv(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  return { ...env, ...extra };
}

test.beforeEach(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legio-e2e-'));
  app = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: launchEnv({
      LEGIO_USER_DATA_DIR: userDataDir,
      LEGIO_ANTHROPIC_BASE_URL: stub.url,
      LEGIO_MOCK_KEYCHAIN: '1',
    }),
  });
});

test.afterEach(async () => {
  await app?.close();
  await fs.rm(userDataDir, { recursive: true, force: true });
});

async function openSettings(): Promise<Page> {
  const main = await app.firstWindow();
  const settingsPromise = app.waitForEvent('window');
  await main.getByRole('button', { name: 'Open Settings…' }).click();
  const settings = await settingsPromise;
  await expect(settings.getByTestId('settings-view')).toBeVisible();
  return settings;
}

test('launches and renders the main window', async () => {
  const main = await app.firstWindow();
  await expect(main.getByTestId('home-view')).toBeVisible();
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Legio');
});

test('main window runs hardened: no Node, only the typed preload API', async () => {
  const main = await app.firstWindow();
  await expect(main.getByTestId('home-view')).toBeVisible();
  const surface = await main.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    legio: Object.keys((globalThis as unknown as { legio: Record<string, unknown> }).legio),
  }));
  expect(surface).toEqual({ require: 'undefined', process: 'undefined', legio: ['settings'] });
});

/**
 * better-sqlite3 in node_modules is compiled for Electron's ABI, so it can't
 * load in Playwright's Node process. macOS ships the sqlite3 CLI; use that.
 */
function sqlite(dbPath: string, query: string): string[] {
  return execFileSync('/usr/bin/sqlite3', ['-readonly', dbPath, query], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.length > 0);
}

test('migrates a fresh database on first run', async () => {
  const main = await app.firstWindow();
  await expect(main.getByTestId('home-view')).toBeVisible();
  const dbPath = path.join(userDataDir, 'legio.sqlite');
  expect(sqlite(dbPath, 'SELECT version FROM schema_migrations').length).toBeGreaterThan(0);
  expect(sqlite(dbPath, "SELECT name FROM sqlite_master WHERE type = 'table'")).toEqual(
    expect.arrayContaining(['companies', 'workers', 'usage_ledger']),
  );
});

test('Settings saves a key and the test call succeeds against the stub', async () => {
  const settings = await openSettings();
  await settings.getByLabel('API key').fill(VALID_KEY);
  await settings.getByRole('button', { name: 'Save' }).click();
  await expect(settings.getByTestId('key-status')).toHaveText('A key is saved.');
  await settings.getByRole('button', { name: 'Test connection' }).click();
  await expect(settings.getByTestId('settings-feedback')).toContainText('Connected');
  expect(stub.requests.at(-1)?.apiKey).toBe(VALID_KEY);

  // The key file on disk must be encrypted, never plaintext.
  const secretsDir = path.join(userDataDir, 'secrets');
  for (const file of await fs.readdir(secretsDir)) {
    expect(await fs.readFile(path.join(secretsDir, file), 'utf8')).not.toContain(VALID_KEY);
  }
});

test('Settings reports a rejected key', async () => {
  const settings = await openSettings();
  await settings.getByLabel('API key').fill('sk-ant-e2e-wrong-key-0123456789');
  await settings.getByRole('button', { name: 'Save' }).click();
  await settings.getByRole('button', { name: 'Test connection' }).click();
  await expect(settings.getByTestId('settings-feedback')).toContainText('rejected');
});
