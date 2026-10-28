import {
  computeCoverageCategorySnapshots,
  type CoverageComputationInput,
  type CoverageStatus,
} from "./coverage";
import {
  buildCoverageMatrix,
  type CoverageMatrix,
  type CoverageMatrixCell,
} from "./coverage-matrix";
import { formatLocalDateKey, getScheduleWeekStartDate, parseLocalDateKey } from "./dates";

/** One person's day on one side. Satisfies 47b's `CoverageDaySide`. */
export interface CoverageSuggestionDay {
  assignmentIds: number[];
  mentoredAssignmentIds: number[];
  /** An all-day absence. */
  absenceTypeId: number | null;
  /** The absence for the rest of a worked day. */
  restOfDayAbsenceTypeId: number | null;
}

export type CoverageSide = "draft" | "published";

/** What applying a suggestion writes: one person's whole day on one side. */
export interface CoverageDayOverride {
  employeeId: string;
  dateKey: string;
  side: CoverageSide;
  day: CoverageSuggestionDay;
}

export interface CoverageCellEffect {
  rowKey: string;
  dateKey: string;
  past: boolean;
  draftBefore: CoverageStatus;
  draftAfter: CoverageStatus;
  publishedBefore: CoverageStatus | null;
  publishedAfter: CoverageStatus | null;
}

export interface CoverageMeasurement {
  effects: CoverageCellEffect[];
  /** Cells short before and not after, among cells that have not started. */
  closes: number;
  /** Cells not short before and short after. */
  opens: number;
  /** Staff added to short cells, summed. */
  filled: number;
  /** Staff taken from cells that end up short, summed. */
  worsened: number;
  /** Cells over before and not after. */
  clearsOver: number;
}

/** Everything needed to count coverage again with some days changed. */
export interface CoverageMeasureInput {
  matrix: CoverageMatrix;
  coverage: Omit<
    CoverageComputationInput,
    "dates" | "assignmentIdsForKey" | "coverageCreditForKey" | "includeContributors"
  >;
  /** The organization's mentored credit, 0 to 1. */
  mentoredCredit: number;
  draftDay: (employeeId: string, dateKey: string) => CoverageSuggestionDay;
  publishedDay: (employeeId: string, dateKey: string) => CoverageSuggestionDay;
}

const EPSILON = 1e-9;

function shortageOf(status: CoverageStatus): number {
  return Math.max(0, Math.round((status.required - status.actual) * 1e6) / 1e6);
}

function isShort(status: CoverageStatus): boolean {
  return status.actual < status.required - EPSILON;
}

function isOver(status: CoverageStatus): boolean {
  return status.actual > status.required + EPSILON;
}

function sameStatus(left: CoverageStatus | null, right: CoverageStatus | null): boolean {
  if (!left || !right) return left === right;
  return (
    Math.abs(left.actual - right.actual) <= EPSILON &&
    Math.abs(left.required - right.required) <= EPSILON
  );
}

function cellLookup(matrix: CoverageMatrix): Map<string, CoverageMatrixCell> {
  const cells = new Map<string, CoverageMatrixCell>();
  for (const row of matrix.rows) {
    for (const cell of row.cells) if (cell) cells.set(`${row.rowKey}|${cell.dateKey}`, cell);
  }
  return cells;
}

/** Coverage on one side for some dates, keyed `rowKey|dateKey`. */
function countSide(
  input: CoverageMeasureInput,
  side: CoverageSide,
  dateKeys: string[],
  overrides: ReadonlyMap<string, CoverageSuggestionDay>,
): Map<string, CoverageStatus> {
  const lookup = side === "draft" ? input.draftDay : input.publishedDay;
  const dayOf = (employeeId: string, dateKey: string) =>
    overrides.get(`${side}|${employeeId}|${dateKey}`) ?? lookup(employeeId, dateKey);
  const keyOf = formatLocalDateKey;
  const snapshots = computeCoverageCategorySnapshots({
    ...input.coverage,
    dates: dateKeys.map(parseLocalDateKey),
    assignmentIdsForKey: (employeeId, date) => dayOf(employeeId, keyOf(date)).assignmentIds,
    coverageCreditForKey: (employeeId, date, assignmentId) =>
      dayOf(employeeId, keyOf(date)).mentoredAssignmentIds.includes(assignmentId)
        ? input.mentoredCredit
        : 1,
  });
  return new Map(
    snapshots.map((snapshot) => [`${snapshot.rowKey}|${keyOf(snapshot.date)}`, snapshot.status]),
  );
}

/**
 * Counts coverage again with some days changed and reports every cell whose
 * count moves. Before and after are both counted here, by the same engine,
 * so the difference is exact whatever produced the matrix.
 */
export function measureCoverageChange(
  input: CoverageMeasureInput,
  overrides: ReadonlyArray<CoverageDayOverride>,
): CoverageMeasurement {
  const result: CoverageMeasurement = {
    effects: [],
    closes: 0,
    opens: 0,
    filled: 0,
    worsened: 0,
    clearsOver: 0,
  };
  if (overrides.length === 0) return result;

  const cells = cellLookup(input.matrix);
  const overrideMap = new Map(
    overrides.map((override) => [
      `${override.side}|${override.employeeId}|${override.dateKey}`,
      override.day,
    ]),
  );
  const dateKeys = [...new Set(overrides.map((override) => override.dateKey))].sort();
  const touchesPublished = overrides.some((override) => override.side === "published");
  const none = new Map<string, CoverageSuggestionDay>();

  const draftBefore = countSide(input, "draft", dateKeys, none);
  const draftAfter = countSide(input, "draft", dateKeys, overrideMap);
  const publishedBefore = touchesPublished ? countSide(input, "published", dateKeys, none) : null;
  const publishedAfter = touchesPublished
    ? countSide(input, "published", dateKeys, overrideMap)
    : null;

  for (const [key, before] of draftBefore) {
    const after = draftAfter.get(key) ?? before;
    const cell = cells.get(key);
    // A date never published has no published side to report.
    const isPublished = cell?.published != null;
    const pubBefore = isPublished ? (publishedBefore?.get(key) ?? cell.published) : null;
    const pubAfter = isPublished ? (publishedAfter?.get(key) ?? pubBefore) : null;
    if (sameStatus(before, after) && sameStatus(pubBefore, pubAfter)) continue;

    const [rowKey, dateKey] = key.split("|");
    const past = cell?.past ?? false;
    result.effects.push({
      rowKey,
      dateKey,
      past,
      draftBefore: before,
      draftAfter: after,
      publishedBefore: pubBefore,
      publishedAfter: pubAfter,
    });
    if (past) continue;
    const shortBefore = shortageOf(before);
    const shortAfter = shortageOf(after);
    if (isShort(before) && !isShort(after)) result.closes += 1;
    if (!isShort(before) && isShort(after)) result.opens += 1;
    if (shortAfter < shortBefore) result.filled += shortBefore - shortAfter;
    if (shortAfter > shortBefore) result.worsened += shortAfter - shortBefore;
    if (isOver(before) && !isOver(after)) result.clearsOver += 1;
  }
  result.filled = Math.round(result.filled * 1e6) / 1e6;
  result.worsened = Math.round(result.worsened * 1e6) / 1e6;
  return result;
}

