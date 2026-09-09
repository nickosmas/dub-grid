/**
 * `fetch` with a deadline.
 *
 * A stalled connection — a phone dropping to one bar, hotel wifi, a captive
 * portal — does not fail a `fetch`. It leaves the promise pending, sometimes
 * for minutes. Any button that awaits one without a deadline is therefore a
 * spinner that can never stop, because nothing rejects and so no error path
 * runs. That is a network condition our users will meet routinely, not an edge
 * case, so every user-initiated request needs one of these.
 *
 * `AbortSignal.timeout` aborts the request itself rather than just abandoning
 * the promise, so the connection is released too.
 */

/** A request that exceeded its deadline, as opposed to one that failed. */
export class RequestTimeoutError extends Error {
  constructor(ms: number) {
    super(`Request exceeded ${ms}ms`);
    this.name = "RequestTimeoutError";
  }
}

/** Default budget: long enough for a slow-but-working connection to finish. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  try {
    return await fetch(input, { ...init, signal });
  } catch (err) {
    // AbortSignal.timeout rejects with a TimeoutError DOMException. Translate
    // it so callers can tell "too slow" from "refused" and say so to the user.
    if (timeoutSignal.aborted) {
      throw new RequestTimeoutError(timeoutMs);
    }
    throw err;
  }
}

/**
 * Give an async browser-provider operation the same finite UI deadline as a
 * fetch. The provider promise may not support cancellation, so callers must
 * ignore its late settlement and must not automatically replay mutations.
 */
export async function settleWithRequestTimeout<T>(
  request: PromiseLike<T>,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new RequestTimeoutError(timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve(request), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/** True when a caught error came from a request deadline rather than a failure. */
export function isRequestTimeout(err: unknown): boolean {
  return (
    err instanceof RequestTimeoutError ||
    (err instanceof DOMException && err.name === "TimeoutError")
  );
}
