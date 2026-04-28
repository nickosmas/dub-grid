import { QueryClient } from "@tanstack/react-query";
import { isNetworkConnectionError } from "./errors";

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
    },
    mutations: {
      retry: false,
    },
  },
});
