export const OVERTIME_THRESHOLD_HOURS = 40;

/** The step after `step` in a loop of `stepCount` steps. */
export function nextLoopStep(step: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return (step + 1) % stepCount;
}

export interface WeeklyHoursBar {
  /** Share of the bar filled up to the threshold, 0 to 100. */
  withinPercent: number;
  /** Share of the bar past the threshold, 0 to 100. */
  overPercent: number;
  isOvertime: boolean;
  hoursLabel: string;
  detailLabel: string;
}

/**
 * One person's week on the overtime illustration: a bar scaled to `scaleHours`
 * whose part past 40 hours is drawn separately, labelled the way the
 * dashboard's staff hours card labels it ("+4h OT" or "of 40h").
 */
export function describeWeeklyHours(hours: number, scaleHours = 48): WeeklyHoursBar {
  const scale = Math.max(scaleHours, OVERTIME_THRESHOLD_HOURS);
  const clamped = Math.min(Math.max(hours, 0), scale);
  const within = Math.min(clamped, OVERTIME_THRESHOLD_HOURS);
  const over = Math.max(clamped - OVERTIME_THRESHOLD_HOURS, 0);
  const isOvertime = hours > OVERTIME_THRESHOLD_HOURS;

  return {
    withinPercent: (within / scale) * 100,
    overPercent: (over / scale) * 100,
    isOvertime,
    hoursLabel: `${hours}h`,
    detailLabel: isOvertime
      ? `+${hours - OVERTIME_THRESHOLD_HOURS}h OT`
      : `of ${OVERTIME_THRESHOLD_HOURS}h`,
  };
}

export interface PatternCell {
  code: string;
  /** How many day columns the cell covers; an off run spans several. */
  span: number;
}

/**
 * Reads one row of the hero schedule: space-separated cell codes, where an
 * off run such as "O3" covers three days and is followed by "_" for each
 * day it swallows. Throws if the row doesn't cover exactly `days` days, so a
 * typo in the data can't shift a week out of line.
 */
export function parseSchedulePattern(pattern: string, days: number): PatternCell[] {
  const tokens = pattern.trim().split(/\s+/);
  if (tokens.length !== days) {
    throw new Error(`Pattern covers ${tokens.length} days, expected ${days}: ${pattern}`);
  }
  const cells: PatternCell[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === "_") continue;
    const run = /^O(\d)$/.exec(token);
    const span = run ? Number(run[1]) : 1;
    for (let offset = 1; offset < span; offset++) {
      if (tokens[index + offset] !== "_") {
        throw new Error(`"${token}" needs ${span - 1} "_" after it: ${pattern}`);
      }
    }
    cells.push({ code: run ? "off" : token, span });
  }
  return cells;
}
