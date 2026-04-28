import { onlineManager } from "@tanstack/react-query";
import {
  getClientFriendlyErrorMessage,
  isAuthorizationError,
  isNetworkConnectionError,
} from "./errors";

export function getQueryErrorMessage(
  error: unknown,
  fallback = "We couldn't load this right now.",
): string {
  return getClientFriendlyErrorMessage(error, fallback);
}

export function getMobileQueryContentState(input: {
  hasData: boolean;
  isLoading: boolean;
  error: unknown;
}) {
  if (!input.hasData && onlineManager.isOnline() === false) {
    return {
      kind: "error",
      message: "You're offline. Check your internet connection and try again.",
      reason: "network",
    } as const;
  }

  if (input.isLoading && !input.hasData) {
    return { kind: "loading" } as const;
  }

  if (input.error && !input.hasData) {
    return {
      kind: "error",
      message: getQueryErrorMessage(input.error),
      reason: isAuthorizationError(input.error)
        ? "unauthorized"
        : isNetworkConnectionError(input.error)
          ? "network"
          : "generic",
    } as const;
  }

  if (!input.hasData) {
    return { kind: "empty" } as const;
  }

  return { kind: "ready" } as const;
}
