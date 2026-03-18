/** Shallow equality check for sorted number arrays (avoids JSON.stringify). */
export function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatDateKey(date: Date): string {
  // Use local components to avoid timezone shift in ISO string
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Time utilities (24-hour ↔ 12-hour) ───────────────────────────────────────

/** Parse a "HH:MM" 24-hour string into 12-hour components. */
export function parseTo12h(time24: string | null | undefined): { hour: string; minute: string; period: "AM" | "PM" } {
  if (!time24) return { hour: "", minute: "00", period: "AM" };
  const [h, m] = time24.split(":").map(Number);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { hour: String(hour12), minute: String(m).padStart(2, "0"), period };
}

/** Convert 12-hour components to a "HH:MM" string. Returns null if invalid. */
export function to24h(hour: string, minute: string, period: "AM" | "PM"): string | null {
  const h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  if (isNaN(h) || isNaN(m) || h < 1 || h > 12 || m < 0 || m > 59) return null;
  const h24 = period === "AM" ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12;
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Format a "HH:MM" 24-hour string as "7:00 AM" / "3:30 PM". Returns "—" for null/empty. */
export function fmt12h(time24: string | null | undefined): string {
  if (!time24) return "—";
  const { hour, minute, period } = parseTo12h(time24);
  return `${hour}:${minute} ${period}`;
}

// ── ID → display resolution helpers ─────────────────────────────────────────

import type { NamedItem } from "@/types";

export function getCertName(id: number | null, certs: NamedItem[]): string {
  if (id == null) return "";
  return certs.find((c) => c.id === id)?.name ?? "";
}

export function getCertAbbr(id: number | null, certs: NamedItem[]): string {
  if (id == null) return "";
  return certs.find((c) => c.id === id)?.abbr ?? "";
}

export function getRoleAbbrs(ids: number[], roles: NamedItem[]): string[] {
  const map = new Map(roles.map((r) => [r.id, r.abbr]));
  return ids.map((id) => map.get(id)).filter((a): a is string => !!a);
}

export function getInitials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    const letters = parts[0].replace(/[^a-zA-Z]/g, "");
    return letters.slice(0, 2).toUpperCase();
  }
  const firstLetter = parts[0].replace(/[^a-zA-Z]/g, "")[0] ?? "";
  const lastLetter = parts[parts.length - 1].replace(/[^a-zA-Z]/g, "")[0] ?? "";
  return (firstLetter + lastLetter).toUpperCase();
}

/** Format a timestamp as a relative string: "just now", "5 min ago", "2 hr ago", "3 days ago", or "Mar 15". */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  if (days < 7) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
