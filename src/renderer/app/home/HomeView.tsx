import { useEffect, useState } from 'react';
import type { ApiKeyStatus } from '../../../shared/types';
import { APP_NAME } from '../../../shared/constants';
import { api } from '../../lib/ipc-client';

/** M1 placeholder for the main window: companies and workers arrive in M2. */
export function HomeView() {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);

  useEffect(() => {
    const refresh = () => {
      void api.settings.getApiKeyStatus().then((r) => {
        if (r.ok) setStatus(r.value);
      });
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  return (
    <main className="home" data-testid="home-view">
      <h1>{APP_NAME}</h1>
      <p className="muted">No companies yet.</p>
      {status && !status.configured && (
        <p>
          Add your Claude API key in Settings to get started.{' '}
          <button type="button" onClick={() => void api.settings.openWindow()}>
            Open Settings…
          </button>
        </p>
      )}
      {status?.configured && <p className="muted">API key saved.</p>}
    </main>
  );
}
