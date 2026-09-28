import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC } from '../../shared/ipc-contract';
import { err, ok } from '../../shared/types';
import type { SettingsHandlers } from './handlers/settings';

export interface RegisterDeps {
  settings: SettingsHandlers;
  openSettingsWindow(): void;
  /** True only for frames that belong to one of our own app windows. */
  isTrustedSender(event: IpcMainInvokeEvent): boolean;
}

/**
 * Wires the typed handlers to ipcMain. Every handler receives exactly one
 * `unknown` argument and validates it itself; calls from a frame that isn't
 * one of our app windows are rejected before any handler runs.
 */
export function registerIpcHandlers(deps: RegisterDeps): void {
  const handle = (channel: string, fn: (input: unknown) => Promise<unknown>): void => {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      if (!deps.isTrustedSender(event)) return err('forbidden', 'Untrusted sender.');
      if (args.length > 1) return err('invalid_input', 'Unexpected arguments.');
      return fn(args[0]);
    });
  };

  handle(IPC.settings.getApiKeyStatus, (i) => deps.settings.getApiKeyStatus(i));
  handle(IPC.settings.setApiKey, (i) => deps.settings.setApiKey(i));
  handle(IPC.settings.clearApiKey, (i) => deps.settings.clearApiKey(i));
  handle(IPC.settings.testConnection, (i) => deps.settings.testConnection(i));
  handle(IPC.settings.openWindow, async (i) => {
    if (i !== undefined) return err('invalid_input', 'Unexpected arguments.');
    deps.openSettingsWindow();
    return ok(null);
  });
}
