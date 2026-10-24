import { formatScheduleTimeValue } from "./dates";
import {
  formatHoursLabel,
  getMinutesSinceMidnight,
  getRangeDurationMinutes,
  subtractBreakMinutes,
  toHoursValue,
} from "./schedule-time";
import { alignSegmentsToBefore, unclaimedBeforeIndices } from "./segment-alignment";

export interface ShiftChangeShiftInput {
  kind: "shift";
  /** Pairing identity: `buildShiftJobPairKey(shiftId, jobId)`. */
  key: string;
  /** Null for a job worked without a shift. */
  shiftName: string | null;
  jobName: string;
  shiftArchived?: boolean;
  jobArchived?: boolean;
  focusAreaName: string | null;
  /** "HH:MM". An end at or before the start crosses midnight. */
  start: string | null;
  end: string | null;
  breakMinutes?: number | null;
}

export interface ShiftChangeAbsenceInput {
  kind: "absence";
  key: string;
  name: string;
  archived?: boolean;
  scope: "allDay" | "restOfDay";
}

export type ShiftChangeItemInput = ShiftChangeShiftInput | ShiftChangeAbsenceInput;

/** One side of a cell's day. No items means no shift. */
export interface ShiftChangeDayInput {
  items: ShiftChangeItemInput[];
}

export interface ShiftChangeTextPart {
  text: string;
  changed?: boolean;
}

export type ShiftChangeItemLabel = "shift1" | "shift2" | "absence";
export type ShiftChangeItemStatus = "same" | "changed" | "added" | "removed";

export interface ShiftChangeBreak {
  minutes: number;
  start: string;
  end: string;
}

export interface ShiftChangeItem {
  kind: "shift" | "absence";
  label: ShiftChangeItemLabel | null;
  status: ShiftChangeItemStatus;
  /** "Day Shift · Registered Nurse", or "Sick (rest of day)". */
  title: ShiftChangeTextPart[];
  /** "7:00 AM - 3:00 PM (8 hrs) · Skilled Nursing"; empty for an absence. */
  detail: ShiftChangeTextPart[];
  plain: string;
  /** Worked minutes after the break; null for an absence or unknown times. */
  minutes: number | null;
  breakBefore: ShiftChangeBreak | null;
  /** Position on the shared day-bar scale, in minutes from its start. */
  bar: { from: number; to: number } | null;
}

export interface ShiftChangeSide {
  /** Time order. Empty means "No shift". */
  items: ShiftChangeItem[];
  /** Total worked minutes; only on days with more than one item. */
  totalMinutes: number | null;
}

export interface ShiftChange {
  kind: "none" | "single" | "multi";
  date: string;
  before: ShiftChangeSide;
  after: ShiftChangeSide;
  barScale: { start: string; end: string; minutes: number } | null;
}

/**
 * A day that had nothing before. It reads as what is new, never as Before and
 * After, since there is nothing it changed from.
 */
export function isNewShiftChange(change: ShiftChange): boolean {
  return change.kind !== "none" && change.before.items.length === 0;
}

/** Which fields of one item differ from its partner on the other side. */
export interface ShiftChangeMarks {
  all?: boolean;
  shift?: boolean;
  job?: boolean;
  start?: boolean;
  end?: boolean;
  hours?: boolean;
  focusArea?: boolean;
  absence?: boolean;
  scope?: boolean;
}

export type DescribedShiftChangeItem = Pick<
  ShiftChangeItem,
  "kind" | "title" | "detail" | "plain" | "minutes"
>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const SEPARATOR = " · ";

function weekdayOf(date: string, offsetDays: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return WEEKDAYS[utc.getUTCDay()];
}

function withArchived(name: string, archived: boolean | undefined): string {
  return archived ? `${name} (archived)` : name;
}

/** A separator is marked only when the parts on both sides of it are. */
function markSeparators(
  parts: ShiftChangeTextPart[],
  separators: Set<number>,
): ShiftChangeTextPart[] {
  return parts.map((part, index) => {
    if (!separators.has(index)) return part;
    const changed = Boolean(parts[index - 1]?.changed && parts[index + 1]?.changed);
    return changed ? { text: part.text, changed } : { text: part.text };
  });
}

function part(text: string, changed: boolean | undefined): ShiftChangeTextPart {
  return changed ? { text, changed: true } : { text };
}

function joinText(parts: ShiftChangeTextPart[]): string {
  return parts.map((p) => p.text).join("");
}

export function shiftChangeItemMinutes(item: ShiftChangeItemInput): number | null {
  if (item.kind !== "shift" || !item.start || !item.end) return null;
  const range = getRangeDurationMinutes(item.start, item.end);
  if (range <= 0) return null;
  return subtractBreakMinutes(range, item.breakMinutes);
}

