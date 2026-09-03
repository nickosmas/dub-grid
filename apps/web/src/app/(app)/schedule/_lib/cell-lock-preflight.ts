import type { CellLock } from "@/hooks/useCellLocks";
import { extractDateKeyFromCellKey, type DateRangeFilter } from "@/lib/draft-utils";

type ImportOutcome = {
  employeeId: string;
  targetDate: string;
  outcome: "imported" | "skipped";
};

export function findConflictingCellLock(
  locks: Iterable<CellLock>,
  cellKeys: Iterable<string>,
  seriesIds: Iterable<string> = [],
  resolveSeriesId?: (cellKey: string) => string | null,
): CellLock | null {
  const targetCells = new Set(cellKeys);
  const targetSeries = new Set(seriesIds);

  for (const lock of locks) {
    if (targetCells.has(lock.cellKey)) return lock;
    const seriesId = lock.seriesId ?? resolveSeriesId?.(lock.cellKey) ?? null;
    if (seriesId && targetSeries.has(seriesId)) return lock;
  }

  return null;
}

export function getLockedCellKeysInRange(
  locks: Iterable<CellLock>,
  range: DateRangeFilter,
): string[] {
  const keys: string[] = [];
  for (const lock of locks) {
    const dateKey = extractDateKeyFromCellKey(lock.cellKey);
    if (dateKey && dateKey >= range.startDateKey && dateKey <= range.endDateKey) {
      keys.push(lock.cellKey);
    }
  }
  return keys;
}

export function getImportTargetCellKeys(outcomes: Iterable<ImportOutcome>): string[] {
  const keys: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.outcome === "imported") {
      keys.push(`${outcome.employeeId}_${outcome.targetDate}`);
    }
  }
  return keys;
}

export function formatCellLockMessage(lock: CellLock): string {
  return lock.owner === "same_account"
    ? "This cell is open in another tab or device for your account."
    : `This cell is being edited by ${lock.userName}.`;
}
