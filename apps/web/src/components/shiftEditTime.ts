// ── Time helpers ────────────────────────────────────────────────────────────
// NOTE: These `parseTo12h`/`to24h`/`fmt12h` are intentionally NOT the shared
// `@/lib/utils` versions. The editor needs richer semantics: `parseTo12h` splits
// pipe-delimited multi-shift strings and returns a blank hour ("") to drive the
// empty dropdown state, and `to24h` validates its inputs and returns `null` on an
// invalid time. Folding these behaviors into the shared util would over-generalize
// it — keep this editor-local copy.
export function parseTo12h(time24: string | null | undefined): {
  hour: string;
  minute: string;
  period: "AM" | "PM";
} {
  if (!time24) return { hour: "", minute: "00", period: "AM" };
  // Handle pipe-delimited multi-shift times — use first segment
  const seg = time24.split("|")[0];
  if (!seg) return { hour: "", minute: "00", period: "AM" };
  const [h, m] = seg.split(":").map(Number);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { hour: String(hour12), minute: String(m).padStart(2, "0"), period };
}

export function to24h(hour: string, minute: string, period: "AM" | "PM"): string | null {
  const h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  if (isNaN(h) || isNaN(m) || h < 1 || h > 12 || m < 0 || m > 59) return null;
  const h24 = period === "AM" ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12;
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fmt12h(time24: string | null | undefined): string {
  if (!time24) return "";
  const { hour, minute, period } = parseTo12h(time24);
  return `${hour}:${minute} ${period}`;
}

/** Normalize a time string to HH:MM (DB TIME columns may include seconds). */
export function normalizeTime(t: string): string {
  return t.slice(0, 5);
}

/** True if start→end is a valid time range. Overnight shifts (end ≤ start) are valid for scheduling. */
export function isValidTimeOrder(start: string, end: string): boolean {
  const s = normalizeTime(start);
  const e = normalizeTime(end);
  // Only invalid if start and end are identical (zero-duration shift)
  return s !== e;
}

/** Subtract one hour from HH:MM string, clamped to 00:00. */
export function subtractOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = Math.max(0, h - 1);
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Add one hour to HH:MM string, clamped to 23:59. */
export function addOneHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = Math.min(23, h + 1);
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Puts a cell's shifts in start-time order, moving each `|`-separated custom
 * time with its shift, and equal starts keep their order. Only a general shift
 * can lack a start time, and it has no place on the clock, so then the order
 * the shifts were picked in stands. Returns the inputs untouched when the
 * order already holds.
 */
export function orderSegmentsByStartTime<T>(
  segments: T[],
  customStartTime: string | null,
  customEndTime: string | null,
  defaultStartTime: (segment: T) => string | null | undefined,
): { segments: T[]; customStartTime: string | null; customEndTime: string | null } {
  const parts = (time: string | null) =>
    segments.map((_, index) => (time ?? "").split("|")[index]?.trim() || null);
  const starts = parts(customStartTime);
  const ends = parts(customEndTime);
  const startOf = (index: number) => {
    const start = starts[index] ?? defaultStartTime(segments[index]);
    return start ? normalizeTime(start) : null;
  };

  const startTimes = segments.map((_, index) => startOf(index));
  if (!startTimes.every((start): start is string => start != null)) {
    return { segments, customStartTime, customEndTime };
  }

  const order = segments
    .map((_, index) => index)
    .sort((left, right) => startTimes[left].localeCompare(startTimes[right]));
  if (order.every((index, position) => index === position)) {
    return { segments, customStartTime, customEndTime };
  }

  const join = (times: (string | null)[]) =>
    times.every((time) => !time) ? null : times.map((time) => time ?? "").join("|");
  return {
    segments: order.map((index) => segments[index]),
    customStartTime: join(order.map((index) => starts[index])),
    customEndTime: join(order.map((index) => ends[index])),
  };
}

/**
 * Sets when the last of a cell's shifts actually ended ("Worked until", item
 * 45), leaving every other shift's `|`-separated times alone. The time editor
 * saves a start and end together, so the last shift's start fills from its
 * custom or default start.
 */
export function withLastShiftEnd(
  customStartTime: string | null,
  customEndTime: string | null,
  shiftCount: number,
  lastDefaultStart: string | null,
  workedUntil: string,
): { customStartTime: string | null; customEndTime: string | null } {
  const split = (time: string | null) =>
    Array.from({ length: shiftCount }, (_, index) => time?.split("|")[index] || null);
  const join = (times: Array<string | null>) =>
    times.every((time) => !time) ? null : times.map((time) => time ?? "").join("|");
  const starts = split(customStartTime);
  const ends = split(customEndTime);
  const last = shiftCount - 1;
  starts[last] = starts[last] ?? lastDefaultStart;
  ends[last] = workedUntil;
  return { customStartTime: join(starts), customEndTime: join(ends) };
}
