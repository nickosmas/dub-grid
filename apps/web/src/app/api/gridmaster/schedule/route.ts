import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type {
  DbAbsenceType,
  DbCoverageRequirement,
  DbFocusArea,
  DbJobDefinition,
  DbScheduleCell,
  DbShiftCategory,
} from "@dubgrid/db-types";
import { getServiceClient } from "@/lib/supabase-service";
import { requireGridmasterSession } from "@/lib/api-auth";
import { buildScheduleAssignmentOptions } from "@/lib/assignable-shifts";
import { buildShiftDisplayParts } from "@/lib/assignable-shifts";
import {
  rowToAbsenceType,
  rowToCoverageRequirement,
  rowToFocusArea,
  rowToJobDefinition,
  rowToShiftCategory,
} from "@/lib/db/mappers";
import { mapNormalizedScheduleCellRowToScheduleEntry } from "@/lib/schedule-cells";
import { createAssignmentDefinitionIdByPairMap } from "@/lib/shift-job-segments";
import type { AssignmentDefinition, DraftKind, ShiftDisplayMode } from "@/types";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const readOnlyScheduleSchema = z.object({
  orgId: z.string().uuid(),
  startDate: dateKeySchema,
  endDate: dateKeySchema,
});

const FOCUS_AREA_COLS = "id, org_id, department_id, name, color, sort_order, archived_at";
const SHIFT_CATEGORY_COLS =
  "id, org_id, name, abbr, start_time, end_time, color, sort_order, focus_area_id, break_minutes, archived_at";
const JOB_COLS =
  "id, org_id, name, abbr, show_on_grid, assignment_mode, eligibility_mode, focus_area_ids, department_ids, applicable_shift_ids, eligible_role_ids, required_certification_ids, color, border_color, text_color, shift_time_overrides, shift_color_overrides, default_start_time, default_end_time, default_duration_hours, default_duration_minutes, sort_order, system_key, archived_at";
const ABSENCE_TYPE_COLS =
  "id, org_id, label, name, color, border_color, text_color, sort_order, archived_at";
const COVERAGE_REQUIREMENT_COLS =
  "id, org_id, focus_area_id, job_id, preferred_shift_id, day_of_week, min_staff";
