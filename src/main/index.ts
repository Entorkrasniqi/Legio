import { app, BrowserWindow, dialog, safeStorage, session } from 'electron';
import path from 'node:path';
import { APP_ID, DATABASE_FILE_NAME } from '../shared/constants';
import { createAnthropicClient } from './agent-runtime/testConnection';
import { openDatabase } from './db';
import { createSettingsHandlers } from './ipc/handlers/settings';
import { registerIpcHandlers } from './ipc/register';
import { installAppMenu } from './menu';
import { buildCsp } from './security/csp';
import { SecretStore } from './security/secrets';
import { hardenSession, isAllowedAppUrl, type AppUrlPolicy } from './security/windowHardening';
import { createMainWindow, openSettingsWindow, RENDERER_HTML } from './windows';

const isDev = !app.isPackaged;
const devServerUrl = isDev ? process.env['ELECTRON_RENDERER_URL'] : undefined;

/**
 * Test-only overrides, honoured ONLY in unpackaged builds so a shipped app
 * can never be pointed somewhere else by an environment variable:
 *   LEGIO_USER_DATA_DIR       isolate E2E runs from real app data
 *   LEGIO_ANTHROPIC_BASE_URL  send the Settings test call to a local stub
 *   LEGIO_MOCK_KEYCHAIN=1     use Chromium's mock keychain (CI has no GUI prompt)
 */
const testOverrides = isDev
  ? {
      userDataDir: process.env['LEGIO_USER_DATA_DIR'],
      anthropicBaseUrl: process.env['LEGIO_ANTHROPIC_BASE_URL'],
      mockKeychain: process.env['LEGIO_MOCK_KEYCHAIN'] === '1',
    }
  : { userDataDir: undefined, anthropicBaseUrl: undefined, mockKeychain: false };

// Pin the data directory to the stable APP_ID, independent of the display name.
app.setPath('userData', testOverrides.userDataDir ?? path.join(app.getPath('appData'), APP_ID));
if (testOverrides.mockKeychain) app.commandLine.appendSwitch('use-mock-keychain');

// Refuse a second instance rather than letting two processes share one SQLite file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
const urlPolicy: AppUrlPolicy = { rendererFile: RENDERER_HTML, devServerUrl };

function showSettings(): void {
  openSettingsWindow(urlPolicy);
}

function isTrustedSender(frameUrl: string | undefined): boolean {
  return frameUrl !== undefined && isAllowedAppUrl(frameUrl, urlPolicy);
}

async function start(): Promise<void> {
  hardenSession(session.defaultSession, buildCsp(isDev ? 'development' : 'production'));

  try {
    openDatabase(path.join(app.getPath('userData'), DATABASE_FILE_NAME));
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    dialog.showErrorBox('Database error', `The local database could not be opened or migrated.\n\n${detail}`);
    app.exit(1);
    return;
  }

  const secrets = new SecretStore(path.join(app.getPath('userData'), 'secrets'), safeStorage);
  const settings = createSettingsHandlers({
    secrets,
    createClient: (apiKey) =>
      createAnthropicClient({
        apiKey,
        ...(testOverrides.anthropicBaseUrl !== undefined ? { baseURL: testOverrides.anthropicBaseUrl } : {}),
      }),
  });

  registerIpcHandlers({
    settings,
    openSettingsWindow: showSettings,
    isTrustedSender: (event) => isTrustedSender(event.senderFrame?.url),
  });

  installAppMenu(showSettings);
  mainWindow = createMainWindow(urlPolicy);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// macOS convention: closing the last window keeps the app running.
app.on('activate', () => {
  if (app.isReady() && BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow(urlPolicy);
});

void app.whenReady().then(start);
