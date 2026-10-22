import { formatScheduleTimeValue } from "./dates";
import {
  formatShiftChangeHours,
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

function statusSuffix(item: ShiftChangeItem): string {
  if (item.status === "removed") return " (removed)";
  if (item.status === "added") return " (added)";
  return "";
}

function breakLine(item: ShiftChangeItem): string | null {
  if (!item.breakBefore) return null;
  const { minutes, start, end } = item.breakBefore;
  return `Break: ${formatShiftChangeHours(minutes)}, ${formatScheduleTimeValue(start)} - ${formatScheduleTimeValue(end)}`;
}

function sideLines(heading: "Before" | "After", side: ShiftChangeSide, multi: boolean): string[] {
  if (!multi) {
    const [item] = side.items;
    return [`${heading}: ${item ? `${item.plain}${statusSuffix(item)}` : NO_SHIFT}`];
  }
  if (side.items.length === 0) return [`${heading}: ${NO_SHIFT}`];
  const total = side.totalMinutes != null ? ` (${formatShiftChangeHours(side.totalMinutes)})` : "";
  const lines = [`${heading}${total}:`];
  for (const item of side.items) {
    const gap = breakLine(item);
    if (gap) lines.push(gap);
    const label = item.label ? `${LABEL_TEXT[item.label]}: ` : "";
    lines.push(`${label}${item.plain}${statusSuffix(item)}`);
  }
  return lines;
}

/** Before and After lines for email text parts and screen readers; empty when nothing changed. */
export function formatShiftChangePlain(change: ShiftChange): string[] {
  if (change.kind === "none") return [];
  const multi = change.kind === "multi";
  return [...sideLines("Before", change.before, multi), ...sideLines("After", change.after, multi)];
}

function compactSide(side: ShiftChangeSide): string {
  return side.items.length === 0 ? NO_SHIFT : side.items.map((item) => item.plain).join(" + ");
}

/** One line with an arrow, for compact spaces such as push notifications. */
export function formatShiftChangeCompact(change: ShiftChange): string {
  if (change.kind === "none") return "";
  return `${compactSide(change.before)} → ${compactSide(change.after)}`;
}
