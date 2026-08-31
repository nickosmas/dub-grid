import { hasShiftRequestStarted } from "./schedule-time";
import type { ShiftRequestLike } from "./types";

const TERMINAL_SHIFT_REQUEST_STATUSES = new Set(["expired", "cancelled", "approved", "rejected"]);

export type ActiveShiftRequestLike = ShiftRequestLike & {
  status: string;
  expiresAt: string;
};

/**
 * Canonical "is this request still actionable right now" filter: not in a
 * terminal status, not past its expiry, and its underlying shift hasn't
 * already started. Shared so web and mobile always agree on which requests
 * count toward Pending Approvals / badges instead of each platform applying
 * these checks independently (or, previously on mobile, not at all).
 */
export function resolveActiveShiftRequests<T extends ActiveShiftRequestLike>(
  requests: ReadonlyArray<T>,
  now: Date,
  timeZone?: string | null,
): T[] {
  const nowIso = now.toISOString();
  return requests.filter(
    (request) =>
      !TERMINAL_SHIFT_REQUEST_STATUSES.has(request.status) &&
      request.expiresAt > nowIso &&
      !hasShiftRequestStarted(request, now, timeZone),
  );
}
