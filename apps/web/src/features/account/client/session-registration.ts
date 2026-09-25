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
