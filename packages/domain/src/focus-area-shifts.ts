import { formatReturnDate } from "./employment-status";

/** A save that takes someone off a focus area holding their upcoming shifts, without saying what to do with them (51i). */
export const FOCUS_AREA_SHIFTS_DECISION_CODE = "FOCUS_AREA_SHIFTS_DECISION";

export type FocusAreaShiftsDecision = "clear" | "keep";

/** Someone's upcoming shifts in one focus area they're coming off. */
export interface FocusAreaUpcomingShifts {
  focusAreaId: number;
  focusAreaName: string;
  count: number;
  /** YYYY-MM-DD of the first and last of them. */
  firstDate: string;
  lastDate: string;
}

export interface FocusAreaShiftsQuestion {
  title: string;
  message: string;
  points: string[];
  clearLabel: string;
  keepLabel: string;
}

export const FOCUS_AREA_SHIFTS_CLEAR_LABEL = "Clear shifts";
export const FOCUS_AREA_SHIFTS_KEEP_LABEL = "Keep shifts";

/** The focus areas in `before` that `after` no longer has. */
export function removedFocusAreaIds(before: readonly number[], after: readonly number[]): number[] {
  const kept = new Set(after);
  return [...new Set(before)].filter((id) => !kept.has(id));
}

function shiftCount(count: number): string {
  return count === 1 ? "1 upcoming shift" : `${count} upcoming shifts`;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function totalOf(areas: readonly FocusAreaUpcomingShifts[]): number {
  return areas.reduce((sum, area) => sum + area.count, 0);
}

function dateRange(areas: readonly FocusAreaUpcomingShifts[]): string {
  const first = areas.map((area) => area.firstDate).sort()[0]!;
  const lasts = areas.map((area) => area.lastDate).sort();
  const last = lasts[lasts.length - 1]!;
  const from = formatReturnDate(first, { weekday: true });
  return first === last ? `on ${from}` : `${from} to ${formatReturnDate(last, { weekday: true })}`;
}

/** "3 upcoming shifts in East Wing" or "3 upcoming shifts in East Wing and 1 in West Wing". */
function shiftsIn(areas: readonly FocusAreaUpcomingShifts[]): string {
  const [head, ...rest] = areas;
  if (!head) return "";
  const parts = [
    `${shiftCount(head.count)} in ${head.focusAreaName}`,
    ...rest.map((area) => `${area.count} in ${area.focusAreaName}`),
  ];
  return joinNames(parts);
}

/**
 * The question a save asks before taking someone off focus areas with
 * upcoming shifts. `self` words it for a manager editing their own record.
 */
export function describeFocusAreaShiftsQuestion(
  personName: string,
  areas: readonly FocusAreaUpcomingShifts[],
  { self = false } = {},
): FocusAreaShiftsQuestion {
  const whose = self ? "your" : `${personName}'s`;
  const title =
    areas.length === 1
      ? `Clear ${whose} upcoming shifts in ${areas[0]!.focusAreaName}?`
      : `Clear ${whose} upcoming shifts?`;
  return {
    title,
    message: `${self ? "You" : "They"} have ${shiftsIn(areas)}, ${dateRange(areas)}.`,
    points: [
      "Cleared shifts come off in the draft and leave the schedule when it's published.",
      "Open requests for those shifts are closed.",
    ],
    clearLabel: FOCUS_AREA_SHIFTS_CLEAR_LABEL,
    keepLabel: FOCUS_AREA_SHIFTS_KEEP_LABEL,
  };
}

/** The server's refusal when a save doesn't say what to do with the shifts. */
export function focusAreaShiftsRefusal(areas: readonly FocusAreaUpcomingShifts[]): string {
  const total = totalOf(areas);
  const names = joinNames(areas.map((area) => area.focusAreaName));
  return `Choose whether to clear or keep their ${shiftCount(total)} in ${names}.`;
}

/** Said when the save went through but the clear didn't. */
export function focusAreaShiftsClearFailed(areas: readonly FocusAreaUpcomingShifts[]): string {
  const names = joinNames(areas.map((area) => area.focusAreaName));
  return `Saved, but their shifts in ${names} weren't cleared. Remove them on the schedule.`;
}

function isArea(value: unknown): value is FocusAreaUpcomingShifts {
  if (!value || typeof value !== "object") return false;
  const area = value as Record<string, unknown>;
  return (
    typeof area.focusAreaId === "number" &&
    typeof area.focusAreaName === "string" &&
    typeof area.count === "number" &&
    area.count > 0 &&
    typeof area.firstDate === "string" &&
    typeof area.lastDate === "string"
  );
}

/** The focus areas a refused save asks about, read from the response body; null for any other body. */
export function parseFocusAreaShiftsQuestion(payload: unknown): FocusAreaUpcomingShifts[] | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { code?: unknown; focusAreaShifts?: unknown };
  if (body.code !== FOCUS_AREA_SHIFTS_DECISION_CODE) return null;
  if (!Array.isArray(body.focusAreaShifts) || body.focusAreaShifts.length === 0) return null;
  return body.focusAreaShifts.every(isArea) ? body.focusAreaShifts : null;
}
