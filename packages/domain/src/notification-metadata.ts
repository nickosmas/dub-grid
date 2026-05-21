/**
 * Shared helpers for rendering notification metadata in user-facing surfaces
 * (bell, inbox, mobile detail). The notifications table can carry arbitrary
 * metadata, but most keys are either technical plumbing (ids, hrefs, type
 * discriminators) or user-facing details. This module hides the former and
 * humanizes the latter.
 */

/** Keys that are wiring/plumbing and must never surface in the UI. */
const TECHNICAL_METADATA_KEYS = new Set<string>([
  // ids
  "requestId",
  "notificationId",
  "stripeEventId",
  "stripe_event_id",
  "invitationId",
  "sessionId",
  "empId",
  "seriesId",
  "removedUserId",
  "acceptedUserId",
  "targetUserId",
  "affectedUserId",
  // routing / wiring
  "href",
  "action",
  "tab",
  // type discriminators (the title already conveys this)
  "requestType",
  "type",
  "mode",
  // internal accounting
  "email_sent",
  // before/after blobs (we show them via curated rows instead)
  "before",
  "after",
  "fields",
  // already rendered via dedicated UI affordances
  "actionUrl",
  "actionLabel",
  // dispatch grouping bookkeeping
  "groupCount",
  "publishedBy",
]);

/** Friendly label per known metadata key. Anything not listed is humanized. */
const METADATA_FRIENDLY_LABELS: Record<string, string> = {
  requestedBy: "Requested by",
  reviewedBy: "Reviewed by",
  note: "Note",
  adminNote: "Admin note",
  fromRole: "Previous role",
  toRole: "New role",
  fromStatus: "Previous status",
  toStatus: "New status",
  startDate: "Start date",
  endDate: "End date",
  date: "Date",
  inviteeEmail: "Invitee email",
  planName: "Plan",
  amountCents: "Amount",
};

/**
 * Turn a camelCase or snake_case key into human-readable text:
 *   "requesterName" → "Requester name"
 *   "from_status"   → "From status"
 *   "Name"          → "Name"
 */
function humanizeKey(key: string): string {
  // If it already starts with an uppercase letter, assume it's already a label.
  if (/^[A-Z]/.test(key) && !/[A-Z]/.test(key.slice(1))) return key;

  const withSpaces = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return withSpaces.length > 0
    ? withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1)
    : key;
}

/** Format a metadata value for display. Returns null when the value is empty. */
function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => formatValue(entry))
      .filter((entry): entry is string => entry !== null);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  if (typeof value === "object") {
    // Don't surface raw JSON to users.
    return null;
  }
  return null;
}

export interface NotificationDetailEntry {
  label: string;
  value: string;
}

/**
 * Convert a notification's metadata into a curated, ordered list of
 * { label, value } pairs ready to render. Technical keys are stripped;
 * known keys get friendly labels; unknown keys are humanized.
 */
export function formatNotificationMetadata(
  metadata: Record<string, unknown> | null | undefined,
): NotificationDetailEntry[] {
  if (!metadata) return [];
  const entries: NotificationDetailEntry[] = [];
  for (const [key, raw] of Object.entries(metadata)) {
    if (TECHNICAL_METADATA_KEYS.has(key)) continue;
    const value = formatValue(raw);
    if (value === null) continue;
    const label = METADATA_FRIENDLY_LABELS[key] ?? humanizeKey(key);
    entries.push({ label, value });
  }
  return entries;
}

/**
 * Returns the actionUrl + actionLabel pair from metadata if both are
 * present non-empty strings. Used to render a "Review request" / "View"
 * call-to-action button on the notification detail surface.
 */
export function extractNotificationAction(
  metadata: Record<string, unknown> | null | undefined,
): { href: string; label: string } | null {
  if (!metadata) return null;
  const href = metadata.actionUrl;
  const label = metadata.actionLabel;
  if (typeof href !== "string" || href.trim().length === 0) return null;
  if (typeof label !== "string" || label.trim().length === 0) return null;
  return { href: href.trim(), label: label.trim() };
}
