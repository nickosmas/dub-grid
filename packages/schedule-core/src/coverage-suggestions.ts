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
import { formatLocalDateKey, parseLocalDateKey } from "./dates";

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
  | { kind: "unverified"; dateKey: string };

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

function keeps(measurement: CoverageMeasurement): boolean {
  return (
    (measurement.closes > 0 || measurement.filled > 0) &&
    measurement.opens === 0 &&
    measurement.worsened === 0 &&
    !measurement.effects.some((effect) => effect.past)
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

export interface PlanCoverageFixesOptions {
  /** Only fixes for this date. */
  dateKey?: string;
  /** Only fixes for these requirement rows, such as one focus area's. */
  rowKeys?: ReadonlySet<string>;
  /**
   * Availability once the planned days are written, from the caller's own
   * shift times. Without it, a person a fix changed is not used again on that
   * day or the days either side, since overnight work could overlap.
   */
  availabilityWith?: (
    planned: ReadonlyArray<CoverageDayOverride>,
  ) => CoverageSuggestionInput["availability"];
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
  const plan: CoverageSuggestion[] = [];
  const overrides: CoverageDayOverride[] = [];
  const reach = options.availabilityWith ? 0 : 1;
  const clashes = (override: CoverageDayOverride) =>
    overrides.some(
      (planned) =>
        planned.employeeId === override.employeeId &&
        Math.abs(dayNumber(planned.dateKey) - dayNumber(override.dateKey)) <= reach,
    );
  let current = input;
  // Every fix kept closes or fills a gap, so the loop ends; the bound is a backstop.
  for (let step = 0; step < 500; step += 1) {
    const next = suggestCoverageFixes(current).suggestions.find(
      (suggestion) =>
        DRAFT_KINDS.has(suggestion.kind) &&
        suggestion.targets.some(
          (target) =>
            (options.dateKey == null || target.dateKey === options.dateKey) &&
            (options.rowKeys == null || options.rowKeys.has(target.rowKey)),
        ) &&
        !suggestion.overrides.some(clashes),
    );
    if (!next) return plan;
    plan.push(next);
    overrides.push(...next.overrides);
    current = withDraftOverrides(input, overrides);
    if (options.availabilityWith) {
      current = { ...current, availability: options.availabilityWith(overrides) };
    }
  }
  return plan;
}

/** What a build would do to the draft, counted exactly before anything changes. */
export interface CoverageBuildPreview {
  /** In the order they will be applied. */
  fixes: CoverageSuggestion[];
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
  const fixes = planCoverageFixes(input, options);
  const after = withDraftOverrides(
    input,
    fixes.flatMap((fix) => fix.overrides),
  );
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
    counts,
    people: new Set(fixes.map((fix) => fix.employeeId)).size,
    shortBefore: before.short,
    shortAfter: result.short,
    overBefore: before.over,
    overAfter: result.over,
    staffShortBefore: before.staffShort,
    staffShortAfter: result.staffShort,
  };
}