export function formatShiftChangeHours(minutes: number): string {
  const hours = toHoursValue(minutes);
  return `${formatHoursLabel(hours)} ${hours === 1 ? "hr" : "hrs"}`;
}

function describeShift(
  item: ShiftChangeShiftInput,
  date: string,
  marks: ShiftChangeMarks,
): DescribedShiftChangeItem {
  const all = marks.all;
  const titleParts: ShiftChangeTextPart[] = [];
  const titleSeparators = new Set<number>();
  if (item.shiftName) {
    titleParts.push(part(withArchived(item.shiftName, item.shiftArchived), all || marks.shift));
    titleSeparators.add(titleParts.length);
    titleParts.push({ text: SEPARATOR });
  }
  titleParts.push(part(withArchived(item.jobName, item.jobArchived), all || marks.job));

  const minutes = shiftChangeItemMinutes(item);
  const detailParts: ShiftChangeTextPart[] = [];
  const detailSeparators = new Set<number>();
  if (item.start && item.end) {
    const startMinutes = getMinutesSinceMidnight(item.start);
    const endMinutes = getMinutesSinceMidnight(item.end);
    const overnight = startMinutes != null && endMinutes != null && endMinutes <= startMinutes;
    const startText = formatScheduleTimeValue(item.start);
    const endText = formatScheduleTimeValue(item.end);
    detailParts.push(
      part(overnight ? `${weekdayOf(date, 0)} ${startText}` : startText, all || marks.start),
    );
    detailSeparators.add(detailParts.length);
    detailParts.push({ text: " - " });
    detailParts.push(
      part(overnight ? `${weekdayOf(date, 1)} ${endText}` : endText, all || marks.end),
    );
    if (minutes != null) {
      detailSeparators.add(detailParts.length);
      detailParts.push({ text: " " });
      detailParts.push(part(`(${formatShiftChangeHours(minutes)})`, all || marks.hours));
    }
  }
  if (item.focusAreaName) {
    if (detailParts.length > 0) {
      detailSeparators.add(detailParts.length);
      detailParts.push({ text: SEPARATOR });
    }
    detailParts.push(part(item.focusAreaName, all || marks.focusArea));
  }

  const title = markSeparators(titleParts, titleSeparators);
  const detail = markSeparators(detailParts, detailSeparators);
  const plain =
    detail.length > 0 ? `${joinText(title)}${SEPARATOR}${joinText(detail)}` : joinText(title);
  return { kind: "shift", title, detail, plain, minutes };
}

function describeAbsence(
  item: ShiftChangeAbsenceInput,
  marks: ShiftChangeMarks,
): DescribedShiftChangeItem {
  const scopeText = item.scope === "restOfDay" ? "(rest of day)" : "(all day)";
  const title = markSeparators(
    [
      part(withArchived(item.name, item.archived), marks.all || marks.absence),
      { text: " " },
      part(scopeText, marks.all || marks.scope),
    ],
    new Set([1]),
  );
  return { kind: "absence", title, detail: [], plain: joinText(title), minutes: null };
}

/** Formats one shift or absence; `date` ("YYYY-MM-DD") names the weekdays of an overnight shift. */
export function describeShiftChangeItem(
  item: ShiftChangeItemInput,
  options: { date: string; marks?: ShiftChangeMarks },
): DescribedShiftChangeItem {
  const marks = options.marks ?? {};
  return item.kind === "shift"
    ? describeShift(item, options.date, marks)
    : describeAbsence(item, marks);
}

const MINUTES_PER_DAY = 24 * 60;

function sameShiftChangeItem(a: ShiftChangeItemInput, b: ShiftChangeItemInput): boolean {
  return Object.keys(shiftChangeMarks(a, b)).length === 0;
}

/** The visible differences between two items; empty when they read the same. */
export function shiftChangeMarks(
  a: ShiftChangeItemInput,
  b: ShiftChangeItemInput,
): ShiftChangeMarks {
  if (a.kind !== b.kind) return { all: true };
  const marks: ShiftChangeMarks = {};
  if (a.kind === "absence" && b.kind === "absence") {
    if (a.name !== b.name || Boolean(a.archived) !== Boolean(b.archived)) marks.absence = true;
    if (a.scope !== b.scope) marks.scope = true;
    return marks;
  }
  if (a.kind !== "shift" || b.kind !== "shift") return marks;
  if (a.shiftName !== b.shiftName || Boolean(a.shiftArchived) !== Boolean(b.shiftArchived)) {
    marks.shift = true;
  }
  if (a.jobName !== b.jobName || Boolean(a.jobArchived) !== Boolean(b.jobArchived))
    marks.job = true;
  if (a.start !== b.start) marks.start = true;
  if (a.end !== b.end) marks.end = true;
  if (shiftChangeItemMinutes(a) !== shiftChangeItemMinutes(b)) marks.hours = true;
  if (a.focusAreaName !== b.focusAreaName) marks.focusArea = true;
  return marks;
}

