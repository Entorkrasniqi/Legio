import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  CONNECTION_TEST_MAX_TOKENS,
  CONNECTION_TEST_MODEL,
} from '../../src/main/agent-runtime/pricing-config';
import { testConnection } from '../../src/main/agent-runtime/testConnection';
import { fakeClient, sdkError } from '../helpers/fakeAnthropic';

const KEY = 'sk-ant-secret-should-never-appear-0123456789';

describe('testConnection', () => {
  it('makes one minimal call with the configured cheap model and a tiny token cap', async () => {
    const client = fakeClient({ model: CONNECTION_TEST_MODEL.id });
    let t = 1000;
    const result = await testConnection(client, () => (t += 150));
    expect(result).toEqual({ ok: true, value: { model: CONNECTION_TEST_MODEL.id, latencyMs: 150 } });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.model).toBe(CONNECTION_TEST_MODEL.id);
    expect(client.calls[0]?.max_tokens).toBe(CONNECTION_TEST_MAX_TOKENS);
    expect(CONNECTION_TEST_MAX_TOKENS).toBeLessThanOrEqual(16);
  });

  it.each([
    [Anthropic.AuthenticationError, 401, 'invalid_api_key'],
    [Anthropic.PermissionDeniedError, 403, 'permission_denied'],
    [Anthropic.RateLimitError, 429, 'rate_limited'],
    [Anthropic.APIConnectionError, undefined, 'network_error'],
    [Anthropic.InternalServerError, 500, 'api_error'],
  ] as const)('maps %o to %s', async (cls, status, code) => {
    const result = await testConnection(fakeClient(sdkError(cls, status !== undefined ? { status } : {})));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(code);
  });

  it('maps a non-SDK error to unknown_error', async () => {
    const result = await testConnection(fakeClient(new TypeError('boom')));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unknown_error');
  });

  it('never passes the raw SDK error text through (it could echo the key)', async () => {
    for (const cls of [Anthropic.AuthenticationError, Anthropic.APIError, Anthropic.APIConnectionError]) {
      const result = await testConnection(
        fakeClient(sdkError(cls, { status: 401, message: `bad key ${KEY}` })),
      );
      expect(JSON.stringify(result)).not.toContain(KEY);
    }
    const plain = await testConnection(fakeClient(new Error(`bad key ${KEY}`)));
    expect(JSON.stringify(plain)).not.toContain(KEY);
  });
});