export type CoverageAvailability =
  | { kind: "free" }
  | { kind: "absence"; absenceTypeId: number }
  | { kind: "restOfDayAbsence"; absenceTypeId: number }
  | { kind: "overlap"; dateKey: string; assignmentId: number }
  | { kind: "unverified"; dateKey: string }
  /** A pickup, swap or call-off waits on this person that day. */
  | { kind: "request"; dateKey: string }
  /** Working this day would make `days` in a row, over the limit. */
  | { kind: "workRun"; days: number }
  /** Working this day would make `days` in its Sunday-to-Saturday week, over the limit. */
  | { kind: "workWeek"; days: number }
  /** The person already works that day; only a scheduler adds a second shift. */
  | { kind: "doubleShift" }
  /** The person works only the shifts they chose, and this is not one. */
  | { kind: "onlyShifts" }
  /** The person works only the jobs they chose, and this is not one. */
  | { kind: "onlyJobs" }
  /** The scheduler left the person out of this build. */
  | { kind: "excluded" }
  /** The person is away until `until`, their first day back (YYYY-MM-DD). */
  | { kind: "away"; until: string | null }
  /** The day is after the person's last day (YYYY-MM-DD), when they're offboarded. */
  | { kind: "leaving"; lastDay: string }
  /** The day is before the person's first day (YYYY-MM-DD, 51g4). */
  | { kind: "notStarted"; firstDay: string };

/** A person's shift preference: flexible ("prefers") or strict ("only"). */
export interface CoverageShiftPreference {
  mode: "prefers" | "only";
  /** Shift category ids. */
  shiftIds: number[];
}

/** A person's job preference, as for shifts: flexible ("prefers") or strict ("only"). */
export interface CoverageJobPreference {
  mode: "prefers" | "only";
  jobIds: number[];
}

export interface CoveragePickupRequest {
  requestId: string;
  employeeId: string;
  dateKey: string;
  focusAreaId: number;
  assignmentIds: number[];
}

export interface CoverageSuggestionPerson {
  id: string;
  name: string;
  active: boolean;
  focusAreaIds: number[];
}

export interface CoverageSuggestionInput extends CoverageMeasureInput {
  /** Every loaded date, so a move into the next week can still be moved back. */
  dateKeys: ReadonlyArray<string>;
  people: ReadonlyArray<CoverageSuggestionPerson>;
  qualifiedFor: (employeeId: string, assignmentId: number) => boolean;
  /** Whether the person can take the assignment on that date, against the draft. */
  availability: (employeeId: string, dateKey: string, assignmentId: number) => CoverageAvailability;
  /** A pending request where the person is requester or target on that date. */
  hasRequest: (employeeId: string, dateKey: string) => boolean;
  pendingPickups: ReadonlyArray<CoveragePickupRequest>;
  /**
   * Why working this day, with the days `worked` reports, would break a limit
   * on days worked, or null. A restore or move back adds work without asking
   * `availability`, so it checks this for each day it adds.
   */
  workLimit?: (
    employeeId: string,
    dateKey: string,
    worked: (dateKey: string) => boolean,
  ) => CoverageAvailability | null;
}

export type CoverageSuggestionKind =
  "moveBack" | "restore" | "assign" | "approvePickup" | "pattern";

/** What a suggestion is about, for its words. */
export interface CoverageSuggestionSubject {
  rowKey: string;
  focusAreaId: number;
  assignmentId: number;
  dateKey: string;
  /** Move back: the date the shift went to. */
  otherDateKey: string | null;
  /** Move back: the work the shift changed to. Assign: other work kept that day. */
  otherAssignmentIds: number[];
}

export interface CoverageSuggestion {
  id: string;
  kind: CoverageSuggestionKind;
  employeeId: string | null;
  requestId: string | null;
  /** True only for an approval, which publishes and cannot be undone here. */
  final: boolean;
  subject: CoverageSuggestionSubject;
  /** The short cells it helps (for a pattern, the cells that repeat). */
  targets: { rowKey: string; dateKey: string }[];
  overrides: CoverageDayOverride[];
  effects: CoverageCellEffect[];
  closes: number;
  filled: number;
  clearsOver: number;
}

export interface CoverageRuledOut {
  rowKey: string;
  dateKey: string;
  employeeId: string;
  requestId: string | null;
  reason: Exclude<CoverageAvailability, { kind: "free" }>;
}

export interface CoverageSuggestions {
  suggestions: CoverageSuggestion[];
  ruledOut: CoverageRuledOut[];
}

const KIND_ORDER: Record<CoverageSuggestionKind, number> = {
  moveBack: 0,
  restore: 1,
  approvePickup: 2,
  assign: 3,
  pattern: 4,
};

interface ShortCell {
  rowKey: string;
  focusAreaId: number;
  cell: CoverageMatrixCell;
}

function shortCells(matrix: CoverageMatrix): ShortCell[] {
  const cells: ShortCell[] = [];
  for (const row of matrix.rows) {
    for (const cell of row.cells) {
      if (cell && cell.kind === "short" && !cell.past) {
        cells.push({ rowKey: row.rowKey, focusAreaId: row.focusAreaId, cell });
      }
    }
  }
  return cells;
}

function withAssignments(
  day: CoverageSuggestionDay,
  assignmentIds: number[],
): CoverageSuggestionDay {
  return {
    ...day,
    assignmentIds: [
      ...day.assignmentIds,
      ...assignmentIds.filter((id) => !day.assignmentIds.includes(id)),
    ],
    absenceTypeId: null,
  };
}

/** The other end of a move: the nearest loaded date (earlier on a tie) the draft gave this shift. */
function findMovedTo(
  input: CoverageSuggestionInput,
  employeeId: string,
  assignmentId: number,
  dateKey: string,
): string | null {
  const here = parseLocalDateKey(dateKey).getTime();
  let best: { dateKey: string; distance: number } | null = null;
  for (const candidate of input.dateKeys) {
    if (candidate === dateKey) continue;
    if (!input.draftDay(employeeId, candidate).assignmentIds.includes(assignmentId)) continue;
    if (input.publishedDay(employeeId, candidate).assignmentIds.includes(assignmentId)) continue;
    const distance = Math.abs(parseLocalDateKey(candidate).getTime() - here);
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && candidate < best.dateKey)
    ) {
      best = { dateKey: candidate, distance };
    }
  }
  return best?.dateKey ?? null;
}

/** Whether a change adds staff to a requirement already at its most. */
function pastMaximum(effect: CoverageCellEffect): boolean {
  const { maximum, actual } = effect.draftAfter;
  return (
    maximum != null && actual > maximum + EPSILON && actual > effect.draftBefore.actual + EPSILON
  );
}

function keeps(measurement: CoverageMeasurement): boolean {
  return (
    (measurement.closes > 0 || measurement.filled > 0) &&
    measurement.opens === 0 &&
    measurement.worsened === 0 &&
    !measurement.effects.some((effect) => effect.past || pastMaximum(effect))
  );
}

function targetsOf(measurement: CoverageMeasurement): { rowKey: string; dateKey: string }[] {
  return measurement.effects
    .filter(
      (effect) =>
        !effect.past &&
        effect.draftBefore.actual < effect.draftBefore.required - EPSILON &&
        effect.draftAfter.actual > effect.draftBefore.actual + EPSILON,
    )
    .map(({ rowKey, dateKey }) => ({ rowKey, dateKey }));
}

/** Whether a day these overrides add work to would break the input's limit on days worked. */
function breaksWorkLimit(
  input: CoverageSuggestionInput,
  overrides: ReadonlyArray<CoverageDayOverride>,
): boolean {
  const { workLimit } = input;
  if (!workLimit) return false;
  return overrides.some((override) => {
    const { employeeId, dateKey } = override;
    if (override.day.assignmentIds.length === 0) return false;
    if (input.draftDay(employeeId, dateKey).assignmentIds.length > 0) return false;
    // The other days as the overrides leave them, this one as it stands.
    const worked = (key: string) => {
      const other = key === dateKey ? undefined : overrides.find((day) => day.dateKey === key);
      return (other?.day ?? input.draftDay(employeeId, key)).assignmentIds.length > 0;
    };
    return workLimit(employeeId, dateKey, worked) != null;
  });
}