function startMinutesOf(item: ShiftChangeItemInput): number | null {
  return item.kind === "shift" && item.start ? getMinutesSinceMidnight(item.start) : null;
}

/** Shifts by start time (unknown times keep their order, after timed ones), then the absence. */
function inTimeOrder(items: ShiftChangeItemInput[]): ShiftChangeItemInput[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const kindOrder =
        Number(left.item.kind === "absence") - Number(right.item.kind === "absence");
      if (kindOrder !== 0) return kindOrder;
      const leftStart = startMinutesOf(left.item) ?? Number.POSITIVE_INFINITY;
      const rightStart = startMinutesOf(right.item) ?? Number.POSITIVE_INFINITY;
      if (leftStart !== rightStart) return leftStart - rightStart;
      return left.index - right.index;
    })
    .map(({ item }) => item);
}

interface PairedItem {
  input: ShiftChangeItemInput;
  status: ShiftChangeItemStatus;
  marks: ShiftChangeMarks;
}

function sameDay(before: ShiftChangeItemInput[], after: ShiftChangeItemInput[]): boolean {
  return (
    before.length === after.length &&
    before.every((item, index) => sameShiftChangeItem(item, after[index]))
  );
}

function pairSingle(before: ShiftChangeItemInput[], after: ShiftChangeItemInput[]) {
  const [b] = before;
  const [a] = after;
  if (b && a) {
    const marks = shiftChangeMarks(b, a);
    return {
      before: [{ input: b, status: "changed" as const, marks }],
      after: [{ input: a, status: "changed" as const, marks }],
    };
  }
  return {
    before: b ? [{ input: b, status: "removed" as const, marks: {} }] : [],
    after: a ? [{ input: a, status: "added" as const, marks: {} }] : [],
  };
}

function pairDay(before: ShiftChangeItemInput[], after: ShiftChangeItemInput[]) {
  const beforeShifts = before.filter((item) => item.kind === "shift");
  const afterShifts = after.filter((item) => item.kind === "shift");
  const alignment = alignSegmentsToBefore(beforeShifts, afterShifts, (item) => item.key);
  const pairs: Array<[ShiftChangeItemInput | null, ShiftChangeItemInput | null]> = alignment.map(
    (beforeIndex, afterIndex) => [
      beforeIndex == null ? null : beforeShifts[beforeIndex],
      afterShifts[afterIndex],
    ],
  );
  for (const beforeIndex of unclaimedBeforeIndices(alignment, beforeShifts.length)) {
    pairs.push([beforeShifts[beforeIndex], null]);
  }
  const beforeAbsence = before.find((item) => item.kind === "absence") ?? null;
  const afterAbsence = after.find((item) => item.kind === "absence") ?? null;
  if (beforeAbsence || afterAbsence) pairs.push([beforeAbsence, afterAbsence]);

  const pairedBefore = new Map<ShiftChangeItemInput, PairedItem>();
  const pairedAfter = new Map<ShiftChangeItemInput, PairedItem>();
  for (const [b, a] of pairs) {
    if (b && a) {
      const marks = shiftChangeMarks(b, a);
      const status = Object.keys(marks).length === 0 ? "same" : "changed";
      pairedBefore.set(b, { input: b, status, marks });
      pairedAfter.set(a, { input: a, status, marks });
    } else if (b) {
      pairedBefore.set(b, { input: b, status: "removed", marks: {} });
    } else if (a) {
      pairedAfter.set(a, { input: a, status: "added", marks: {} });
    }
  }
  return {
    before: before.map((item) => pairedBefore.get(item) as PairedItem),
    after: after.map((item) => pairedAfter.get(item) as PairedItem),
  };
}

interface Interval {
  from: number;
  to: number;
}

/** Each timed shift's interval in minutes from the day's midnight, with overnight ends past 24:00. */
function shiftIntervals(items: ShiftChangeItemInput[]): Array<Interval | null> {
  let previousStart: number | null = null;
  return items.map((item) => {
    if (item.kind !== "shift" || !item.start || !item.end) return null;
    let from = getMinutesSinceMidnight(item.start);
    const endMinutes = getMinutesSinceMidnight(item.end);
    if (from == null || endMinutes == null) return null;
    if (previousStart != null && from < previousStart) from += MINUTES_PER_DAY;
    previousStart = from;
    const length = getRangeDurationMinutes(item.start, item.end);
    return { from, to: from + length };
  });
}

