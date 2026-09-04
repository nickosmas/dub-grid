import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { NamedItem, type DirectoryPerson } from "@/types";
import { resolveAvatarSeed } from "@dubgrid/design-tokens";
import { formatLocalDateKey } from "@dubgrid/schedule-core";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name?: string): string {
  if (!name) return "";
  const lettersOnly = name.replace(/[^a-zA-Z\s]/g, "");
  const words = lettersOnly.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function getAvatarInitials(name?: string | null, fallback = "?"): string {
  const parts = name?.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu)?.filter(Boolean) ?? [];

  if (parts.length === 0) {
    return fallback;
  }

  const first = parts[0]?.charAt(0).toUpperCase() ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0).toUpperCase() ?? "") : "";

  return `${first}${last}` || fallback;
}

/**
 * Avatar seed for a directory row. `personId` is a prefixed composite
 * ("u:<uuid>", "inv:<uuid>") and would hash to a different color than the raw
 * ids presence and the header use, so it is only the last resort.
 */
export function getDirectoryPersonAvatarSeed(person: DirectoryPerson): string {
  return resolveAvatarSeed({
    userId: person.userId,
    id: person.employeeId ?? person.personId,
  });
}

export function getEmployeeDisplayName(emp: { firstName: string; lastName: string }): string {
  return `${emp.firstName} ${emp.lastName}`.trim();
}

export function getCompactNamedItemLabel(item: Pick<NamedItem, "name" | "abbr">): string {
  const name = item.name.trim();
  const abbr = item.abbr.trim();
  if (abbr && abbr !== name && abbr.length <= 6) return abbr;
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length === 1) {
    const word = words[0] ?? "";
    return word.length <= 6 ? word : word.slice(0, 3).toUpperCase();
  }
  if (words.length > 1) {
    const levelWords = words.filter((word) => /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(word));
    const initials = words
      .filter((word) => !levelWords.includes(word))
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();
    const levelSuffix = levelWords.map((word) => word.toUpperCase()).join(" ");
    return levelSuffix ? `${initials} ${levelSuffix}`.trim() : initials;
  }
  return getInitials(name) || name.slice(0, 2).toUpperCase();
}

export function getCertAbbr(
  certId?: number | string | null,
  certifications?: NamedItem[],
  useCompactLabels = true,
): string {
  if (certId == null || !certifications) return "";
  const cert = certifications.find((c) => c.id === Number(certId));
  return cert ? (useCompactLabels ? getCompactNamedItemLabel(cert) : cert.name) : "";
}

export function getRoleAbbrs(
  roleIds: (number | string)[],
  roles?: NamedItem[],
  useCompactLabels = true,
): string[] {
  if (!roles || !roleIds?.length) return [];
  return roleIds
    .map((id) => {
      const role = roles.find((r) => r.id === Number(id));
      return role ? (useCompactLabels ? getCompactNamedItemLabel(role) : role.name) : "";
    })
    .filter(Boolean);
}

export function getCertName(certId?: number | string | null, certifications?: NamedItem[]): string {
  if (certId == null || !certifications) return "";
  const cert = certifications.find((c) => c.id === Number(certId));
  return cert ? cert.name : "";
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Add days based on pure calendrical local time math (using Date.setDate)
  d.setDate(d.getDate() + days);
  return d;
}

export function formatDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// Delegates to @dubgrid/schedule-core's canonical local-date-key formatter —
// the same function mobile's coverage/schedule pipeline now uses, so a
// "YYYY-MM-DD" key means the exact same calendar day on both platforms
// regardless of server timezone.
export const formatDateKey = formatLocalDateKey;

/**
 * Yields `{ dateKey, dayOfWeek, dayIndex }` for each calendar day in [start, end] inclusive.
 * Uses UTC arithmetic internally so DST transitions cannot skip or duplicate a day.
 */
export function* iterateDateRange(
  start: Date,
  end: Date,
): Generator<{ dateKey: string; dayOfWeek: number; dayIndex: number }> {
  const s = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const e = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const MS_PER_DAY = 86_400_000;
  let i = 0;
  for (let ts = s; ts <= e; ts += MS_PER_DAY) {
    const d = new Date(ts);
    yield {
      dateKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
      dayOfWeek: d.getUTCDay(),
      dayIndex: i++,
    };
  }
}

export function parseTo12h(time24: string | null | undefined): {
  hour: string;
  minute: string;
  period: "AM" | "PM";
} {
  if (!time24) return { hour: "12", minute: "00", period: "AM" };
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10) || 0;
  const ampm = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { hour: String(h), minute: mStr || "00", period: ampm };
}

export function to24h(hour: string, minute: string, period: "AM" | "PM"): string {
  let h = parseInt(hour, 10) || 0;
  if (period === "PM" && h < 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

export function fmt12h(time24: string | null | undefined): string {
  if (!time24) return "";
  const p = parseTo12h(time24);
  return `${p.hour}:${p.minute} ${p.period}`;
}

/**
 * Compact 12-hour label used inside dense grid/print cells: drops the AM/PM
 * suffix and the ":00" on whole hours (e.g. "9", "9:30", "13:00" -> "1").
 */
export function fmt12hShort(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? String(h12) : `${h12}:${String(m).padStart(2, "0")}`;
}

/** Calculate duration between two 24h time strings. Handles overnight spans. */
export function calcTimeDuration(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60; // overnight
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Calculate net duration after break deduction. */
export function calcNetDuration(
  start: string | null | undefined,
  end: string | null | undefined,
  breakMinutes: number | null | undefined,
): string | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  diff = Math.max(0, diff - (breakMinutes ?? 0));
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Resolve effective break minutes for display. Returns the break in minutes or 0. */
export function resolveEffectiveBreak(breakMinutes: number | null | undefined): number {
  return breakMinutes ?? 0;
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${formatRelativeTimeClock(d)}`;
  }

  const sixDaysAgo = new Date(now);
  sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
  if (d >= sixDaysAgo) {
    return `${d.toLocaleDateString(undefined, { weekday: "long" })} at ${formatRelativeTimeClock(d)}`;
  }

  // The year is always named. Anything reaching this branch is over a week
  // old, which is exactly where "May 4" stops being enough to place an event.
  const absolute = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${absolute} at ${formatRelativeTimeClock(d)}`;
}

function formatRelativeTimeClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
