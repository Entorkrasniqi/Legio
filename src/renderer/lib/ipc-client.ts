import type { LegioApi } from '../../shared/ipc-contract';

declare global {
  interface Window {
    legio: LegioApi;
  }
}

/**
 * The renderer's only way to reach main. Everything goes through the typed
 * surface the preload script exposes; there is no raw ipcRenderer here.
 */
export const api: LegioApi = window.legio;
