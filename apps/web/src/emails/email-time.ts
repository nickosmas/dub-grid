/**
 * A zone `Intl` accepts. Emails render on a server whose own zone is UTC, so
 * every date in one must name the organization's zone explicitly; an empty or
 * unknown value falls back to UTC rather than throwing mid-render.
 */
export function resolveEmailTimeZone(timeZone: string | null | undefined): string {
  const candidate = timeZone?.trim();
  if (!candidate) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

/** "September 24, 2026 at 2:42 PM PDT": a moment, with the zone it is read in. */
export function formatEmailDateTime(iso: string, timeZone: string | null | undefined): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    timeZone: resolveEmailTimeZone(timeZone),
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** "September 24, 2026": the calendar day the moment falls on in that zone. */
export function formatEmailDate(iso: string, timeZone: string | null | undefined): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    timeZone: resolveEmailTimeZone(timeZone),
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
