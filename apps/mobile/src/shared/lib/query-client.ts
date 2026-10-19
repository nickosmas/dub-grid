import { QueryClient } from "@tanstack/react-query";
import { ApiResponseError } from "@dubgrid/api-client";
import { isNetworkConnectionError } from "./errors";

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
 * comes back again and only delays the error. Network failures wait for
 * `refetchOnReconnect`.
 */
const TERMINAL_STATUSES = new Set([401, 403, 404]);

export function shouldRetryMobileQuery(failureCount: number, error: unknown): boolean {
  if (isNetworkConnectionError(error)) {
    return false;
  }

  if (error instanceof ApiResponseError && TERMINAL_STATUSES.has(error.status)) {
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