/** The draft's own losses in short cells: moves to undo and removals to restore. */
function draftUndoSuggestions(
  input: CoverageSuggestionInput,
  gaps: ShortCell[],
): CoverageSuggestion[] {
  const found: CoverageSuggestion[] = [];
  for (const { rowKey, focusAreaId, cell } of gaps) {
    for (const change of cell.contributorChanges) {
      if (change.draftCredit >= change.publishedCredit || change.publishedAssignmentId == null)
        continue;
      const assignmentId = change.publishedAssignmentId;
      const { employeeId } = change;
      const draftHere = input.draftDay(employeeId, cell.dateKey);
      const publishedHere = input.publishedDay(employeeId, cell.dateKey);
      // Still on the shift with less credit is a mentoring change, not a fix to suggest.
      if (draftHere.assignmentIds.includes(assignmentId)) continue;

      const movedTo = findMovedTo(input, employeeId, assignmentId, cell.dateKey);
      const added = draftHere.assignmentIds.filter(
        (id) => !publishedHere.assignmentIds.includes(id),
      );
      let kind: CoverageSuggestionKind;
      let dates: string[];
      if (movedTo) {
        kind = "moveBack";
        dates = [cell.dateKey, movedTo];
      } else if (added.length > 0) {
        kind = "moveBack";
        dates = [cell.dateKey];
      } else if (draftHere.assignmentIds.length === 0 && draftHere.absenceTypeId != null) {
        continue;
      } else if (input.hasRequest(employeeId, cell.dateKey)) {
        continue;
      } else {
        kind = "restore";
        dates = [cell.dateKey];
      }

      const overrides = dates.map((dateKey) => ({
        employeeId,
        dateKey,
        side: "draft" as const,
        day: input.publishedDay(employeeId, dateKey),
      }));
      if (breaksWorkLimit(input, overrides)) continue;
      const measurement = measureCoverageChange(input, overrides);
      if (!keeps(measurement)) continue;
      found.push({
        id: `${kind}:${employeeId}:${[...dates].sort().join(",")}`,
        kind,
        employeeId,
        requestId: null,
        final: false,
        subject: {
          rowKey,
          focusAreaId,
          assignmentId,
          dateKey: cell.dateKey,
          otherDateKey: movedTo,
          otherAssignmentIds: movedTo ? [] : added,
        },
        targets: targetsOf(measurement),
        overrides,
        effects: measurement.effects,
        closes: measurement.closes,
        filled: measurement.filled,
        clearsOver: measurement.clearsOver,
      });
    }
  }
  return found;
}

/** A planned shift for one person in one requirement's cell, as measured. */
function assignFix(
  employeeId: string,
  at: { rowKey: string; focusAreaId: number; assignmentId: number; dateKey: string },
  overrides: CoverageDayOverride[],
  measurement: CoverageMeasurement,
): CoverageSuggestion {
  return {
    id: `assign:${employeeId}:${at.dateKey}:${at.assignmentId}`,
    kind: "assign",
    employeeId,
    requestId: null,
    final: false,
    subject: {
      rowKey: at.rowKey,
      focusAreaId: at.focusAreaId,
      assignmentId: at.assignmentId,
      dateKey: at.dateKey,
      otherDateKey: null,
      otherAssignmentIds: [],
    },
    targets: targetsOf(measurement),
    overrides,
    effects: measurement.effects,
    closes: measurement.closes,
    filled: measurement.filled,
    clearsOver: measurement.clearsOver,
  };
}

function cellAssignments(cell: CoverageMatrixCell): number[] {
  return [
    ...new Set([
      ...cell.shortageDetails.map((detail) => detail.assignmentId),
      cell.preferredOpenAssignmentDefinitionId,
    ]),
  ];
}

/** Free, qualified people and waiting pickups for each short cell, and why the rest are not. */
function staffingSuggestions(
  input: CoverageSuggestionInput,
  gaps: ShortCell[],
  undone: ReadonlySet<string>,
): CoverageSuggestions {
  const suggestions: CoverageSuggestion[] = [];
  const ruledOut: CoverageRuledOut[] = [];

  for (const { rowKey, focusAreaId, cell } of gaps) {
    const tryOrder = cellAssignments(cell);
    const eligible = new Set([...cell.eligibleAssignmentDefinitionIds, ...tryOrder]);
    const approvedPeople = new Set<string>();

    for (const pickup of input.pendingPickups) {
      if (pickup.dateKey !== cell.dateKey || pickup.focusAreaId !== focusAreaId) continue;
      const assignmentId = pickup.assignmentIds.find((id) => eligible.has(id));
      if (assignmentId == null) continue;
      const availability = input.availability(pickup.employeeId, cell.dateKey, assignmentId);
      if (availability.kind !== "free") {
        ruledOut.push({
          rowKey,
          dateKey: cell.dateKey,
          employeeId: pickup.employeeId,
          requestId: pickup.requestId,
          reason: availability,
        });
        continue;
      }
      // An approval publishes at once and replaces the requester's draft of that day.
      const day = withAssignments(
        input.publishedDay(pickup.employeeId, cell.dateKey),
        pickup.assignmentIds,
      );
      const overrides: CoverageDayOverride[] = (["published", "draft"] as const).map((side) => ({
        employeeId: pickup.employeeId,
        dateKey: cell.dateKey,
        side,
        day,
      }));
      const measurement = measureCoverageChange(input, overrides);
      if (!keeps(measurement)) continue;
      approvedPeople.add(pickup.employeeId);
      suggestions.push({
        id: `approvePickup:${pickup.employeeId}:${cell.dateKey}:${pickup.requestId}`,
        kind: "approvePickup",
        employeeId: pickup.employeeId,
        requestId: pickup.requestId,
        final: true,
        subject: {
          rowKey,
          focusAreaId,
          assignmentId,
          dateKey: cell.dateKey,
          otherDateKey: null,
          otherAssignmentIds: [],
        },
        targets: targetsOf(measurement),
        overrides,
        effects: measurement.effects,
        closes: measurement.closes,
        filled: measurement.filled,
        clearsOver: measurement.clearsOver,
      });
    }

    for (const person of input.people) {
      if (!person.active || !person.focusAreaIds.includes(focusAreaId)) continue;
      // Approving their pickup, or undoing their own draft change, already covers it.
      if (approvedPeople.has(person.id)) continue;
      if (undone.has(`${person.id}|${rowKey}|${cell.dateKey}`)) continue;
      const draftHere = input.draftDay(person.id, cell.dateKey);
      if (draftHere.assignmentIds.some((id) => eligible.has(id))) continue;
      const assignmentId = tryOrder.find((id) => input.qualifiedFor(person.id, id));
      if (assignmentId == null) continue;
      // A request waiting on them that day decides their day first.
      if (input.hasRequest(person.id, cell.dateKey)) {
        ruledOut.push({
          rowKey,
          dateKey: cell.dateKey,
          employeeId: person.id,
          requestId: null,
          reason: { kind: "request", dateKey: cell.dateKey },
        });
        continue;
      }

      const availability = input.availability(person.id, cell.dateKey, assignmentId);
      if (availability.kind !== "free") {
        ruledOut.push({
          rowKey,
          dateKey: cell.dateKey,
          employeeId: person.id,
          requestId: null,
          reason: availability,
        });
        continue;
      }
      const overrides: CoverageDayOverride[] = [
        {
          employeeId: person.id,
          dateKey: cell.dateKey,
          side: "draft",
          day: { ...withAssignments(draftHere, [assignmentId]), restOfDayAbsenceTypeId: null },
        },
      ];
      const measurement = measureCoverageChange(input, overrides);
      if (!keeps(measurement)) continue;
      suggestions.push({
        id: `assign:${person.id}:${cell.dateKey}:${assignmentId}`,
        kind: "assign",
        employeeId: person.id,
        requestId: null,
        final: false,
        subject: {
          rowKey,
          focusAreaId,
          assignmentId,
          dateKey: cell.dateKey,
          otherDateKey: null,
          otherAssignmentIds: draftHere.assignmentIds,
        },
        targets: targetsOf(measurement),
        overrides,
        effects: measurement.effects,
        closes: measurement.closes,
        filled: measurement.filled,
        clearsOver: measurement.clearsOver,
      });
    }
  }
  return { suggestions, ruledOut };
}

