import type Anthropic from '@anthropic-ai/sdk';
import type { MessagesClient } from '../../src/main/agent-runtime/testConnection';

type ErrorClass =
  | typeof Anthropic.AuthenticationError
  | typeof Anthropic.PermissionDeniedError
  | typeof Anthropic.RateLimitError
  | typeof Anthropic.APIConnectionError
  | typeof Anthropic.InternalServerError
  | typeof Anthropic.APIError;

/**
 * Builds an instance of a real SDK error class without going through its
 * constructor (whose signature isn't part of the public contract we rely
 * on) — `instanceof` is all testConnection() checks.
 */
export function sdkError(cls: ErrorClass, props: { status?: number; message?: string } = {}): Error {
  const error = Object.create(cls.prototype) as Error & { status?: number };
  error.message = props.message ?? 'fake SDK error';
  if (props.status !== undefined) error.status = props.status;
  return error;
}

export interface FakeClient extends MessagesClient {
  calls: Parameters<MessagesClient['messages']['create']>[0][];
}

export function fakeClient(outcome: { model: string } | Error): FakeClient {
  const calls: FakeClient['calls'] = [];
  return {
    calls,
    messages: {
      async create(params) {
        calls.push(params);
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
  };
}
