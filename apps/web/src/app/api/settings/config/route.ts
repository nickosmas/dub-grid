import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildPermissionContext } from "@dubgrid/authz";
import type { AdminPermissions } from "@dubgrid/domain";
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
import type { AuditAction, AuditResourceType } from "@/lib/audit";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
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

export const dynamic = "force-dynamic";

type DependencyInfo = {
  hasDependencies: boolean;
  summary: string;
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

const namedItemSchema = z.object({
  id: z.number().int(),
  orgId: z.string(),
  name: z.string(),
  abbr: z.string(),
  isScheduleRole: z.boolean().optional(),
  departmentId: z.number().int().nullable().optional(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable().optional(),
});

const departmentSchema = z.object({
  id: z.number().int(),
  orgId: z.string(),
  name: z.string(),
  abbr: z.string(),
  type: z.enum(["scheduled", "management"]),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable().optional(),
  permissions: z.record(z.string(), z.boolean()).nullable().optional(),
});

const focusAreaSchema = z.object({
  id: z.number().int().optional(),
  orgId: z.string(),
  departmentId: z.number().int().nullable(),
  name: z.string(),
  color: z.string().optional().nullable(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable().optional(),
});

const shiftCategorySchema = z.object({
  id: z.number().int().optional(),
  orgId: z.string(),
  name: z.string(),
  abbr: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  color: z.string(),
  sortOrder: z.number().int(),
  focusAreaId: z.number().int().nullable(),
  breakMinutes: z.number().int().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
});

const jobSchema = z.object({
  id: z.number().int().optional(),
  orgId: z.string(),
  name: z.string(),
  abbr: z.string(),
  showOnGrid: z.boolean(),
  assignmentMode: z.enum(["with_shift", "shiftless", "both"]).optional(),
  eligibilityMode: z.enum(["and", "or"]).optional(),
  focusAreaIds: z.array(z.number().int()).optional(),
  departmentIds: z.array(z.number().int()).optional(),
  applicableShiftIds: z.array(z.number().int()).optional(),
  eligibleRoleIds: z.array(z.number().int()).optional(),
  requiredCertificationIds: z.array(z.number().int()).optional(),
  color: z.string(),
  border: z.string(),
  text: z.string(),
  shiftTimeOverrides: z.record(z.string(), z.unknown()).optional(),
  shiftColorOverrides: z.record(z.string(), z.string()).optional(),
  defaultStartTime: z.string().nullable().optional(),
  defaultEndTime: z.string().nullable().optional(),
  defaultDurationHours: z.number().int().nullable().optional(),
  defaultDurationMinutes: z.number().int().nullable().optional(),
  sortOrder: z.number().int(),
  systemKey: z.string().nullable().optional(),
  archivedAt: z.string().nullable().optional(),
});

const coverageRequirementInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  minStaff: z.number().int().min(0),
});

const absenceTypeSchema = z.object({
  id: z.number().int().optional(),
  orgId: z.string(),
  label: z.string(),
  name: z.string(),
  color: z.string(),
  border: z.string(),
  text: z.string(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable().optional(),
});

const indicatorTypeSchema = z.object({
  id: z.number().int().optional(),
  orgId: z.string(),
  name: z.string(),
  color: z.string(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable().optional(),
});

const postBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("saveCertifications"),
    orgId: z.string().uuid(),
    items: z.array(namedItemSchema),
    existing: z.array(namedItemSchema),
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
  }),
  z.object({
    action: z.literal("restoreIndicatorType"),
    orgId: z.string().uuid(),
    itemId: z.number().int(),
  }),
]);

function buildSummary(parts: string[]): DependencyInfo {
  const active = parts.filter(Boolean);
  if (active.length === 0) {
    return { hasDependencies: false, summary: "" };
  }
  return { hasDependencies: true, summary: `Used by ${active.join(" and ")}` };
}

function recurringStateUsesShift(state: ScheduleCellState, shiftId: number): boolean {
  return state.kind === "worked" && state.segments.some((segment) => segment.shiftId === shiftId);
}

function recurringStateUsesJob(state: ScheduleCellState, jobId: number): boolean {
  return state.kind === "worked" && state.segments.some((segment) => segment.jobId === jobId);
}

