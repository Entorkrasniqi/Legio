import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StubServer {
  url: string;
  requests: { path: string; apiKey: string | undefined }[];
  close(): Promise<void>;
}

/**
 * A tiny stand-in for the Messages API so the E2E suite never spends real
 * credit. Accepts one key ('sk-ant-e2e-valid-key-0123456789'); anything else
 * gets a 401 in the API's error shape.
 */
export async function startStubAnthropic(): Promise<StubServer> {
  const requests: StubServer['requests'] = [];
  const server = http.createServer((req, res) => {
    const apiKey = req.headers['x-api-key'];
    requests.push({ path: req.url ?? '', apiKey: typeof apiKey === 'string' ? apiKey : undefined });
    req.resume();
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
        res.statusCode = 404;
        res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'not found' } }));
        return;
      }
      if (apiKey !== 'sk-ant-e2e-valid-key-0123456789') {
        res.statusCode = 401;
        res.end(
          JSON.stringify({
            type: 'error',
            error: { type: 'authentication_error', message: 'invalid x-api-key' },
          }),
        );
        return;
      }
      res.statusCode = 200;
      res.end(
        JSON.stringify({
          id: 'msg_e2e_stub',
          type: 'message',
          role: 'assistant',
          model: 'claude-e2e-stub',
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 12, output_tokens: 1 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
