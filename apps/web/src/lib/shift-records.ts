// One person's shift records for a period (the staff page's Shifts tab, item
// 55d): one row per day they work, spelled out, newest first.

import { addDaysToIsoDate, formatScheduleTimeRange } from "@dubgrid/schedule-core";
import { computeShiftDurationHours } from "@/lib/dashboard-stats";
import type { AbsenceType, AssignmentDefinition, ShiftCategory, ShiftMap } from "@/types";

export type ShiftRecordState = "draft" | "published" | "corrected";

export interface ShiftRecord {
  date: string;
  /** Each worked shift that day, spelled out: "Day Shift". */
  shifts: Array<{ name: string; jobName: string | null; time: string | null }>;
  focusArea: string | null;
  hours: number;
  state: ShiftRecordState;
  /** What a draft does to the published day. */
  draftKind: "new" | "modified" | "deleted" | null;
  /** The published shifts a draft replaces, spelled out. */
  was: string | null;
  correctionReason: string | null;
  /** An absence beside the shifts, such as "Sick". */
  absenceName: string | null;
  noteCount: number;
}

export interface ShiftRecordLookups {
  assignmentById: Map<number, AssignmentDefinition>;
  shiftById: Map<number, ShiftCategory>;
  jobById: Map<number, { name: string }>;
  focusAreaById: Map<number, { name: string }>;
  absenceById: Map<number, AbsenceType>;
}

function describeAssignments(ids: number[], lookups: ShiftRecordLookups) {
  return ids
    .map((id) => lookups.assignmentById.get(id))
    .filter((item): item is AssignmentDefinition => Boolean(item))
    .map((assignment) => {
      const shift =
        assignment.shiftId != null ? lookups.shiftById.get(assignment.shiftId) : undefined;
      return {
        assignment,
        name: shift?.name ?? assignment.name,
        jobName:
          assignment.jobId != null ? (lookups.jobById.get(assignment.jobId)?.name ?? null) : null,
        defaultTime: formatScheduleTimeRange(
          shift?.startTime ?? assignment.defaultStartTime ?? null,
          shift?.endTime ?? assignment.defaultEndTime ?? null,
        ),
      };
    });
}

export function buildShiftRecords(
  empId: string,
  shifts: ShiftMap,
  range: { startDate: string; endDate: string },
  lookups: ShiftRecordLookups,
  extras: {
    /** Corrected days, by date, with their reason. */
    corrections?: ReadonlyMap<string, string | null>;
    /** Schedule notes per date. */
    noteCounts?: ReadonlyMap<string, number>;
  } = {},
): ShiftRecord[] {
  const records: ShiftRecord[] = [];
  for (let date = range.endDate; date >= range.startDate; date = addDaysToIsoDate(date, -1)) {
    const entry = shifts[`${empId}_${date}`];
    if (!entry) continue;
    const removed = Boolean(entry.isDelete) || entry.draftKind === "deleted";
    const ids = removed ? entry.publishedAssignmentDefinitionIds : entry.assignmentIds;
    if (ids.length === 0) continue;
    const described = describeAssignments(ids, lookups);
    if (described.length === 0) continue;

    const custom = formatScheduleTimeRange(
      entry.customStartTime ?? null,
      entry.customEndTime ?? null,
    );
    const focusAreaId = described.find((item) => item.assignment.focusAreaId != null)?.assignment
      .focusAreaId;
    const absenceId = entry.restOfDayAbsenceTypeId ?? null;
    const draftKind = entry.isDraft
      ? removed
        ? "deleted"
        : (entry.draftKind ?? "modified")
      : null;
    const was =
      draftKind === "modified" && entry.publishedAssignmentDefinitionIds.length > 0
        ? describeAssignments(entry.publishedAssignmentDefinitionIds, lookups)
            .map((item) => item.name)
            .join(", ") || null
        : null;
    const correctionReason = extras.corrections?.get(date);

    records.push({
      date,
      shifts: described.map((item, index) => ({
        name: item.name,
        jobName: item.jobName,
        time: index === 0 && custom ? custom : item.defaultTime,
      })),
      focusArea:
        focusAreaId != null ? (lookups.focusAreaById.get(focusAreaId)?.name ?? null) : null,
      hours: removed
        ? 0
        : computeShiftDurationHours(
            entry.assignmentIds,
            lookups.assignmentById,
            entry.customStartTime,
            entry.customEndTime,
            lookups.shiftById,
          ),
      state: draftKind ? "draft" : correctionReason !== undefined ? "corrected" : "published",
      draftKind,
      was,
      correctionReason: correctionReason ?? null,
      absenceName:
        absenceId != null
          ? (lookups.absenceById.get(absenceId)?.name ??
            lookups.absenceById.get(absenceId)?.label ??
            null)
          : null,
      noteCount: extras.noteCounts?.get(date) ?? 0,
    });
  }
  return records;
}

const STATE_LABELS: Record<ShiftRecordState, string> = {
  draft: "Draft",
  published: "Published",
  corrected: "Corrected",
};

export function shiftRecordStateLabel(record: ShiftRecord): string {
  if (record.state !== "draft") return STATE_LABELS[record.state];
  return record.draftKind === "deleted"
    ? "Draft: removed"
    : record.draftKind === "new"
      ? "Draft: new"
      : "Draft: changed";
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The same rows as a CSV file's text, with a header row. */
export function shiftRecordsToCsv(records: readonly ShiftRecord[]): string {
  const header = ["Date", "Shift", "Job", "Time", "Focus area", "Hours", "State", "Was", "Absence"];
  const rows = records.map((record) => [
    record.date,
    record.shifts.map((shift) => shift.name).join(" / "),
    record.shifts.map((shift) => shift.jobName ?? "").join(" / "),
    record.shifts.map((shift) => shift.time ?? "").join(" / "),
    record.focusArea ?? "",
    String(Math.round(record.hours * 100) / 100),
    shiftRecordStateLabel(record),
    record.was ?? "",
    record.absenceName ?? "",
  ]);
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");
}
