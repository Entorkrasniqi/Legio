import { contextBridge, ipcRenderer } from 'electron';
import { IPC, PRELOAD_GLOBAL, type LegioApi } from '../shared/ipc-contract';

/**
 * Exposes exactly the calls in LegioApi — never ipcRenderer itself, never a
 * generic invoke(channel, …) (docs/SECURITY.md → Electron hardening).
 * Runs sandboxed, so this file may only import 'electron' and bundled code.
 */
const api: LegioApi = {
  settings: {
    getApiKeyStatus: () => ipcRenderer.invoke(IPC.settings.getApiKeyStatus),
    setApiKey: (req) => ipcRenderer.invoke(IPC.settings.setApiKey, { apiKey: req.apiKey }),
    clearApiKey: () => ipcRenderer.invoke(IPC.settings.clearApiKey),
    testConnection: () => ipcRenderer.invoke(IPC.settings.testConnection),
    openWindow: () => ipcRenderer.invoke(IPC.settings.openWindow),
  },
};

contextBridge.exposeInMainWorld(PRELOAD_GLOBAL, api);