function recurringStateUsesAbsenceType(
  state: ScheduleCellState,
  absenceTypeId: number,
): boolean {
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

async function authorize(
  req: NextRequest,
  orgId: string,
  permission: SettingsPermission,
) {
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) {
    return { response: auth.response } as const;
  }

  const serviceClient = getServiceClient();
  const [{ data: membership }, { data: profile }] = await Promise.all([
    serviceClient
      .from("organization_memberships")
      .select("org_role, admin_permissions")
      .eq("user_id", auth.user.id)
      .eq("org_id", orgId)
      .maybeSingle(),
    serviceClient
      .from("profiles")
      .select("platform_role")
      .eq("id", auth.user.id)
      .maybeSingle(),
  ]);

  const role =
    profile?.platform_role === "gridmaster"
      ? "gridmaster"
      : (membership?.org_role ?? "user");
  const permissions = buildPermissionContext(
    role,
    orgId,
    (membership?.admin_permissions as AdminPermissions | null) ?? null,
  );

  const allowed = (() => {
    switch (permission) {
      case "orgLabelsRead":
        return permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewOrgLabels || permissions.canManageOrgLabels;
      case "orgLabelsManage":
        return permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageOrgLabels;
      case "departmentsRead":
        return permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewFocusAreas || permissions.canManageFocusAreas || permissions.canViewOrgLabels || permissions.canManageOrgLabels;
      case "departmentsManage":
        return permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageFocusAreas || permissions.canManageOrgLabels;
      case "scheduleDefinitionsRead":
        return permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewScheduleDefinitions || permissions.canManageScheduleDefinitions;
      case "scheduleDefinitionsManage":
        return permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageScheduleDefinitions;
      case "coverageRead":
        return permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewCoverageRequirements || permissions.canManageCoverageRequirements;
      case "coverageManage":
        return permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageCoverageRequirements;
      case "indicatorTypesRead":
        return permissions.isGridmaster || permissions.isSuperAdmin || permissions.canViewIndicatorTypes || permissions.canManageIndicatorTypes;
      case "indicatorTypesManage":
        return permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageIndicatorTypes;
    }
  })();

  if (!allowed) {
    return {
      response: NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      ),
    } as const;
  }

  return { actor: auth.user, serviceClient } as const;
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
  return (data ?? []).map((row) =>
    rowToNamedItem(row as Parameters<typeof rowToNamedItem>[0]),
  );
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
  return (data ?? []).map((row) =>
    rowToNamedItem(row as Parameters<typeof rowToNamedItem>[0]),
  );
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
  return (data ?? []).map((row) =>
    rowToDepartment(row as Parameters<typeof rowToDepartment>[0]),
  );
}

async function fetchFocusAreasForOrg(
  orgId: string,
  includeArchived = false,
): Promise<FocusArea[]> {
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
  return (data ?? []).map((row) =>
    rowToFocusArea(row as Parameters<typeof rowToFocusArea>[0]),
  );
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
  let query = serviceClient
    .from("jobs")
    .select(JOB_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (!includeArchived) {
    query = query.is("archived_at", null);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) =>
    rowToJobDefinition(row as Parameters<typeof rowToJobDefinition>[0]),
  );
}

