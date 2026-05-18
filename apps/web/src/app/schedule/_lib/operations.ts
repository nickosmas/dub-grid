import type { Employee, ScheduleCellInput, ShiftMap } from "@/types";
import { addDays, formatDate, formatDateKey, getEmployeeDisplayName } from "@/lib/utils";
import type { UpsertShiftBatchItem } from "@/features/schedule/client";

export type { ScheduleCellInput } from "@/types";

export type ScheduleOperation = {
  kind: "autofill" | "import_previous" | "repeat_series";
  title: string;
  detail?: string;
  progress: number;
};

export const IMPORT_PREVIOUS_BATCH_SIZE = 20;
export const DRAFT_CHANGED_BROADCAST_KEY = "draft_changed";
export const OPERATION_MODAL_DISMISS_MS = 450;
export const PUBLISH_WINDOW_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export type DisqualifiedImportShift = {
  empName: string;
  date: string;
  reason: string;
};

export type ImportPreviousPlan = {
  upsertItems: UpsertShiftBatchItem[];
  shiftUpdates: Record<string, ShiftMap[string]>;
  disqualified: DisqualifiedImportShift[];
};

export type PlanImportPreviousArgs = {
  days: number;
  sourceStart: Date;
  weekStart: Date;
  employees: Employee[];
  shifts: ShiftMap;
  /** Returns null if qualified, or a human-readable reason if not. */
  checkQualification: (empId: string, assignmentIds: number[]) => string | null;
  buildEntryPayload: (entry: ShiftMap[string]) => ScheduleCellInput;
  currentUserId: string | null;
};

/**
 * Walks the source/target grid once and computes the full import plan.
 *
 * Shared by both the preview (counts what will land) and the executor (does
 * the inserts), so the two cannot drift apart. The qualification filter is
 * applied here — disqualified shifts are returned separately so the UI can
 * surface them before the user confirms.
 */
export function planImportPrevious(
  args: PlanImportPreviousArgs,
): ImportPreviousPlan {
  const {
    days,
    sourceStart,
    weekStart,
    employees,
    shifts,
    checkQualification,
    buildEntryPayload,
    currentUserId,
  } = args;

  const upsertItems: UpsertShiftBatchItem[] = [];
  const shiftUpdates: Record<string, ShiftMap[string]> = {};
  const disqualified: DisqualifiedImportShift[] = [];

  for (let i = 0; i < days; i++) {
    const sourceDate = addDays(sourceStart, i);
    const targetDate = addDays(weekStart, i);
    const sourceDateKey = formatDateKey(sourceDate);
    const targetDateKey = formatDateKey(targetDate);

    for (const emp of employees) {
      const sourceKey = `${emp.id}_${sourceDateKey}`;
      const targetKey = `${emp.id}_${targetDateKey}`;
      const sourceShift = shifts[sourceKey];

      if (
        !sourceShift ||
        (sourceShift.assignmentIds.length === 0 && sourceShift.absenceTypeId == null) ||
        sourceShift.isDelete ||
        shifts[targetKey]
      ) {
        continue;
      }

      if (sourceShift.assignmentIds.length > 0) {
        const disqualifyReason = checkQualification(
          emp.id,
          sourceShift.assignmentIds,
        );
        if (disqualifyReason) {
          disqualified.push({
            empName: getEmployeeDisplayName(emp),
            date: formatDate(targetDate),
            reason: disqualifyReason,
          });
          continue;
        }
      }

      shiftUpdates[targetKey] = {
        label: sourceShift.label,
        assignmentIds: sourceShift.assignmentIds,
        absenceTypeId: sourceShift.absenceTypeId,
        isDraft: true,
        draftKind: "new",
        publishedAssignmentDefinitionIds: [],
        publishedLabel: "",
        updatedBy: currentUserId,
      };

      upsertItems.push({
        employeeId: emp.id,
        date: targetDateKey,
        input: buildEntryPayload(sourceShift),
      });
    }
  }

  return { upsertItems, shiftUpdates, disqualified };
}
