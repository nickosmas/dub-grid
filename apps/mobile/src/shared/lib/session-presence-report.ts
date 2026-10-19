import {
  getOrgIdFromAccessToken,
  getSessionIdFromAccessToken,
  getUserIdFromAccessToken,
} from "./access-token";

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

/** Refresh-time reports for one session are sent at most this often. */
export const SESSION_PRESENCE_REFRESH_MS = 30 * 60_000;

export type SessionPresenceMark = { sessionKey: string; reportedAt: number };

/**
 * Who and where this token signs in: the person, the organization and the
 * Supabase session, all unchanged by a refresh. A token without a session id
 * keys on itself, so it is still reported.
 */
export function getSessionPresenceKey(accessToken: string): string {
  const sessionId = getSessionIdFromAccessToken(accessToken);
  if (!sessionId) return accessToken;
  return JSON.stringify([
    getUserIdFromAccessToken(accessToken),
    getOrgIdFromAccessToken(accessToken),
    sessionId,
  ]);
}

/**
 * A sign-in, a restore or an organization change reports at once; a token
 * refresh within the same session only once the last report is half an hour
 * old. Reporting every refresh sent the same row about once an hour per device
 * and again on most foregrounds.
 */
export function shouldReportSessionPresence(
  last: SessionPresenceMark | null,
  sessionKey: string,
  now: number,
): boolean {
  if (!last || last.sessionKey !== sessionKey) return true;
  const age = now - last.reportedAt;
  return age < 0 || age >= SESSION_PRESENCE_REFRESH_MS;
}