const SHIFT_REQUEST_COLS =
  "id, type, status, requester_emp_id, requester_shift_date, target_emp_id, target_shift_date";
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
            is_mentored,
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
  assignmentDetails: Array<{
    id: number;
    label: string;
    name: string;
    color: string | null;
    border: string | null;
    text: string | null;
    shiftId: number | null;
    jobId: number | null;
    focusAreaName: string | null;
    defaultStartTime: string | null;
    defaultEndTime: string | null;
    isShiftless: boolean;
    isShiftOnly: boolean;
    focusAreaId: number | null;
    coverageStatus: {
      actual: number;
      required: number;
      isMet: boolean;
    } | null;
  }>;
  requestIndicators: Array<{
    id: string;
    type: string;
    status: string;
    relation: "requester" | "target";
  }>;
  absenceLabel: string | null;
  focusAreaName: string | null;
  isDraft: boolean;
  draftKind: DraftKind;
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
      coverageRequirementResult,
      requesterShiftRequestResult,
      targetShiftRequestResult,
      scheduleCellResult,
      organizationResult,
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
        .from("coverage_requirements")
        .select(COVERAGE_REQUIREMENT_COLS)
        .eq("org_id", parsed.data.orgId),
      serviceClient
        .from("shift_requests")
        .select(SHIFT_REQUEST_COLS)
        .eq("org_id", parsed.data.orgId)
        .gte("requester_shift_date", parsed.data.startDate)
        .lte("requester_shift_date", parsed.data.endDate),
      serviceClient
        .from("shift_requests")
        .select(SHIFT_REQUEST_COLS)
        .eq("org_id", parsed.data.orgId)
        .gte("target_shift_date", parsed.data.startDate)
        .lte("target_shift_date", parsed.data.endDate),
      serviceClient
        .from("schedule_cells")
        .select(SCHEDULE_CELL_SELECT)
        .eq("org_id", parsed.data.orgId)
        .gte("date", parsed.data.startDate)
        .lte("date", parsed.data.endDate)
        .order("date")
        .order("emp_id"),
      serviceClient
        .from("organizations")
        .select("shift_display_mode")
        .eq("id", parsed.data.orgId)
        .single(),
    ]);

    if (focusAreaResult.error) throw focusAreaResult.error;
    if (shiftCategoryResult.error) throw shiftCategoryResult.error;
    if (jobResult.error) throw jobResult.error;
    if (absenceTypeResult.error) throw absenceTypeResult.error;
    if (coverageRequirementResult.error) throw coverageRequirementResult.error;
    if (requesterShiftRequestResult.error) throw requesterShiftRequestResult.error;
    if (targetShiftRequestResult.error) throw targetShiftRequestResult.error;
    if (scheduleCellResult.error) throw scheduleCellResult.error;
    if (organizationResult.error) throw organizationResult.error;

    const focusAreas = ((focusAreaResult.data ?? []) as DbFocusArea[]).map(rowToFocusArea);
    const shiftCategories = ((shiftCategoryResult.data ?? []) as DbShiftCategory[]).map(
      rowToShiftCategory,
    );
    const jobs = ((jobResult.data ?? []) as DbJobDefinition[]).map(rowToJobDefinition);
    const shiftDisplayMode: ShiftDisplayMode =
      (organizationResult.data as { shift_display_mode?: unknown } | null)?.shift_display_mode ===
      "name"
        ? "name"
        : "code";
    const focusAreaNameById = new Map(
      focusAreas.map((focusArea) => [focusArea.id, focusArea.name]),
    );
    const shiftById = new Map(
      shiftCategories.map((shiftCategory) => [shiftCategory.id, shiftCategory]),
    );
    const jobById = new Map(jobs.map((job) => [job.id, job]));
    const assignments = buildScheduleAssignmentOptions({
      orgId: parsed.data.orgId,
      focusAreas,
      shiftCategories,
      jobs,
      includeArchived: true,
    });
    const assignmentLabelMap = new Map(
      assignments.map((assignment) => [assignment.id, assignment.label]),
    );
    const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
    const assignmentIdByPair = createAssignmentDefinitionIdByPairMap(assignments);
    const absenceTypeMap = new Map(
      ((absenceTypeResult.data ?? []) as DbAbsenceType[]).map((row) => {
        const absenceType = rowToAbsenceType(row);
        return [absenceType.id, absenceType.label];
      }),
    );
    const coverageRequirements = (
      (coverageRequirementResult.data ?? []) as DbCoverageRequirement[]
    ).map(rowToCoverageRequirement);
    const requestsByEmployeeDate = new Map<string, ShiftRow["requestIndicators"]>();
    const addRequestIndicator = (
      row: Record<string, unknown>,
      relation: "requester" | "target",
    ) => {
      const empId =
        relation === "requester"
          ? (row.requester_emp_id as string | null)
          : (row.target_emp_id as string | null);
      const date =
        relation === "requester"
          ? (row.requester_shift_date as string | null)
          : (row.target_shift_date as string | null);
      if (!empId || !date) return;
      const key = `${empId}:${date}`;
      const existing = requestsByEmployeeDate.get(key) ?? [];
      if (existing.some((request) => request.id === row.id)) return;
      existing.push({
        id: row.id as string,
        type: row.type as string,
        status: row.status as string,
        relation,
      });
      requestsByEmployeeDate.set(key, existing);
    };
    for (const row of (requesterShiftRequestResult.data ?? []) as Record<string, unknown>[]) {
      addRequestIndicator(row, "requester");
    }
    for (const row of (targetShiftRequestResult.data ?? []) as Record<string, unknown>[]) {
      addRequestIndicator(row, "target");
    }

    const shifts: ShiftRow[] = (
      (scheduleCellResult.data ?? []) as Array<DbScheduleCell & Record<string, unknown>>
    )
      .map<ShiftRow | null>((row) => {
        const entry = mapNormalizedScheduleCellRowToScheduleEntry(row, {
          isScheduler: true,
          assignmentLabelMap,
          assignmentIdByPair,
          absenceTypeMap,
        });
        if (!entry) return null;

        const assignmentDetails: ShiftRow["assignmentDetails"] = entry.assignmentIds.map((id) => {
          const assignment = assignmentById.get(id) as AssignmentDefinition | undefined;
          if (!assignment) {
            return {
              id,
              label: `?${id}`,
              name: `?${id}`,
              color: null,
              border: null,
              text: null,
              shiftId: null,
              jobId: null,
              focusAreaName: null,
              defaultStartTime: null,
              defaultEndTime: null,
              isShiftless: false,
              isShiftOnly: false,
              focusAreaId: null,
              coverageStatus: null,
            };
          }

          const shift =
            assignment.shiftId != null ? (shiftById.get(assignment.shiftId) ?? null) : null;
          const job = assignment.jobId != null ? (jobById.get(assignment.jobId) ?? null) : null;
          const displayParts = buildShiftDisplayParts({
            shift,
            job,
            assignment,
            shiftDisplayMode,
          });
          const label = displayParts.secondaryLabel
            ? `${displayParts.primaryLabel} · ${displayParts.secondaryLabel}`
            : displayParts.primaryLabel;

          return {
            id,
            label,
            name: assignment.name,
            color: assignment.color || null,
            border: assignment.border || null,
            text: assignment.text || null,
            shiftId: assignment.shiftId ?? null,
            jobId: assignment.jobId ?? null,
            focusAreaName:
              assignment.focusAreaId != null
                ? (focusAreaNameById.get(assignment.focusAreaId) ?? null)
                : null,
            focusAreaId: assignment.focusAreaId ?? null,
            defaultStartTime: assignment.defaultStartTime ?? null,
            defaultEndTime: assignment.defaultEndTime ?? null,
            isShiftless: displayParts.isShiftless,
            isShiftOnly: displayParts.isShiftOnly,
            coverageStatus: null,
          };
        });
        const employee =
          (row.employees as { first_name?: string | null; last_name?: string | null } | null) ??
          null;
        const focusArea = (row.focus_areas as { name?: unknown } | null) ?? null;
        const employeeName = [employee?.first_name?.trim(), employee?.last_name?.trim()]
          .filter(Boolean)
          .join(" ");

        return {
          empId: row.emp_id,
          empName: employeeName || row.emp_id.slice(0, 8),
          date: row.date,
          assignments: assignmentDetails.map((assignment) => assignment.label),
          assignmentDetails,
          requestIndicators: requestsByEmployeeDate.get(`${row.emp_id}:${row.date}`) ?? [],
          absenceLabel:
            entry.absenceTypeId != null ? (absenceTypeMap.get(entry.absenceTypeId) ?? null) : null,
          focusAreaName: typeof focusArea?.name === "string" ? focusArea.name : null,
          isDraft: entry.draftKind != null,
          draftKind: entry.draftKind,
        } satisfies ShiftRow;
      })
      .filter((row): row is ShiftRow => row != null);

    const assignmentCountsByDate = new Map<string, number>();
    for (const shift of shifts) {
      for (const assignment of shift.assignmentDetails) {
        assignmentCountsByDate.set(
          `${shift.date}:${assignment.id}`,
          (assignmentCountsByDate.get(`${shift.date}:${assignment.id}`) ?? 0) + 1,
        );
      }
    }

    for (const shift of shifts) {
      const dayOfWeek = new Date(`${shift.date}T00:00:00`).getDay();
      shift.assignmentDetails = shift.assignmentDetails.map((assignment) => {
        if (assignment.focusAreaId == null || assignment.jobId == null) {
          return assignment;
        }

        const requirement =
          coverageRequirements.find(
            (candidate) =>
              candidate.focusAreaId === assignment.focusAreaId &&
              candidate.jobId === assignment.jobId &&
              (candidate.preferredShiftId ?? null) === assignment.shiftId &&
              candidate.dayOfWeek === dayOfWeek,
          ) ??
          coverageRequirements.find(
            (candidate) =>
              candidate.focusAreaId === assignment.focusAreaId &&
              candidate.jobId === assignment.jobId &&
              (candidate.preferredShiftId ?? null) === assignment.shiftId &&
              candidate.dayOfWeek === null,
          );
        if (!requirement || requirement.minStaff <= 0) {
          return assignment;
        }

        const actual = assignmentCountsByDate.get(`${shift.date}:${assignment.id}`) ?? 0;
        return {
          ...assignment,
          coverageStatus: {
            actual,
            required: requirement.minStaff,
            isMet: actual >= requirement.minStaff,
          },
        };
      });
    }

    return NextResponse.json({ shifts });
  } catch (error) {
    console.error("gridmaster schedule GET failed", error);
    return NextResponse.json({ error: "Failed to load read-only schedule" }, { status: 500 });
  }
}
