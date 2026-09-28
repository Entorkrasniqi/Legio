/**
 * Every IPC call resolves to a Result instead of throwing. Errors thrown
 * across IPC are serialized with their raw message, which is an easy way to
 * leak internal detail to the renderer; a typed error code avoids that.
 */
export type Result<T, E extends string = string> =
  { ok: true; value: T } | { ok: false; error: { code: E; message: string } };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E extends string>(
  code: E,
  message: string,
): { ok: false; error: { code: E; message: string } } {
  return { ok: false, error: { code, message } };
}
