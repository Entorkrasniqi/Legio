/**
 * What the renderer is allowed to know about the API key: whether one is
 * stored, and whether the OS can encrypt one at all. Never the key itself,
 * never a fragment of it (docs/SECURITY.md → Secrets).
 */
export interface ApiKeyStatus {
  configured: boolean;
  encryptionAvailable: boolean;
}

export type ApiKeyErrorCode = 'invalid_input' | 'encryption_unavailable' | 'storage_failed';

export type TestConnectionErrorCode =
  | 'no_api_key'
  | 'invalid_api_key'
  | 'permission_denied'
  | 'rate_limited'
  | 'network_error'
  | 'api_error'
  | 'unknown_error';

export interface TestConnectionSuccess {
  model: string;
  latencyMs: number;
}
