import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { NamedItem } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

export function getEmployeeDisplayName(emp: { firstName: string, lastName: string }): string {
  return `${emp.firstName} ${emp.lastName}`.trim();
}

export function getCertAbbr(certId?: number | string | null, certifications?: NamedItem[]): string {
  if (certId == null || !certifications) return "";
  const cert = certifications.find(c => c.id === Number(certId));
  return cert ? (cert.abbr || cert.name) : "";
}

export function getRoleAbbrs(roleIds: (number | string)[], roles?: NamedItem[]): string[] {
  if (!roles || !roleIds?.length) return [];
  return roleIds.map(id => {
    const role = roles.find(r => r.id === Number(id));
    return role ? (role.abbr || role.name) : "";
  }).filter(Boolean);
}

export function getCertName(certId?: number | string | null, certifications?: NamedItem[]): string {
  if (certId == null || !certifications) return "";
  const cert = certifications.find(c => c.id === Number(certId));
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

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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
      dateKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
      dayOfWeek: d.getUTCDay(),
      dayIndex: i++,
    };
  }
}

export function parseTo12h(time24: string | null | undefined): { hour: string, minute: string, period: "AM" | "PM" } {
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
  return `${String(h).padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

export function fmt12h(time24: string | null | undefined): string {
  if (!time24) return "";
  const p = parseTo12h(time24);
  return `${p.hour}:${p.minute} ${p.period}`;
}

/** Calculate duration between two 24h time strings. Handles overnight spans. */
export function calcTimeDuration(start: string | null | undefined, end: string | null | undefined): string | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60; // overnight
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Calculate net duration after break deduction, resolving via category → focus area hierarchy. */
export function calcNetDuration(
  start: string | null | undefined,
  end: string | null | undefined,
  breakMinutes: number | null | undefined,
  focusAreaId: number | null | undefined,
  focusAreas: Array<{ id: number; breakMinutes?: number | null }>,
): string | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  const effectiveBreak = breakMinutes ?? (focusAreaId != null
    ? focusAreas.find((fa) => fa.id === focusAreaId)?.breakMinutes ?? 0
    : 0);
  diff = Math.max(0, diff - effectiveBreak);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Resolve effective break minutes for display. Returns the break in minutes or 0. */
export function resolveEffectiveBreak(
  breakMinutes: number | null | undefined,
  focusAreaId: number | null | undefined,
  focusAreas: Array<{ id: number; breakMinutes?: number | null }>,
): number {
  if (breakMinutes != null) return breakMinutes;
  if (focusAreaId != null) {
    return focusAreas.find((fa) => fa.id === focusAreaId)?.breakMinutes ?? 0;
  }
  return 0;
}

export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const diff = Math.max(0, Date.now() - d.getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
