import {
  isAuthRecoveryTimeout,
  isNetworkConnectionError,
  isRetryableAuthRecoveryError,
} from "@dubgrid/client-errors";

type StatusError = { status?: unknown };

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as StatusError).status;
  return typeof status === "number" ? status : null;
}

export function getWebAuthRecoveryMessage(error: unknown, fallback: string): string {
  const status = statusOf(error);
  if (status === 429) return "Too many requests. Wait a few minutes and try again.";
  if (isAuthRecoveryTimeout(error)) {
    return "That took too long. Check your connection and try again.";
  }
  if (isNetworkConnectionError(error)) {
    return "We couldn't reach DubGrid. Check your connection and try again.";
  }
  if (isRetryableAuthRecoveryError(error)) {
    return "DubGrid is temporarily unavailable. Please try again.";
  }
  return fallback;
}
