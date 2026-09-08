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
 * Coalesces overlapping registration attempts for one verified Supabase
 * session. The state is intentionally memory-only: it survives development
 * Strict Mode remounts, resets on a real page load, and never persists a token.
 */
export function createSessionRegistration(
  send: () => Promise<void>,
  options: {
    now?: () => number;
    dedupeWindowMs?: number;
  } = {},
): (session: SessionWithAccessToken) => Promise<void> {
  const now = options.now ?? Date.now;
  const dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  let state: RegistrationState | null = null;

  return (session) => {
    const sessionId = readSupabaseSessionId(session.access_token);

    // A real Supabase access token contains session_id. If an unexpected token
    // does not, preserve the existing behavior instead of deduplicating two
    // sessions we cannot prove are the same.
    if (!sessionId) return send();

    if (
      state?.sessionId === sessionId &&
      (state.completedAt === null || now() - state.completedAt < dedupeWindowMs)
    ) {
      return state.request;
    }

    const request = Promise.resolve().then(send);
    const nextState: RegistrationState = {
      sessionId,
      request,
      completedAt: null,
    };
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
