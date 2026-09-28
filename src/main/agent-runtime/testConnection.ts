import Anthropic from '@anthropic-ai/sdk';
import { err, ok, type Result } from '../../shared/types';
import type { TestConnectionErrorCode, TestConnectionSuccess } from '../../shared/types';
import { CONNECTION_TEST_MAX_TOKENS, CONNECTION_TEST_MODEL } from './pricing-config';

/** The slice of the SDK client this module uses — lets tests pass a fake. */
export interface MessagesClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      messages: { role: 'user'; content: string }[];
    }): Promise<{ model: string }>;
  };
}

export interface ClientOptions {
  apiKey: string;
  /** Only ever set in unpackaged dev/test builds — see main/index.ts. */
  baseURL?: string;
}

export function createAnthropicClient(opts: ClientOptions): MessagesClient {
  return new Anthropic({
    apiKey: opts.apiKey,
    ...(opts.baseURL !== undefined ? { baseURL: opts.baseURL } : {}),
    maxRetries: 0,
    timeout: 20_000,
  });
}

const MESSAGES: Record<TestConnectionErrorCode, string> = {
  no_api_key: 'No API key is saved yet.',
  invalid_api_key: 'The API key was rejected. Check that it was copied in full.',
  permission_denied: 'The API key does not have permission to use this model.',
  rate_limited: 'Rate limited by the API. Wait a moment and try again.',
  network_error: 'Could not reach the Claude API. Check your internet connection.',
  api_error: 'The Claude API returned an error.',
  unknown_error: 'The test call failed for an unexpected reason.',
};

function fail(code: TestConnectionErrorCode, detail?: string): Result<never, TestConnectionErrorCode> {
  return err(code, detail ? `${MESSAGES[code]} (${detail})` : MESSAGES[code]);
}

/**
 * Makes one minimal real Messages API call and maps the outcome to a typed
 * result. Error messages are built from fixed strings plus, at most, an HTTP
 * status — never the SDK's raw error text, so nothing that could echo the
 * request (and with it the key) can reach the renderer or a log.
 */
export async function testConnection(
  client: MessagesClient,
  now: () => number = Date.now,
): Promise<Result<TestConnectionSuccess, TestConnectionErrorCode>> {
  const started = now();
  try {
    const response = await client.messages.create({
      model: CONNECTION_TEST_MODEL.id,
      max_tokens: CONNECTION_TEST_MAX_TOKENS,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
    });
    return ok({ model: response.model, latencyMs: now() - started });
  } catch (error: unknown) {
    if (error instanceof Anthropic.AuthenticationError) return fail('invalid_api_key');
    if (error instanceof Anthropic.PermissionDeniedError) return fail('permission_denied');
    if (error instanceof Anthropic.RateLimitError) return fail('rate_limited');
    if (error instanceof Anthropic.APIConnectionError) return fail('network_error');
    if (error instanceof Anthropic.APIError) {
      return fail('api_error', error.status !== undefined ? `HTTP ${error.status}` : undefined);
    }
    return fail('unknown_error');
  }
}
