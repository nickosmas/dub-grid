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

/**
 * `hasData` answers "is there anything to render from?" and drives the loading
 * and error branches. `isEmpty` answers "did the result turn out to be empty?"
 * and drives the empty branch.
 *
 * They are the same question for a screen whose only signal is a list length,
 * which is why `isEmpty` defaults to `!hasData`. They come apart on any screen
 * whose query key carries a search or filter: there, `hasData` has to mean "the
 * query resolved" so a keystroke doesn't repaint the skeleton over content the
 * user is reading, and `isEmpty` carries the list length separately.
 */
export function getMobileQueryContentState(input: {
  hasData: boolean;
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
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

  if (input.isEmpty ?? !input.hasData) {
    return { kind: "empty" } as const;
  }

  return { kind: "ready" } as const;
}
