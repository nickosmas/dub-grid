/**
 * Mobile error helpers.
 *
 * Raw-message extraction, error classification, and friendly-copy translation
 * are delegated to the shared `@dubgrid/client-errors` package so the web and
 * mobile apps stay in sync. This file keeps only the mobile-specific concerns:
 * building `ToastInput` objects and the dev-server network hint, both of which
 * depend on the mobile toast type or `process.env`.
 */
import {
  NETWORK_ERROR_MESSAGE,
  NETWORK_ERROR_TITLE,
  formatClientErrorMessage,
  getErrorMessage,
  isAuthorizationError,
  isNetworkConnectionError,
  getOrgUnavailableMessage,
  isAuthRecoveryTimeout,
} from "@dubgrid/client-errors";
import type { ToastInput } from "../providers/ToastProvider";
import { isLoopbackHost, isPrivateIpv4Host } from "./env";

export {
  getErrorMessage,
  isAuthorizationError,
  isNetworkConnectionError,
  getOrgUnavailableMessage,
};

const GENERIC_INLINE_NETWORK_ERROR_MESSAGE =
  "We couldn't connect right now. Check your internet connection and try again.";
const DEV_INLINE_NETWORK_ERROR_MESSAGE =
  "We couldn't reach the local service from this device. Make sure your phone is on the same Wi-Fi network as the laptop running the dev server, then try again.";
const NETWORK_ERROR_TOAST_KEY = "network-connection-error";

export function buildInlineNetworkErrorMessage(): string {
  const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
  if (!apiBaseUrl) {
    return GENERIC_INLINE_NETWORK_ERROR_MESSAGE;
  }

  try {
    const host = new URL(apiBaseUrl).hostname;
    if (isLoopbackHost(host) || isPrivateIpv4Host(host)) {
      return DEV_INLINE_NETWORK_ERROR_MESSAGE;
    }
  } catch {
    // Fall through to the generic message.
  }

  return GENERIC_INLINE_NETWORK_ERROR_MESSAGE;
}

type ClientFriendlyToastInput = {
  error: unknown;
  fallbackMessage: string;
  title: string;
  /**
   * Collapses repeats of the same failure into one toast. Pass it where two
   * surfaces report the same underlying query error — without it the user gets
   * a stack of differently-titled toasts for a single failed request.
   */
  dedupeKey?: string;
};

/**
 * Translate an unknown error into copy safe to show a user. Thin wrapper over
 * the shared `formatClientErrorMessage` — kept for the mobile-friendly name and
 * its required (non-optional) fallback argument.
 */
export function getClientFriendlyErrorMessage(error: unknown, fallbackMessage: string): string {
  return formatClientErrorMessage(error, fallbackMessage);
}

export function createNetworkErrorToast(): ToastInput {
  return {
    tone: "error",
    title: NETWORK_ERROR_TITLE,
    message: NETWORK_ERROR_MESSAGE,
    dedupeKey: NETWORK_ERROR_TOAST_KEY,
  };
}

export function pushClientFriendlyErrorToast(
  pushToast: (toast: ToastInput) => void,
  input: ClientFriendlyToastInput,
) {
  if (isNetworkConnectionError(input.error) || isAuthRecoveryTimeout(input.error)) {
    pushToast(createNetworkErrorToast());
    return;
  }

  pushToast({
    tone: "error",
    title: input.title,
    message: getClientFriendlyErrorMessage(input.error, input.fallbackMessage),
    dedupeKey: input.dedupeKey,
  });
}

export function getInlineErrorMessageOrToast(
  pushToast: (toast: ToastInput) => void,
  input: {
    error: unknown;
    fallbackMessage: string;
    preferInlineNetworkError?: boolean;
  },
): string | null {
  if (isNetworkConnectionError(input.error) || isAuthRecoveryTimeout(input.error)) {
    if (input.preferInlineNetworkError) {
      return buildInlineNetworkErrorMessage();
    }

    pushToast(createNetworkErrorToast());
    return null;
  }

  return getClientFriendlyErrorMessage(input.error, input.fallbackMessage);
}
