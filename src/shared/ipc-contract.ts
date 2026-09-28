/**
 * The single source of truth for the main ⇄ renderer IPC surface
 * (docs/ARCHITECTURE.md → IPC contract). Main registers handlers for exactly
 * these channels, preload exposes exactly these functions, and the renderer
 * calls them through `window.legio`. Keep this module free of runtime
 * dependencies: it is bundled into the sandboxed preload script.
 */
import type {
  ApiKeyErrorCode,
  ApiKeyStatus,
  Result,
  TestConnectionErrorCode,
  TestConnectionSuccess,
} from './types';

export const IPC = {
  settings: {
    getApiKeyStatus: 'settings:getApiKeyStatus',
    setApiKey: 'settings:setApiKey',
    clearApiKey: 'settings:clearApiKey',
    testConnection: 'settings:testConnection',
    openWindow: 'settings:openWindow',
  },
} as const;

type ValuesOf<T> = T extends Record<string, infer V> ? (V extends string ? V : ValuesOf<V>) : never;
export type IpcChannel = ValuesOf<typeof IPC>;

export interface SetApiKeyRequest {
  apiKey: string;
}

/** The API exposed on `window.legio` by the preload script. */
export interface LegioApi {
  settings: {
    getApiKeyStatus(): Promise<Result<ApiKeyStatus>>;
    setApiKey(req: SetApiKeyRequest): Promise<Result<ApiKeyStatus, ApiKeyErrorCode>>;
    clearApiKey(): Promise<Result<ApiKeyStatus, ApiKeyErrorCode>>;
    testConnection(): Promise<Result<TestConnectionSuccess, TestConnectionErrorCode>>;
    openWindow(): Promise<Result<null>>;
  };
}

/** Name of the global the preload script exposes via contextBridge. */
export const PRELOAD_GLOBAL = 'legio' as const;
