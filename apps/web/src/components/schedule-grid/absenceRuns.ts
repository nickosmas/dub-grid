import {
  buildAbsenceRuns,
  type AbsenceRunInputDay,
  type AbsenceRuns,
} from "@dubgrid/schedule-core";

/** What the grid reads to tell whether a day can join an absence run (item 52). */
export interface AbsenceRunReads {
  shiftForKey: (empId: string, date: Date) => string | null;
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  segmentsForKey?: (empId: string, date: Date) => readonly unknown[];
  draftKindForKey?: (empId: string, date: Date) => unknown;
  publishDiffForKey?: (empId: string, date: Date) => unknown;
  showPublishDiffOverlay?: boolean;
  hasAbsenceType: (absenceTypeId: number) => boolean;
}

const STANDS_ALONE: AbsenceRunInputDay = { absenceTypeId: null, hasShift: false, changed: false };

/**
 * One row's runs. A day joins only as the grid would draw it as one plain
 * absence pill: a known whole-day absence, no shift, and no draft change or
 * published-change mark (those keep their own pill and chip).
 */
export function buildRowAbsenceRuns(
  empId: string,
  dates: readonly Date[],
  reads: AbsenceRunReads,
  splitAt?: number,
  known?: { labels: readonly (string | null)[]; absenceTypeIds: readonly (number | null)[] },
): AbsenceRuns {
  return buildAbsenceRuns(
    dates.map((date, index) => {
      const absenceTypeId = known
        ? known.absenceTypeIds[index]
        : (reads.absenceTypeIdForKey?.(empId, date) ?? null);
      if (absenceTypeId == null || !reads.hasAbsenceType(absenceTypeId)) return STANDS_ALONE;
      const label = known ? known.labels[index] : reads.shiftForKey(empId, date);
      if (!label || label === "OFF") return STANDS_ALONE;
      return {
        absenceTypeId,
        hasShift: (reads.segmentsForKey?.(empId, date) ?? []).length > 0,
        changed:
          reads.draftKindForKey?.(empId, date) != null ||
          (!!reads.showPublishDiffOverlay && reads.publishDiffForKey?.(empId, date) != null),
      };
    }),
    { splitAt },
  );
}
