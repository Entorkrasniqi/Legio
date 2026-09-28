import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EncryptionUnavailableError, SecretStore, type Encryptor } from '../../src/main/security/secrets';

/** Reversible fake: good enough to prove plaintext never hits the disk. */
function fakeEncryptor(available = true): Encryptor {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString('base64')}`),
    decryptString: (b) => Buffer.from(b.toString().slice(4), 'base64').toString(),
  };
}

const KEY = 'sk-ant-test-0123456789abcdefghij';
let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'legio-secrets-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('SecretStore', () => {
  it('round-trips a secret', async () => {
    const store = new SecretStore(dir, fakeEncryptor());
    expect(await store.has('anthropic-api-key')).toBe(false);
    await store.set('anthropic-api-key', KEY);
    expect(await store.has('anthropic-api-key')).toBe(true);
    expect(await store.get('anthropic-api-key')).toBe(KEY);
  });

  it('never writes the plaintext to disk', async () => {
    const store = new SecretStore(dir, fakeEncryptor());
    await store.set('anthropic-api-key', KEY);
    for (const file of await fs.readdir(dir)) {
      const contents = await fs.readFile(path.join(dir, file), 'utf8');
      expect(contents).not.toContain(KEY);
    }
  });

  it('writes owner-only files in an owner-only directory', async () => {
    const secretsDir = path.join(dir, 'secrets');
    const store = new SecretStore(secretsDir, fakeEncryptor());
    await store.set('anthropic-api-key', KEY);
    const dirMode = (await fs.stat(secretsDir)).mode & 0o777;
    const fileMode = (await fs.stat(path.join(secretsDir, 'anthropic-api-key.bin'))).mode & 0o777;
    expect(dirMode).toBe(0o700);
    expect(fileMode).toBe(0o600);
  });

  it('refuses to store anything when OS encryption is unavailable — no plaintext fallback', async () => {
    const store = new SecretStore(dir, fakeEncryptor(false));
    await expect(store.set('anthropic-api-key', KEY)).rejects.toBeInstanceOf(EncryptionUnavailableError);
    expect(await fs.readdir(dir)).toEqual([]);
  });

  it('deletes a secret, and deleting a missing one is fine', async () => {
    const store = new SecretStore(dir, fakeEncryptor());
    await store.set('anthropic-api-key', KEY);
    await store.delete('anthropic-api-key');
    expect(await store.has('anthropic-api-key')).toBe(false);
    expect(await store.get('anthropic-api-key')).toBeUndefined();
    await expect(store.delete('anthropic-api-key')).resolves.toBeUndefined();
  });

  it('rejects unknown secret names instead of building a path from them', async () => {
    const store = new SecretStore(dir, fakeEncryptor());
    // Deliberately bypass the type system to simulate a future bad caller.
    const bad = '../../etc/passwd' as unknown as 'anthropic-api-key';
    await expect(store.set(bad, KEY)).rejects.toThrow(/Unknown secret name/);
  });
});
