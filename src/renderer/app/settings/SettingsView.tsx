import { useEffect, useState, type FormEvent } from 'react';
import type { ApiKeyStatus } from '../../../shared/types';
import { api } from '../../lib/ipc-client';

type Feedback = { kind: 'success' | 'error'; text: string } | null;

/**
 * API key entry. The key goes to main once, on Save, and is never read back:
 * the renderer only ever learns whether a key is stored.
 */
export function SettingsView() {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    void api.settings.getApiKeyStatus().then((r) => {
      if (r.ok) setStatus(r.value);
    });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    const result = await api.settings.setApiKey({ apiKey: draft });
    setBusy(false);
    if (result.ok) {
      setStatus(result.value);
      setDraft('');
      setFeedback({ kind: 'success', text: 'API key saved to the Keychain.' });
    } else {
      setFeedback({ kind: 'error', text: result.error.message });
    }
  }

  async function test() {
    setBusy(true);
    setFeedback(null);
    const result = await api.settings.testConnection();
    setBusy(false);
    setFeedback(
      result.ok
        ? {
            kind: 'success',
            text: `Connected — ${result.value.model} replied in ${result.value.latencyMs} ms.`,
          }
        : { kind: 'error', text: result.error.message },
    );
  }

  async function clear() {
    setBusy(true);
    setFeedback(null);
    const result = await api.settings.clearApiKey();
    setBusy(false);
    if (result.ok) {
      setStatus(result.value);
      setFeedback({ kind: 'success', text: 'API key removed.' });
    } else {
      setFeedback({ kind: 'error', text: result.error.message });
    }
  }

  return (
    <main className="settings" data-testid="settings-view">
      <h2>Claude API key</h2>
      {status && !status.encryptionAvailable && (
        <p className="feedback error">
          macOS Keychain encryption is unavailable, so a key can’t be stored safely.
        </p>
      )}
      <p className="muted" data-testid="key-status">
        {status === null ? 'Checking…' : status.configured ? 'A key is saved.' : 'No key saved.'}
      </p>
      <form onSubmit={(e) => void save(e)} className="row">
        <input
          type="password"
          aria-label="API key"
          placeholder={status?.configured ? 'Replace saved key' : 'sk-ant-…'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <button type="submit" disabled={busy || draft.trim() === ''}>
          Save
        </button>
      </form>
      <div className="row">
        <button type="button" onClick={() => void test()} disabled={busy || !status?.configured}>
          Test connection
        </button>
        <button type="button" onClick={() => void clear()} disabled={busy || !status?.configured}>
          Remove key
        </button>
      </div>
      {feedback && (
        <p className={`feedback ${feedback.kind}`} role="status" data-testid="settings-feedback">
          {feedback.text}
        </p>
      )}
      <p className="muted small">
        The key is encrypted with the macOS Keychain and only ever used by the app’s main process. Test
        connection sends one tiny request (a fraction of a cent).
      </p>
    </main>
  );
}
