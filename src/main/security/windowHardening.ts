import type { BrowserWindow, Session, WebPreferences } from 'electron';

/**
 * Non-negotiable webPreferences for every app window (docs/SECURITY.md →
 * Electron hardening). Callers may add a preload path but must not override
 * any of these; `hardenedWebPreferences` enforces that by spreading these last.
 */
export const HARDENED_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  experimentalFeatures: false,
  navigateOnDragDrop: false,
  spellcheck: true,
} as const satisfies WebPreferences;

export function hardenedWebPreferences(preloadPath: string): WebPreferences {
  return { preload: preloadPath, ...HARDENED_WEB_PREFERENCES };
}

export interface AppUrlPolicy {
  /** Absolute path of the bundled renderer index.html. */
  rendererFile: string;
  /** Set only in development (electron-vite dev server). */
  devServerUrl: string | undefined;
}

/**
 * The only URLs an app window may ever show — and the only frames whose IPC
 * calls main will answer: the bundled renderer index.html exactly (any hash),
 * or, in development, the local Vite dev server's origin. Any other file://
 * URL is rejected, so a window can't be navigated to some other local HTML
 * file that would then inherit the preload API.
 */
export function isAllowedAppUrl(url: string, policy: AppUrlPolicy): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'file:') {
    return decodeURIComponent(parsed.pathname) === policy.rendererFile;
  }
  if (policy.devServerUrl === undefined) return false;
  return parsed.origin === new URL(policy.devServerUrl).origin;
}

/**
 * Blocks in-window navigation to anything but the app itself, blocks every
 * attempt to open a new window, and blocks <webview> attachment. External
 * links are not opened automatically either — a future feature that needs
 * that must route through an explicit, validated IPC call.
 */
export function lockDownNavigation(win: BrowserWindow, policy: AppUrlPolicy): void {
  const contents = win.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedAppUrl(url, policy)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isAllowedAppUrl(url, policy)) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

/**
 * Session-wide: deny every permission request/check by default (camera,
 * microphone, notifications, geolocation, …) and attach the CSP header.
 * Microphone access for voice (M11) will be allowed explicitly when that
 * milestone lands, not by loosening this default.
 */
export function hardenSession(session: Session, csp: string): void {
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}