async function fetchCoverageRequirementsForOrg(
  orgId: string,
): Promise<CoverageRequirement[]> {
  const serviceClient = getServiceClient();
  const [{ data, error }, jobs] = await Promise.all([
    serviceClient
      .from("coverage_requirements")
      .select(COVERAGE_REQ_COLS)
      .eq("org_id", orgId),
    fetchJobDefinitionsForOrg(orgId, true),
  ]);

  if (error) throw error;

  const visibleJobIds = new Set(
    jobs
      .filter((job) => !job.archivedAt && shouldShowJobOnGrid(job))
      .map((job) => job.id),
  );

  return ((data ?? []) as Array<Parameters<typeof rowToCoverageRequirement>[0]>)
    .map((row) => rowToCoverageRequirement(row))
    .filter(
      (requirement) =>
        (requirement.jobId ?? 0) > 0 &&
        visibleJobIds.has(requirement.jobId ?? 0),
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
  return (data ?? []).map((row) =>
    rowToAbsenceType(row as Parameters<typeof rowToAbsenceType>[0]),
  );
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

async function fetchAssignmentDefinitionsForOrg(
  orgId: string,
  includeArchived = false,
) {
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
    .select(`
      id,
      employees!inner(archived_at),
      snapshots:schedule_cell_snapshots(
        absence_type_id,
        segments:schedule_cell_segments(
          shift_id,
          job_id
        )
      )
    `)
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

async function checkRoleDependenciesForOrg(roleId: number, orgId: string) {
  const serviceClient = getServiceClient();
  const [employeeRes, jobRes] = await Promise.all([
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
  ]);

  return buildSummary([
    employeeRes.count
      ? `${employeeRes.count} employee${employeeRes.count !== 1 ? "s" : ""}`
      : "",
    jobRes.count
      ? `${jobRes.count} job${jobRes.count !== 1 ? "s" : ""}`
      : "",
  ]);
}

async function checkCertificationDependenciesForOrg(
  certId: number,
  orgId: string,
) {
  const serviceClient = getServiceClient();
  const [employeeRes, assignments, jobRes] = await Promise.all([
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
  ]);

  const assignmentCount = assignments.filter(
    (assignment) =>
      !assignment.archivedAt &&
      (assignment.requiredCertificationIds ?? []).includes(certId),
  ).length;

  return buildSummary([
    employeeRes.count
      ? `${employeeRes.count} employee${employeeRes.count !== 1 ? "s" : ""}`
      : "",
    assignmentCount
      ? `${assignmentCount} schedule option${assignmentCount !== 1 ? "s" : ""}`
      : "",
    jobRes.count ? `${jobRes.count} job${jobRes.count !== 1 ? "s" : ""}` : "",
  ]);
}

async function checkDepartmentDependenciesForOrg(
  deptId: number,
  orgId: string,
) {
  const serviceClient = getServiceClient();
  const [employeeRes, focusAreaRes, roleRes, jobRes] = await Promise.all([
    serviceClient
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("department_ids", [deptId]),
    serviceClient
      .from("focus_areas")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .eq("department_id", deptId),
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
  ]);

  return buildSummary([
    employeeRes.count
      ? `${employeeRes.count} employee${employeeRes.count !== 1 ? "s" : ""}`
      : "",
    focusAreaRes.count
      ? `${focusAreaRes.count} focus area${focusAreaRes.count !== 1 ? "s" : ""}`
      : "",
    roleRes.count
      ? `${roleRes.count} role${roleRes.count !== 1 ? "s" : ""}`
      : "",
    jobRes.count ? `${jobRes.count} job${jobRes.count !== 1 ? "s" : ""}` : "",
  ]);
}

async function checkShiftCategoryDependenciesForOrg(
  categoryId: number,
  orgId: string,
) {
  const serviceClient = getServiceClient();
  const [assignments, recurringStates, coverageRes] = await Promise.all([
    fetchAssignmentDefinitionsForOrg(orgId, true),
    loadActiveRecurringStateDependencies(orgId),
    serviceClient
      .from("coverage_requirements")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("preferred_shift_id", categoryId),
  ]);

  const assignmentCount = assignments.filter(
    (assignment) =>
      !assignment.archivedAt &&
      (assignment.shiftId === categoryId || assignment.categoryId === categoryId),
  ).length;
  const recurringCount = recurringStates.filter((row) =>
    recurringStateUsesShift(row.state, categoryId),
  ).length;

  return buildSummary([
    assignmentCount
      ? `${assignmentCount} assignment${assignmentCount !== 1 ? "s" : ""}`
      : "",
    recurringCount
      ? `${recurringCount} recurring template${recurringCount !== 1 ? "s" : ""}`
      : "",
    coverageRes.count
      ? `${coverageRes.count} coverage requirement${coverageRes.count !== 1 ? "s" : ""}`
      : "",
  ]);
}

async function checkJobDependenciesForOrg(jobId: number, orgId: string) {
  const serviceClient = getServiceClient();
  const [scheduleCells, recurringStates, coverageRes] = await Promise.all([
    loadActiveScheduleCellDependencies(orgId),
    loadActiveRecurringStateDependencies(orgId),
    serviceClient
      .from("coverage_requirements")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("job_id", jobId),
  ]);

  const scheduleCount = scheduleCells.filter((cell) =>
    (cell.snapshots ?? []).some((snapshot) =>
      (snapshot.segments ?? []).some((segment) => segment.job_id === jobId),
    ),
  ).length;

  const recurringCount = recurringStates.filter((row) =>
    recurringStateUsesJob(row.state, jobId),
  ).length;

  return buildSummary([
    scheduleCount
      ? `${scheduleCount} shift${scheduleCount !== 1 ? "s" : ""}`
      : "",
    recurringCount
      ? `${recurringCount} recurring template${recurringCount !== 1 ? "s" : ""}`
      : "",
    coverageRes.count
      ? `${coverageRes.count} coverage requirement${coverageRes.count !== 1 ? "s" : ""}`
      : "",
  ]);
}

async function checkAbsenceTypeDependenciesForOrg(
  absenceTypeId: number,
  orgId: string,
) {
  const [scheduleCells, recurringStates] = await Promise.all([
    loadActiveScheduleCellDependencies(orgId),
    loadActiveRecurringStateDependencies(orgId),
  ]);

  const scheduleCount = scheduleCells.filter((cell) =>
    (cell.snapshots ?? []).some(
      (snapshot) => snapshot.absence_type_id === absenceTypeId,
    ),
  ).length;

  const recurringCount = recurringStates.filter((row) =>
    recurringStateUsesAbsenceType(row.state, absenceTypeId),
  ).length;

  return buildSummary([
    scheduleCount
      ? `${scheduleCount} shift${scheduleCount !== 1 ? "s" : ""}`
      : "",
    recurringCount
      ? `${recurringCount} recurring template${recurringCount !== 1 ? "s" : ""}`
      : "",
  ]);
}

export async function GET(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");
  const orgId = req.nextUrl.searchParams.get("orgId");

  if (!action || !orgId) {
    return NextResponse.json({ error: "Missing action or orgId" }, { status: 400 });
  }

  const includeArchived =
    req.nextUrl.searchParams.get("includeArchived") === "1";
  const itemId = req.nextUrl.searchParams.get("itemId");

  const permissionByAction: Record<string, SettingsPermission> = {
    fetchCertifications: "orgLabelsRead",
    checkCertificationDependencies: "orgLabelsRead",
    fetchOrganizationRoles: "orgLabelsRead",
    checkRoleDependencies: "orgLabelsRead",
    fetchDepartments: "departmentsRead",
    checkDepartmentDependencies: "departmentsRead",
    fetchFocusAreas: "departmentsRead",
    fetchShiftCategories: "scheduleDefinitionsRead",
    checkShiftCategoryDependencies: "scheduleDefinitionsRead",
    fetchJobDefinitions: "scheduleDefinitionsRead",
    checkJobDependencies: "scheduleDefinitionsRead",
    fetchCoverageRequirements: "coverageRead",
    fetchAbsenceTypes: "scheduleDefinitionsRead",
    checkAbsenceTypeDependencies: "scheduleDefinitionsRead",
    fetchIndicatorTypes: "indicatorTypesRead",
  };

  const permission = permissionByAction[action];
  if (!permission) {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const authorized = await authorize(req, orgId, permission);
  if ("response" in authorized) {
    return authorized.response;
  }

  try {
    switch (action) {
      case "fetchCertifications":
        return NextResponse.json({
          items: await fetchCertificationsForOrg(orgId, includeArchived),
        });
      case "checkCertificationDependencies":
        return NextResponse.json(
          await checkCertificationDependenciesForOrg(Number(itemId), orgId),
        );
      case "fetchOrganizationRoles":
        return NextResponse.json({
          items: await fetchOrganizationRolesForOrg(orgId, includeArchived),
        });
      case "checkRoleDependencies":
        return NextResponse.json(
          await checkRoleDependenciesForOrg(Number(itemId), orgId),
        );
      case "fetchDepartments":
        return NextResponse.json({
          items: await fetchDepartmentsForOrg(orgId, includeArchived),
        });
      case "checkDepartmentDependencies":
        return NextResponse.json(
          await checkDepartmentDependenciesForOrg(Number(itemId), orgId),
        );
      case "fetchFocusAreas":
        return NextResponse.json({
          items: await fetchFocusAreasForOrg(orgId, includeArchived),
        });
      case "fetchShiftCategories":
        return NextResponse.json({
          items: await fetchShiftCategoriesForOrg(orgId, includeArchived),
        });
      case "checkShiftCategoryDependencies":
        return NextResponse.json(
          await checkShiftCategoryDependenciesForOrg(Number(itemId), orgId),
        );
      case "fetchJobDefinitions":
        return NextResponse.json({
          items: await fetchJobDefinitionsForOrg(orgId, includeArchived),
        });
      case "checkJobDependencies":
        return NextResponse.json(
          await checkJobDependenciesForOrg(Number(itemId), orgId),
        );
      case "fetchCoverageRequirements":
        return NextResponse.json({
          items: await fetchCoverageRequirementsForOrg(orgId),
        });
      case "fetchAbsenceTypes":
        return NextResponse.json({
          items: await fetchAbsenceTypesForOrg(orgId, includeArchived),
        });
      case "checkAbsenceTypeDependencies":
        return NextResponse.json(
          await checkAbsenceTypeDependenciesForOrg(Number(itemId), orgId),
        );
      case "fetchIndicatorTypes":
        return NextResponse.json({
          items: await fetchIndicatorTypesForOrg(orgId, includeArchived),
        });
      default:
        return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Settings GET failed", { action, orgId, error });
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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const data = parsed.data;
  const orgId = "orgId" in data ? data.orgId : data.action === "upsertFocusArea"
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

  const { actor, serviceClient } = authorized;

  try {
    switch (data.action) {
      case "saveCertifications": {
        const existingIds = new Set(data.existing.map((item) => item.id));
        const newIds = new Set(data.items.filter((item) => item.id).map((item) => item.id));
        const toDelete = data.existing.filter((item) => !newIds.has(item.id));

        if (toDelete.length > 0) {
          const { error } = await serviceClient
            .from("certifications")
            .update({ archived_at: new Date().toISOString() })
            .eq("org_id", data.orgId)
            .in("id", toDelete.map((item) => item.id));
          if (error) throw error;
        }

        const toUpdate = data.items
          .map((item, index) => ({ item, sortOrder: index }))
          .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
        const toInsert = data.items
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
            archived: toDelete.length,
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
        const existingIds = new Set(data.existing.map((item) => item.id));
        const newIds = new Set(data.items.filter((item) => item.id).map((item) => item.id));
        const toDelete = data.existing.filter((item) => !newIds.has(item.id));

        if (toDelete.length > 0) {
          const { error } = await serviceClient
            .from("organization_roles")
            .update({ archived_at: new Date().toISOString() })
            .eq("org_id", data.orgId)
            .in("id", toDelete.map((item) => item.id));
          if (error) throw error;
        }

        const toUpdate = data.items
          .map((item, index) => ({ item, sortOrder: index }))
          .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
        const toInsert = data.items
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
            const { error } = await serviceClient
              .from("organization_roles")
              .insert({
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
            archived: toDelete.length,
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
        const existingIds = new Set(data.existing.map((item) => item.id));
        const newIds = new Set(data.items.filter((item) => item.id).map((item) => item.id));
        const toDelete = data.existing.filter((item) => !newIds.has(item.id));

        if (toDelete.length > 0) {
          const { error } = await serviceClient
            .from("departments")
            .update({ archived_at: new Date().toISOString() })
            .eq("org_id", data.orgId)
            .in("id", toDelete.map((item) => item.id));
          if (error) throw error;
        }

        const toUpdate = data.items
          .map((item, index) => ({ item, sortOrder: index }))
          .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
        const toInsert = data.items
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

        await cacheDel(CacheKey.departments(data.orgId), CacheKey.orgDirectory(data.orgId));
        await writeAudit({
          actor,
          action: "departments.saved",
          resourceType: "department",
          resourceId: null,
          details: {
            created: toInsert.length,
            updated: toUpdate.length,
            archived: toDelete.length,
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
        const row = {
          org_id: data.focusArea.orgId,
          department_id: data.focusArea.departmentId ?? null,
          name: data.focusArea.name,
          color: normalizePresetBg(data.focusArea.color ?? undefined),
          sort_order: data.focusArea.sortOrder,
        };

        let savedRow;
        if (data.focusArea.id) {
          const { data: updated, error } = await serviceClient
            .from("focus_areas")
            .update(row)
            .eq("id", data.focusArea.id)
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

        await cacheDel(CacheKey.focusAreas(data.focusArea.orgId));
        await writeAudit({
          actor,
          action: "focus_area.upserted",
          resourceType: "focus_area",
          resourceId: String(savedRow.id),
          details: { name: data.focusArea.name },
          orgId: data.focusArea.orgId,
        });
        return NextResponse.json({
          item: rowToFocusArea(savedRow as Parameters<typeof rowToFocusArea>[0]),
        });
      }
      case "deleteFocusArea": {
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
          action: "focus_area.archived",
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
        const row = {
          org_id: data.shiftCategory.orgId,
          name: data.shiftCategory.name,
          abbr: data.shiftCategory.abbr ?? null,
          start_time: data.shiftCategory.startTime ?? null,
          end_time: data.shiftCategory.endTime ?? null,
          color: normalizePresetBg(data.shiftCategory.color),
          sort_order: data.shiftCategory.sortOrder,
          focus_area_id: data.shiftCategory.focusAreaId ?? null,
          break_minutes: data.shiftCategory.breakMinutes ?? null,
        };

        let savedRow;
        if (data.shiftCategory.id) {
          const { data: updated, error } = await serviceClient
            .from("shift_categories")
            .update(row)
            .eq("id", data.shiftCategory.id)
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

        await cacheDel(CacheKey.shiftCategories(data.shiftCategory.orgId));
        await cacheDel(
          CacheKey.assignments(data.shiftCategory.orgId),
          CacheKey.assignments(data.shiftCategory.orgId, true),
          CacheKey.jobs(data.shiftCategory.orgId),
          CacheKey.jobs(data.shiftCategory.orgId, true),
        );
        await writeAudit({
          actor,
          action: "shift_category.upserted",
          resourceType: "shift_category",
          resourceId: String(savedRow.id),
          details: { name: data.shiftCategory.name },
          orgId: data.shiftCategory.orgId,
        });
        return NextResponse.json({
          item: rowToShiftCategory(savedRow as Parameters<typeof rowToShiftCategory>[0]),
        });
      }
      case "deleteShiftCategory": {
        const { error } = await serviceClient
          .from("shift_categories")
          .update({ archived_at: new Date().toISOString() })
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
          action: "shift_category.archived",
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
        const focusAreaIds = getStoredJobFocusAreaIds(data.job);
        const departmentIds = getStoredJobDepartmentIds(data.job);
        const normalizedTiming = normalizeShiftlessJobTiming(data.job);
        const isShiftlessJob = (data.job.assignmentMode ?? "with_shift") === "shiftless";
        const storedStyle = isShiftlessJob
          ? {
              color: data.job.color,
              border_color: data.job.border,
              text_color: data.job.text,
            }
          : {
              color: "#E2E8F0",
              border_color: "transparent",
              text_color: "#1E293B",
            };

        const row = {
          org_id: data.job.orgId,
          name: data.job.name,
          abbr: data.job.abbr,
          show_on_grid: data.job.showOnGrid,
          assignment_mode: data.job.assignmentMode ?? "with_shift",
          eligibility_mode: getJobEligibilityMode(data.job),
          focus_area_ids: focusAreaIds,
          department_ids: departmentIds,
          applicable_shift_ids: normalizePlacementIds(data.job.applicableShiftIds),
          eligible_role_ids: data.job.eligibleRoleIds ?? [],
          required_certification_ids: data.job.requiredCertificationIds ?? [],
          color: storedStyle.color,
          border_color: storedStyle.border_color,
          text_color: storedStyle.text_color,
          shift_time_overrides: normalizeShiftTimeOverrides(
            data.job.shiftTimeOverrides as
              | Record<string, JobShiftTimeOverride | undefined>
              | undefined,
          ),
          shift_color_overrides: normalizeShiftColorOverrides(data.job.shiftColorOverrides),
          default_start_time: normalizedTiming.defaultStartTime,
          default_end_time: normalizedTiming.defaultEndTime,
          default_duration_hours: normalizedTiming.defaultDurationHours,
          default_duration_minutes: normalizedTiming.defaultDurationMinutes,
          sort_order: data.job.sortOrder,
          system_key: data.job.systemKey ?? null,
        };

        let savedRow;
        if (data.job.id) {
          const { data: updated, error } = await serviceClient
            .from("jobs")
            .update(row)
            .eq("org_id", data.job.orgId)
            .eq("id", data.job.id)
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

        await cacheDel(
          CacheKey.assignments(data.job.orgId),
          CacheKey.assignments(data.job.orgId, true),
          CacheKey.jobs(data.job.orgId),
          CacheKey.jobs(data.job.orgId, true),
        );
        await writeAudit({
          actor,
          action: "job.upserted",
          resourceType: "job",
          resourceId: String(savedRow.id),
          details: { name: data.job.name },
          orgId: data.job.orgId,
        });
        return NextResponse.json({
          item: rowToJobDefinition(savedRow as Parameters<typeof rowToJobDefinition>[0]),
        });
      }
      case "deleteJobDefinition": {
        const { error } = await serviceClient
          .from("jobs")
          .update({ archived_at: new Date().toISOString() })
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
          action: "job.archived",
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
          const { error } = await serviceClient
            .from("coverage_requirements")
            .insert(rows);
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
        const row = {
          org_id: data.absenceType.orgId,
          label: data.absenceType.label,
          name: data.absenceType.name,
          color: data.absenceType.color,
          border_color: data.absenceType.border,
          text_color: data.absenceType.text,
          sort_order: data.absenceType.sortOrder,
        };

        let savedRow;
        if (data.absenceType.id) {
          const { data: updated, error } = await serviceClient
            .from("absence_types")
            .update(row)
            .eq("id", data.absenceType.id)
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
          CacheKey.absenceTypes(data.absenceType.orgId),
          CacheKey.absenceTypes(data.absenceType.orgId, true),
        );
        await writeAudit({
          actor,
          action: "absence_type.upserted",
          resourceType: "absence_type",
          resourceId: String(savedRow.id),
          details: {
            label: data.absenceType.label,
            name: data.absenceType.name,
          },
          orgId: data.absenceType.orgId,
        });
        return NextResponse.json({
          item: rowToAbsenceType(savedRow as Parameters<typeof rowToAbsenceType>[0]),
        });
      }
      case "deleteAbsenceType": {
        const { error } = await serviceClient
          .from("absence_types")
          .update({ archived_at: new Date().toISOString() })
          .eq("org_id", data.orgId)
          .eq("id", data.itemId);
        if (error) throw error;
        await cacheDel(
          CacheKey.absenceTypes(data.orgId),
          CacheKey.absenceTypes(data.orgId, true),
        );
        await writeAudit({
          actor,
          action: "absence_type.archived",
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
        await cacheDel(
          CacheKey.absenceTypes(data.orgId),
          CacheKey.absenceTypes(data.orgId, true),
        );
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
        const row = {
          org_id: data.indicatorType.orgId,
          name: data.indicatorType.name,
          color: data.indicatorType.color,
          sort_order: data.indicatorType.sortOrder,
        };

        let savedRow;
        if (data.indicatorType.id) {
          const { data: updated, error } = await serviceClient
            .from("indicator_types")
            .update(row)
            .eq("id", data.indicatorType.id)
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

        await cacheDel(CacheKey.indicatorTypes(data.indicatorType.orgId));
        await writeAudit({
          actor,
          action: "indicator_type.upserted",
          resourceType: "indicator_type",
          resourceId: String(savedRow.id),
          details: { name: data.indicatorType.name },
          orgId: data.indicatorType.orgId,
        });
        return NextResponse.json({
          item: rowToIndicatorType(savedRow as Parameters<typeof rowToIndicatorType>[0]),
        });
      }
      case "deleteIndicatorType": {
        const { error } = await serviceClient
          .from("indicator_types")
          .update({ archived_at: new Date().toISOString() })
          .eq("org_id", data.orgId)
          .eq("id", data.itemId);
        if (error) throw error;
        await cacheDel(CacheKey.indicatorTypes(data.orgId));
        await writeAudit({
          actor,
          action: "indicator_type.archived",
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
    console.error("Settings POST failed", { action: data.action, orgId, error });
    const message =
      error instanceof Error ? error.message : "Settings request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
