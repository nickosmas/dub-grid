import type { ShiftMap } from "@/types";
import { scheduleCellSnapshotToInput } from "@/lib/schedule-cells";
import type { SuggestionWrite } from "./coverage-suggestions";

/**
 * What removing a run of absence days writes (every day emptied) and what its
 * Undo puts back (each day as it stood), in the shape `planUndo` reads (item 52).
 */
export function planAbsenceRunRemoval(
  employeeId: string,
  dateKeys: readonly string[],
  shifts: ShiftMap,
): { before: SuggestionWrite[]; writes: SuggestionWrite[] } {
  return {
    before: dateKeys.map((dateKey) => ({
      employeeId,
      dateKey,
      input: scheduleCellSnapshotToInput(shifts[`${employeeId}_${dateKey}`]?.effective),
    })),
    writes: dateKeys.map((dateKey) => ({ employeeId, dateKey, input: null })),
  };
}