/** A row short on the same weekday in two or more weeks, with nothing that fixes any of them. */
function patternSuggestions(
  gaps: ShortCell[],
  suggested: ReadonlySet<string>,
): CoverageSuggestion[] {
  const groups = new Map<string, ShortCell[]>();
  for (const gap of gaps) {
    const weekday = parseLocalDateKey(gap.cell.dateKey).getDay();
    const key = `${gap.rowKey}|${weekday}`;
    groups.set(key, [...(groups.get(key) ?? []), gap]);
  }
  const found: CoverageSuggestion[] = [];
  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    if (members.some((gap) => suggested.has(`${gap.rowKey}|${gap.cell.dateKey}`))) continue;
    const [first] = members;
    found.push({
      id: `pattern:${key}`,
      kind: "pattern",
      employeeId: null,
      requestId: null,
      final: false,
      subject: {
        rowKey: first.rowKey,
        focusAreaId: first.focusAreaId,
        assignmentId: first.cell.preferredOpenAssignmentDefinitionId,
        dateKey: first.cell.dateKey,
        otherDateKey: null,
        otherAssignmentIds: [],
      },
      targets: members.map((gap) => ({ rowKey: gap.rowKey, dateKey: gap.cell.dateKey })),
      overrides: [],
      effects: [],
      closes: 0,
      filled: 0,
      clearsOver: 0,
    });
  }
  return found;
}

function earliestTarget(suggestion: CoverageSuggestion): string {
  return suggestion.targets.map((target) => target.dateKey).sort()[0] ?? suggestion.subject.dateKey;
}

/**
 * Ways to fix Coverage Check's gaps, each measured on a copy of the schedule
 * and kept only when it closes or fills a gap without opening or deepening
 * another, plus why each other qualified person was not suggested.
 */
export function suggestCoverageFixes(input: CoverageSuggestionInput): CoverageSuggestions {
  const gaps = shortCells(input.matrix);
  const byId = new Map<string, CoverageSuggestion>();
  const undo = draftUndoSuggestions(input, gaps);
  const undone = new Set(
    undo.flatMap((suggestion) =>
      suggestion.targets.map(
        (target) => `${suggestion.employeeId}|${target.rowKey}|${target.dateKey}`,
      ),
    ),
  );
  const staffing = staffingSuggestions(input, gaps, undone);
  for (const suggestion of [...undo, ...staffing.suggestions]) {
    if (!byId.has(suggestion.id)) byId.set(suggestion.id, suggestion);
  }
  const fixes = [...byId.values()];
  const suggested = new Set(
    fixes.flatMap((fix) => fix.targets.map((t) => `${t.rowKey}|${t.dateKey}`)),
  );
  const nameOf = new Map(input.people.map((person) => [person.id, person.name]));

  fixes.sort(
    (left, right) =>
      right.closes - left.closes ||
      right.filled - left.filled ||
      KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
      earliestTarget(left).localeCompare(earliestTarget(right)) ||
      (nameOf.get(left.employeeId ?? "") ?? "").localeCompare(
        nameOf.get(right.employeeId ?? "") ?? "",
      ) ||
      left.id.localeCompare(right.id),
  );
  const patterns = patternSuggestions(gaps, suggested).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const ruledOut = staffing.ruledOut.sort(
    (left, right) =>
      left.dateKey.localeCompare(right.dateKey) ||
      left.rowKey.localeCompare(right.rowKey) ||
      (nameOf.get(left.employeeId) ?? "").localeCompare(nameOf.get(right.employeeId) ?? ""),
  );
  return { suggestions: [...fixes, ...patterns], ruledOut };
}

const DRAFT_KINDS: ReadonlySet<CoverageSuggestionKind> = new Set(["moveBack", "restore", "assign"]);

/** The input again with some draft days changed, coverage counted afresh. */
function withDraftOverrides(
  input: CoverageSuggestionInput,
  overrides: ReadonlyArray<CoverageDayOverride>,
): CoverageSuggestionInput {
  const changed = new Map(
    overrides
      .filter((override) => override.side === "draft")
      .map((override) => [`${override.employeeId}|${override.dateKey}`, override.day]),
  );
  const draftDay = (employeeId: string, dateKey: string) =>
    changed.get(`${employeeId}|${dateKey}`) ?? input.draftDay(employeeId, dateKey);
  const started = new Set<string>();
  const publishedDateKeys = new Set<string>();
  for (const row of input.matrix.rows) {
    for (const cell of row.cells) {
      if (cell?.past) started.add(`${row.rowKey}|${cell.dateKey}`);
      if (cell?.published) publishedDateKeys.add(cell.dateKey);
    }
  }
  const dates = input.matrix.dateKeys.map(parseLocalDateKey);
  const snapshots = (dayOf: typeof draftDay) =>
    computeCoverageCategorySnapshots({
      ...input.coverage,
      dates,
      assignmentIdsForKey: (employeeId, date) =>
        dayOf(employeeId, formatLocalDateKey(date)).assignmentIds,
      coverageCreditForKey: (employeeId, date, assignmentId) =>
        dayOf(employeeId, formatLocalDateKey(date)).mentoredAssignmentIds.includes(assignmentId)
          ? input.mentoredCredit
          : 1,
      includeContributors: true,
    });
  const matrix = buildCoverageMatrix({
    draft: snapshots(draftDay),
    published: snapshots(input.publishedDay),
    dates,
    publishedDateKeys,
    isStarted: (snapshot) => started.has(`${snapshot.rowKey}|${formatLocalDateKey(snapshot.date)}`),
  });
  return { ...input, matrix, draftDay };
}

function dayNumber(dateKey: string): number {
  return Math.round(parseLocalDateKey(dateKey).getTime() / 86_400_000);
}

/** The organization's weekly overtime threshold, with the caller's own hour counting. */
export interface CoverageOvertimeRule {
  thresholdHours: number;
  /** The person's draft hours in the week holding the date, with the planned days written. */
  weekHours: (
    employeeId: string,
    dateKey: string,
    planned: ReadonlyArray<CoverageDayOverride>,
  ) => number;
}

/** A fix the plan took although it puts the person over the threshold. */
export interface CoverageOverThreshold {
  employeeId: string;
  dateKey: string;
  suggestionId: string;
  /** Their hours that week once the whole plan is written. */
  hours: number;
}

/** A person's standing for one shift; lower is fairer to give them. */
export interface CoverageFairnessStanding {
  /** Whether this shift would leave the person a single day off between work days. */
  splitsDaysOff?: boolean;
  /** Their preference against this shift: one they prefer, none, or other shifts. */
  preference?: "match" | "none" | "other";
  /** Weekend shifts recently and this period, or null when the shift is not on a weekend. */
  weekends: number | null;
  /** Night shifts recently and this period, or null when the shift is not a night. */
  nights: number | null;
  /** Hours this period. */
  hours: number;
}

