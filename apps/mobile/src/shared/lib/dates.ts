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

export type DashboardPeriodMode = "week" | "2weeks";

// Local Y-M-D formatting — deliberately not toISOString(), which converts to
// UTC and can shift the calendar day on a device whose local timezone isn't
// UTC (e.g. evening hours in US timezones rolling into the next UTC day).
function formatIsoDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Sunday-start current week (1 or 2 weeks), matching web's dashboard default
// (apps/web/src/lib/dashboard-stats.ts getWeekStart) and the server-side
// default in apps/web/src/features/mobile/server/routes/dashboard.ts.
export function getDashboardPeriodRange(
  mode: DashboardPeriodMode,
  reference = new Date(),
): { startDate: string; endDate: string } {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + (mode === "2weeks" ? 13 : 6));
  return { startDate: formatIsoDateKey(start), endDate: formatIsoDateKey(end) };
}
