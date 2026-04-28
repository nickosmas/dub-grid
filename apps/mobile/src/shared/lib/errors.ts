import type { ToastInput } from "../providers/ToastProvider";

const NETWORK_ERROR_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /load failed/i,
  /internet connection/i,
  /network connection/i,
  /couldn't reach the mobile backend/i,
  /could not reach the mobile backend/i,
  /offline/i,
] as const;

const CLIENT_FRIENDLY_ERROR_PATTERNS = [
  {
    pattern: /invalid login credentials|invalid email or password/i,
    message: "Check your email and password and try again.",
  },
  {
    pattern: /invalid session|unauthenticated|session expired/i,
    message: "Your session expired. Sign in again to continue.",
  },
  {
    pattern: /unauthorized|forbidden|not authorized|permission denied/i,
    message: "You don't have permission to do that in this workspace.",
  },
  {
    pattern:
      /workspace.*not found|organization.*not found|could not find workspace|no workspace matched that slug/i,
    message: "We couldn't find that workspace. Check the subdomain and try again.",
  },
  {
    pattern: /email not confirmed/i,
    message: "Confirm your email address before signing in.",
  },
] as const;

const NETWORK_ERROR_TOAST_TITLE = "Network connection issue";
const NETWORK_ERROR_TOAST_MESSAGE =
  "Check your internet connection and try again.";
const NETWORK_ERROR_TOAST_KEY = "network-connection-error";

type MessageCarrier = {
  message?: unknown;
};

type ClientFriendlyToastInput = {
  error: unknown;
  fallbackMessage: string;
  title: string;
};

export function getErrorMessage(error: unknown): string | null {
  if (typeof error === "string") {
    const trimmedError = error.trim();
    return trimmedError.length > 0 ? trimmedError : null;
  }

  if (error instanceof Error) {
    const trimmedError = error.message.trim();
    return trimmedError.length > 0 ? trimmedError : null;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as MessageCarrier).message === "string"
  ) {
    const trimmedError = (error as { message: string }).message.trim();
    return trimmedError.length > 0 ? trimmedError : null;
  }

  return null;
}

export function isNetworkConnectionError(error: unknown): boolean {
  const message = getErrorMessage(error);

  if (!message) {
    return false;
  }

  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function isAuthorizationError(error: unknown): boolean {
  const message = getErrorMessage(error);

  if (!message) {
    return false;
  }

  return /unauthorized|forbidden|not authorized|permission denied/i.test(message);
}

export function getClientFriendlyErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (isNetworkConnectionError(error)) {
    return NETWORK_ERROR_TOAST_MESSAGE;
  }

  const message = getErrorMessage(error);

  if (!message) {
    return fallbackMessage;
  }

  const matchedMessage = CLIENT_FRIENDLY_ERROR_PATTERNS.find(({ pattern }) =>
    pattern.test(message),
  );

  if (matchedMessage) {
    return matchedMessage.message;
  }

  return fallbackMessage;
}

export function createNetworkErrorToast(): ToastInput {
  return {
    tone: "error",
    title: NETWORK_ERROR_TOAST_TITLE,
    message: NETWORK_ERROR_TOAST_MESSAGE,
    durationMs: null,
    dedupeKey: NETWORK_ERROR_TOAST_KEY,
  };
}

export function pushClientFriendlyErrorToast(
  pushToast: (toast: ToastInput) => void,
  input: ClientFriendlyToastInput,
) {
  if (isNetworkConnectionError(input.error)) {
    pushToast(createNetworkErrorToast());
    return;
  }

  pushToast({
    tone: "error",
    title: input.title,
    message: getClientFriendlyErrorMessage(
      input.error,
      input.fallbackMessage,
    ),
  });
}

export function getInlineErrorMessageOrToast(
  pushToast: (toast: ToastInput) => void,
  input: {
    error: unknown;
    fallbackMessage: string;
  },
): string | null {
  if (isNetworkConnectionError(input.error)) {
    pushToast(createNetworkErrorToast());
    return null;
  }

  return getClientFriendlyErrorMessage(input.error, input.fallbackMessage);
}
