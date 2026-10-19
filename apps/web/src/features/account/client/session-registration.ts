type SessionWithAccessToken = {
  access_token: string;
};

type RegistrationState = {
  sessionId: string;
  request: Promise<void>;
  completedAt: number | null;
};

const DEFAULT_DEDUPE_WINDOW_MS = 5_000;
/**
 * Waits before each retry. The server can alert on a new sign-in only for 15
 * minutes after it, so the retries land within seconds, and a failure that
 * outlasts them is left to the next token rather than retried forever.
 */
const DEFAULT_RETRY_DELAYS_MS = [1_000, 3_000];

/** A report the server refused or could not take, and whether trying again can help. */
export class SessionRegistrationError extends Error {
  readonly retryable: boolean;

  constructor(status: number) {
    super(`Session registration failed with ${status}`);
    this.name = "SessionRegistrationError";
    // 409: the account row was not ready yet. 5xx: the server failed. A 400 or
    // 401 will fail the same way again.
    this.retryable = status === 409 || status >= 500;
  }
}

function isRetryable(error: unknown): boolean {
  return error instanceof SessionRegistrationError ? error.retryable : true;
}

/**
 * Coalesces overlapping registration attempts for one verified Supabase
 * session. The state is intentionally memory-only: it survives development
 * Strict Mode remounts, resets on a real page load, and never persists a token.
 */
export function createSessionRegistration(
  send: () => Promise<void>,
  options: {
    now?: () => number;
    dedupeWindowMs?: number;
    retryDelaysMs?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
  } = {},
): (session: SessionWithAccessToken) => Promise<void> {
  const now = options.now ?? Date.now;
  const dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let state: RegistrationState | null = null;

  // `isCurrent` stops a retry once another session has replaced this one:
  // the report is cookie-authenticated, so a late retry would speak for it.
  const sendWithRetries = async (isCurrent: () => boolean = () => true): Promise<void> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await send();
      } catch (error) {
        const delay = retryDelaysMs[attempt];
        if (delay === undefined || !isRetryable(error)) throw error;
        await sleep(delay);
        if (!isCurrent()) throw error;
      }
    }
  };

  return (session) => {
    const sessionId = readSupabaseSessionId(session.access_token);

    // A real Supabase access token contains session_id. If an unexpected token
    // does not, preserve the existing behavior instead of deduplicating two
    // sessions we cannot prove are the same.
    if (!sessionId) return sendWithRetries();

    if (
      state?.sessionId === sessionId &&
      (state.completedAt === null || now() - state.completedAt < dedupeWindowMs)
    ) {
      return state.request;
    }

    const nextState: RegistrationState = {
      sessionId,
      request: Promise.resolve(),
      completedAt: null,
    };
    const request = Promise.resolve().then(() => sendWithRetries(() => state === nextState));
    nextState.request = request;
    state = nextState;

    void request.then(
      () => {
        if (state === nextState) nextState.completedAt = now();
      },
      () => {
        if (state === nextState) state = null;
      },
    );

    return request;
  };
}

const REPORTED_SESSION_KEY = "dg_session_reported";
export const RESTORED_SESSION_REPORT_INTERVAL_MS = 10 * 60_000;

type ReportedSessionStorage = Pick<Storage, "getItem" | "setItem">;

function browserSessionStorage(): ReportedSessionStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function resolveStorage(options: {
  storage?: ReportedSessionStorage | null;
}): ReportedSessionStorage | null {
  return "storage" in options ? (options.storage ?? null) : browserSessionStorage();
}

/**
 * Whether a session restored on page load was reported from this tab recently
 * enough to skip reporting it again. Every hard load used to post it. Storage
 * that cannot be read answers false, so the report is sent.
 */
export function wasSessionReportedRecently(
  session: SessionWithAccessToken,
  options: { storage?: ReportedSessionStorage | null; now?: () => number } = {},
): boolean {
  const sessionId = readSupabaseSessionId(session.access_token);
  if (!sessionId) return false;
  try {
    const raw = resolveStorage(options)?.getItem(REPORTED_SESSION_KEY);
    if (!raw) return false;
    const stamp = JSON.parse(raw) as { sessionId?: unknown; at?: unknown };
    const age = (options.now ?? Date.now)() - Number(stamp.at);
    return stamp.sessionId === sessionId && age >= 0 && age < RESTORED_SESSION_REPORT_INTERVAL_MS;
  } catch {
    return false;
  }
}

export function markSessionReported(
  session: SessionWithAccessToken,
  options: { storage?: ReportedSessionStorage | null; now?: () => number } = {},
): void {
  const sessionId = readSupabaseSessionId(session.access_token);
  if (!sessionId) return;
  try {
    resolveStorage(options)?.setItem(
      REPORTED_SESSION_KEY,
      JSON.stringify({ sessionId, at: (options.now ?? Date.now)() }),
    );
  } catch {
    // A full or blocked store only means the next load reports again.
  }
}

function readSupabaseSessionId(accessToken: string): string | null {
  try {
    const encodedPayload = accessToken.split(".")[1];
    if (!encodedPayload) return null;
    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const payload = JSON.parse(atob(`${normalized}${padding}`)) as Record<string, unknown>;
    return typeof payload.session_id === "string" && payload.session_id.length > 0
      ? payload.session_id
      : null;
  } catch {
    return null;
  }
}
