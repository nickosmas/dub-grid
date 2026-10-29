import { formatScheduleTimeValue } from "./dates";
import {
  formatShiftChangeHours,
  isNewShiftChange,
  type ShiftChange,
  type ShiftChangeItem,
  type ShiftChangeItemLabel,
  type ShiftChangeSide,
} from "./shift-change";

const LABEL_TEXT: Record<ShiftChangeItemLabel, string> = {
  shift1: "Shift 1",
  shift2: "Shift 2",
  absence: "Absence",
};

const NO_SHIFT = "No shift";

function statusSuffix(item: ShiftChangeItem, isNew: boolean): string {
  if (isNew) return "";
  if (item.status === "removed") return " (removed)";
  if (item.status === "added") return " (added)";
  return "";
}

function breakLine(item: ShiftChangeItem): string | null {
  if (!item.breakBefore) return null;
  const { minutes, start, end } = item.breakBefore;
  return `Break: ${formatShiftChangeHours(minutes)}, ${formatScheduleTimeValue(start)} - ${formatScheduleTimeValue(end)}`;
}

function sideLines(
  heading: "Before" | "After" | "New",
  side: ShiftChangeSide,
  multi: boolean,
): string[] {
  const isNew = heading === "New";
  if (!multi) {
    const [item] = side.items;
    return [`${heading}: ${item ? `${item.plain}${statusSuffix(item, isNew)}` : NO_SHIFT}`];
  }
  if (side.items.length === 0) return [`${heading}: ${NO_SHIFT}`];
  const total = side.totalMinutes != null ? ` (${formatShiftChangeHours(side.totalMinutes)})` : "";
  const lines = [`${heading}${total}:`];
  for (const item of side.items) {
    const gap = breakLine(item);
    if (gap) lines.push(gap);
    const label = item.label ? `${LABEL_TEXT[item.label]}: ` : "";
    lines.push(`${label}${item.plain}${statusSuffix(item, isNew)}`);
  }
  return lines;
}

/**
 * Before and After lines for email text parts and screen readers, or one New
 * side for a day that had nothing; empty when nothing changed.
 */
export function formatShiftChangePlain(change: ShiftChange): string[] {
  if (change.kind === "none") return [];
  const multi = change.kind === "multi";
  if (isNewShiftChange(change)) return sideLines("New", change.after, multi);
  return [...sideLines("Before", change.before, multi), ...sideLines("After", change.after, multi)];
}

function compactSide(side: ShiftChangeSide): string {
  return side.items.length === 0 ? NO_SHIFT : side.items.map((item) => item.plain).join(" + ");
}

/**
 * The compact Before and After apart, for a layout that draws the arrow itself;
 * `before` is null for a day that had nothing.
 */
export function formatShiftChangeCompactSides(
  change: ShiftChange,
): { before: string | null; after: string } | null {
  if (change.kind === "none") return null;
  if (isNewShiftChange(change)) return { before: null, after: compactSide(change.after) };
  return { before: compactSide(change.before), after: compactSide(change.after) };
}

/** One line with an arrow, for compact spaces such as push notifications. */
export function formatShiftChangeCompact(change: ShiftChange): string {
  const sides = formatShiftChangeCompactSides(change);
  if (!sides) return "";
  if (sides.before === null) return `New: ${sides.after}`;
  return `${sides.before} → ${sides.after}`;
}
