import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { User } from "@supabase/supabase-js";
import type {
  AbsenceType,
  CoverageRequirement,
  Department,
  FocusArea,
  IndicatorType,
  JobDefinition,
  JobShiftTimeOverride,
  NamedItem,
  ScheduleCellState,
  ShiftCategory,
} from "@/types";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import type { AuditAction, AuditResourceType } from "@/lib/audit";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiErrorResponse } from "@/lib/error-handling";
import logger from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase-service";
import {
  ABSENCE_TYPE_COLS,
  COVERAGE_REQ_COLS,
  DEPARTMENT_COLS,
  FOCUS_AREA_COLS,
  INDICATOR_TYPE_COLS,
  JOB_COLS,
  NAMED_ITEM_COLS,
  ORG_ROLE_COLS,
  SHIFT_CATEGORY_COLS,
} from "@/lib/db/shared";
import {
  rowToAbsenceType,
  rowToCoverageRequirement,
  rowToDepartment,
  rowToFocusArea,
  rowToIndicatorType,
  rowToJobDefinition,
  rowToNamedItem,
  rowToShiftCategory,
} from "@/lib/db/mappers";
import { buildScheduleAssignmentOptions } from "@/lib/assignable-shifts";
import { normalizePresetBg } from "@/lib/colors";
import {
  namedItemSchema,
  departmentSchema,
  focusAreaSchema,
  shiftCategorySchema,
  jobSchema,
  absenceTypeSchema,
  indicatorTypeSchema,
  validateNamedItems,
  validateDepartments,
  validateFocusArea,
  validateShiftCategory,
  validateJob,
  validateAbsenceType,
  validateIndicatorType,
} from "./_lib/validation";
import {
  getJobEligibilityMode,
  getStoredJobDepartmentIds,
  getStoredJobFocusAreaIds,
  normalizePlacementIds,
  normalizeShiftColorOverrides,
  normalizeShiftTimeOverrides,
  normalizeShiftlessJobTiming,
  shouldShowJobOnGrid,
} from "@/lib/job-placement";
import { CacheKey, cacheDel } from "@/lib/cache";
import {
  DEFAULT_SHIFT_JOB_SYSTEM_KEY,
  isDefaultShiftSystemJob,
  isRegularStaffSystemJob,
} from "@/lib/system-jobs";
import { getShiftCategoryConflict } from "@/lib/shift-category-conflicts";
import { getDepartmentConflict } from "@/lib/department-conflicts";

export const dynamic = "force-dynamic";

type DependencyInfo = {
  hasDependencies: boolean;
  summary: string;
  hasAnyReferences: boolean;
};

type SettingsPermission =
  | "orgLabelsRead"
  | "orgLabelsManage"
  | "departmentsRead"
  | "departmentsManage"
  | "scheduleDefinitionsRead"
  | "scheduleDefinitionsManage"
  | "coverageRead"
  | "coverageManage"
  | "indicatorTypesRead"
  | "indicatorTypesManage";

const POSTGREST_MUTATION_BATCH_SIZE = 50;

type SettingsServiceClient = ReturnType<typeof getServiceClient>;
type ArchivableSettingsTable = "certifications" | "organization_roles" | "departments";

function chunkNumberIds(ids: number[]): number[][] {
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += POSTGREST_MUTATION_BATCH_SIZE) {
    chunks.push(ids.slice(i, i + POSTGREST_MUTATION_BATCH_SIZE));
  }
  return chunks;
}

async function archiveSettingsRowsByIds(
  serviceClient: SettingsServiceClient,
  table: ArchivableSettingsTable,
  orgId: string,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;

  const archivedAt = new Date().toISOString();
  for (const batch of chunkNumberIds(ids)) {
    const { error } = await serviceClient
      .from(table)
      .update({ archived_at: archivedAt })
      .eq("org_id", orgId)
      .in("id", batch);
    if (error) throw error;
  }
}

async function hardDeleteSettingsRowsByIds(
  serviceClient: SettingsServiceClient,
  table: ArchivableSettingsTable,
  orgId: string,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  for (const batch of chunkNumberIds(ids)) {
    const { error } = await serviceClient.from(table).delete().eq("org_id", orgId).in("id", batch);
    if (error) throw error;
  }
}


const coverageRequirementInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  minStaff: z.number().int().min(0),
});


const postBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("saveCertifications"),
    orgId: z.string().uuid(),
    items: z.array(namedItemSchema),
    existing: z.array(namedItemSchema),
    hardDeleteIds: z.array(z.number().int()).optional(),
  }),
  z.object({
    action: z.literal("restoreCertification"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
  }),
  z.object({
    action: z.literal("saveOrganizationRoles"),
    orgId: z.string().uuid(),
    items: z.array(namedItemSchema),
    existing: z.array(namedItemSchema),
    hardDeleteIds: z.array(z.number().int()).optional(),
  }),
  z.object({
    action: z.literal("restoreOrganizationRole"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
  }),
  z.object({
    action: z.literal("saveDepartments"),
    orgId: z.string().uuid(),
    items: z.array(departmentSchema),
    existing: z.array(departmentSchema),
    hardDeleteIds: z.array(z.number().int()).optional(),
  }),
  z.object({
    action: z.literal("restoreDepartment"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
  }),
  z.object({
    action: z.literal("upsertFocusArea"),
    focusArea: focusAreaSchema.extend({ id: z.number().int().optional() }),
  }),
  z.object({
    action: z.literal("deleteFocusArea"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
    hard: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("restoreFocusArea"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
  }),
  z.object({
    action: z.literal("upsertShiftCategory"),
    shiftCategory: shiftCategorySchema.extend({ id: z.number().int().optional() }),
  }),
  z.object({
    action: z.literal("deleteShiftCategory"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
    hard: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("restoreShiftCategory"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
  }),
  z.object({
    action: z.literal("upsertJobDefinition"),
    job: jobSchema.extend({ id: z.number().int().optional() }),
  }),
  z.object({
    action: z.literal("deleteJobDefinition"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
    hard: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("restoreJobDefinition"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
  }),
  z.object({
    action: z.literal("saveCoverageRequirements"),
    orgId: z.string().uuid(),
    focusAreaId: z.number().int(),
    jobId: z.number().int(),
    preferredShiftId: z.number().int().nullable(),
    requirements: z.array(coverageRequirementInputSchema),
  }),
  z.object({
    action: z.literal("upsertAbsenceType"),
    absenceType: absenceTypeSchema.extend({ id: z.number().int().optional() }),
  }),
  z.object({
    action: z.literal("deleteAbsenceType"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
    hard: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("restoreAbsenceType"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
  }),
  z.object({
    action: z.literal("upsertIndicatorType"),
    indicatorType: indicatorTypeSchema.extend({ id: z.number().int().optional() }),
  }),
  z.object({
    action: z.literal("deleteIndicatorType"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
    hard: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("restoreIndicatorType"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
  }),
]);



function buildSummary(parts: string[]): Omit<DependencyInfo, "hasAnyReferences"> {
  const active = parts.filter(Boolean);
  if (active.length === 0) {
    return { hasDependencies: false, summary: "" };
  }
  return { hasDependencies: true, summary: `Used by ${active.join(" and ")}` };
}

function withAnyRefs(
  base: Omit<DependencyInfo, "hasAnyReferences">,
  hasAnyReferences: boolean,
): DependencyInfo {
  return { ...base, hasAnyReferences };
}

function recurringStateUsesShift(state: ScheduleCellState, shiftId: number): boolean {
  return state.kind === "worked" && state.segments.some((segment) => segment.shiftId === shiftId);
}

function recurringStateUsesJob(state: ScheduleCellState, jobId: number): boolean {
  return state.kind === "worked" && state.segments.some((segment) => segment.jobId === jobId);
}

function recurringStateUsesAbsenceType(state: ScheduleCellState, absenceTypeId: number): boolean {
  return state.kind === "absence" && state.absenceTypeId === absenceTypeId;
}

async function writeAudit(args: {
  actor: User;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId: string | null;
  details?: Record<string, unknown>;
  orgId?: string | null;
}) {
  try {
    const serviceClient = getServiceClient();
    await serviceClient.from("audit_log").insert({
      org_id: args.orgId ?? null,
      actor_id: args.actor.id,
      actor_email: args.actor.email ?? null,
      action: args.action,
      resource_type: args.resourceType,
      resource_id: args.resourceId,
      details: args.details ?? {},
    });
  } catch {
    // Best effort only. We do not fail config updates on audit write issues.
  }
}

async function authorize(req: NextRequest, orgId: string, permission: SettingsPermission) {
  const auth = await requireOrgPermissions(
    req,
    orgId,
    (permissions) => {
      switch (permission) {
        case "orgLabelsRead":
          return (
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canViewOrgLabels ||
            permissions.canManageOrgLabels
          );
        case "orgLabelsManage":
          return (
            permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageOrgLabels
          );
        case "departmentsRead":
          return (
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canViewFocusAreas ||
            permissions.canManageFocusAreas ||
            permissions.canViewOrgLabels ||
            permissions.canManageOrgLabels
          );
        case "departmentsManage":
          return (
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canManageFocusAreas ||
            permissions.canManageOrgLabels
          );
        case "scheduleDefinitionsRead":
          return (
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canViewScheduleDefinitions ||
            permissions.canManageScheduleDefinitions
          );
        case "scheduleDefinitionsManage":
          return (
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canManageScheduleDefinitions
          );
        case "coverageRead":
          return (
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canViewCoverageRequirements ||
            permissions.canManageCoverageRequirements
          );
        case "coverageManage":
          return (
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canManageCoverageRequirements
          );
        case "indicatorTypesRead":
          return (
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canViewIndicatorTypes ||
            permissions.canManageIndicatorTypes
          );
        case "indicatorTypesManage":
          return (
            permissions.isGridmaster ||
            permissions.isSuperAdmin ||
            permissions.canManageIndicatorTypes
          );
      }
    },
    { allowDuringSetup: true },
  );
  if ("response" in auth) {
    return { response: auth.response } as const;
  }

  return {
    actor: auth.actor,
    serviceClient: auth.serviceClient,
    orgId: auth.orgId,
  } as const;
}

async function fetchCertificationsForOrg(
  orgId: string,
  includeArchived = false,
): Promise<NamedItem[]> {
  const serviceClient = getServiceClient();
  let query = serviceClient
    .from("certifications")
    .select(NAMED_ITEM_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (!includeArchived) {
    query = query.is("archived_at", null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => rowToNamedItem(row as Parameters<typeof rowToNamedItem>[0]));
}

async function fetchOrganizationRolesForOrg(
  orgId: string,
  includeArchived = false,
): Promise<NamedItem[]> {
  const serviceClient = getServiceClient();
  let query = serviceClient
    .from("organization_roles")
    .select(ORG_ROLE_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (!includeArchived) {
    query = query.is("archived_at", null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => rowToNamedItem(row as Parameters<typeof rowToNamedItem>[0]));
}

async function fetchDepartmentsForOrg(
  orgId: string,
  includeArchived = false,
): Promise<Department[]> {
  const serviceClient = getServiceClient();
  let query = serviceClient
    .from("departments")
    .select(DEPARTMENT_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (!includeArchived) {
    query = query.is("archived_at", null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => rowToDepartment(row as Parameters<typeof rowToDepartment>[0]));
}

async function fetchFocusAreasForOrg(orgId: string, includeArchived = false): Promise<FocusArea[]> {
  const serviceClient = getServiceClient();
  let query = serviceClient
    .from("focus_areas")
    .select(FOCUS_AREA_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (!includeArchived) {
    query = query.is("archived_at", null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => rowToFocusArea(row as Parameters<typeof rowToFocusArea>[0]));
}

async function fetchShiftCategoriesForOrg(
  orgId: string,
  includeArchived = false,
): Promise<ShiftCategory[]> {
  const serviceClient = getServiceClient();
  let query = serviceClient
    .from("shift_categories")
    .select(SHIFT_CATEGORY_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (!includeArchived) {
    query = query.is("archived_at", null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) =>
    rowToShiftCategory(row as Parameters<typeof rowToShiftCategory>[0]),
  );
}

async function fetchJobDefinitionsForOrg(
  orgId: string,
  includeArchived = false,
): Promise<JobDefinition[]> {
  const serviceClient = getServiceClient();
  await ensureDefaultShiftJobForOrg(orgId);
  let query = serviceClient.from("jobs").select(JOB_COLS).eq("org_id", orgId).order("sort_order");
  if (!includeArchived) {
    query = query.is("archived_at", null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) =>
    rowToJobDefinition(row as Parameters<typeof rowToJobDefinition>[0]),
  );
}

async function ensureDefaultShiftJobForOrg(orgId: string): Promise<void> {
  const serviceClient = getServiceClient();
  const { data: existing, error: existingError } = await serviceClient
    .from("jobs")
    .select("id, archived_at")
    .eq("org_id", orgId)
    .eq("system_key", DEFAULT_SHIFT_JOB_SYSTEM_KEY)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    if (existing.archived_at != null) {
      const { error } = await serviceClient
        .from("jobs")
        .update({ archived_at: null })
        .eq("org_id", orgId)
        .eq("id", existing.id);
      if (error) throw error;
    }
    return;
  }

  const { error } = await serviceClient.from("jobs").insert({
    org_id: orgId,
    name: "Default shift job",
    abbr: "SHIFT",
    show_on_grid: false,
    assignment_mode: "with_shift",
    eligibility_mode: "and",
    focus_area_ids: [],
    department_ids: [],
    applicable_shift_ids: [],
    eligible_role_ids: [],
    required_certification_ids: [],
    color: "#E2E8F0",
    border_color: "transparent",
    text_color: "#1E293B",
    default_start_time: null,
    default_end_time: null,
    default_duration_hours: null,
    default_duration_minutes: null,
    sort_order: -1000,
    system_key: DEFAULT_SHIFT_JOB_SYSTEM_KEY,
  });
  if (error && error.code !== "23505") throw error;
}

async function fetchCoverageRequirementsForOrg(orgId: string): Promise<CoverageRequirement[]> {
  const serviceClient = getServiceClient();
  const [{ data, error }, jobs] = await Promise.all([
    serviceClient.from("coverage_requirements").select(COVERAGE_REQ_COLS).eq("org_id", orgId),
    fetchJobDefinitionsForOrg(orgId, true),
  ]);

  if (error) throw error;

  const visibleJobIds = new Set(
    jobs
      .filter(
        (job) =>
          !job.archivedAt &&
          !isRegularStaffSystemJob(job) &&
          (shouldShowJobOnGrid(job) || isDefaultShiftSystemJob(job)),
      )
      .map((job) => job.id),
  );

  return ((data ?? []) as Array<Parameters<typeof rowToCoverageRequirement>[0]>)
    .map((row) => rowToCoverageRequirement(row))
    .filter(
      (requirement) => (requirement.jobId ?? 0) > 0 && visibleJobIds.has(requirement.jobId ?? 0),
    );
}

async function fetchAbsenceTypesForOrg(
  orgId: string,
  includeArchived = false,
): Promise<AbsenceType[]> {
  const serviceClient = getServiceClient();
  let query = serviceClient
    .from("absence_types")
    .select(ABSENCE_TYPE_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (!includeArchived) {
    query = query.is("archived_at", null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => rowToAbsenceType(row as Parameters<typeof rowToAbsenceType>[0]));
}

async function fetchIndicatorTypesForOrg(
  orgId: string,
  includeArchived = false,
): Promise<IndicatorType[]> {
  const serviceClient = getServiceClient();
  let query = serviceClient
    .from("indicator_types")
    .select(INDICATOR_TYPE_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (!includeArchived) {
    query = query.is("archived_at", null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) =>
    rowToIndicatorType(row as Parameters<typeof rowToIndicatorType>[0]),
  );
}

async function fetchAssignmentDefinitionsForOrg(orgId: string, includeArchived = false) {
  const [focusAreas, shiftCategories, jobs] = await Promise.all([
    fetchFocusAreasForOrg(orgId, includeArchived),
    fetchShiftCategoriesForOrg(orgId, includeArchived),
    fetchJobDefinitionsForOrg(orgId, includeArchived),
  ]);

  return buildScheduleAssignmentOptions({
    orgId,
    focusAreas,
    shiftCategories,
    jobs,
    includeArchived,
  });
}

async function loadActiveRecurringStateDependencies(orgId: string) {
  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("recurring_shifts")
    .select("id, state")
    .eq("org_id", orgId)
    .is("archived_at", null);

  if (error) throw error;
  return (data ?? []) as Array<{ id: string; state: ScheduleCellState }>;
}

async function loadActiveScheduleCellDependencies(orgId: string) {
  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("schedule_cells")
    .select(
      `
      id,
      employees!inner(archived_at),
      snapshots:schedule_cell_snapshots(
        absence_type_id,
        segments:schedule_cell_segments(
          shift_id,
          job_id
        )
      )
    `,
    )
    .eq("org_id", orgId)
    .is("employees.archived_at", null);

  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    snapshots?: Array<{
      absence_type_id?: number | null;
      segments?: Array<{
        shift_id?: number | null;
        job_id?: number | null;
      }> | null;
    }> | null;
  }>;
}

// ─── hasAnyReferences checks ────────────────────────────────────────────────
//
// Each of these returns true if anything anywhere references the entity —
// active or archived, current or historical. A false return is the signal that
// the row can be hard-deleted (DELETE FROM ...) instead of archived. We never
// trust the caller's intent for this; the server always re-checks.

type RecurringStateRow = { id: string; state: ScheduleCellState };

async function loadAllRecurringStates(orgId: string): Promise<RecurringStateRow[]> {
  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("recurring_shifts")
    .select("id, state")
    .eq("org_id", orgId);
  if (error) throw error;
  return (data ?? []) as RecurringStateRow[];
}

async function anyScheduleCellSegment(
  orgId: string,
  match: (segment: { shift_id?: number | null; job_id?: number | null }) => boolean,
): Promise<boolean> {
  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("schedule_cells")
    .select(
      `
      id,
      snapshots:schedule_cell_snapshots(
        absence_type_id,
        segments:schedule_cell_segments(
          shift_id,
          job_id
        )
      )
    `,
    )
    .eq("org_id", orgId);
  if (error) throw error;
  return (data ?? []).some((cell: any) =>
    (cell.snapshots ?? []).some((snap: any) =>
      (snap.segments ?? []).some((seg: any) => match(seg)),
    ),
  );
}

async function anyScheduleCellSnapshot(
  orgId: string,
  match: (snapshot: { absence_type_id?: number | null }) => boolean,
): Promise<boolean> {
  const serviceClient = getServiceClient();
  const { data, error } = await serviceClient
    .from("schedule_cells")
    .select(
      `
      id,
      snapshots:schedule_cell_snapshots(absence_type_id)
    `,
    )
    .eq("org_id", orgId);
  if (error) throw error;
  return (data ?? []).some((cell: any) => (cell.snapshots ?? []).some((snap: any) => match(snap)));
}

async function focusAreaHasAnyReferencesForOrg(
  focusAreaId: number,
  orgId: string,
): Promise<boolean> {
  const serviceClient = getServiceClient();
  const [shiftCatRes, scheduleCellRes, scheduleNoteRes, coverageRes, employeeRes, jobRes] =
    await Promise.all([
      serviceClient
        .from("shift_categories")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("focus_area_id", focusAreaId),
      serviceClient
        .from("schedule_cells")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("focus_area_id", focusAreaId),
      serviceClient
        .from("schedule_notes")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("focus_area_id", focusAreaId),
      serviceClient
        .from("coverage_requirements")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("focus_area_id", focusAreaId),
      serviceClient
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .contains("focus_area_ids", [focusAreaId]),
      serviceClient
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .contains("focus_area_ids", [focusAreaId]),
    ]);
  return (
    (shiftCatRes.count ?? 0) > 0 ||
    (scheduleCellRes.count ?? 0) > 0 ||
    (scheduleNoteRes.count ?? 0) > 0 ||
    (coverageRes.count ?? 0) > 0 ||
    (employeeRes.count ?? 0) > 0 ||
    (jobRes.count ?? 0) > 0
  );
}

type DepartmentRefCheck = {
  hasAnyReferences: boolean;
  cascadeFocusAreaIds: number[];
};

async function departmentRefCheckForOrg(
  deptId: number,
  orgId: string,
): Promise<DepartmentRefCheck> {
  const serviceClient = getServiceClient();
  const [employeeRes, roleRes, certRes, jobRes, membershipRes, faRes] = await Promise.all([
    serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .contains("department_ids", [deptId]),
    serviceClient
      .from("organization_roles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("department_id", deptId),
    serviceClient
      .from("certifications")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("department_id", deptId),
    serviceClient
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .contains("department_ids", [deptId]),
    serviceClient
      .from("organization_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .contains("department_ids", [deptId]),
    serviceClient.from("focus_areas").select("id").eq("org_id", orgId).eq("department_id", deptId),
  ]);

  const nonStructural =
    (employeeRes.count ?? 0) > 0 ||
    (roleRes.count ?? 0) > 0 ||
    (certRes.count ?? 0) > 0 ||
    (jobRes.count ?? 0) > 0 ||
    (membershipRes.count ?? 0) > 0;

  if (nonStructural) {
    return { hasAnyReferences: true, cascadeFocusAreaIds: [] };
  }

  const faIds = ((faRes.data ?? []) as Array<{ id: number }>).map((row) => row.id);
  const faRefResults = await Promise.all(
    faIds.map((id) => focusAreaHasAnyReferencesForOrg(id, orgId)),
  );
  const anyFaHasRefs = faRefResults.some(Boolean);

  return {
    hasAnyReferences: anyFaHasRefs,
    cascadeFocusAreaIds: anyFaHasRefs ? [] : faIds,
  };
}

async function roleHasAnyReferencesForOrg(roleId: number, orgId: string): Promise<boolean> {
  const serviceClient = getServiceClient();
  const [employeeRes, jobRes] = await Promise.all([
    serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .contains("role_ids", [roleId]),
    serviceClient
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .contains("eligible_role_ids", [roleId]),
  ]);
  return (employeeRes.count ?? 0) > 0 || (jobRes.count ?? 0) > 0;
}

async function certificationHasAnyReferencesForOrg(
  certId: number,
  orgId: string,
): Promise<boolean> {
  const serviceClient = getServiceClient();
  const [employeeRes, jobRes] = await Promise.all([
    serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("certification_id", certId),
    serviceClient
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .contains("required_certification_ids", [certId]),
  ]);
  return (employeeRes.count ?? 0) > 0 || (jobRes.count ?? 0) > 0;
}

async function jobHasAnyReferencesForOrg(jobId: number, orgId: string): Promise<boolean> {
  const serviceClient = getServiceClient();
  const coverageRes = await serviceClient
    .from("coverage_requirements")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("job_id", jobId);
  if ((coverageRes.count ?? 0) > 0) return true;

  const [cellHasJob, recurring] = await Promise.all([
    anyScheduleCellSegment(orgId, (seg) => seg.job_id === jobId),
    loadAllRecurringStates(orgId),
  ]);
  if (cellHasJob) return true;
  return recurring.some((row) => recurringStateUsesJob(row.state, jobId));
}

async function shiftCategoryHasAnyReferencesForOrg(
  categoryId: number,
  orgId: string,
): Promise<boolean> {
  const serviceClient = getServiceClient();
  const coverageRes = await serviceClient
    .from("coverage_requirements")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("preferred_shift_id", categoryId);
  if ((coverageRes.count ?? 0) > 0) return true;

  const [cellHasShift, recurring] = await Promise.all([
    anyScheduleCellSegment(orgId, (seg) => seg.shift_id === categoryId),
    loadAllRecurringStates(orgId),
  ]);
  if (cellHasShift) return true;
  return recurring.some((row) => recurringStateUsesShift(row.state, categoryId));
}

async function absenceTypeHasAnyReferencesForOrg(
  absenceTypeId: number,
  orgId: string,
): Promise<boolean> {
  const serviceClient = getServiceClient();
  const shiftReqRes = await serviceClient
    .from("shift_requests")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("absence_type_id", absenceTypeId);
  if ((shiftReqRes.count ?? 0) > 0) return true;

  const [cellHasAbsence, recurring] = await Promise.all([
    anyScheduleCellSnapshot(orgId, (snap) => snap.absence_type_id === absenceTypeId),
    loadAllRecurringStates(orgId),
  ]);
  if (cellHasAbsence) return true;
  return recurring.some((row) => recurringStateUsesAbsenceType(row.state, absenceTypeId));
}

async function indicatorTypeHasAnyReferencesForOrg(
  indicatorTypeId: number,
  orgId: string,
): Promise<boolean> {
  const serviceClient = getServiceClient();
  const noteRes = await serviceClient
    .from("schedule_notes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("indicator_type_id", indicatorTypeId);
  return (noteRes.count ?? 0) > 0;
}

async function checkRoleDependenciesForOrg(roleId: number, orgId: string): Promise<DependencyInfo> {
  const serviceClient = getServiceClient();
  const [employeeRes, jobRes, hasAny] = await Promise.all([
    serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("role_ids", [roleId]),
    serviceClient
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("eligible_role_ids", [roleId]),
    roleHasAnyReferencesForOrg(roleId, orgId),
  ]);

  return withAnyRefs(
    buildSummary([
      employeeRes.count ? `${employeeRes.count} employee${employeeRes.count !== 1 ? "s" : ""}` : "",
      jobRes.count ? `${jobRes.count} job${jobRes.count !== 1 ? "s" : ""}` : "",
    ]),
    hasAny,
  );
}

async function checkCertificationDependenciesForOrg(
  certId: number,
  orgId: string,
): Promise<DependencyInfo> {
  const serviceClient = getServiceClient();
  const [employeeRes, assignments, jobRes, hasAny] = await Promise.all([
    serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .eq("certification_id", certId),
    fetchAssignmentDefinitionsForOrg(orgId, true),
    serviceClient
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("required_certification_ids", [certId]),
    certificationHasAnyReferencesForOrg(certId, orgId),
  ]);

  const assignmentCount = assignments.filter(
    (assignment) =>
      !assignment.archivedAt && (assignment.requiredCertificationIds ?? []).includes(certId),
  ).length;

  return withAnyRefs(
    buildSummary([
      employeeRes.count ? `${employeeRes.count} employee${employeeRes.count !== 1 ? "s" : ""}` : "",
      assignmentCount
        ? `${assignmentCount} schedule option${assignmentCount !== 1 ? "s" : ""}`
        : "",
      jobRes.count ? `${jobRes.count} job${jobRes.count !== 1 ? "s" : ""}` : "",
    ]),
    hasAny,
  );
}

async function checkDepartmentDependenciesForOrg(
  deptId: number,
  orgId: string,
): Promise<DependencyInfo> {
  // Focus areas are intentionally omitted from the active-deps summary:
  // every scheduled department has at least one structural focus area, so
  // counting them would always report "used". Real usage of a department
  // surfaces through employees/roles/jobs (and via FA children separately).
  const serviceClient = getServiceClient();
  const [employeeRes, roleRes, jobRes, refCheck] = await Promise.all([
    serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("department_ids", [deptId]),
    serviceClient
      .from("organization_roles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .eq("department_id", deptId),
    serviceClient
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("department_ids", [deptId]),
    departmentRefCheckForOrg(deptId, orgId),
  ]);

  return withAnyRefs(
    buildSummary([
      employeeRes.count ? `${employeeRes.count} employee${employeeRes.count !== 1 ? "s" : ""}` : "",
      roleRes.count ? `${roleRes.count} role${roleRes.count !== 1 ? "s" : ""}` : "",
      jobRes.count ? `${jobRes.count} job${jobRes.count !== 1 ? "s" : ""}` : "",
    ]),
    refCheck.hasAnyReferences,
  );
}

async function checkFocusAreaDependenciesForOrg(
  focusAreaId: number,
  orgId: string,
): Promise<DependencyInfo> {
  const serviceClient = getServiceClient();
  const [employeeRes, shiftCatRes, coverageRes, hasAny] = await Promise.all([
    serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("focus_area_ids", [focusAreaId]),
    serviceClient
      .from("shift_categories")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .eq("focus_area_id", focusAreaId),
    serviceClient
      .from("coverage_requirements")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("focus_area_id", focusAreaId),
    focusAreaHasAnyReferencesForOrg(focusAreaId, orgId),
  ]);

  return withAnyRefs(
    buildSummary([
      employeeRes.count ? `${employeeRes.count} employee${employeeRes.count !== 1 ? "s" : ""}` : "",
      shiftCatRes.count ? `${shiftCatRes.count} shift${shiftCatRes.count !== 1 ? "s" : ""}` : "",
      coverageRes.count
        ? `${coverageRes.count} coverage requirement${coverageRes.count !== 1 ? "s" : ""}`
        : "",
    ]),
    hasAny,
  );
}

async function checkShiftCategoryDependenciesForOrg(
  categoryId: number,
  orgId: string,
): Promise<DependencyInfo> {
  // "Assignments" are virtual job × shift cross-joins derived from active
  // jobs at read time — they are not persisted usage. Every non-archived
  // shift will appear in at least one assignment so long as any permissive
  // job exists, so counting them would always report "used". Real usage
  // surfaces via schedule cells, recurring templates, and coverage rules.
  const serviceClient = getServiceClient();
  const [scheduleCells, recurringStates, coverageRes, hasAny] = await Promise.all([
    loadActiveScheduleCellDependencies(orgId),
    loadActiveRecurringStateDependencies(orgId),
    serviceClient
      .from("coverage_requirements")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("preferred_shift_id", categoryId),
    shiftCategoryHasAnyReferencesForOrg(categoryId, orgId),
  ]);

  const scheduleCount = scheduleCells.filter((cell) =>
    (cell.snapshots ?? []).some((snapshot) =>
      (snapshot.segments ?? []).some((segment) => segment.shift_id === categoryId),
    ),
  ).length;
  const recurringCount = recurringStates.filter((row) =>
    recurringStateUsesShift(row.state, categoryId),
  ).length;

  return withAnyRefs(
    buildSummary([
      scheduleCount ? `${scheduleCount} shift${scheduleCount !== 1 ? "s" : ""}` : "",
      recurringCount
        ? `${recurringCount} recurring template${recurringCount !== 1 ? "s" : ""}`
        : "",
      coverageRes.count
        ? `${coverageRes.count} coverage requirement${coverageRes.count !== 1 ? "s" : ""}`
        : "",
    ]),
    hasAny,
  );
}

async function checkJobDependenciesForOrg(jobId: number, orgId: string): Promise<DependencyInfo> {
  const serviceClient = getServiceClient();
  const [scheduleCells, recurringStates, coverageRes, hasAny] = await Promise.all([
    loadActiveScheduleCellDependencies(orgId),
    loadActiveRecurringStateDependencies(orgId),
    serviceClient
      .from("coverage_requirements")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("job_id", jobId),
    jobHasAnyReferencesForOrg(jobId, orgId),
  ]);

  const scheduleCount = scheduleCells.filter((cell) =>
    (cell.snapshots ?? []).some((snapshot) =>
      (snapshot.segments ?? []).some((segment) => segment.job_id === jobId),
    ),
  ).length;

  const recurringCount = recurringStates.filter((row) =>
    recurringStateUsesJob(row.state, jobId),
  ).length;

  return withAnyRefs(
    buildSummary([
      scheduleCount ? `${scheduleCount} shift${scheduleCount !== 1 ? "s" : ""}` : "",
      recurringCount
        ? `${recurringCount} recurring template${recurringCount !== 1 ? "s" : ""}`
        : "",
      coverageRes.count
        ? `${coverageRes.count} coverage requirement${coverageRes.count !== 1 ? "s" : ""}`
        : "",
    ]),
    hasAny,
  );
}

async function checkAbsenceTypeDependenciesForOrg(
  absenceTypeId: number,
  orgId: string,
): Promise<DependencyInfo> {
  const [scheduleCells, recurringStates, hasAny] = await Promise.all([
    loadActiveScheduleCellDependencies(orgId),
    loadActiveRecurringStateDependencies(orgId),
    absenceTypeHasAnyReferencesForOrg(absenceTypeId, orgId),
  ]);

  const scheduleCount = scheduleCells.filter((cell) =>
    (cell.snapshots ?? []).some((snapshot) => snapshot.absence_type_id === absenceTypeId),
  ).length;

  const recurringCount = recurringStates.filter((row) =>
    recurringStateUsesAbsenceType(row.state, absenceTypeId),
  ).length;

  return withAnyRefs(
    buildSummary([
      scheduleCount ? `${scheduleCount} shift${scheduleCount !== 1 ? "s" : ""}` : "",
      recurringCount
        ? `${recurringCount} recurring template${recurringCount !== 1 ? "s" : ""}`
        : "",
    ]),
    hasAny,
  );
}

async function checkIndicatorTypeDependenciesForOrg(
  indicatorTypeId: number,
  orgId: string,
): Promise<DependencyInfo> {
  const serviceClient = getServiceClient();
  const noteRes = await serviceClient
    .from("schedule_notes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("indicator_type_id", indicatorTypeId);
  const count = noteRes.count ?? 0;
  return withAnyRefs(
    buildSummary([count ? `${count} schedule note${count !== 1 ? "s" : ""}` : ""]),
    count > 0,
  );
}

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  const orgId = req.nextUrl.searchParams.get("orgId");

  if (!action || !orgId) {
    return NextResponse.json({ error: "Missing action or orgId" }, { status: 400 });
  }

  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
  const itemId = req.nextUrl.searchParams.get("itemId");

  const permissionByAction: Record<string, SettingsPermission> = {
    fetchCertifications: "orgLabelsRead",
    checkCertificationDependencies: "orgLabelsRead",
    fetchOrganizationRoles: "orgLabelsRead",
    checkRoleDependencies: "orgLabelsRead",
    fetchDepartments: "departmentsRead",
    checkDepartmentDependencies: "departmentsRead",
    fetchFocusAreas: "departmentsRead",
    checkFocusAreaDependencies: "departmentsRead",
    fetchShiftCategories: "scheduleDefinitionsRead",
    checkShiftCategoryDependencies: "scheduleDefinitionsRead",
    fetchJobDefinitions: "scheduleDefinitionsRead",
    checkJobDependencies: "scheduleDefinitionsRead",
    fetchCoverageRequirements: "coverageRead",
    fetchAbsenceTypes: "scheduleDefinitionsRead",
    checkAbsenceTypeDependencies: "scheduleDefinitionsRead",
    fetchIndicatorTypes: "indicatorTypesRead",
    checkIndicatorTypeDependencies: "indicatorTypesRead",
  };

  const permission = permissionByAction[action];
  if (!permission) {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const authorized = await authorize(req, orgId, permission);
  if ("response" in authorized) {
    return authorized.response;
  }

  // Effective (sandbox-redirected) org, not the raw query param. A caller in
  // sandbox mode must read their sandbox's config, never the real org's.
  const effectiveOrgId = authorized.orgId;

  try {
    switch (action) {
      case "fetchCertifications":
        return NextResponse.json({
          items: await fetchCertificationsForOrg(effectiveOrgId, includeArchived),
        });
      case "checkCertificationDependencies":
        return NextResponse.json(
          await checkCertificationDependenciesForOrg(Number(itemId), effectiveOrgId),
        );
      case "fetchOrganizationRoles":
        return NextResponse.json({
          items: await fetchOrganizationRolesForOrg(effectiveOrgId, includeArchived),
        });
      case "checkRoleDependencies":
        return NextResponse.json(await checkRoleDependenciesForOrg(Number(itemId), effectiveOrgId));
      case "fetchDepartments":
        return NextResponse.json({
          items: await fetchDepartmentsForOrg(effectiveOrgId, includeArchived),
        });
      case "checkDepartmentDependencies":
        return NextResponse.json(
          await checkDepartmentDependenciesForOrg(Number(itemId), effectiveOrgId),
        );
      case "fetchFocusAreas":
        return NextResponse.json({
          items: await fetchFocusAreasForOrg(effectiveOrgId, includeArchived),
        });
      case "checkFocusAreaDependencies":
        return NextResponse.json(
          await checkFocusAreaDependenciesForOrg(Number(itemId), effectiveOrgId),
        );
      case "fetchShiftCategories":
        return NextResponse.json({
          items: await fetchShiftCategoriesForOrg(effectiveOrgId, includeArchived),
        });
      case "checkShiftCategoryDependencies":
        return NextResponse.json(
          await checkShiftCategoryDependenciesForOrg(Number(itemId), effectiveOrgId),
        );
      case "fetchJobDefinitions":
        return NextResponse.json({
          items: await fetchJobDefinitionsForOrg(effectiveOrgId, includeArchived),
        });
      case "checkJobDependencies":
        return NextResponse.json(await checkJobDependenciesForOrg(Number(itemId), effectiveOrgId));
      case "fetchCoverageRequirements":
        return NextResponse.json({
          items: await fetchCoverageRequirementsForOrg(effectiveOrgId),
        });
      case "fetchAbsenceTypes":
        return NextResponse.json({
          items: await fetchAbsenceTypesForOrg(effectiveOrgId, includeArchived),
        });
      case "checkAbsenceTypeDependencies":
        return NextResponse.json(
          await checkAbsenceTypeDependenciesForOrg(Number(itemId), effectiveOrgId),
        );
      case "fetchIndicatorTypes":
        return NextResponse.json({
          items: await fetchIndicatorTypesForOrg(effectiveOrgId, includeArchived),
        });
      case "checkIndicatorTypeDependencies":
        return NextResponse.json(
          await checkIndicatorTypeDependenciesForOrg(Number(itemId), effectiveOrgId),
        );
      default:
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (error) {
    logger.error({ action, orgId: effectiveOrgId, error }, "Settings GET failed");
    return NextResponse.json({ error: "Settings request failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) {
    return csrfError;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const data = parsed.data;
  const orgId =
    "orgId" in data
      ? data.orgId
      : data.action === "upsertFocusArea"
        ? data.focusArea.orgId
        : data.action === "upsertShiftCategory"
          ? data.shiftCategory.orgId
          : data.action === "upsertJobDefinition"
            ? data.job.orgId
            : data.action === "upsertAbsenceType"
              ? data.absenceType.orgId
              : data.indicatorType.orgId;

  const permissionByAction: Record<typeof data.action, SettingsPermission> = {
    saveCertifications: "orgLabelsManage",
    restoreCertification: "orgLabelsManage",
    saveOrganizationRoles: "orgLabelsManage",
    restoreOrganizationRole: "orgLabelsManage",
    saveDepartments: "departmentsManage",
    restoreDepartment: "departmentsManage",
    upsertFocusArea: "departmentsManage",
    deleteFocusArea: "departmentsManage",
    restoreFocusArea: "departmentsManage",
    upsertShiftCategory: "scheduleDefinitionsManage",
    deleteShiftCategory: "scheduleDefinitionsManage",
    restoreShiftCategory: "scheduleDefinitionsManage",
    upsertJobDefinition: "scheduleDefinitionsManage",
    deleteJobDefinition: "scheduleDefinitionsManage",
    restoreJobDefinition: "scheduleDefinitionsManage",
    saveCoverageRequirements: "coverageManage",
    upsertAbsenceType: "scheduleDefinitionsManage",
    deleteAbsenceType: "scheduleDefinitionsManage",
    restoreAbsenceType: "scheduleDefinitionsManage",
    upsertIndicatorType: "indicatorTypesManage",
    deleteIndicatorType: "indicatorTypesManage",
    restoreIndicatorType: "indicatorTypesManage",
  };

  const authorized = await authorize(req, orgId, permissionByAction[data.action]);
  if ("response" in authorized) {
    return authorized.response;
  }

  // Redirect the request body's orgId fields to the effective (possibly
  // sandbox) org id from auth. This file has 100+ references to
  // `data.orgId` / `data.X.orgId` in sub-handlers; mutating the parsed
  // body here means every downstream read/write uses the right org id
  // without touching each handler. Without this, writes leak to the
  // real organization while the user is in sandbox mode.
  const effectiveOrgId = authorized.orgId;
  if ("orgId" in data) {
    (data as { orgId: string }).orgId = effectiveOrgId;
  }
  if ("focusArea" in data && data.focusArea) {
    (data.focusArea as { orgId: string }).orgId = effectiveOrgId;
  }
  if ("shiftCategory" in data && data.shiftCategory) {
    (data.shiftCategory as { orgId: string }).orgId = effectiveOrgId;
  }
  if ("job" in data && data.job) {
    (data.job as { orgId: string }).orgId = effectiveOrgId;
  }
  if ("absenceType" in data && data.absenceType) {
    (data.absenceType as { orgId: string }).orgId = effectiveOrgId;
  }
  if ("indicatorType" in data && data.indicatorType) {
    (data.indicatorType as { orgId: string }).orgId = effectiveOrgId;
  }

  const { actor, serviceClient } = authorized;

  try {
    switch (data.action) {
      case "saveCertifications": {
        const validatedItems = validateNamedItems(data.items, {
          itemLabel: "Certification",
        });
        if ("response" in validatedItems) {
          return validatedItems.response;
        }
        const validatedExisting = validateNamedItems(data.existing, {
          itemLabel: "Certification",
        });
        if ("response" in validatedExisting) {
          return validatedExisting.response;
        }

        const existingIds = new Set(validatedExisting.items.map((item) => item.id));
        const newIds = new Set(
          validatedItems.items.filter((item) => item.id).map((item) => item.id),
        );
        const toDelete = validatedExisting.items.filter((item) => !newIds.has(item.id));

        const hardDeleteHint = new Set(data.hardDeleteIds ?? []);
        const toHardDelete: number[] = [];
        const toArchive: number[] = [];
        for (const item of toDelete) {
          if (hardDeleteHint.has(item.id)) {
            const hasAny = await certificationHasAnyReferencesForOrg(item.id, data.orgId);
            if (!hasAny) {
              toHardDelete.push(item.id);
              continue;
            }
          }
          toArchive.push(item.id);
        }

        await hardDeleteSettingsRowsByIds(
          serviceClient,
          "certifications",
          data.orgId,
          toHardDelete,
        );
        await archiveSettingsRowsByIds(serviceClient, "certifications", data.orgId, toArchive);

        const toUpdate = validatedItems.items
          .map((item, index) => ({ item, sortOrder: index }))
          .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
        const toInsert = validatedItems.items
          .map((item, index) => ({ item, sortOrder: index }))
          .filter(({ item }) => item.id <= 0 || !existingIds.has(item.id));

        for (const { item, sortOrder } of toUpdate) {
          const { error } = await serviceClient
            .from("certifications")
            .update({
              name: item.name,
              abbr: item.abbr,
              department_id: item.departmentId ?? null,
              sort_order: sortOrder,
            })
            .eq("org_id", data.orgId)
            .eq("id", item.id);
          if (error) throw error;
        }

        for (const { item, sortOrder } of toInsert) {
          const { data: archived } = await serviceClient
            .from("certifications")
            .select("id")
            .eq("org_id", data.orgId)
            .eq("name", item.name)
            .not("archived_at", "is", null)
            .maybeSingle();

          if (archived) {
            const { error } = await serviceClient
              .from("certifications")
              .update({
                name: item.name,
                abbr: item.abbr,
                department_id: item.departmentId ?? null,
                sort_order: sortOrder,
                archived_at: null,
              })
              .eq("id", archived.id);
            if (error) throw error;
          } else {
            const { error } = await serviceClient.from("certifications").insert({
              org_id: data.orgId,
              name: item.name,
              abbr: item.abbr,
              department_id: item.departmentId ?? null,
              sort_order: sortOrder,
            });
            if (error) throw error;
          }
        }

        await cacheDel(CacheKey.certifications(data.orgId));
        await writeAudit({
          actor,
          action: "certifications.saved",
          resourceType: "certification",
          resourceId: null,
          details: {
            created: toInsert.length,
            updated: toUpdate.length,
            archived: toArchive.length,
            deleted: toHardDelete.length,
          },
          orgId: data.orgId,
        });

        return NextResponse.json({
          items: await fetchCertificationsForOrg(data.orgId),
        });
      }
      case "restoreCertification": {
        const { error } = await serviceClient
          .from("certifications")
          .update({ archived_at: null })
          .eq("org_id", data.orgId)
          .eq("id", data.itemId);
        if (error) throw error;
        await cacheDel(CacheKey.certifications(data.orgId));
        await writeAudit({
          actor,
          action: "certification.restored",
          resourceType: "certification",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "saveOrganizationRoles": {
        const validatedItems = validateNamedItems(data.items, {
          itemLabel: "Role",
        });
        if ("response" in validatedItems) {
          return validatedItems.response;
        }
        const validatedExisting = validateNamedItems(data.existing, {
          itemLabel: "Role",
        });
        if ("response" in validatedExisting) {
          return validatedExisting.response;
        }

        const existingIds = new Set(validatedExisting.items.map((item) => item.id));
        const newIds = new Set(
          validatedItems.items.filter((item) => item.id).map((item) => item.id),
        );
        const toDelete = validatedExisting.items.filter((item) => !newIds.has(item.id));

        const hardDeleteHint = new Set(data.hardDeleteIds ?? []);
        const toHardDelete: number[] = [];
        const toArchive: number[] = [];
        for (const item of toDelete) {
          if (hardDeleteHint.has(item.id)) {
            const hasAny = await roleHasAnyReferencesForOrg(item.id, data.orgId);
            if (!hasAny) {
              toHardDelete.push(item.id);
              continue;
            }
          }
          toArchive.push(item.id);
        }

        await hardDeleteSettingsRowsByIds(
          serviceClient,
          "organization_roles",
          data.orgId,
          toHardDelete,
        );
        await archiveSettingsRowsByIds(serviceClient, "organization_roles", data.orgId, toArchive);

        const toUpdate = validatedItems.items
          .map((item, index) => ({ item, sortOrder: index }))
          .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
        const toInsert = validatedItems.items
          .map((item, index) => ({ item, sortOrder: index }))
          .filter(({ item }) => item.id <= 0 || !existingIds.has(item.id));

        for (const { item, sortOrder } of toUpdate) {
          const { error } = await serviceClient
            .from("organization_roles")
            .update({
              name: item.name,
              abbr: item.abbr,
              is_schedule_role: item.isScheduleRole ?? true,
              department_id: item.departmentId ?? null,
              sort_order: sortOrder,
            })
            .eq("org_id", data.orgId)
            .eq("id", item.id);
          if (error) throw error;
        }

        for (const { item, sortOrder } of toInsert) {
          const { data: archived } = await serviceClient
            .from("organization_roles")
            .select("id")
            .eq("org_id", data.orgId)
            .eq("name", item.name)
            .not("archived_at", "is", null)
            .maybeSingle();

          if (archived) {
            const { error } = await serviceClient
              .from("organization_roles")
              .update({
                name: item.name,
                abbr: item.abbr,
                is_schedule_role: item.isScheduleRole ?? true,
                department_id: item.departmentId ?? null,
                sort_order: sortOrder,
                archived_at: null,
              })
              .eq("id", archived.id);
            if (error) throw error;
          } else {
            const { error } = await serviceClient.from("organization_roles").insert({
              org_id: data.orgId,
              name: item.name,
              abbr: item.abbr,
              is_schedule_role: item.isScheduleRole ?? true,
              department_id: item.departmentId ?? null,
              sort_order: sortOrder,
            });
            if (error) throw error;
          }
        }

        await cacheDel(CacheKey.orgRoles(data.orgId));
        await writeAudit({
          actor,
          action: "org_roles.saved",
          resourceType: "org_role",
          resourceId: null,
          details: {
            created: toInsert.length,
            updated: toUpdate.length,
            archived: toArchive.length,
            deleted: toHardDelete.length,
          },
          orgId: data.orgId,
        });

        return NextResponse.json({
          items: await fetchOrganizationRolesForOrg(data.orgId),
        });
      }
      case "restoreOrganizationRole": {
        const { error } = await serviceClient
          .from("organization_roles")
          .update({ archived_at: null })
          .eq("org_id", data.orgId)
          .eq("id", data.itemId);
        if (error) throw error;
        await cacheDel(CacheKey.orgRoles(data.orgId));
        await writeAudit({
          actor,
          action: "org_role.restored",
          resourceType: "org_role",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "saveDepartments": {
        const validatedItems = validateDepartments(data.items);
        if ("response" in validatedItems) {
          return validatedItems.response;
        }
        const validatedExisting = validateDepartments(data.existing);
        if ("response" in validatedExisting) {
          return validatedExisting.response;
        }

        const existingIds = new Set(validatedExisting.items.map((item) => item.id));
        const newIds = new Set(
          validatedItems.items.filter((item) => item.id).map((item) => item.id),
        );
        const toDelete = validatedExisting.items.filter((item) => !newIds.has(item.id));

        const hardDeleteHint = new Set(data.hardDeleteIds ?? []);
        const toHardDelete: number[] = [];
        const toArchive: number[] = [];
        const cascadeFocusAreaIds: number[] = [];
        for (const item of toDelete) {
          if (hardDeleteHint.has(item.id)) {
            const refCheck = await departmentRefCheckForOrg(item.id, data.orgId);
            if (!refCheck.hasAnyReferences) {
              toHardDelete.push(item.id);
              cascadeFocusAreaIds.push(...refCheck.cascadeFocusAreaIds);
              continue;
            }
          }
          toArchive.push(item.id);
        }

        if (cascadeFocusAreaIds.length > 0) {
          for (const batch of chunkNumberIds(cascadeFocusAreaIds)) {
            const { error } = await serviceClient
              .from("focus_areas")
              .delete()
              .eq("org_id", data.orgId)
              .in("id", batch);
            if (error) throw error;
          }
        }
        await hardDeleteSettingsRowsByIds(serviceClient, "departments", data.orgId, toHardDelete);
        await archiveSettingsRowsByIds(serviceClient, "departments", data.orgId, toArchive);

        const toUpdate = validatedItems.items
          .map((item, index) => ({ item, sortOrder: index }))
          .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
        const toInsert = validatedItems.items
          .map((item, index) => ({ item, sortOrder: index }))
          .filter(({ item }) => item.id <= 0 || !existingIds.has(item.id));

        for (const { item, sortOrder } of toUpdate) {
          const { error } = await serviceClient
            .from("departments")
            .update({
              name: item.name,
              abbr: item.abbr || "",
              type: item.type,
              sort_order: sortOrder,
              permissions: item.permissions ?? null,
            })
            .eq("org_id", data.orgId)
            .eq("id", item.id);
          if (error) throw error;
        }

        for (const { item, sortOrder } of toInsert) {
          const { data: archived } = await serviceClient
            .from("departments")
            .select("id")
            .eq("org_id", data.orgId)
            .eq("name", item.name)
            .not("archived_at", "is", null)
            .maybeSingle();

          if (archived) {
            const { error } = await serviceClient
              .from("departments")
              .update({
                name: item.name,
                abbr: item.abbr || "",
                type: item.type,
                sort_order: sortOrder,
                archived_at: null,
                permissions: item.permissions ?? null,
              })
              .eq("id", archived.id);
            if (error) throw error;
          } else {
            const { error } = await serviceClient.from("departments").insert({
              org_id: data.orgId,
              name: item.name,
              abbr: item.abbr || "",
              type: item.type,
              sort_order: sortOrder,
              permissions: item.permissions ?? null,
            });
            if (error) throw error;
          }
        }

        await cacheDel(
          CacheKey.departments(data.orgId),
          CacheKey.orgDirectory(data.orgId),
          CacheKey.focusAreas(data.orgId),
        );
        await writeAudit({
          actor,
          action: "departments.saved",
          resourceType: "department",
          resourceId: null,
          details: {
            created: toInsert.length,
            updated: toUpdate.length,
            archived: toArchive.length,
            deleted: toHardDelete.length,
            cascadedFocusAreas: cascadeFocusAreaIds.length,
          },
          orgId: data.orgId,
        });

        return NextResponse.json({
          items: await fetchDepartmentsForOrg(data.orgId),
        });
      }
      case "restoreDepartment": {
        const { error } = await serviceClient
          .from("departments")
          .update({ archived_at: null })
          .eq("org_id", data.orgId)
          .eq("id", data.itemId);
        if (error) throw error;
        await cacheDel(CacheKey.departments(data.orgId), CacheKey.orgDirectory(data.orgId));
        await writeAudit({
          actor,
          action: "department.restored",
          resourceType: "department",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "upsertFocusArea": {
        const validatedFocusArea = validateFocusArea(data.focusArea);
        if ("response" in validatedFocusArea) {
          return validatedFocusArea.response;
        }
        const row = {
          org_id: validatedFocusArea.focusArea.orgId,
          department_id: validatedFocusArea.focusArea.departmentId ?? null,
          name: validatedFocusArea.focusArea.name,
          color: normalizePresetBg(validatedFocusArea.focusArea.color ?? undefined),
          sort_order: validatedFocusArea.focusArea.sortOrder,
        };

        let savedRow;
        if (validatedFocusArea.focusArea.id) {
          const { data: updated, error } = await serviceClient
            .from("focus_areas")
            .update(row)
            .eq("id", validatedFocusArea.focusArea.id)
            .select()
            .single();
          if (error) throw error;
          savedRow = updated;
        } else {
          const { data: inserted, error } = await serviceClient
            .from("focus_areas")
            .insert(row)
            .select()
            .single();
          if (error) throw error;
          savedRow = inserted;
        }

        await cacheDel(CacheKey.focusAreas(validatedFocusArea.focusArea.orgId));
        await writeAudit({
          actor,
          action: "focus_area.upserted",
          resourceType: "focus_area",
          resourceId: String(savedRow.id),
          details: { name: validatedFocusArea.focusArea.name },
          orgId: validatedFocusArea.focusArea.orgId,
        });
        return NextResponse.json({
          item: rowToFocusArea(savedRow as Parameters<typeof rowToFocusArea>[0]),
        });
      }
      case "deleteFocusArea": {
        const wantHard =
          data.hard === true && !(await focusAreaHasAnyReferencesForOrg(data.itemId, data.orgId));

        if (wantHard) {
          const { error } = await serviceClient
            .from("focus_areas")
            .delete()
            .eq("org_id", data.orgId)
            .eq("id", data.itemId);
          if (error) throw error;
        } else {
          const now = new Date().toISOString();
          const { error: categoryError } = await serviceClient
            .from("shift_categories")
            .update({ archived_at: now })
            .eq("org_id", data.orgId)
            .eq("focus_area_id", data.itemId)
            .is("archived_at", null);
          if (categoryError) throw categoryError;

          const { error: employeeError } = await serviceClient.rpc(
            "remove_focus_area_from_employees",
            { p_focus_area_id: data.itemId },
          );
          if (employeeError) throw employeeError;

          const { error } = await serviceClient
            .from("focus_areas")
            .update({ archived_at: now })
            .eq("org_id", data.orgId)
            .eq("id", data.itemId);
          if (error) throw error;
        }

        await cacheDel(
          CacheKey.focusAreas(data.orgId),
          CacheKey.assignments(data.orgId),
          CacheKey.assignments(data.orgId, true),
          CacheKey.shiftCategories(data.orgId),
          CacheKey.employees(data.orgId),
          CacheKey.coverageReqs(data.orgId),
        );
        await writeAudit({
          actor,
          action: wantHard ? "focus_area.deleted" : "focus_area.archived",
          resourceType: "focus_area",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "restoreFocusArea": {
        const { error } = await serviceClient
          .from("focus_areas")
          .update({ archived_at: null })
          .eq("org_id", data.orgId)
          .eq("id", data.itemId);
        if (error) throw error;
        await cacheDel(CacheKey.focusAreas(data.orgId));
        await writeAudit({
          actor,
          action: "focus_area.restored",
          resourceType: "focus_area",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "upsertShiftCategory": {
        const validatedShiftCategory = validateShiftCategory(data.shiftCategory);
        if ("response" in validatedShiftCategory) {
          return validatedShiftCategory.response;
        }
        const row = {
          org_id: validatedShiftCategory.shiftCategory.orgId,
          name: validatedShiftCategory.shiftCategory.name,
          abbr: validatedShiftCategory.shiftCategory.abbr ?? null,
          start_time: validatedShiftCategory.shiftCategory.startTime ?? null,
          end_time: validatedShiftCategory.shiftCategory.endTime ?? null,
          color: normalizePresetBg(validatedShiftCategory.shiftCategory.color),
          sort_order: validatedShiftCategory.shiftCategory.sortOrder,
          focus_area_id: validatedShiftCategory.shiftCategory.focusAreaId ?? null,
          break_minutes: validatedShiftCategory.shiftCategory.breakMinutes ?? null,
        };

        let savedRow;
        if (validatedShiftCategory.shiftCategory.id) {
          const { data: updated, error } = await serviceClient
            .from("shift_categories")
            .update(row)
            .eq("id", validatedShiftCategory.shiftCategory.id)
            .select()
            .single();
          if (error) throw error;
          savedRow = updated;
        } else {
          const { data: inserted, error } = await serviceClient
            .from("shift_categories")
            .insert(row)
            .select()
            .single();
          if (error) throw error;
          savedRow = inserted;
        }

        await cacheDel(CacheKey.shiftCategories(validatedShiftCategory.shiftCategory.orgId));
        await cacheDel(
          CacheKey.assignments(validatedShiftCategory.shiftCategory.orgId),
          CacheKey.assignments(validatedShiftCategory.shiftCategory.orgId, true),
          CacheKey.jobs(validatedShiftCategory.shiftCategory.orgId),
          CacheKey.jobs(validatedShiftCategory.shiftCategory.orgId, true),
        );
        await writeAudit({
          actor,
          action: "shift_category.upserted",
          resourceType: "shift_category",
          resourceId: String(savedRow.id),
          details: { name: validatedShiftCategory.shiftCategory.name },
          orgId: validatedShiftCategory.shiftCategory.orgId,
        });
        return NextResponse.json({
          item: rowToShiftCategory(savedRow as Parameters<typeof rowToShiftCategory>[0]),
        });
      }
      case "deleteShiftCategory": {
        const wantHard =
          data.hard === true &&
          !(await shiftCategoryHasAnyReferencesForOrg(data.itemId, data.orgId));

        if (wantHard) {
          const { error } = await serviceClient
            .from("shift_categories")
            .delete()
            .eq("org_id", data.orgId)
            .eq("id", data.itemId);
          if (error) throw error;
        } else {
          const { error } = await serviceClient
            .from("shift_categories")
            .update({ archived_at: new Date().toISOString() })
            .eq("org_id", data.orgId)
            .eq("id", data.itemId);
          if (error) throw error;
        }
        await cacheDel(CacheKey.shiftCategories(data.orgId));
        await cacheDel(
          CacheKey.assignments(data.orgId),
          CacheKey.assignments(data.orgId, true),
          CacheKey.jobs(data.orgId),
          CacheKey.jobs(data.orgId, true),
        );
        await writeAudit({
          actor,
          action: wantHard ? "shift_category.deleted" : "shift_category.archived",
          resourceType: "shift_category",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "restoreShiftCategory": {
        const { error } = await serviceClient
          .from("shift_categories")
          .update({ archived_at: null })
          .eq("org_id", data.orgId)
          .eq("id", data.itemId);
        if (error) throw error;
        await cacheDel(CacheKey.shiftCategories(data.orgId));
        await cacheDel(
          CacheKey.assignments(data.orgId),
          CacheKey.assignments(data.orgId, true),
          CacheKey.jobs(data.orgId),
          CacheKey.jobs(data.orgId, true),
        );
        await writeAudit({
          actor,
          action: "shift_category.restored",
          resourceType: "shift_category",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "upsertJobDefinition": {
        const validatedJob = validateJob(data.job);
        if ("response" in validatedJob) {
          return validatedJob.response;
        }
        const focusAreaIds = getStoredJobFocusAreaIds(validatedJob.job);
        const departmentIds = getStoredJobDepartmentIds(validatedJob.job);
        const normalizedTiming = normalizeShiftlessJobTiming(validatedJob.job);
        const isShiftlessJob = (validatedJob.job.assignmentMode ?? "with_shift") === "shiftless";
        const storedStyle = isShiftlessJob
          ? {
              color: validatedJob.job.color,
              border_color: validatedJob.job.border,
              text_color: validatedJob.job.text,
            }
          : {
              color: "#E2E8F0",
              border_color: "transparent",
              text_color: "#1E293B",
            };

        const row = {
          org_id: validatedJob.job.orgId,
          name: validatedJob.job.name,
          abbr: validatedJob.job.abbr,
          show_on_grid: validatedJob.job.showOnGrid,
          assignment_mode: validatedJob.job.assignmentMode ?? "with_shift",
          eligibility_mode: getJobEligibilityMode(validatedJob.job),
          focus_area_ids: focusAreaIds,
          department_ids: departmentIds,
          applicable_shift_ids: normalizePlacementIds(validatedJob.job.applicableShiftIds),
          eligible_role_ids: validatedJob.job.eligibleRoleIds ?? [],
          required_certification_ids: validatedJob.job.requiredCertificationIds ?? [],
          color: storedStyle.color,
          border_color: storedStyle.border_color,
          text_color: storedStyle.text_color,
          default_start_time: normalizedTiming.defaultStartTime,
          default_end_time: normalizedTiming.defaultEndTime,
          default_duration_hours: normalizedTiming.defaultDurationHours,
          default_duration_minutes: normalizedTiming.defaultDurationMinutes,
          sort_order: validatedJob.job.sortOrder,
          system_key: validatedJob.job.systemKey ?? null,
        };
        const timeOverrides = normalizeShiftTimeOverrides(
          validatedJob.job.shiftTimeOverrides as
            Record<string, JobShiftTimeOverride | undefined> | undefined,
        );
        const colorOverrides = normalizeShiftColorOverrides(validatedJob.job.shiftColorOverrides);

        let savedRow;
        if (validatedJob.job.id) {
          const { data: updated, error } = await serviceClient
            .from("jobs")
            .update(row)
            .eq("org_id", validatedJob.job.orgId)
            .eq("id", validatedJob.job.id)
            .select(JOB_COLS)
            .single();
          if (error) throw error;
          savedRow = updated;
        } else {
          const { data: inserted, error } = await serviceClient
            .from("jobs")
            .insert(row)
            .select(JOB_COLS)
            .single();
          if (error) throw error;
          savedRow = inserted;
        }

        const { error: overridesError } = await serviceClient.rpc("set_job_shift_overrides", {
          p_job_id: savedRow.id,
          p_time_overrides: timeOverrides,
          p_color_overrides: colorOverrides,
          p_actor_id: actor.id,
        });
        if (overridesError) throw overridesError;
        const { data: overrideRows, error: overrideRowsError } = await serviceClient
          .from("job_shift_overrides")
          .select("shift_id, start_time, end_time, color")
          .eq("job_id", savedRow.id);
        if (overrideRowsError) throw overrideRowsError;
        savedRow.job_shift_overrides = overrideRows ?? [];

        await cacheDel(
          CacheKey.assignments(validatedJob.job.orgId),
          CacheKey.assignments(validatedJob.job.orgId, true),
          CacheKey.jobs(validatedJob.job.orgId),
          CacheKey.jobs(validatedJob.job.orgId, true),
        );
        await writeAudit({
          actor,
          action: "job.upserted",
          resourceType: "job",
          resourceId: String(savedRow.id),
          details: { name: validatedJob.job.name },
          orgId: validatedJob.job.orgId,
        });
        return NextResponse.json({
          item: rowToJobDefinition(savedRow as Parameters<typeof rowToJobDefinition>[0]),
        });
      }
      case "deleteJobDefinition": {
        const wantHard =
          data.hard === true && !(await jobHasAnyReferencesForOrg(data.itemId, data.orgId));

        if (wantHard) {
          const { error } = await serviceClient
            .from("jobs")
            .delete()
            .eq("org_id", data.orgId)
            .eq("id", data.itemId);
          if (error) throw error;
        } else {
          const { error } = await serviceClient
            .from("jobs")
            .update({ archived_at: new Date().toISOString() })
            .eq("org_id", data.orgId)
            .eq("id", data.itemId);
          if (error) throw error;
        }
        await cacheDel(
          CacheKey.assignments(data.orgId),
          CacheKey.assignments(data.orgId, true),
          CacheKey.jobs(data.orgId),
          CacheKey.jobs(data.orgId, true),
        );
        await writeAudit({
          actor,
          action: wantHard ? "job.deleted" : "job.archived",
          resourceType: "job",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "restoreJobDefinition": {
        const { error } = await serviceClient
          .from("jobs")
          .update({ archived_at: null })
          .eq("org_id", data.orgId)
          .eq("id", data.itemId);
        if (error) throw error;
        await cacheDel(
          CacheKey.assignments(data.orgId),
          CacheKey.assignments(data.orgId, true),
          CacheKey.jobs(data.orgId),
          CacheKey.jobs(data.orgId, true),
        );
        await writeAudit({
          actor,
          action: "job.restored",
          resourceType: "job",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "saveCoverageRequirements": {
        let deleteQuery = serviceClient
          .from("coverage_requirements")
          .delete()
          .eq("org_id", data.orgId)
          .eq("focus_area_id", data.focusAreaId)
          .eq("job_id", data.jobId);
        deleteQuery =
          data.preferredShiftId == null
            ? deleteQuery.is("preferred_shift_id", null)
            : deleteQuery.eq("preferred_shift_id", data.preferredShiftId);
        const { error: deleteError } = await deleteQuery;
        if (deleteError) throw deleteError;

        const rows = data.requirements
          .filter((requirement) => requirement.minStaff > 0)
          .map((requirement) => ({
            org_id: data.orgId,
            focus_area_id: data.focusAreaId,
            job_id: data.jobId,
            preferred_shift_id: data.preferredShiftId,
            day_of_week: requirement.dayOfWeek,
            min_staff: requirement.minStaff,
          }));

        if (rows.length > 0) {
          const { error } = await serviceClient.from("coverage_requirements").insert(rows);
          if (error) throw error;
        }

        await cacheDel(CacheKey.coverageReqs(data.orgId));
        await writeAudit({
          actor,
          action: "coverage_requirements.saved",
          resourceType: "coverage_requirement",
          resourceId: `${data.focusAreaId}_${data.jobId}_${data.preferredShiftId ?? "null"}`,
          details: { count: rows.length },
          orgId: data.orgId,
        });
        return NextResponse.json({
          items: await fetchCoverageRequirementsForOrg(data.orgId),
        });
      }
      case "upsertAbsenceType": {
        const validatedAbsenceType = validateAbsenceType(data.absenceType);
        if ("response" in validatedAbsenceType) {
          return validatedAbsenceType.response;
        }
        const row = {
          org_id: validatedAbsenceType.absenceType.orgId,
          label: validatedAbsenceType.absenceType.label,
          name: validatedAbsenceType.absenceType.name,
          color: validatedAbsenceType.absenceType.color,
          border_color: validatedAbsenceType.absenceType.border,
          text_color: validatedAbsenceType.absenceType.text,
          sort_order: validatedAbsenceType.absenceType.sortOrder,
        };

        let savedRow;
        if (validatedAbsenceType.absenceType.id) {
          const { data: updated, error } = await serviceClient
            .from("absence_types")
            .update(row)
            .eq("id", validatedAbsenceType.absenceType.id)
            .select()
            .single();
          if (error) throw error;
          savedRow = updated;
        } else {
          const { data: inserted, error } = await serviceClient
            .from("absence_types")
            .insert(row)
            .select()
            .single();
          if (error) throw error;
          savedRow = inserted;
        }

        await cacheDel(
          CacheKey.absenceTypes(validatedAbsenceType.absenceType.orgId),
          CacheKey.absenceTypes(validatedAbsenceType.absenceType.orgId, true),
        );
        await writeAudit({
          actor,
          action: "absence_type.upserted",
          resourceType: "absence_type",
          resourceId: String(savedRow.id),
          details: {
            label: validatedAbsenceType.absenceType.label,
            name: validatedAbsenceType.absenceType.name,
          },
          orgId: validatedAbsenceType.absenceType.orgId,
        });
        return NextResponse.json({
          item: rowToAbsenceType(savedRow as Parameters<typeof rowToAbsenceType>[0]),
        });
      }
      case "deleteAbsenceType": {
        const wantHard =
          data.hard === true && !(await absenceTypeHasAnyReferencesForOrg(data.itemId, data.orgId));

        if (wantHard) {
          const { error } = await serviceClient
            .from("absence_types")
            .delete()
            .eq("org_id", data.orgId)
            .eq("id", data.itemId);
          if (error) throw error;
        } else {
          const { error } = await serviceClient
            .from("absence_types")
            .update({ archived_at: new Date().toISOString() })
            .eq("org_id", data.orgId)
            .eq("id", data.itemId);
          if (error) throw error;
        }
        await cacheDel(CacheKey.absenceTypes(data.orgId), CacheKey.absenceTypes(data.orgId, true));
        await writeAudit({
          actor,
          action: wantHard ? "absence_type.deleted" : "absence_type.archived",
          resourceType: "absence_type",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "restoreAbsenceType": {
        const { error } = await serviceClient
          .from("absence_types")
          .update({ archived_at: null })
          .eq("org_id", data.orgId)
          .eq("id", data.itemId);
        if (error) throw error;
        await cacheDel(CacheKey.absenceTypes(data.orgId), CacheKey.absenceTypes(data.orgId, true));
        await writeAudit({
          actor,
          action: "absence_type.restored",
          resourceType: "absence_type",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "upsertIndicatorType": {
        const validatedIndicatorType = validateIndicatorType(data.indicatorType);
        if ("response" in validatedIndicatorType) {
          return validatedIndicatorType.response;
        }
        const row = {
          org_id: validatedIndicatorType.indicatorType.orgId,
          name: validatedIndicatorType.indicatorType.name,
          color: validatedIndicatorType.indicatorType.color,
          sort_order: validatedIndicatorType.indicatorType.sortOrder,
        };

        let savedRow;
        if (validatedIndicatorType.indicatorType.id) {
          const { data: updated, error } = await serviceClient
            .from("indicator_types")
            .update(row)
            .eq("id", validatedIndicatorType.indicatorType.id)
            .select()
            .single();
          if (error) throw error;
          savedRow = updated;
        } else {
          const { data: inserted, error } = await serviceClient
            .from("indicator_types")
            .insert(row)
            .select()
            .single();
          if (error) throw error;
          savedRow = inserted;
        }

        await cacheDel(CacheKey.indicatorTypes(validatedIndicatorType.indicatorType.orgId));
        await writeAudit({
          actor,
          action: "indicator_type.upserted",
          resourceType: "indicator_type",
          resourceId: String(savedRow.id),
          details: { name: validatedIndicatorType.indicatorType.name },
          orgId: validatedIndicatorType.indicatorType.orgId,
        });
        return NextResponse.json({
          item: rowToIndicatorType(savedRow as Parameters<typeof rowToIndicatorType>[0]),
        });
      }
      case "deleteIndicatorType": {
        const wantHard =
          data.hard === true &&
          !(await indicatorTypeHasAnyReferencesForOrg(data.itemId, data.orgId));

        if (wantHard) {
          const { error } = await serviceClient
            .from("indicator_types")
            .delete()
            .eq("org_id", data.orgId)
            .eq("id", data.itemId);
          if (error) throw error;
        } else {
          const { error } = await serviceClient
            .from("indicator_types")
            .update({ archived_at: new Date().toISOString() })
            .eq("org_id", data.orgId)
            .eq("id", data.itemId);
          if (error) throw error;
        }
        await cacheDel(CacheKey.indicatorTypes(data.orgId));
        await writeAudit({
          actor,
          action: wantHard ? "indicator_type.deleted" : "indicator_type.archived",
          resourceType: "indicator_type",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
      case "restoreIndicatorType": {
        const { error } = await serviceClient
          .from("indicator_types")
          .update({ archived_at: null })
          .eq("org_id", data.orgId)
          .eq("id", data.itemId);
        if (error) throw error;
        await cacheDel(CacheKey.indicatorTypes(data.orgId));
        await writeAudit({
          actor,
          action: "indicator_type.restored",
          resourceType: "indicator_type",
          resourceId: String(data.itemId),
          orgId: data.orgId,
        });
        return NextResponse.json({ success: true });
      }
    }
  } catch (error) {
    if (data.action === "upsertShiftCategory" || data.action === "deleteShiftCategory") {
      const shiftConflict = getShiftCategoryConflict(error);
      if (shiftConflict) {
        return NextResponse.json(shiftConflict, { status: 409 });
      }
    }
    if (data.action === "saveDepartments" || data.action === "restoreDepartment") {
      const deptConflict = getDepartmentConflict(error);
      if (deptConflict) {
        return NextResponse.json(deptConflict, { status: 409 });
      }
    }
    logger.error({ action: data.action, orgId, error }, "Settings POST failed");
    return apiErrorResponse(error, "Settings request failed");
  }
}
