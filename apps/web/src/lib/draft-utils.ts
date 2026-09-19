import type { ShiftMap } from "@/types";
import { expandDelimitedTimeRanges } from "@/lib/shift-diff-badges";

/** One side of a published-cell comparison, in the shape both the draft map and publish history can supply. */
export interface CellChangeSide {
  segments: ReadonlyArray<{ shiftId: number | null; jobId: number; isMentored?: boolean }>;
  absenceTypeId: number | null;
  customStartTime: string | null;
  customEndTime: string | null;
}

/**
 * How many shifts a change to an already-published cell added without
 * touching what was there. Adding a second shift beside a published one makes
 * a double shift, and the grid already rings that pill green as "new"; the
 * cell-level `draftKind` still says "modified", so the banner used to count it
 * as an edit. Returns 0 when anything published changed (replaced, removed,
 * reordered, retimed, or an absence swapped), so those stay edits.
 */
export function countShiftsAddedToPublishedCell(
  before: CellChangeSide,
  after: CellChangeSide,
): number {
  if (before.segments.length === 0 || after.segments.length <= before.segments.length) return 0;
  if ((before.absenceTypeId ?? null) !== (after.absenceTypeId ?? null)) return 0;

  const beforeTimes = expandDelimitedTimeRanges(
    before.customStartTime,
    before.customEndTime,
    before.segments.length,
  );
  const afterTimes = expandDelimitedTimeRanges(
    after.customStartTime,
    after.customEndTime,
    after.segments.length,
  );

  const preserved = before.segments.every((segment, index) => {
    const other = after.segments[index];
    return (
      !!other &&
      (segment.shiftId ?? null) === (other.shiftId ?? null) &&
      segment.jobId === other.jobId &&
      (segment.isMentored ?? false) === (other.isMentored ?? false) &&
      beforeTimes[index]?.start === afterTimes[index]?.start &&
      beforeTimes[index]?.end === afterTimes[index]?.end
    );
  });

  return preserved ? after.segments.length - before.segments.length : 0;
}

/**
 * How many changes one draft cell contributes to a total: the added shifts
 * when that is all that changed, otherwise the cell itself. Keeps the headline
 * count, the per-editor rows, the out-of-window groups, and the server audit
 * summary agreeing with the chips.
 */
export function countDraftEntryChanges(entry: ShiftMap[string]): number {
  if (entry.draftKind == null) return 0;
  if (entry.draftKind !== "modified") return 1;
  return Math.max(1, countShiftsAddedToPublishedEntry(entry));
}

/** Splits a `modified` draft cell into the added-shift count the banner should report as new. */
export function countShiftsAddedToPublishedEntry(entry: ShiftMap[string]): number {
  const toSegments = (
    segments: ShiftMap[string]["segments"],
    assignmentIds: number[] | undefined,
  ) =>
    segments && segments.length > 0
      ? segments
      : (assignmentIds ?? []).map((id) => ({ shiftId: id, jobId: -1 }));
  return countShiftsAddedToPublishedCell(
    {
      segments: toSegments(entry.publishedSegments, entry.publishedAssignmentDefinitionIds),
      absenceTypeId: entry.publishedAbsenceTypeId ?? null,
      customStartTime: entry.publishedCustomStartTime ?? null,
      customEndTime: entry.publishedCustomEndTime ?? null,
    },
    {
      segments: toSegments(entry.segments, entry.assignmentIds),
      absenceTypeId: entry.absenceTypeId ?? null,
      customStartTime: entry.customStartTime ?? null,
      customEndTime: entry.customEndTime ?? null,
    },
  );
}

export interface DraftBreakdown {
  newShifts: number;
  modifiedShifts: number;
  deletedShifts: number;
  newNotes: number;
  deletedNotes: number;
  totalChanges: number;
}

export interface DateRangeFilter {
  /** Inclusive lower bound, formatted as YYYY-MM-DD (local). */
  startDateKey: string;
  /** Inclusive upper bound, formatted as YYYY-MM-DD (local). */
  endDateKey: string;
}

/**
 * Extracts the YYYY-MM-DD date suffix from a shift or note map key.
 * - Shift keys: `${empId}_${dateKey}`
 * - Note keys: `${empId}_${dateKey}` or `${empId}_${dateKey}_${focusAreaId}`
 * Returns null if the key doesn't contain a recognizable date segment.
 */
