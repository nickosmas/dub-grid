import { computeShiftDurationHours } from "@/lib/dashboard-stats";
import type { ShiftCode } from "@/types";

export const PUBLISHED_SHIFT_COLS = [
  "emp_id",
  "date",
  "published_shift_code_ids",
  "published_absence_type_id",
  "published_custom_start_time",
  "published_custom_end_time",
].join(", ");

export interface PublishedShiftRow {
  emp_id: string;
  date: string;
  published_shift_code_ids: number[] | null;
  published_absence_type_id: number | null;
  published_custom_start_time: string | null;
  published_custom_end_time: string | null;
}

export interface PublishedScheduleEntry {
  kind: "shift" | "absence";
  empId: string;
  date: string;
  label: string;
  shiftCodeIds: number[];
  absenceTypeId: number | null;
  startTime: string | null;
  endTime: string | null;
  durationHours: number;
}

type PublishedShiftCode = Pick<
  ShiftCode,
  "label" | "defaultStartTime" | "defaultEndTime"
>;

function pickPipeTime(
  value: string | null | undefined,
  which: "first" | "last",
): string | null {
  if (!value) return null;
  const parts = value.split("|").filter(Boolean);
  if (parts.length === 0) return null;
  return which === "first" ? parts[0] ?? null : parts[parts.length - 1] ?? null;
}

function getFallbackTime(
  shiftCodeIds: number[],
  shiftCodeById: Map<number, PublishedShiftCode>,
  part: "start" | "end",
): string | null {
  if (shiftCodeIds.length === 0) return null;
  const code =
    part === "start"
      ? shiftCodeById.get(shiftCodeIds[0]!)
      : shiftCodeById.get(shiftCodeIds[shiftCodeIds.length - 1]!);

  if (!code) return null;

  return part === "start"
    ? code.defaultStartTime ?? null
    : code.defaultEndTime ?? null;
}

function resolveShiftLabel(
  shiftCodeIds: number[],
  shiftCodeById: Map<number, PublishedShiftCode>,
): string {
  return shiftCodeIds
    .map((id) => shiftCodeById.get(id)?.label ?? "?")
    .join("/");
}

export function hasPublishedScheduleContent(row: PublishedShiftRow): boolean {
  return (
    (row.published_shift_code_ids?.length ?? 0) > 0 ||
    row.published_absence_type_id != null
  );
}

export function resolvePublishedScheduleEntry(
  row: PublishedShiftRow,
  shiftCodeById: Map<number, PublishedShiftCode>,
  absenceTypeById: Map<number, string> = new Map(),
): PublishedScheduleEntry | null {
  const shiftCodeIds = row.published_shift_code_ids ?? [];
  const absenceTypeId = row.published_absence_type_id ?? null;

  if (shiftCodeIds.length === 0 && absenceTypeId == null) {
    return null;
  }

  if (absenceTypeId != null) {
    return {
      kind: "absence",
      empId: row.emp_id,
      date: row.date,
      label: absenceTypeById.get(absenceTypeId) ?? "OFF",
      shiftCodeIds: [],
      absenceTypeId,
      startTime: null,
      endTime: null,
      durationHours: 0,
    };
  }

  const startTime =
    pickPipeTime(row.published_custom_start_time, "first") ??
    getFallbackTime(shiftCodeIds, shiftCodeById, "start");
  const endTime =
    pickPipeTime(row.published_custom_end_time, "last") ??
    getFallbackTime(shiftCodeIds, shiftCodeById, "end");

  return {
    kind: "shift",
    empId: row.emp_id,
    date: row.date,
    label: resolveShiftLabel(shiftCodeIds, shiftCodeById),
    shiftCodeIds,
    absenceTypeId: null,
    startTime,
    endTime,
    durationHours: computeShiftDurationHours(
      shiftCodeIds,
      shiftCodeById as Map<number, ShiftCode>,
      row.published_custom_start_time ?? null,
      row.published_custom_end_time ?? null,
    ),
  };
}
