/**
 * Content-Security-Policy for app windows (docs/SECURITY.md → Electron
 * hardening). Injected into index.html at build time by the Vite plugin in
 * electron.vite.config.ts, and also sent as a response header, so the two can
 * never disagree.
 *
 * Production is strict: no remote sources, no inline script, no eval.
 * Development only relaxes what the Vite dev server + React Fast Refresh
 * genuinely need (an inline preamble script, injected <style> tags, and the
 * HMR websocket on localhost). Nothing in either policy allows a remote host.
 */
const PROD_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'frame-src': ["'none'"],
  'worker-src': ["'none'"],
};

const DEV_OVERRIDES: Record<string, string[]> = {
  'script-src': ["'self'", "'unsafe-inline'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'connect-src': ["'self'", 'ws://localhost:*', 'http://localhost:*'],
};

export function buildCsp(mode: 'production' | 'development'): string {
  const directives = mode === 'development' ? { ...PROD_DIRECTIVES, ...DEV_OVERRIDES } : PROD_DIRECTIVES;
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
