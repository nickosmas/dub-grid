import type { CoverageContributorChange, CoverageMatrixCell } from "./coverage-matrix";
import { parseLocalDateKey } from "./dates";

/** What a person works on one day, on one side (draft or published). */
export interface CoverageDaySide {
  assignmentIds: number[];
  /** An all-day absence. A rest-of-day absence beside a shift is work, not an absence. */
  absenceTypeId: number | null;
}

export interface DescribeCoverageCellChangesInput {
  changes: ReadonlyArray<CoverageContributorChange>;
  /** The row's focus area, so work elsewhere is named with its area. */
  focusAreaId: number;
  dateKey: string;
  /** Every loaded date, so a move into the next week still reads as a move. */
  dateKeys: ReadonlyArray<string>;
  personName: (employeeId: string) => string | null;
  assignmentName: (assignmentId: number) => string;
  assignmentFocusAreaId: (assignmentId: number) => number | null;
  focusAreaName: (focusAreaId: number) => string | null;
  absenceName: (absenceTypeId: number) => string;
  draftDay: (employeeId: string, dateKey: string) => CoverageDaySide;
  publishedDay: (employeeId: string, dateKey: string) => CoverageDaySide;
  formatDate: (dateKey: string) => string;
}

const DAY_MS = 86_400_000;

function formatCredit(value: number): string {
  return String(Number(value.toFixed(2)));
}

function isAbsence(day: CoverageDaySide): boolean {
  return day.assignmentIds.length === 0 && day.absenceTypeId != null;
}

/**
 * The other end of a move: the nearest loaded date (the earlier on a tie)
 * where `from` holds the assignment and `to` does not.
 */
function findMoveDate(
  input: DescribeCoverageCellChangesInput,
  assignmentId: number,
  has: (dateKey: string) => CoverageDaySide,
  lacks: (dateKey: string) => CoverageDaySide,
): string | null {
  const here = parseLocalDateKey(input.dateKey).getTime();
  let best: { dateKey: string; distance: number; time: number } | null = null;
  for (const dateKey of input.dateKeys) {
    if (dateKey === input.dateKey) continue;
    if (!has(dateKey).assignmentIds.includes(assignmentId)) continue;
    if (lacks(dateKey).assignmentIds.includes(assignmentId)) continue;
    const time = parseLocalDateKey(dateKey).getTime();
    const distance = Math.round(Math.abs(time - here) / DAY_MS);
    if (!best || distance < best.distance || (distance === best.distance && time < best.time)) {
      best = { dateKey, distance, time };
    }
  }
  return best?.dateKey ?? null;
}

function describeWork(input: DescribeCoverageCellChangesInput, assignmentIds: number[]): string {
  return assignmentIds
    .map((assignmentId) => {
      const name = input.assignmentName(assignmentId);
      const areaId = input.assignmentFocusAreaId(assignmentId);
      const area =
        areaId != null && areaId !== input.focusAreaId ? input.focusAreaName(areaId) : null;
      return area ? `${name} in ${area}` : name;
    })
    .join(" and ");
}

function describeLoss(
  input: DescribeCoverageCellChangesInput,
  change: CoverageContributorChange,
  name: string,
): string {
  const assignmentId = change.publishedAssignmentId as number;
  const shift = input.assignmentName(assignmentId);
  const draftHere = input.draftDay(change.employeeId, input.dateKey);
  if (draftHere.assignmentIds.includes(assignmentId)) {
    return `${name} is now mentored on ${shift}, counting ${formatCredit(change.draftCredit)}`;
  }
  const movedTo = findMoveDate(
    input,
    assignmentId,
    (dateKey) => input.draftDay(change.employeeId, dateKey),
    (dateKey) => input.publishedDay(change.employeeId, dateKey),
  );
  if (movedTo) return `${name}'s ${shift} moved to ${input.formatDate(movedTo)}`;
  // Only work the draft added counts as what the shift changed to; work kept
  // from the published day was there all along.
  const publishedHere = input.publishedDay(change.employeeId, input.dateKey);
  const added = draftHere.assignmentIds.filter((id) => !publishedHere.assignmentIds.includes(id));
  if (added.length > 0) {
    return `${name}'s ${shift} changed to ${describeWork(input, added)}`;
  }
  if (isAbsence(draftHere)) {
    return `${name} was given an absence (${input.absenceName(
      draftHere.absenceTypeId as number,
    )}) instead of ${shift}`;
  }
  return `${name} was taken off ${shift}`;
}

function describeGain(
  input: DescribeCoverageCellChangesInput,
  change: CoverageContributorChange,
  name: string,
): string {
  const assignmentId = change.draftAssignmentId as number;
  const shift = input.assignmentName(assignmentId);
  const publishedHere = input.publishedDay(change.employeeId, input.dateKey);
  if (publishedHere.assignmentIds.includes(assignmentId)) {
    return `${name} is no longer mentored on ${shift}, counting ${formatCredit(change.draftCredit)}`;
  }
  const movedFrom = findMoveDate(
    input,
    assignmentId,
    (dateKey) => input.publishedDay(change.employeeId, dateKey),
    (dateKey) => input.draftDay(change.employeeId, dateKey),
  );
  if (movedFrom) return `${name}'s ${shift} moved here from ${input.formatDate(movedFrom)}`;
  const draftHere = input.draftDay(change.employeeId, input.dateKey);
  const dropped = publishedHere.assignmentIds.filter((id) => !draftHere.assignmentIds.includes(id));
  if (dropped.length > 0) {
    return `${name} changed from ${describeWork(input, dropped)} to ${shift}`;
  }
  if (isAbsence(publishedHere)) {
    return `${name}'s absence (${input.absenceName(
      publishedHere.absenceTypeId as number,
    )}) was replaced with ${shift}`;
  }
  return `${name} was scheduled for ${shift}`;
}

/**
 * One plain line per person whose draft change moved a Coverage Check cell,
 * losses first, then gains, each by name. Every line comes from a
 * `CoverageContributorChange`, so together they account for the whole change.
 */
export function describeCoverageCellChanges(input: DescribeCoverageCellChangesInput): string[] {
  const named = input.changes.map((change) => ({
    change,
    name: input.personName(change.employeeId) ?? "Someone",
    lost: change.draftCredit < change.publishedCredit,
  }));
  named.sort(
    (left, right) =>
      Number(left.lost === false) - Number(right.lost === false) ||
      left.name.localeCompare(right.name) ||
      left.change.employeeId.localeCompare(right.change.employeeId),
  );
  return named.map(({ change, name, lost }) =>
    lost ? describeLoss(input, change, name) : describeGain(input, change, name),
  );
}

/** What the cell detail says when no draft change touched the cell. */
export function coverageCellUnchangedText(cell: CoverageMatrixCell): string {
  if (!cell.published) return "Not published yet, so there is nothing to compare.";
  if (cell.kind === "short") {
    return "Short since it was published. The draft doesn't change that.";
  }
  return "The draft doesn't change this count.";
}
