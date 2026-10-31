// Formats an ISO "YYYY-MM-DD" date key using US conventions (short month
// name first, e.g. "May 12") — never the raw ISO/YYYY-MM-DD string, which
// reads as day-first to US users.
export function formatUsDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

// Formats an "HH:mm:ss" or "HH:mm" 24h time string as US 12-hour clock time,
// e.g. "07:00:00" -> "7:00 AM".
export function formatUsTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return time;
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}
