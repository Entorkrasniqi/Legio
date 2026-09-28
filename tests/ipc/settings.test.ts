import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MessagesClient } from '../../src/main/agent-runtime/testConnection';
import { createSettingsHandlers, type SettingsHandlers } from '../../src/main/ipc/handlers/settings';
import { SecretStore, type Encryptor } from '../../src/main/security/secrets';
import { fakeClient, sdkError } from '../helpers/fakeAnthropic';

const KEY = 'sk-ant-test-0123456789abcdefghij';

const encryptor = (available = true): Encryptor => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(s).reverse(),
  decryptString: (b) => Buffer.from(b).reverse().toString(),
});

let dir: string;
let handlers: SettingsHandlers;
let clientFor: (key: string) => MessagesClient;
const keysSeenByClient: string[] = [];

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'legio-settings-'));
  keysSeenByClient.length = 0;
  clientFor = () => fakeClient({ model: 'claude-test' });
  handlers = createSettingsHandlers({
    secrets: new SecretStore(dir, encryptor()),
    createClient: (key) => {
      keysSeenByClient.push(key);
      return clientFor(key);
    },
  });
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('settings IPC handlers', () => {
  it('reports no key initially, without ever returning key material', async () => {
    const result = await handlers.getApiKeyStatus(undefined);
    expect(result).toEqual({ ok: true, value: { configured: false, encryptionAvailable: true } });
  });

  it('saves a key and returns only status', async () => {
    const result = await handlers.setApiKey({ apiKey: `  ${KEY}  ` });
    expect(result).toEqual({ ok: true, value: { configured: true, encryptionAvailable: true } });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it.each([
    ['missing object', undefined],
    ['wrong type', { apiKey: 42 }],
    ['too short', { apiKey: 'sk-ant' }],
    ['too long', { apiKey: `sk-${'a'.repeat(600)}` }],
    ['contains spaces', { apiKey: 'sk-ant-abc def-0123456789abc' }],
    ['extra fields', { apiKey: KEY, overridePolicy: true }],
    ['array', [KEY]],
    ['string', KEY],
  ])('rejects invalid setApiKey input: %s', async (_label, input) => {
    const result = await handlers.setApiKey(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('rejects arguments on no-argument calls', async () => {
    expect((await handlers.getApiKeyStatus({ sneaky: true })).ok).toBe(false);
    expect((await handlers.clearApiKey('x')).ok).toBe(false);
    expect((await handlers.testConnection({ apiKey: KEY })).ok).toBe(false);
    expect(keysSeenByClient).toEqual([]);
  });

  it('refuses to save when Keychain encryption is unavailable', async () => {
    const noCrypto = createSettingsHandlers({
      secrets: new SecretStore(dir, encryptor(false)),
      createClient: () => fakeClient({ model: 'x' }),
    });
    const result = await noCrypto.setApiKey({ apiKey: KEY });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('encryption_unavailable');
  });

  it('test connection without a saved key does not call the API', async () => {
    const result = await handlers.testConnection(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('no_api_key');
    expect(keysSeenByClient).toEqual([]);
  });

  it('test connection uses the stored (trimmed) key, in main only', async () => {
    await handlers.setApiKey({ apiKey: `  ${KEY}\n` });
    const result = await handlers.testConnection(undefined);
    expect(result).toMatchObject({ ok: true, value: { model: 'claude-test' } });
    expect(keysSeenByClient).toEqual([KEY]);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('reports an auth failure from the API as invalid_api_key', async () => {
    clientFor = () => fakeClient(sdkError(Anthropic.AuthenticationError, { status: 401, message: KEY }));
    await handlers.setApiKey({ apiKey: KEY });
    const result = await handlers.testConnection(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_api_key');
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it('clears the key', async () => {
    await handlers.setApiKey({ apiKey: KEY });
    const result = await handlers.clearApiKey(undefined);
    expect(result).toEqual({ ok: true, value: { configured: false, encryptionAvailable: true } });
  });
});