export interface CoverageFairnessRule {
  standing: (
    employeeId: string,
    dateKey: string,
    assignmentId: number,
    planned: ReadonlyArray<CoverageDayOverride>,
  ) => CoverageFairnessStanding;
}

/** Why the plan gave a shift to this person rather than another who could fill it. */
export interface CoverageFairChoice {
  suggestionId: string;
  employeeId: string;
  dateKey: string;
  /**
   * `weekDays`: given to bring the person up to their usual days that week.
   * `moved`: given a shift nobody free could fill, their earlier shift going to someone else.
   */
  reason:
    | "only"
    | "daysOff"
    | "preference"
    | "weekends"
    | "nights"
    | "hours"
    | "tie"
    | "weekDays"
    | "moved";
  /** The chosen person's count for that reason (hours for a tie). */
  count: number;
  /** How many others could have filled it the same way. */
  others: number;
}

export interface PlanCoverageFixesOptions {
  /** Only fixes for this date. */
  dateKey?: string;
  /** Only fixes for these requirement rows, such as one focus area's. */
  rowKeys?: ReadonlySet<string>;
  /**
   * Draft days fixed before any fix is planned, such as recurring schedule
   * fills: counted as written, seen by availability, and never written twice.
   */
  baseOverrides?: ReadonlyArray<CoverageDayOverride>;
  /**
   * Availability once the planned days are written, from the caller's own
   * shift times. Without it, a person a fix changed is not used again on that
   * day or the days either side, since overnight work could overlap.
   */
  availabilityWith?: (
    planned: ReadonlyArray<CoverageDayOverride>,
  ) => CoverageSuggestionInput["availability"];
  /**
   * Prefer fixes that keep everyone at or under the threshold; take one that
   * goes over only when no other fix is left.
   */
  overtime?: CoverageOvertimeRule;
  /**
   * Between people who would fill the same shift the same way, give it to
   * the one with the fewest weekends, nights or hours, and say why.
   */
  fairness?: CoverageFairnessRule;
  /** People the scheduler excluded from this build: given no fixes and no top-up. */
  excludedEmployeeIds?: ReadonlySet<string>;
  /** Recurring fills the caller left out, such as a sixth day in a row; reported with the preview. */
  skippedRecurring?: ReadonlyArray<CoverageSkippedRecurring>;
  /**
   * Once no gap is left to fill, give people working fewer than their usual
   * days a week more shifts, each in the least-staffed shift they can take
   * that day, even when it is already staffed.
   */
  topUp?: CoverageTopUpRule;
}

/** Who works fewer days a week than usual, and by how many. */
export interface CoverageTopUpRule {
  /** The people to top up; only those who work a day in the period are. */
  employeeIds: ReadonlyArray<string>;
  /** Days they usually work in a week. */
  target: (employeeId: string) => number;
  /** Days they work in the Sunday-to-Saturday week holding the date, with the planned days written. */
  weekDays: (
    employeeId: string,
    dateKey: string,
    planned: ReadonlyArray<CoverageDayOverride>,
  ) => number;
}

/** A recurring schedule fill left out because it would make too many days in a row or a week. */
export interface CoverageSkippedRecurring {
  employeeId: string;
  dateKey: string;
  /** Days it would have made, in a row or in its week. */
  days: number;
  /** Which limit it would have broken; days in a row when left out. */
  limit?: "row" | "week";
}

const FAIRNESS_REASONS = ["daysOff", "preference", "weekends", "nights", "hours"] as const;

const PREFERENCE_RANK = { match: 0, none: 1, other: 2 } as const;

// Days off stay in pairs first: a split is taken only when everyone else splits too.
function standingKey(standing: CoverageFairnessStanding): number[] {
  return [
    standing.splitsDaysOff ? 1 : 0,
    PREFERENCE_RANK[standing.preference ?? "none"],
    standing.weekends ?? 0,
    standing.nights ?? 0,
    standing.hours,
  ];
}

/** Same shift, same cell, same effect: only who fills it differs. */
function samePeer(left: CoverageSuggestion, right: CoverageSuggestion): boolean {
  return (
    left.kind === "assign" &&
    right.kind === "assign" &&
    left.subject.rowKey === right.subject.rowKey &&
    left.subject.dateKey === right.subject.dateKey &&
    left.subject.assignmentId === right.subject.assignmentId &&
    left.closes === right.closes &&
    Math.abs(left.filled - right.filled) < EPSILON
  );
}

/**
 * Every draft fix to apply together, chosen one at a time: after each, the
 * schedule is counted again and suggestions are made afresh, so two fixes
 * never fill the same spot and none undoes another. Approvals publish, so
 * they are left out, and no two fixes write the same person's same day.
 */
export function planCoverageFixes(
  input: CoverageSuggestionInput,
  options: PlanCoverageFixesOptions = {},
): CoverageSuggestion[] {
  return planWithLeftovers(input, options).fixes;
}

interface PlanWithLeftovers {
  fixes: CoverageSuggestion[];
  ruledOut: CoverageRuledOut[];
  final: CoverageSuggestionInput;
  overThreshold: CoverageOverThreshold[];
  choices: CoverageFairChoice[];
}

/** Runs the planner's steps to the end at once. */
function planWithLeftovers(
  input: CoverageSuggestionInput,
  options: PlanCoverageFixesOptions,
): PlanWithLeftovers {
  const steps = planSteps(input, options);
  for (let step = steps.next(); ; step = steps.next()) {
    if (step.done) return step.value;
  }
}

/** How far a build has got: fixes placed, and staff filled out of those needed at the start. */
export interface CoverageBuildProgress {
  placed: number;
  filled: number;
  needed: number;
}

/**
 * The plan one fix at a time, yielding its progress after each, then the
 * plan, who the last pass ruled out and the schedule it ended on.
 */
