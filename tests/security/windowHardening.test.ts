import { describe, expect, it } from 'vitest';
import { buildCsp } from '../../src/main/security/csp';
import {
  HARDENED_WEB_PREFERENCES,
  hardenedWebPreferences,
  isAllowedAppUrl,
  type AppUrlPolicy,
} from '../../src/main/security/windowHardening';

describe('hardened webPreferences (docs/SECURITY.md)', () => {
  it('has the non-negotiable settings', () => {
    expect(HARDENED_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
    });
  });

  it('only adds the preload path and cannot be weakened by it', () => {
    const prefs = hardenedWebPreferences('/app/out/preload/index.js');
    expect(prefs).toEqual({ preload: '/app/out/preload/index.js', ...HARDENED_WEB_PREFERENCES });
  });
});

describe('isAllowedAppUrl', () => {
  const prod: AppUrlPolicy = {
    rendererFile: '/Applications/Legio.app/out/renderer/index.html',
    devServerUrl: undefined,
  };
  const dev: AppUrlPolicy = { ...prod, devServerUrl: 'http://localhost:5173' };

  it('allows the bundled renderer, with or without a hash', () => {
    expect(isAllowedAppUrl('file:///Applications/Legio.app/out/renderer/index.html', prod)).toBe(true);
    expect(isAllowedAppUrl('file:///Applications/Legio.app/out/renderer/index.html#settings', prod)).toBe(
      true,
    );
  });

  it('rejects any other local file', () => {
    expect(isAllowedAppUrl('file:///Users/me/Downloads/evil.html', prod)).toBe(false);
    expect(isAllowedAppUrl('file:///Applications/Legio.app/out/renderer/../../evil.html', prod)).toBe(false);
  });

  it('rejects remote content', () => {
    expect(isAllowedAppUrl('https://example.com/', prod)).toBe(false);
    expect(isAllowedAppUrl('https://example.com/', dev)).toBe(false);
  });

  it('allows the dev server only in development, and only its exact origin', () => {
    expect(isAllowedAppUrl('http://localhost:5173/#settings', dev)).toBe(true);
    expect(isAllowedAppUrl('http://localhost:5173/#settings', prod)).toBe(false);
    expect(isAllowedAppUrl('http://localhost:9999/', dev)).toBe(false);
  });

  it('rejects garbage', () => {
    expect(isAllowedAppUrl('not a url', dev)).toBe(false);
    expect(isAllowedAppUrl('javascript:alert(1)', dev)).toBe(false);
  });
});

describe('Content-Security-Policy', () => {
  const prodCsp = buildCsp('production');
  const devCsp = buildCsp('development');

  it('production allows no inline script, no eval, and no remote sources', () => {
    expect(prodCsp).not.toContain('unsafe-inline');
    expect(prodCsp).not.toContain('unsafe-eval');
    expect(prodCsp).not.toMatch(/https?:/);
    expect(prodCsp).toContain("default-src 'none'");
    expect(prodCsp).toContain("object-src 'none'");
  });

  it('development never allows eval or a non-localhost host', () => {
    expect(devCsp).not.toContain('unsafe-eval');
    const hosts = devCsp.match(/(?:https?|wss?):\/\/[^\s;]+/g) ?? [];
    for (const host of hosts) expect(host).toMatch(/^(?:https?|wss?):\/\/localhost:\*$/);
  });
});
