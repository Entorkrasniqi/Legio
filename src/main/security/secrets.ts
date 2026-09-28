import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * The subset of Electron's `safeStorage` this module needs. Injected so the
 * store is unit-testable without Electron and so nothing else in main ever
 * handles encryption directly.
 */
export interface Encryptor {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class EncryptionUnavailableError extends Error {
  constructor() {
    super('OS-level encryption (Keychain via safeStorage) is not available');
    this.name = 'EncryptionUnavailableError';
  }
}

export type SecretName = 'anthropic-api-key';

const SECRET_NAMES: ReadonlySet<string> = new Set<SecretName>(['anthropic-api-key']);

/**
 * Stores secrets encrypted with safeStorage (whose key lives in the macOS
 * Keychain) as individual files under `<userData>/secrets/`, owner-only
 * permissions. Never in SQLite, never in plain text, never logged
 * (docs/SECURITY.md → Secrets). If the OS can't encrypt, storing fails —
 * there is no plaintext fallback.
 */
export class SecretStore {
  constructor(
    private readonly dir: string,
    private readonly encryptor: Encryptor,
  ) {}

  isEncryptionAvailable(): boolean {
    return this.encryptor.isEncryptionAvailable();
  }

  async has(name: SecretName): Promise<boolean> {
    try {
      await fs.access(this.fileFor(name));
      return true;
    } catch {
      return false;
    }
  }

  async set(name: SecretName, value: string): Promise<void> {
    const target = this.fileFor(name);
    if (!this.encryptor.isEncryptionAvailable()) throw new EncryptionUnavailableError();
    const encrypted = this.encryptor.encryptString(value);
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    await fs.chmod(this.dir, 0o700);
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, encrypted, { mode: 0o600 });
    await fs.rename(tmp, target);
  }

  /** Returns undefined when no secret is stored. Main-process use only. */
  async get(name: SecretName): Promise<string | undefined> {
    let encrypted: Buffer;
    try {
      encrypted = await fs.readFile(this.fileFor(name));
    } catch {
      return undefined;
    }
    if (!this.encryptor.isEncryptionAvailable()) throw new EncryptionUnavailableError();
    return this.encryptor.decryptString(encrypted);
  }

  async delete(name: SecretName): Promise<void> {
    await fs.rm(this.fileFor(name), { force: true });
  }

  private fileFor(name: SecretName): string {
    // Names come from a closed set, never from IPC input, but check anyway so
    // a future caller can't turn this into a path-traversal primitive.
    if (!SECRET_NAMES.has(name)) throw new Error('Unknown secret name');
    return path.join(this.dir, `${name}.bin`);
  }
}
