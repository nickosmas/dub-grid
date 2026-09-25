/**
 * Waits before each retry. The server alerts on a new sign-in only within 15
 * minutes of it, so the retries land within seconds; a failure that outlasts
 * them is left to the next token.
 */
const RETRY_DELAYS_MS = [1_000, 3_000];

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  // No status: the request never got an answer. 409: the account row was not
  // ready. 5xx: the server failed. Anything else will fail the same way again.
  return typeof status !== "number" || status === 409 || status >= 500;
}

/**
 * Reports this device's session, retrying a refused report while the token is
 * still the current one. Resolves true once a report lands, false otherwise.
 * A refused report used to be dropped until the next token, about an hour
 * later and too late for the server to alert on the sign-in (41d1).
 */
export async function reportSessionPresence(
  accessToken: string,
  deps: {
    send: (accessToken: string) => Promise<unknown>;
    isCurrent: () => boolean;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<boolean> {
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      await deps.send(accessToken);
      return true;
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isRetryable(error)) return false;
      await sleep(delay);
      if (!deps.isCurrent()) return false;
    }
  }
}