function clockText(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/** A break sits before a shift whose start is later than the previous shift's end. */
function breaksFor(
  items: ShiftChangeItemInput[],
  intervals: Array<Interval | null>,
): Array<ShiftChangeBreak | null> {
  let previous: Interval | null = null;
  return items.map((item, index) => {
    const interval = intervals[index];
    if (item.kind !== "shift") return null;
    const gap: ShiftChangeBreak | null =
      previous && interval && interval.from > previous.to
        ? {
            minutes: interval.from - previous.to,
            start: clockText(previous.to),
            end: clockText(interval.from),
          }
        : null;
    if (interval) previous = interval;
    else previous = null;
    return gap;
  });
}

function labelsFor(items: ShiftChangeItemInput[]): Array<ShiftChangeItemLabel | null> {
  let shiftNumber = 0;
  return items.map((item) => {
    if (item.kind === "absence") return "absence";
    shiftNumber += 1;
    return shiftNumber === 1 ? "shift1" : shiftNumber === 2 ? "shift2" : null;
  });
}

function buildSide(
  paired: PairedItem[],
  date: string,
  multi: boolean,
  breaks: Array<ShiftChangeBreak | null>,
): ShiftChangeSide {
  const labels = multi ? labelsFor(paired.map((p) => p.input)) : paired.map(() => null);
  const items = paired.map(({ input, status, marks }, index) => ({
    ...describeShiftChangeItem(input, { date, marks }),
    label: labels[index],
    status,
    breakBefore: breaks[index],
    bar: null,
  }));
  const timed = items.filter((item) => item.minutes != null);
  const totalMinutes =
    multi && timed.length > 0
      ? timed.reduce((total, item) => total + (item.minutes ?? 0), 0)
      : null;
  return { items, totalMinutes };
}

/** Lays both sides on one scale: the earliest start to the latest end, past midnight when needed. */
function applyBar(
  sides: Array<{ side: ShiftChangeSide; intervals: Array<Interval | null> }>,
): ShiftChange["barScale"] {
  const all = sides.flatMap(({ intervals }) => intervals.filter((i): i is Interval => i != null));
  if (all.length === 0) return null;
  const scaleStart = Math.min(...all.map((i) => i.from));
  let scaleEnd = Math.max(...all.map((i) => i.to));

  const absenceFrom = (intervals: Array<Interval | null>): number | null => {
    const last = intervals.filter((i): i is Interval => i != null).at(-1);
    return last ? last.to : null;
  };
  for (const { side, intervals } of sides) {
    const from = absenceFrom(intervals);
    const hasRestOfDay = side.items.some((item) => item.kind === "absence");
    if (hasRestOfDay && from != null && from >= scaleEnd) {
      scaleEnd = (Math.floor(from / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY;
    }
  }
  for (const { side, intervals } of sides) {
    side.items.forEach((item, index) => {
      const interval = intervals[index];
      if (interval) {
        item.bar = { from: interval.from - scaleStart, to: interval.to - scaleStart };
      } else if (item.kind === "absence") {
        const from = absenceFrom(intervals);
        if (from != null) item.bar = { from: from - scaleStart, to: scaleEnd - scaleStart };
      }
    });
  }
  return { start: clockText(scaleStart), end: clockText(scaleEnd), minutes: scaleEnd - scaleStart };
}

/**
 * Compares two versions of one cell's day. `none` when they read the same,
 * `single` when neither side has more than one item, `multi` otherwise.
 */
export function describeShiftChange(
  beforeDay: ShiftChangeDayInput,
  afterDay: ShiftChangeDayInput,
  options: { date: string },
): ShiftChange {
  const before = inTimeOrder(beforeDay.items);
  const after = inTimeOrder(afterDay.items);
  const { date } = options;
  if (sameDay(before, after)) {
    return {
      kind: "none",
      date,
      before: buildSide(
        before.map((input) => ({ input, status: "same", marks: {} })),
        date,
        false,
        [],
      ),
      after: buildSide(
        after.map((input) => ({ input, status: "same", marks: {} })),
        date,
        false,
        [],
      ),
      barScale: null,
    };
  }
  const multi = before.length > 1 || after.length > 1;
  const paired = multi ? pairDay(before, after) : pairSingle(before, after);
  const beforeIntervals = shiftIntervals(before);
  const afterIntervals = shiftIntervals(after);
  const beforeSide = buildSide(paired.before, date, multi, breaksFor(before, beforeIntervals));
  const afterSide = buildSide(paired.after, date, multi, breaksFor(after, afterIntervals));
  const barScale = multi
    ? applyBar([
        { side: beforeSide, intervals: beforeIntervals },
        { side: afterSide, intervals: afterIntervals },
      ])
    : null;
  return { kind: multi ? "multi" : "single", date, before: beforeSide, after: afterSide, barScale };
}
