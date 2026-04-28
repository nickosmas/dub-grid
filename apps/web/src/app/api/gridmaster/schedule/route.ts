import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type {
  DbAbsenceType,
  DbFocusArea,
  DbJobDefinition,
  DbScheduleCell,
  DbShiftCategory,
} from "@dubgrid/db-types";
import { getServiceClient } from "@/lib/supabase-service";
import { requireGridmasterSession } from "@/lib/api-auth";
import { buildScheduleAssignmentOptions } from "@/lib/assignable-shifts";
import {
  rowToAbsenceType,
  rowToFocusArea,
  rowToJobDefinition,
  rowToShiftCategory,
} from "@/lib/db/mappers";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";
import { createAssignmentDefinitionIdByPairMap } from "@/lib/shift-job-segments";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const readOnlyScheduleSchema = z.object({
  orgId: z.string().uuid(),
  startDate: dateKeySchema,
  endDate: dateKeySchema,
});

const FOCUS_AREA_COLS =
  "id, org_id, department_id, name, color, sort_order, archived_at";
const SHIFT_CATEGORY_COLS =
  "id, org_id, name, abbr, start_time, end_time, color, sort_order, focus_area_id, break_minutes, archived_at";
const JOB_COLS =
  "id, org_id, name, abbr, show_on_grid, assignment_mode, eligibility_mode, focus_area_ids, department_ids, applicable_shift_ids, eligible_role_ids, required_certification_ids, color, border_color, text_color, shift_time_overrides, shift_color_overrides, default_start_time, default_end_time, default_duration_hours, default_duration_minutes, sort_order, system_key, archived_at";
const ABSENCE_TYPE_COLS =
  "id, org_id, label, name, color, border_color, text_color, sort_order, archived_at";
const SCHEDULE_CELL_SELECT = `
  id,
  emp_id,
  date,
  org_id,
  focus_area_id,
  version,
  series_id,
  from_recurring,
  created_by,
  updated_by,
  created_at,
  updated_at,
  snapshots:schedule_cell_snapshots(
    id,
    cell_id,
    org_id,
    snapshot_kind,
    state_kind,
    absence_type_id,
    custom_start_time,
    custom_end_time,
    created_at,
    updated_at,
    segments:schedule_cell_segments(
      id,
      snapshot_id,
      org_id,
      position,
      shift_id,
      job_id,
      created_at,
      updated_at
    )
  ),
  employees(first_name, last_name),
  focus_areas(name)
`;

type ShiftRow = {
  empId: string;
  empName: string;
  date: string;
  assignments: string[];
  absenceLabel: string | null;
  focusAreaName: string | null;
  isDraft: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = readOnlyScheduleSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    const [
      focusAreaResult,
      shiftCategoryResult,
      jobResult,
      absenceTypeResult,
      scheduleCellResult,
    ] = await Promise.all([
      serviceClient
        .from("focus_areas")
        .select(FOCUS_AREA_COLS)
        .eq("org_id", parsed.data.orgId)
        .order("sort_order"),
      serviceClient
        .from("shift_categories")
        .select(SHIFT_CATEGORY_COLS)
        .eq("org_id", parsed.data.orgId)
        .order("sort_order"),
      serviceClient
        .from("jobs")
        .select(JOB_COLS)
        .eq("org_id", parsed.data.orgId)
        .order("sort_order"),
      serviceClient
        .from("absence_types")
        .select(ABSENCE_TYPE_COLS)
        .eq("org_id", parsed.data.orgId)
        .order("sort_order"),
      serviceClient
        .from("schedule_cells")
        .select(SCHEDULE_CELL_SELECT)
        .eq("org_id", parsed.data.orgId)
        .gte("date", parsed.data.startDate)
        .lte("date", parsed.data.endDate)
        .order("date")
        .order("emp_id"),
    ]);

    if (focusAreaResult.error) throw focusAreaResult.error;
    if (shiftCategoryResult.error) throw shiftCategoryResult.error;
    if (jobResult.error) throw jobResult.error;
    if (absenceTypeResult.error) throw absenceTypeResult.error;
    if (scheduleCellResult.error) throw scheduleCellResult.error;

    const assignments = buildScheduleAssignmentOptions({
      orgId: parsed.data.orgId,
      focusAreas: ((focusAreaResult.data ?? []) as DbFocusArea[]).map(rowToFocusArea),
      shiftCategories: (((shiftCategoryResult.data ?? []) as DbShiftCategory[]).map(
        rowToShiftCategory,
      )),
      jobs: ((jobResult.data ?? []) as DbJobDefinition[]).map(rowToJobDefinition),
      includeArchived: true,
    });
    const assignmentLabelMap = new Map(
      assignments.map((assignment) => [assignment.id, assignment.label]),
    );
    const assignmentIdByPair = createAssignmentDefinitionIdByPairMap(assignments);
    const absenceTypeMap = new Map(
      ((absenceTypeResult.data ?? []) as DbAbsenceType[]).map((row) => {
        const absenceType = rowToAbsenceType(row);
        return [absenceType.id, absenceType.label];
      }),
    );

    const shifts = ((scheduleCellResult.data ?? []) as Array<
      DbScheduleCell & Record<string, unknown>
    >)
      .map((row) => {
        const entry = mapNormalizedScheduleCellRowToScheduleEntry(row, {
          isScheduler: true,
          assignmentLabelMap,
          assignmentIdByPair,
          absenceTypeMap,
        });
        if (!entry) return null;

        const employee =
          (row.employees as { first_name?: string | null; last_name?: string | null } | null) ??
          null;
        const focusArea =
          (row.focus_areas as { name?: unknown } | null) ?? null;
        const employeeName = [
          employee?.first_name?.trim(),
          employee?.last_name?.trim(),
        ]
          .filter(Boolean)
          .join(" ");

        return {
          empId: row.emp_id,
          empName: employeeName || row.emp_id.slice(0, 8),
          date: row.date,
          assignments: entry.assignmentIds.map(
            (id) => assignmentLabelMap.get(id) ?? `?${id}`,
          ),
          absenceLabel:
            entry.absenceTypeId != null
              ? (absenceTypeMap.get(entry.absenceTypeId) ?? null)
              : null,
          focusAreaName:
            typeof focusArea?.name === "string" ? focusArea.name : null,
          isDraft: entry.draftKind != null,
        } satisfies ShiftRow;
      })
      .filter((row): row is ShiftRow => row != null);

    return NextResponse.json({ shifts });
  } catch (error) {
    console.error("gridmaster schedule GET failed", error);
    return NextResponse.json(
      { error: "Failed to load read-only schedule" },
      { status: 500 },
    );
  }
}
