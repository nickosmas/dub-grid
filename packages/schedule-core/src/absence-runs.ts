/** One day of a row, as the run builder sees it (item 52). */
export interface AbsenceRunInputDay {
  /** The whole-day absence on the day, or null. */
  absenceTypeId: number | null;
  /** Any worked shift on the day, which includes a rest-of-day absence. */
  hasShift: boolean;
  /** Whether the day differs from the published schedule in the draft. */
  changed: boolean;
}

export type AbsenceRunPosition = "start" | "middle" | "end";

export interface AbsenceRun {
  absenceTypeId: number;
  /** Index of the run's first day. */
  start: number;
  length: number;
}

export interface AbsenceRunDay {
  runIndex: number;
  /** Index of the run's first day. */
  start: number;
  length: number;
  position: AbsenceRunPosition;
}

export interface AbsenceRuns {
  /** Per input day: its place in a run, or null when it stands alone. */
  days: (AbsenceRunDay | null)[];
  runs: AbsenceRun[];
}

function runAbsenceOf(day: AbsenceRunInputDay | undefined): number | null {
  if (!day || day.hasShift || day.changed) return null;
  return day.absenceTypeId;
}

/**
 * Groups two or more days in a row with the same whole-day absence into runs.
 * A shift or a draft change breaks a run, and so does a week boundary: no run
 * crosses an index that is a multiple of `splitAt`.
 */
export function buildAbsenceRuns(
  days: readonly AbsenceRunInputDay[],
  options: { splitAt?: number } = {},
): AbsenceRuns {
  const splitAt = options.splitAt && options.splitAt > 0 ? options.splitAt : 0;
  const result: AbsenceRuns = { days: days.map(() => null), runs: [] };
  let index = 0;
  while (index < days.length) {
    const absenceTypeId = runAbsenceOf(days[index]);
    let end = index + 1;
    if (absenceTypeId != null) {
      while (
        end < days.length &&
        !(splitAt && end % splitAt === 0) &&
        runAbsenceOf(days[end]) === absenceTypeId
      ) {
        end++;
      }
    }
    const length = end - index;
    if (absenceTypeId != null && length >= 2) {
      const runIndex = result.runs.length;
      result.runs.push({ absenceTypeId, start: index, length });
      for (let day = index; day < end; day++) {
        result.days[day] = {
          runIndex,
          start: index,
          length,
          position: day === index ? "start" : day === end - 1 ? "end" : "middle",
        };
      }
    }
    index = end;
  }
  return result;
}

/** "Vacation" for one day, "Vacation ×4" for a run; never pluralized. */
export function formatAbsenceRunLabel(name: string, length: number): string {
  return length >= 2 ? `${name} ×${length}` : name;
}
