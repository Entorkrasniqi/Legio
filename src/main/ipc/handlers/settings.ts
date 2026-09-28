import { z } from 'zod';
import type { SetApiKeyRequest } from '../../../shared/ipc-contract';
import {
  err,
  ok,
  type ApiKeyErrorCode,
  type ApiKeyStatus,
  type Result,
  type TestConnectionErrorCode,
  type TestConnectionSuccess,
} from '../../../shared/types';
import { testConnection, type MessagesClient } from '../../agent-runtime/testConnection';
import { EncryptionUnavailableError, type SecretStore } from '../../security/secrets';

/**
 * IPC input is untrusted even though it comes from our own renderer
 * (docs/SECURITY.md). Deliberately loose on key *format* — only shape and
 * size are checked here; the test call is what tells you if a key is valid.
 */
export const setApiKeySchema = z
  .object({
    apiKey: z
      .string()
      .trim()
      .min(20, 'That looks too short to be an API key.')
      .max(512, 'That is too long to be an API key.')
      .regex(/^\S+$/, 'An API key cannot contain spaces.'),
  })
  .strict() satisfies z.ZodType<SetApiKeyRequest>;

export const noArgsSchema = z.undefined();

export interface SettingsDeps {
  secrets: SecretStore;
  createClient(apiKey: string): MessagesClient;
}

async function status(secrets: SecretStore): Promise<ApiKeyStatus> {
  return {
    configured: await secrets.has('anthropic-api-key'),
    encryptionAvailable: secrets.isEncryptionAvailable(),
  };
}

export function createSettingsHandlers(deps: SettingsDeps) {
  return {
    async getApiKeyStatus(input: unknown): Promise<Result<ApiKeyStatus>> {
      if (!noArgsSchema.safeParse(input).success) return err('invalid_input', 'Unexpected arguments.');
      return ok(await status(deps.secrets));
    },

    async setApiKey(input: unknown): Promise<Result<ApiKeyStatus, ApiKeyErrorCode>> {
      const parsed = setApiKeySchema.safeParse(input);
      if (!parsed.success) {
        return err('invalid_input', parsed.error.issues[0]?.message ?? 'Invalid input.');
      }
      try {
        await deps.secrets.set('anthropic-api-key', parsed.data.apiKey);
      } catch (error: unknown) {
        if (error instanceof EncryptionUnavailableError) {
          return err(
            'encryption_unavailable',
            'macOS Keychain encryption is unavailable, so the key was not saved.',
          );
        }
        return err('storage_failed', 'The key could not be saved.');
      }
      return ok(await status(deps.secrets));
    },

    async clearApiKey(input: unknown): Promise<Result<ApiKeyStatus, ApiKeyErrorCode>> {
      if (!noArgsSchema.safeParse(input).success) return err('invalid_input', 'Unexpected arguments.');
      try {
        await deps.secrets.delete('anthropic-api-key');
      } catch {
        return err('storage_failed', 'The key could not be removed.');
      }
      return ok(await status(deps.secrets));
    },

    async testConnection(input: unknown): Promise<Result<TestConnectionSuccess, TestConnectionErrorCode>> {
      if (!noArgsSchema.safeParse(input).success) return err('unknown_error', 'Unexpected arguments.');
      let apiKey: string | undefined;
      try {
        apiKey = await deps.secrets.get('anthropic-api-key');
      } catch {
        return err('unknown_error', 'The saved key could not be decrypted.');
      }
      if (apiKey === undefined) return err('no_api_key', 'No API key is saved yet.');
      return testConnection(deps.createClient(apiKey));
    },
  };
}

export type SettingsHandlers = ReturnType<typeof createSettingsHandlers>;
