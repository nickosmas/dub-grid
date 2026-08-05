import { QueryClient } from "@tanstack/react-query";
import { isNetworkConnectionError } from "./errors";

/**
 * `NetworkStateProvider` wires react-query's `focusManager` to AppState, so
 * every return-to-foreground marks all mounted queries stale and refetches
 * them at once — a burst of requests and a flash of loading states on a screen
 * the user was just looking at. A short staleness window collapses that burst
 * while still refreshing anything genuinely old.
 */
const FOREGROUND_STALE_TIME_MS = 30_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (isNetworkConnectionError(error)) {
          return false;
        }

        return failureCount < 2;
      },
      refetchOnReconnect: true,
      staleTime: FOREGROUND_STALE_TIME_MS,
    },
    mutations: {
      retry: false,
    },
  },
});