export function extractDateKeyFromCellKey(key: string): string | null {
  const parts = key.split("_");
  if (parts.length < 2) return null;
  const candidate = parts[1] ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

function isInRange(dateKey: string, range?: DateRangeFilter): boolean {
  if (!range) return true;
  return dateKey >= range.startDateKey && dateKey <= range.endDateKey;
}

export function computeDraftBreakdown(
  shifts: ShiftMap,
  notes: Record<
    string,
    { indicatorTypeId: number; status: "published" | "draft" | "draft_deleted" }[]
  >,
  range?: DateRangeFilter,
): DraftBreakdown {
  let newShifts = 0;
  let modifiedShifts = 0;
  let deletedShifts = 0;
  let newNotes = 0;
  let deletedNotes = 0;

  for (const [key, entry] of Object.entries(shifts)) {
    if (entry.draftKind == null) continue;
    if (range) {
      const dateKey = extractDateKeyFromCellKey(key);
      if (!dateKey || !isInRange(dateKey, range)) continue;
    }
    switch (entry.draftKind) {
      case "new":
        newShifts++;
        break;
      case "modified": {
        const added = countShiftsAddedToPublishedEntry(entry);
        if (added > 0) newShifts += added;
        else modifiedShifts++;
        break;
      }
      case "deleted":
        deletedShifts++;
        break;
    }
  }

  for (const [key, noteList] of Object.entries(notes)) {
    if (range) {
      const dateKey = extractDateKeyFromCellKey(key);
      if (!dateKey || !isInRange(dateKey, range)) continue;
    }
    for (const note of noteList) {
      if (note.status === "draft") newNotes++;
      if (note.status === "draft_deleted") deletedNotes++;
    }
  }

  return {
    newShifts,
    modifiedShifts,
    deletedShifts,
    newNotes,
    deletedNotes,
    totalChanges: newShifts + modifiedShifts + deletedShifts + newNotes + deletedNotes,
  };
}

export interface OutOfWindowDraftGroup {
  /** Sortable key — the YYYY-MM-DD start of the grouping period. */
  periodKey: string;
  /** Local Date for the period's first day, suitable for navigation. */
  periodStart: Date;
  /** Total draft count (shifts + notes) in this period. */
  count: number;
}

/**
 * Groups draft-bearing dates that fall OUTSIDE the given window into period
 * buckets (defined by `getPeriodKey` / `parsePeriodKey` so callers can decide
 * whether buckets are weeks, pay periods, or months — matching the user's
 * current view granularity). Used to surface "you also have N drafts in
 * other weeks" so the user knows the banner publish won't touch them.
 */
export function computeOutOfWindowDraftGroups(
  shifts: ShiftMap,
  notes: Record<
    string,
    { indicatorTypeId: number; status: "published" | "draft" | "draft_deleted" }[]
  >,
  window: DateRangeFilter,
  getPeriodKey: (dateKey: string) => string,
  parsePeriodKey: (periodKey: string) => Date,
): OutOfWindowDraftGroup[] {
  const counts = new Map<string, number>();

  const tally = (dateKey: string | null, count: number) => {
    if (!dateKey) return;
    if (isInRange(dateKey, window)) return;
    const periodKey = getPeriodKey(dateKey);
    counts.set(periodKey, (counts.get(periodKey) ?? 0) + count);
  };

  for (const [key, entry] of Object.entries(shifts)) {
    if (entry.draftKind == null) continue;
    tally(extractDateKeyFromCellKey(key), countDraftEntryChanges(entry));
  }

  for (const [key, noteList] of Object.entries(notes)) {
    const dateKey = extractDateKeyFromCellKey(key);
    if (!dateKey || isInRange(dateKey, window)) continue;
    const periodKey = getPeriodKey(dateKey);
    for (const note of noteList) {
      if (note.status === "draft" || note.status === "draft_deleted") {
        counts.set(periodKey, (counts.get(periodKey) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([periodKey, count]) => ({
      periodKey,
      periodStart: parsePeriodKey(periodKey),
      count,
    }));
}

export function draftBreakdownsEqual(left: DraftBreakdown, right: DraftBreakdown): boolean {
  return (
    left.newShifts === right.newShifts &&
    left.modifiedShifts === right.modifiedShifts &&
    left.deletedShifts === right.deletedShifts &&
    left.newNotes === right.newNotes &&
    left.deletedNotes === right.deletedNotes &&
    left.totalChanges === right.totalChanges
  );
}

export function formatDraftBreakdownSummary(breakdown: DraftBreakdown): string {
  const parts: string[] = [];

  if (breakdown.newShifts > 0) {
    parts.push(`${breakdown.newShifts} new shift${breakdown.newShifts === 1 ? "" : "s"}`);
  }
  if (breakdown.modifiedShifts > 0) {
    parts.push(
      `${breakdown.modifiedShifts} edited shift${breakdown.modifiedShifts === 1 ? "" : "s"}`,
    );
  }
  if (breakdown.deletedShifts > 0) {
    parts.push(
      `${breakdown.deletedShifts} deleted shift${breakdown.deletedShifts === 1 ? "" : "s"}`,
    );
  }
  if (breakdown.newNotes > 0) {
    parts.push(`${breakdown.newNotes} new note${breakdown.newNotes === 1 ? "" : "s"}`);
  }
  if (breakdown.deletedNotes > 0) {
    parts.push(`${breakdown.deletedNotes} removed note${breakdown.deletedNotes === 1 ? "" : "s"}`);
  }

  return parts.length > 0 ? parts.join(", ") : "No unpublished changes";
}