function* planSteps(
  input: CoverageSuggestionInput,
  options: PlanCoverageFixesOptions,
): Generator<CoverageBuildProgress, PlanWithLeftovers> {
  const plan: CoverageSuggestion[] = [];
  const overtime = options.overtime;
  const taken: Omit<CoverageOverThreshold, "hours">[] = [];
  const choices: CoverageFairChoice[] = [];
  // The fairest of the equal candidates for the first one's shift, and why.
  const fairest = (candidates: CoverageSuggestion[]): CoverageSuggestion | undefined => {
    const first = candidates[0];
    const fairness = options.fairness;
    if (!first || !fairness || first.kind !== "assign" || !first.employeeId) return first;
    const ranked = candidates
      .filter((candidate) => candidate.employeeId && samePeer(first, candidate))
      .map((candidate, order) => ({
        candidate,
        order,
        key: standingKey(
          fairness.standing(
            candidate.employeeId!,
            candidate.subject.dateKey,
            candidate.subject.assignmentId,
            overrides,
          ),
        ),
      }))
      .sort((left, right) => {
        const index = left.key.findIndex((value, position) => value !== right.key[position]);
        return index >= 0 ? left.key[index] - right.key[index] : left.order - right.order;
      });
    const [best, runnerUp] = ranked;
    const decided = runnerUp
      ? best.key.findIndex((value, position) => value < runnerUp.key[position])
      : -1;
    choices.push({
      suggestionId: best.candidate.id,
      employeeId: best.candidate.employeeId!,
      dateKey: best.candidate.subject.dateKey,
      reason: !runnerUp ? "only" : decided >= 0 ? FAIRNESS_REASONS[decided] : "tie",
      count: best.key[decided >= 0 ? decided : FAIRNESS_REASONS.indexOf("hours")],
      others: ranked.length - 1,
    });
    return best.candidate;
  };
  const overrides: CoverageDayOverride[] = [...(options.baseOverrides ?? [])];
  const reach = options.availabilityWith ? 0 : 1;
  const clashes = (override: CoverageDayOverride) =>
    overrides.some(
      (planned) =>
        planned.employeeId === override.employeeId &&
        Math.abs(dayNumber(planned.dateKey) - dayNumber(override.dateKey)) <= reach,
    );
  const leftOut = options.excludedEmployeeIds ?? new Set<string>();
  const withLeftOut = (next: CoverageSuggestionInput): CoverageSuggestionInput =>
    leftOut.size === 0
      ? next
      : {
          ...next,
          availability: (employeeId, dateKey, assignmentId) =>
            leftOut.has(employeeId)
              ? { kind: "excluded" }
              : next.availability(employeeId, dateKey, assignmentId),
        };
  const withPlanned = (): CoverageSuggestionInput => {
    const next = withDraftOverrides(input, overrides);
    return withLeftOut(
      options.availabilityWith
        ? { ...next, availability: options.availabilityWith(overrides) }
        : next,
    );
  };
  let ruledOut: CoverageRuledOut[] = [];
  // A fix goes over when it adds hours to a week that ends up past the threshold.
  const goesOver = (suggestion: CoverageSuggestion) => {
    if (!overtime) return [];
    const planned = [...overrides, ...suggestion.overrides];
    return suggestion.overrides.filter((override) => {
      if (override.side !== "draft" || override.day.assignmentIds.length === 0) return false;
      const after = overtime.weekHours(override.employeeId, override.dateKey, planned);
      return (
        after > overtime.thresholdHours + EPSILON &&
        after > overtime.weekHours(override.employeeId, override.dateKey, overrides) + EPSILON
      );
    });
  };
  const finish = (final: CoverageSuggestionInput): PlanWithLeftovers => ({
    fixes: plan,
    ruledOut,
    final,
    overThreshold: overtime
      ? taken.map((entry) => ({
          ...entry,
          hours: overtime.weekHours(entry.employeeId, entry.dateKey, overrides),
        }))
      : [],
    choices,
  });
  let current = overrides.length > 0 ? withPlanned() : withLeftOut(input);
  const take = (next: CoverageSuggestion) => {
    for (const override of goesOver(next)) {
      taken.push({
        employeeId: override.employeeId,
        dateKey: override.dateKey,
        suggestionId: next.id,
      });
    }
    plan.push(next);
    overrides.push(...next.overrides);
    current = withPlanned();
  };
  // One shift at a time to whoever is furthest below their usual days in a
  // week, in the least-staffed shift they can take, even one already staffed.
  const topUpSteps = (rule: CoverageTopUpRule) => {
    // The period's dates: the input loads more around it, for moves into the next week.
    const dateKeys = current.matrix.dateKeys.filter(
      (dateKey) => options.dateKey == null || dateKey === options.dateKey,
    );
    const weeks = [...new Set(dateKeys.map(getScheduleWeekStartDate))];
    // Only people who work in the period: someone with no shifts is left alone, as with days off.
    const people = input.people.filter(
      (person) =>
        person.active &&
        rule.employeeIds.includes(person.id) &&
        !leftOut.has(person.id) &&
        dateKeys.some((dateKey) => current.draftDay(person.id, dateKey).assignmentIds.length > 0),
    );
    const exhausted = new Set<string>();
    const candidatesFor = (personId: string, focusAreaIds: number[], week: string) => {
      const found: {
        dateKey: string;
        rowKey: string;
        focusAreaId: number;
        cell: CoverageMatrixCell;
        assignmentId: number;
      }[] = [];
      for (const dateKey of dateKeys) {
        if (getScheduleWeekStartDate(dateKey) !== week) continue;
        const day = current.draftDay(personId, dateKey);
        if (
          day.assignmentIds.length > 0 ||
          day.absenceTypeId != null ||
          day.restOfDayAbsenceTypeId != null ||
          current.hasRequest(personId, dateKey)
        ) {
          continue;
        }
        const index = current.matrix.dateKeys.indexOf(dateKey);
        for (const row of current.matrix.rows) {
          if (options.rowKeys && !options.rowKeys.has(row.rowKey)) continue;
          if (!focusAreaIds.includes(row.focusAreaId)) continue;
          const cell = row.cells[index];
          if (!cell || cell.past) continue;
          if (cell.draft.maximum != null && cell.draft.actual + 1 > cell.draft.maximum + EPSILON) {
            continue;
          }
          const assignmentId = [
            cell.preferredOpenAssignmentDefinitionId,
            ...cell.eligibleAssignmentDefinitionIds,
          ].find(
            (id) =>
              current.qualifiedFor(personId, id) &&
              current.availability(personId, dateKey, id).kind === "free",
          );
          if (assignmentId == null) continue;
          found.push({
            dateKey,
            rowKey: row.rowKey,
            focusAreaId: row.focusAreaId,
            cell,
            assignmentId,
          });
        }
      }
      return found;
    };
    const suggestionFor = (
      personId: string,
      candidate: ReturnType<typeof candidatesFor>[number],
    ): CoverageSuggestion | null => {
      const overridesHere: CoverageDayOverride[] = [
        {
          employeeId: personId,
          dateKey: candidate.dateKey,
          side: "draft",
          day: {
            ...withAssignments(current.draftDay(personId, candidate.dateKey), [
              candidate.assignmentId,
            ]),
            restOfDayAbsenceTypeId: null,
          },
        },
      ];
      const measurement = measureCoverageChange(current, overridesHere);
      if (
        measurement.opens > 0 ||
        measurement.worsened > 0 ||
        measurement.effects.some((effect) => effect.past || pastMaximum(effect)) ||
        !measurement.effects.some((effect) => effect.rowKey === candidate.rowKey)
      ) {
        return null;
      }
      return assignFix(personId, candidate, overridesHere, measurement);
    };
    return (): CoverageSuggestion | null => {
      for (;;) {
        let neediest: {
          person: CoverageSuggestionPerson;
          week: string;
          days: number;
          short: number;
        } | null = null;
        for (const week of weeks) {
          for (const person of people) {
            if (exhausted.has(`${person.id}|${week}`)) continue;
            const days = rule.weekDays(person.id, week, overrides);
            const short = rule.target(person.id) - days;
            if (short > 0 && (!neediest || short > neediest.short)) {
              neediest = { person, week, days, short };
            }
          }
        }
        if (!neediest) return null;
        const { person, week, days } = neediest;
        const ranked = candidatesFor(person.id, person.focusAreaIds, week)
          .map((candidate) => {
            const standing = options.fairness?.standing(
              person.id,
              candidate.dateKey,
              candidate.assignmentId,
              overrides,
            );
            const { actual, required } = candidate.cell.draft;
            return {
              candidate,
              // Short shifts first, then the one this person adds least to in
              // proportion, so a one-person shift is the last to get a second.
              key: [
                standing?.splitsDaysOff ? 1 : 0,
                PREFERENCE_RANK[standing?.preference ?? "none"],
                Math.min(0, actual - required),
                (actual + 1) / Math.max(required, EPSILON),
                actual,
                dayNumber(candidate.dateKey),
              ],
            };
          })
          .sort((left, right) => {
            const index = left.key.findIndex((value, position) => value !== right.key[position]);
            return index >= 0 ? left.key[index] - right.key[index] : 0;
          });
        // Past 40 hours only when every shift they could take goes over.
        let chosen: CoverageSuggestion | null = null;
        let over: CoverageSuggestion | null = null;
        for (const { candidate } of ranked) {
          const suggestion = suggestionFor(person.id, candidate);
          if (!suggestion) continue;
          if (goesOver(suggestion).length === 0) {
            chosen = suggestion;
            break;
          }
          over ??= suggestion;
        }
        chosen ??= over;
        if (!chosen) {
          exhausted.add(`${person.id}|${week}`);
          continue;
        }
        choices.push({
          suggestionId: chosen.id,
          employeeId: person.id,
          dateKey: chosen.subject.dateKey,
          reason: "weekDays",
          count: days,
          others: 0,
        });
        return chosen;
      }
    };
  };
  const peopleById = new Map(input.people.map((person) => [person.id, person]));
  const dayIn = (
    planned: ReadonlyArray<CoverageDayOverride>,
    employeeId: string,
    dateKey: string,
  ) =>
    planned.findLast(
      (override) =>
        override.side === "draft" &&
        override.employeeId === employeeId &&
        override.dateKey === dateKey,
    )?.day ?? input.draftDay(employeeId, dateKey);
  const isFree = (
    planned: ReadonlyArray<CoverageDayOverride>,
    employeeId: string,
    dateKey: string,
    assignmentId: number,
  ) => {
    if (leftOut.has(employeeId) || current.hasRequest(employeeId, dateKey)) return false;
    if (!options.availabilityWith) {
      const near = planned.some(
        (day) =>
          day.employeeId === employeeId &&
          Math.abs(dayNumber(day.dateKey) - dayNumber(dateKey)) <= 1,
      );
      return !near && input.availability(employeeId, dateKey, assignmentId).kind === "free";
    }
    return options.availabilityWith(planned)(employeeId, dateKey, assignmentId).kind === "free";
  };
  const withShift = (
    planned: ReadonlyArray<CoverageDayOverride>,
    employeeId: string,
    dateKey: string,
    assignmentId: number,
  ): CoverageDayOverride => ({
    employeeId,
    dateKey,
    side: "draft",
    day: {
      ...withAssignments(dayIn(planned, employeeId, dateKey), [assignmentId]),
      restOfDayAbsenceTypeId: null,
    },
  });
  // A gap nobody free can fill may still close by moving someone this build
  // gave a shift within a week of it: they take the gap, and someone free
  // takes the shift they leave unless it stays staffed without them. The
  // draft, recurring fills, restores and moves back stay where they are.
  const rebalanceStep = (): boolean => {
    for (const gap of shortCells(current.matrix)) {
      if (options.dateKey != null && gap.cell.dateKey !== options.dateKey) continue;
      if (options.rowKeys && !options.rowKeys.has(gap.rowKey)) continue;
      const to = gap.cell.dateKey;
      const tryOrder = cellAssignments(gap.cell);
      for (const placed of plan) {
        const personId = placed.employeeId;
        if (placed.kind !== "assign" || !personId) continue;
        const from = placed.subject.dateKey;
        if (Math.abs(dayNumber(from) - dayNumber(to)) >= 7) continue;
        if (!peopleById.get(personId)?.focusAreaIds.includes(gap.focusAreaId)) continue;
        const assignmentId = tryOrder.find((id) => current.qualifiedFor(personId, id));
        if (assignmentId == null) continue;
        const rest = overrides.filter((override) => !placed.overrides.includes(override));
        if (from !== to && rest.some((day) => day.employeeId === personId && day.dateKey === to)) {
          continue;
        }
        if (!isFree(rest, personId, to, assignmentId)) continue;
        const moved = withShift(rest, personId, to, assignmentId);
        const back: CoverageDayOverride[] =
          from === to
            ? []
            : [
                {
                  employeeId: personId,
                  dateKey: from,
                  side: "draft",
                  day: dayIn(rest, personId, from),
                },
              ];
        const target = { ...gap, assignmentId, dateKey: to };
        const alone = measureCoverageChange(current, [...back, moved]);
        if (keeps(alone)) {
          replace(placed, [assignFix(personId, target, [moved], alone)]);
          return true;
        }
        const left = { ...placed.subject };
        const afterMove = [...rest, moved];
        const backfills: CoverageSuggestion[] = [];
        const leftCell = cellLookup(current.matrix).get(`${left.rowKey}|${from}`);
        const leftOrder = [left.assignmentId, ...(leftCell?.eligibleAssignmentDefinitionIds ?? [])];
        for (const other of input.people) {
          if (other.id === personId || !other.active) continue;
          if (!other.focusAreaIds.includes(left.focusAreaId)) continue;
          const otherId = other.id;
          if (dayIn(afterMove, otherId, from).assignmentIds.some((id) => leftOrder.includes(id))) {
            continue;
          }
          const fillId = leftOrder.find((id) => current.qualifiedFor(otherId, id));
          if (fillId == null || !isFree(afterMove, otherId, from, fillId)) continue;
          const fill = withShift(afterMove, otherId, from, fillId);
          const measurement = measureCoverageChange(current, [...back, moved, fill]);
          if (keeps(measurement)) {
            backfills.push(
              assignFix(otherId, { ...left, assignmentId: fillId }, [fill], measurement),
            );
          }
        }
        const backfill = fairest(backfills);
        if (!backfill) continue;
        replace(placed, [assignFix(personId, target, [moved], alone), backfill]);
        return true;
      }
    }
    return false;
  };
  // Swaps a planned shift for the fixes that take its place, with their reasons.
  const replace = (placed: CoverageSuggestion, next: CoverageSuggestion[]) => {
    plan.splice(plan.indexOf(placed), 1);
    for (const override of placed.overrides) overrides.splice(overrides.indexOf(override), 1);
    for (let index = taken.length - 1; index >= 0; index -= 1) {
      if (taken[index].suggestionId === placed.id) taken.splice(index, 1);
    }
    for (let index = choices.length - 1; index >= 0; index -= 1) {
      if (choices[index].suggestionId === placed.id) choices.splice(index, 1);
    }
    const [moved] = next;
    choices.push({
      suggestionId: moved.id,
      employeeId: moved.employeeId!,
      dateKey: moved.subject.dateKey,
      reason: "moved",
      count: 0,
      others: 0,
    });
    for (const fix of next) take(fix);
  };
  const rebalance = function* (): Generator<CoverageBuildProgress> {
    for (let step = 0; step < 200 && rebalanceStep(); step += 1) {
      filled = Math.max(filled, needed - countOpen(current.matrix, options.rowKeys).staffShort);
      yield { placed: plan.length, filled: Math.min(filled, needed), needed };
    }
  };
  const needed = countOpen(current.matrix, options.rowKeys).staffShort;
  let filled = 0;
  // Every fix kept closes or fills a gap, so the loop ends; the bound is a backstop.
  for (let step = 0; step < 500; step += 1) {
    const pass = suggestCoverageFixes(current);
    ruledOut = pass.ruledOut;
    const eligible = pass.suggestions.filter(
      (suggestion) =>
        DRAFT_KINDS.has(suggestion.kind) &&
        suggestion.targets.some(
          (target) =>
            (options.dateKey == null || target.dateKey === options.dateKey) &&
            (options.rowKeys == null || options.rowKeys.has(target.rowKey)),
        ) &&
        !suggestion.overrides.some(clashes) &&
        // A restore or move back changes the person too.
        !(suggestion.employeeId && leftOut.has(suggestion.employeeId)),
    );
    const within = eligible.filter((suggestion) => goesOver(suggestion).length === 0);
    const next = fairest(within.length > 0 ? within : eligible);
    if (!next) break;
    take(next);
    filled += next.filled;
    yield { placed: plan.length, filled: Math.min(filled, needed), needed };
  }
  yield* rebalance();
  if (options.topUp) {
    const steps = topUpSteps(options.topUp);
    for (let next = steps(); next; next = steps()) {
      take(next);
      yield { placed: plan.length, filled: Math.min(filled, needed), needed };
    }
  }
  return finish(current);
}

