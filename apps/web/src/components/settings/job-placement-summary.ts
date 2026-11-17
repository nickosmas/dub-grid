import { formatScheduleTimeRange } from "@dubgrid/schedule-core";

interface Choice {
  id: number;
  name: string;
}

/** One level of a job's placement: what can be chosen, what is, and its lower-case plural. */
export interface PlacementLevel {
  choices: readonly Choice[];
  selectedIds: readonly number[];
  plural: string;
}

/**
 * One part of a job's placement line: "No wings", the name when there is one,
 * "All wings" when every choice is ticked, otherwise a count ("2 wings").
 * Names count once: each focus area has its own "Day" shift.
 */
export function summarizeSelection({ choices, selectedIds, plural }: PlacementLevel): string {
  const wanted = new Set(selectedIds);
  const chosen = choices.filter((choice) => wanted.has(choice.id));
  const names = new Set(chosen.map((choice) => choice.name));
  if (names.size === 0) return `No ${plural}`;
  if (names.size === 1) return chosen[0].name;
  if (chosen.length === choices.length) return `All ${plural}`;
  return `${names.size} ${plural}`;
}

function isEmpty({ choices, selectedIds }: PlacementLevel): boolean {
  const wanted = new Set(selectedIds);
  return !choices.some((choice) => wanted.has(choice.id));
}

/**
 * "Nursing · 2 wings · All shifts". Each level's choices come from the one
 * before it, so the line stops at the first empty level ("Nursing · No wings"),
 * and a job with nothing chosen is "Not placed yet".
 */
export function summarizePlacement(levels: readonly PlacementLevel[]): string {
  if (levels.length === 0 || isEmpty(levels[0])) return "Not placed yet";
  const parts: string[] = [];
  for (const level of levels) {
    parts.push(summarizeSelection(level));
    if (isEmpty(level)) break;
  }
  return parts.join(" · ");
}

/** A general job's default timing, as the settings form holds it. */
export interface GeneralJobTiming {
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  defaultDurationHours: number | null;
  defaultDurationMinutes: number | null;
}

function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourPart = hours > 0 ? `${hours} ${hours === 1 ? "hour" : "hours"}` : null;
  const minutePart = minutes > 0 ? `${minutes} min` : null;
  return [hourPart, minutePart].filter(Boolean).join(" ");
}

/** "9:00 AM - 5:00 PM", "8 hours", "3 hours 30 min", or "No set time". */
export function summarizeGeneralJobTiming(timing: GeneralJobTiming): string {
  const range = formatScheduleTimeRange(timing.defaultStartTime, timing.defaultEndTime);
  if (range) return range;
  const totalMinutes =
    (timing.defaultDurationHours ?? 0) * 60 + (timing.defaultDurationMinutes ?? 0);
  if (totalMinutes > 0) return formatDuration(totalMinutes);
  return "No set time";
}
