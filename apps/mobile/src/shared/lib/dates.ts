import { formatLocalDateKey, getDashboardPeriodStartIso } from "@dubgrid/schedule-core";

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

export type DashboardPeriodMode = "day" | "week" | "2weeks";

// @dubgrid/schedule-core's canonical local Y-M-D formatter — deliberately
// not toISOString(), which converts to UTC and can shift the calendar day on
// a device whose local timezone isn't UTC (e.g. evening hours in US
// timezones rolling into the next UTC day). The server-side mobile pipeline
// had a local copy of this exact function that DID route through
// toISOString() and silently dropped a day's worth of coverage requirements
// on any server ahead of UTC — this alias keeps the client on the one
// correct implementation instead of a second hand-rolled copy.
const formatIsoDateKey = formatLocalDateKey;

// "day" = today only; "week" = Sunday-start current week; "2weeks" = the
// org's actual 14-day pay period containing today when `payPeriodStartDate`
// is configured (via @dubgrid/schedule-core's getDashboardPeriodStartIso —
// the same anchor math web's schedule-view.ts uses), otherwise a plain
// Sunday-start 2-week window. Passing no anchor matches web's dashboard
// default (apps/web/src/lib/dashboard-stats.ts getWeekStart) and the
// server-side default in apps/web/src/features/mobile/server/routes/dashboard.ts.
export function getDashboardPeriodRange(
  mode: DashboardPeriodMode,
  reference = new Date(),
  payPeriodStartDate?: string | null,
): { startDate: string; endDate: string } {
  const today = new Date(reference);
  today.setHours(0, 0, 0, 0);
  const todayKey = formatIsoDateKey(today);

  if (mode === "day") {
    return { startDate: todayKey, endDate: todayKey };
  }

  const startKey = getDashboardPeriodStartIso(
    todayKey,
    mode === "2weeks" ? 2 : 1,
    payPeriodStartDate,
  );
  const start = new Date(`${startKey}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + (mode === "2weeks" ? 13 : 6));
  return { startDate: startKey, endDate: formatIsoDateKey(end) };
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Human-readable label for the active period, e.g. "Fri, Jul 10, 2026" (day),
// "Jul 5–11, 2026" (week), or "Jul 26 – Aug 8, 2026" (span crossing months) —
// matches web's DashboardHeader.tsx formatDateRange.
export function formatDashboardDateRange(
  startDate: string,
  endDate: string,
  mode: DashboardPeriodMode,
): string {
  const start = new Date(`${startDate}T00:00:00`);
  const year = start.getFullYear();
  const sMonth = MONTH_NAMES[start.getMonth()];
  const sDay = start.getDate();

  if (mode === "day") {
    return `${DAY_NAMES[start.getDay()]}, ${sMonth} ${sDay}, ${year}`;
  }

  const end = new Date(`${endDate}T00:00:00`);
  const eYear = end.getFullYear();
  const eMonth = MONTH_NAMES[end.getMonth()];
  const eDay = end.getDate();

  if (sMonth === eMonth && year === eYear) {
    return `${sMonth} ${sDay}–${eDay}, ${year}`;
  }
  if (year === eYear) {
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${year}`;
  }
  return `${sMonth} ${sDay}, ${year} – ${eMonth} ${eDay}, ${eYear}`;
}