/** What a build would do to the draft, counted exactly before anything changes. */
export interface CoverageBuildPreview {
  /** In the order they will be applied, after the base days. */
  fixes: CoverageSuggestion[];
  /** The base days (recurring schedule fills) that are shifts and absences. */
  recurring: { shifts: number; absences: number };
  counts: { assign: number; restore: number; moveBack: number };
  /** Distinct people the build changes. */
  people: number;
  /** Short and over cells that have not started, before and after. */
  shortBefore: number;
  shortAfter: number;
  overBefore: number;
  overAfter: number;
  /** People still needed across those cells, before and after (mentored credit counts). */
  staffShortBefore: number;
  staffShortAfter: number;
  /** Why each qualified person was not scheduled into a shift the build leaves short. */
  skipped: CoverageRuledOut[];
  /** Fixes taken over the overtime threshold because no other fix was left. */
  overThreshold: CoverageOverThreshold[];
  /** Why each shift went to its person, when fairness chose between people. */
  choices: CoverageFairChoice[];
  /** Recurring schedule fills per person, in the order first filled. */
  recurringPeople: { employeeId: string; shifts: number; absences: number }[];
  /** Shifts still short after the build that have not started, by date then row. */
  shortCells: { rowKey: string; dateKey: string; staffShort: number }[];
  /** Recurring fills left out for the days-in-a-row limit. */
  recurringSkipped: CoverageSkippedRecurring[];
  /** Empty days the build marks with the day off absence; added by the caller. */
  daysOff: { employeeId: string; dateKey: string }[];
  /** Empty days left blank, one for each day a week someone is short of their usual days; added by the caller. */
  blankDays: { employeeId: string; dateKey: string }[];
  /** Days the build gives someone a sixth day in a row, when allowed; added by the caller. */
  sixthDays: { employeeId: string; dateKey: string }[];
  /** Weeks the build gives someone a sixth day, when allowed; added by the caller. */
  sixthWeeks: { employeeId: string; weekStart: string }[];
  /** People the scheduler left out of the build. */
  excluded: string[];
}

