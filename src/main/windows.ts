import { BrowserWindow } from 'electron';
import path from 'node:path';
import { APP_NAME } from '../shared/constants';
import { hardenedWebPreferences, lockDownNavigation, type AppUrlPolicy } from './security/windowHardening';

export type AppView = 'main' | 'settings';

const PRELOAD_PATH = path.join(__dirname, '../preload/index.js');
export const RENDERER_HTML = path.join(__dirname, '../renderer/index.html');

function load(win: BrowserWindow, view: AppView, policy: AppUrlPolicy): void {
  if (policy.devServerUrl !== undefined) {
    void win.loadURL(`${policy.devServerUrl}#${view}`);
  } else {
    void win.loadFile(policy.rendererFile, { hash: view });
  }
}

export function createMainWindow(policy: AppUrlPolicy): BrowserWindow {
  const win = new BrowserWindow({
    title: APP_NAME,
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    webPreferences: hardenedWebPreferences(PRELOAD_PATH),
  });
  lockDownNavigation(win, policy);
  win.once('ready-to-show', () => win.show());
  load(win, 'main', policy);
  return win;
}

let settingsWindow: BrowserWindow | null = null;

/**
 * Settings is its own compact, fixed-size window opened with ⌘, — the macOS
 * convention (docs/UI_DESIGN.md) — not a page inside the main window. Only
 * one instance exists; opening it again focuses the existing one.
 */
export function openSettingsWindow(policy: AppUrlPolicy): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }
  const win = new BrowserWindow({
    title: 'Settings',
    width: 560,
    height: 380,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: hardenedWebPreferences(PRELOAD_PATH),
  });
  lockDownNavigation(win, policy);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    settingsWindow = null;
  });
  load(win, 'settings', policy);
  settingsWindow = win;
  return win;
}
