import { QueryClient } from "@tanstack/react-query";
import { ApiResponseError } from "@dubgrid/api-client";

/**
 * `NetworkStateProvider` wires react-query's `focusManager` to AppState, so
 * every return-to-foreground marks all mounted queries stale and refetches
 * them at once — a burst of requests and a flash of loading states on a screen
 * the user was just looking at. A short staleness window collapses that burst
 * while still refreshing anything genuinely old.
 */
const FOREGROUND_STALE_TIME_MS = 30_000;

/**
 * A retry re-runs the same request, so a refused, forbidden or missing answer
 * comes back again and only delays the error. A dropped connection is retried
 * like a server failure: iOS often drops the first request after a wake or a
 * network handover while the connection works, and leaving it to
 * `refetchOnReconnect` showed an error page that never cleared, since the app
 * never went offline to come back. React Query pauses retries while offline.
 * A timeout is the exception: see below.
 */
const TERMINAL_STATUSES = new Set([401, 403, 404]);

export function shouldRetryMobileQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiResponseError && TERMINAL_STATUSES.has(error.status)) {
    return false;
  }
  // A request that ran out its whole deadline met a busy server, not a
  // dropped connection; sending it again only lengthens the queue it waited in.
  // By name, since the class lives in api.ts, which imports this module.
  if (error instanceof Error && error.name === "MobileRequestTimeoutError") {
    return false;
  }

  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryMobileQuery,
      refetchOnReconnect: true,
      staleTime: FOREGROUND_STALE_TIME_MS,
    },
    mutations: {
      retry: false,
    },
  },
});