/** Short and over cells that have not started, within the given rows. */
function countOpen(matrix: CoverageMatrix, rowKeys?: ReadonlySet<string>) {
  let short = 0;
  let over = 0;
  let staffShort = 0;
  for (const row of matrix.rows) {
    if (rowKeys && !rowKeys.has(row.rowKey)) continue;
    for (const cell of row.cells) {
      if (!cell || cell.past) continue;
      if (cell.kind === "short") {
        short += 1;
        staffShort += shortageOf(cell.draft);
      }
      if (cell.kind === "over") over += 1;
    }
  }
  return { short, over, staffShort: Math.round(staffShort * 1e6) / 1e6 };
}

/** Plans a build with {@link planCoverageFixes} and counts its result. */
export function previewCoverageBuild(
  input: CoverageSuggestionInput,
  options: PlanCoverageFixesOptions = {},
): CoverageBuildPreview {
  return summarizeBuild(input, options, planWithLeftovers(input, options));
}

export interface CoverageBuildPacing {
  /** Awaited after each fix is placed, so the caller can let the page draw. */
  pause: () => Promise<void>;
  onProgress?: (progress: CoverageBuildProgress) => void;
}

/** {@link previewCoverageBuild}, handing control back between fixes. */
export async function previewCoverageBuildAsync(
  input: CoverageSuggestionInput,
  options: PlanCoverageFixesOptions,
  pacing: CoverageBuildPacing,
): Promise<CoverageBuildPreview> {
  const steps = planSteps(input, options);
  for (let step = steps.next(); ; step = steps.next()) {
    if (step.done) return summarizeBuild(input, options, step.value);
    pacing.onProgress?.(step.value);
    await pacing.pause();
  }
}

function summarizeBuild(
  input: CoverageSuggestionInput,
  options: PlanCoverageFixesOptions,
  { fixes, ruledOut, final, overThreshold, choices }: PlanWithLeftovers,
): CoverageBuildPreview {
  const base = options.baseOverrides ?? [];
  const after = withDraftOverrides(input, [...base, ...fixes.flatMap((fix) => fix.overrides)]);
  const stillShort = new Set<string>();
  const shortCells: CoverageBuildPreview["shortCells"] = [];
  for (const row of final.matrix.rows) {
    if (options.rowKeys && !options.rowKeys.has(row.rowKey)) continue;
    for (const cell of row.cells) {
      if (!cell || cell.past || cell.kind !== "short") continue;
      if (options.dateKey != null && cell.dateKey !== options.dateKey) continue;
      stillShort.add(`${row.rowKey}|${cell.dateKey}`);
      shortCells.push({
        rowKey: row.rowKey,
        dateKey: cell.dateKey,
        staffShort: Math.round(shortageOf(cell.draft) * 1e6) / 1e6,
      });
    }
  }
  const recurringByPerson = new Map<string, { shifts: number; absences: number }>();
  for (const day of base) {
    const counts = recurringByPerson.get(day.employeeId) ?? { shifts: 0, absences: 0 };
    if (day.day.assignmentIds.length > 0) counts.shifts += 1;
    else if (day.day.absenceTypeId != null) counts.absences += 1;
    recurringByPerson.set(day.employeeId, counts);
  }
  const before = countOpen(input.matrix, options.rowKeys);
  const result = countOpen(after.matrix, options.rowKeys);
  const counts = { assign: 0, restore: 0, moveBack: 0 };
  for (const fix of fixes) {
    if (fix.kind === "assign" || fix.kind === "restore" || fix.kind === "moveBack") {
      counts[fix.kind] += 1;
    }
  }
  return {
    fixes,
    recurring: {
      shifts: base.filter((day) => day.day.assignmentIds.length > 0).length,
      absences: base.filter(
        (day) => day.day.assignmentIds.length === 0 && day.day.absenceTypeId != null,
      ).length,
    },
    counts,
    people: new Set([...base.map((day) => day.employeeId), ...fixes.map((fix) => fix.employeeId)])
      .size,
    shortBefore: before.short,
    shortAfter: result.short,
    overBefore: before.over,
    overAfter: result.over,
    staffShortBefore: before.staffShort,
    staffShortAfter: result.staffShort,
    skipped: ruledOut.filter((entry) => stillShort.has(`${entry.rowKey}|${entry.dateKey}`)),
    overThreshold,
    choices,
    recurringSkipped: [...(options.skippedRecurring ?? [])],
    daysOff: [],
    blankDays: [],
    sixthDays: [],
    sixthWeeks: [],
    excluded: [...(options.excludedEmployeeIds ?? [])],
    recurringPeople: [...recurringByPerson.entries()]
      .filter(([, counts]) => counts.shifts + counts.absences > 0)
      .map(([employeeId, counts]) => ({ employeeId, ...counts })),
    shortCells: shortCells.sort(
      (left, right) =>
        left.dateKey.localeCompare(right.dateKey) ||
        final.matrix.rows.findIndex((row) => row.rowKey === left.rowKey) -
          final.matrix.rows.findIndex((row) => row.rowKey === right.rowKey),
    ),
  };
}
