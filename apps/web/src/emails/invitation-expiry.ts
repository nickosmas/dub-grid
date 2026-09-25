/**
 * An invitation's absolute deadline, written out with its zone so a reader
 * anywhere can tell exactly when the link stops working.
 *
 * `timeZone` is the organization's configured zone. An empty or unknown value
 * falls back to UTC, because `Intl` throws on an invalid zone and an email must
 * still render. A missing or unreadable date returns null, and the caller
 * describes the 72 hours without a date.
 */
export function formatInvitationExpiry(
  expiresAt: string | null | undefined,
  timeZone: string | null | undefined,
): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return format(date, timeZone?.trim() || "UTC");
  } catch {
    return format(date, "UTC");
  }
}

function format(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "long",
  }).format(date);
}
