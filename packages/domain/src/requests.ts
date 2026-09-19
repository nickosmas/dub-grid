export type ShiftRequestType = "pickup" | "swap" | "calloff";

export type ShiftRequestStatus =
  "open" | "pending_approval" | "approved" | "rejected" | "cancelled" | "expired";

const SHIFT_REQUEST_STATUS_LABELS: Record<string, string> = {
  approved: "Approved",
  cancelled: "Cancelled",
  canceled: "Canceled",
  expired: "Expired",
  open: "Open",
  pending_approval: "Awaiting approval",
  rejected: "Rejected",
};

/** Human label for a request status; an unknown token is title-cased rather than shown raw. */
export function formatShiftRequestStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  const known = SHIFT_REQUEST_STATUS_LABELS[status];
  if (known) return known;
  const words = status.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Unknown";
}
