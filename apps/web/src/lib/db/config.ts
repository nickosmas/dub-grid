import {
  supabase,
  cacheThrough,
  cacheDel,
  CacheKey,
  TTL,
  FOCUS_AREA_COLS,
  SHIFT_CATEGORY_COLS,
  JOB_COLS,
  NAMED_ITEM_COLS,
  ORG_ROLE_COLS,
  COVERAGE_REQ_COLS,
  ABSENCE_TYPE_COLS,
  INDICATOR_TYPE_COLS,
  logAudit,
  saveNamedEntities,
} from "./shared";
import type {
  DbFocusArea,
  DbShiftCategory,
  DbJobDefinition,
  DbNamedItem,
  DbCoverageRequirement,
  DbAbsenceType,
  DbIndicatorType,
  DbScheduleCell,
} from "./types";
import {
  rowToFocusArea,
  rowToShiftCategory,
  rowToJobDefinition,
  rowToNamedItem,
  rowToCoverageRequirement,
  rowToAbsenceType,
  rowToIndicatorType,
} from "./mappers";
import type {
  FocusArea,
  AssignmentDefinition,
  ShiftCategory,
  JobDefinition,
  NamedItem,
  CoverageRequirement,
  AbsenceType,
  IndicatorType,
  ScheduleCellState,
} from "@/types";
import { buildScheduleAssignmentOptions } from "@/lib/assignable-shifts";
import {
  getStoredJobDepartmentIds,
  getStoredJobFocusAreaIds,
  getJobEligibilityMode,
  normalizeShiftlessJobTiming,
  normalizeShiftColorOverrides,
  normalizeShiftTimeOverrides,
  normalizePlacementIds,
  shouldShowJobOnGrid,
} from "@/lib/job-placement";
import { normalizePresetBg } from "@/lib/colors";
import { isDefaultShiftSystemJob, isRegularStaffSystemJob } from "@/lib/system-jobs";

// ── Dependency Checks ────────────────────────────────────────────────────────
// Before archiving any config item, check if it's referenced elsewhere.
// Returns a summary string for the UI warning dialog.

export interface DependencyInfo {
  hasDependencies: boolean;
  summary: string;
}

const SCHEDULED_JOB_STORAGE_STYLE = {
  color: "#E2E8F0",
  borderColor: "transparent",
  textColor: "#1E293B",
} as const;

type ScheduleCellDependencyRow = Pick<DbScheduleCell, "id"> & {
  employees?: { archived_at?: string | null } | Array<{ archived_at?: string | null }> | null;
  snapshots?: Array<{
    absence_type_id?: number | null;
    segments?: Array<{
      job_id?: number | null;
      shift_id?: number | null;
    }> | null;
  }> | null;
};

type RecurringStateDependencyRow = {
  id: string;
  state: ScheduleCellState;
};

function buildSummary(parts: string[]): DependencyInfo {
  const active = parts.filter(Boolean);
  if (active.length === 0) return { hasDependencies: false, summary: "" };
  return { hasDependencies: true, summary: `Used by ${active.join(" and ")}` };
}

async function loadActiveScheduleCellDependencies(
  orgId: string,
): Promise<ScheduleCellDependencyRow[]> {
  const { data, error } = await supabase
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
  return (data ?? []) as ScheduleCellDependencyRow[];
}

async function loadActiveRecurringStateDependencies(
  orgId: string,
): Promise<RecurringStateDependencyRow[]> {
  const { data, error } = await supabase
    .from("recurring_shifts")
    .select("id, state")
    .eq("org_id", orgId)
    .is("archived_at", null);

  if (error) throw error;
  return (data ?? []) as RecurringStateDependencyRow[];
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

export async function checkRoleDependencies(
  roleId: number,
  orgId: string,
): Promise<DependencyInfo> {
  const [employeeRes, jobRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("role_ids", [roleId]),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("eligible_role_ids", [roleId]),
  ]);
  return buildSummary([
    employeeRes.count ? `${employeeRes.count} employee${employeeRes.count !== 1 ? "s" : ""}` : "",
    jobRes.count ? `${jobRes.count} job${jobRes.count !== 1 ? "s" : ""}` : "",
  ]);
}

export async function checkCertificationDependencies(
  certId: number,
  orgId: string,
): Promise<DependencyInfo> {
  const [empRes, assignments, jobRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .eq("certification_id", certId),
    fetchAssignmentDefinitions(orgId, true),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("required_certification_ids", [certId]),
  ]);
  const codeCount = assignments.filter(
    (assignment) =>
      !assignment.archivedAt && (assignment.requiredCertificationIds ?? []).includes(certId),
  ).length;
  return buildSummary([
    empRes.count ? `${empRes.count} employee${empRes.count !== 1 ? "s" : ""}` : "",
    codeCount ? `${codeCount} schedule option${codeCount !== 1 ? "s" : ""}` : "",
    jobRes.count ? `${jobRes.count} job${jobRes.count !== 1 ? "s" : ""}` : "",
  ]);
}

export async function checkFocusAreaDependencies(
  faId: number,
  orgId: string,
): Promise<DependencyInfo> {
  const [empRes, assignments, covRes, jobRes] = await Promise.all([
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("focus_area_ids", [faId]),
    fetchAssignmentDefinitions(orgId, true),
    supabase
      .from("coverage_requirements")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("focus_area_id", faId),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("archived_at", null)
      .contains("focus_area_ids", [faId]),
  ]);
  const codeCount = assignments.filter(
    (assignment) => !assignment.archivedAt && assignment.focusAreaId === faId,
  ).length;
  return buildSummary([
    empRes.count ? `${empRes.count} employee${empRes.count !== 1 ? "s" : ""}` : "",
    codeCount ? `${codeCount} schedule option${codeCount !== 1 ? "s" : ""}` : "",
    covRes.count ? `${covRes.count} coverage requirement${covRes.count !== 1 ? "s" : ""}` : "",
    jobRes.count ? `${jobRes.count} job${jobRes.count !== 1 ? "s" : ""}` : "",
  ]);
}

export async function checkShiftCategoryDependencies(
  catId: number,
  orgId: string,
): Promise<DependencyInfo> {
  const [assignments, recurringStates, coverageRes] = await Promise.all([
    fetchAssignmentDefinitions(orgId, true),
    loadActiveRecurringStateDependencies(orgId),
    supabase
      .from("coverage_requirements")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("preferred_shift_id", catId),
  ]);
  const codeCount = assignments.filter(
    (assignment) =>
      !assignment.archivedAt && (assignment.shiftId === catId || assignment.categoryId === catId),
  ).length;
  const recurringCount = recurringStates.filter((row) =>
    recurringStateUsesShift(row.state, catId),
  ).length;
  return buildSummary([
    codeCount ? `${codeCount} assignment${codeCount !== 1 ? "s" : ""}` : "",
    recurringCount ? `${recurringCount} recurring template${recurringCount !== 1 ? "s" : ""}` : "",
    coverageRes.count
      ? `${coverageRes.count} coverage requirement${coverageRes.count !== 1 ? "s" : ""}`
      : "",
  ]);
}

export async function checkJobDependencies(jobId: number, orgId: string): Promise<DependencyInfo> {
  const [scheduleCells, recurringStates, coverageRes] = await Promise.all([
    loadActiveScheduleCellDependencies(orgId),
    loadActiveRecurringStateDependencies(orgId),
    supabase
      .from("coverage_requirements")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("job_id", jobId),
  ]);
  const shiftCount = scheduleCells.filter((cell) =>
    (cell.snapshots ?? []).some((snapshot) =>
      (snapshot.segments ?? []).some((segment) => segment.job_id === jobId),
    ),
  ).length;
  const recurringCount = recurringStates.filter((row) =>
    recurringStateUsesJob(row.state, jobId),
  ).length;
  return buildSummary([
    shiftCount ? `${shiftCount} shift${shiftCount !== 1 ? "s" : ""}` : "",
    recurringCount ? `${recurringCount} recurring template${recurringCount !== 1 ? "s" : ""}` : "",
    coverageRes.count
      ? `${coverageRes.count} coverage requirement${coverageRes.count !== 1 ? "s" : ""}`
      : "",
  ]);
}

export async function checkAbsenceTypeDependencies(
  atId: number,
  orgId: string,
): Promise<DependencyInfo> {
  const [scheduleCells, recurringStates] = await Promise.all([
    loadActiveScheduleCellDependencies(orgId),
    loadActiveRecurringStateDependencies(orgId),
  ]);
  const shiftCount = scheduleCells.filter((cell) =>
    (cell.snapshots ?? []).some((snapshot) => snapshot.absence_type_id === atId),
  ).length;
  const recurringCount = recurringStates.filter((row) =>
    recurringStateUsesAbsenceType(row.state, atId),
  ).length;
  return buildSummary([
    shiftCount ? `${shiftCount} shift${shiftCount !== 1 ? "s" : ""}` : "",
    recurringCount ? `${recurringCount} recurring template${recurringCount !== 1 ? "s" : ""}` : "",
  ]);
}

export async function checkIndicatorTypeDependencies(
  itId: number,
  orgId: string,
): Promise<DependencyInfo> {
  const { count } = await supabase
    .from("schedule_notes")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("indicator_type_id", itId);
  return buildSummary([count ? `${count} schedule note${count !== 1 ? "s" : ""}` : ""]);
}

// ── Certifications ───────────────────────────────────────────────────────────

export async function fetchCertifications(
  orgId: string,
  includeArchived = false,
): Promise<NamedItem[]> {
  if (!includeArchived) {
    return cacheThrough(CacheKey.certifications(orgId), TTL.STABLE, async () => {
      const { data, error } = await supabase
        .from("certifications")
        .select(NAMED_ITEM_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data as DbNamedItem[]).map(rowToNamedItem);
    });
  }
  const query = supabase.from("certifications").select(NAMED_ITEM_COLS).eq("org_id", orgId);
  const { data, error } = await query.order("sort_order");
  if (error) throw error;
  return (data as DbNamedItem[]).map(rowToNamedItem);
}

export async function saveCertifications(
  orgId: string,
  items: NamedItem[],
  existing: NamedItem[],
): Promise<NamedItem[]> {
  const { created, updated, archived } = await saveNamedEntities({
    table: "certifications",
    orgId,
    items,
    existing,
    toRow: (item, sortOrder) => ({
      name: item.name,
      abbr: item.abbr,
      department_id: item.departmentId ?? null,
      sort_order: sortOrder,
    }),
  });

  await cacheDel(
    CacheKey.certifications(orgId),
    CacheKey.assignments(orgId),
    CacheKey.assignments(orgId, true),
  );
  void logAudit(
    "certifications.saved",
    "certification",
    null,
    { created, updated, archived },
    orgId,
  );
  return fetchCertifications(orgId);
}

export async function restoreCertification(certId: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("certifications")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", certId);
  if (error) throw error;
  await cacheDel(CacheKey.certifications(orgId));
  void logAudit("certification.restored", "certification", String(certId), {}, orgId);
}

// ── Organization Roles ───────────────────────────────────────────────────────

export async function fetchOrganizationRoles(
  orgId: string,
  includeArchived = false,
): Promise<NamedItem[]> {
  if (!includeArchived) {
    return cacheThrough(CacheKey.orgRoles(orgId), TTL.STABLE, async () => {
      const { data, error } = await supabase
        .from("organization_roles")
        .select(ORG_ROLE_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data as DbNamedItem[]).map(rowToNamedItem);
    });
  }
  const query = supabase.from("organization_roles").select(ORG_ROLE_COLS).eq("org_id", orgId);
  const { data, error } = await query.order("sort_order");
  if (error) throw error;
  return (data as DbNamedItem[]).map(rowToNamedItem);
}

export async function saveOrganizationRoles(
  orgId: string,
  items: NamedItem[],
  existing: NamedItem[],
): Promise<NamedItem[]> {
  const { created, updated, archived } = await saveNamedEntities({
    table: "organization_roles",
    orgId,
    items,
    existing,
    toRow: (item, sortOrder) => ({
      name: item.name,
      abbr: item.abbr,
      is_schedule_role: item.isScheduleRole ?? true,
      department_id: item.departmentId ?? null,
      sort_order: sortOrder,
    }),
  });

  await cacheDel(CacheKey.orgRoles(orgId));
  void logAudit("org_roles.saved", "org_role", null, { created, updated, archived }, orgId);
  return fetchOrganizationRoles(orgId);
}

export async function restoreOrganizationRole(roleId: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("organization_roles")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", roleId);
  if (error) throw error;
  await cacheDel(CacheKey.orgRoles(orgId));
  void logAudit("org_role.restored", "org_role", String(roleId), {}, orgId);
}

// ── Focus Areas ──────────────────────────────────────────────────────────────

export async function fetchFocusAreas(
  orgId: string,
  includeArchived = false,
): Promise<FocusArea[]> {
  if (!includeArchived) {
    return cacheThrough(CacheKey.focusAreas(orgId), TTL.STABLE, async () => {
      const { data, error } = await supabase
        .from("focus_areas")
        .select(FOCUS_AREA_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data as DbFocusArea[]).map(rowToFocusArea);
    });
  }
  const { data, error } = await supabase
    .from("focus_areas")
    .select(FOCUS_AREA_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (error) throw error;
  return (data as DbFocusArea[]).map(rowToFocusArea);
}

/**
 * Auto-migration: if focus areas exist without a department_id and no scheduled
 * departments exist yet, create a default scheduled department and assign all
 * orphaned focus areas to it.
 * - 1 FA: department takes the FA's name
 * - 2+ FAs: department is named "Schedule"
 * Returns true if migration occurred, false if not needed.
 */
export async function autoMigrateOrphanedFocusAreas(orgId: string): Promise<boolean> {
  // Late import to avoid circular dependency — fetchDepartments lives in a sibling module
  const { fetchDepartments } = await import("./employees");

  const [depts, fas] = await Promise.all([fetchDepartments(orgId), fetchFocusAreas(orgId)]);

  const scheduledDepts = depts.filter((d: { type: string }) => d.type === "scheduled");
  const orphanedFAs = fas.filter((fa) => fa.departmentId === null);

  // Nothing to migrate if there are scheduled depts or no orphaned FAs
  if (scheduledDepts.length > 0 || orphanedFAs.length === 0) return false;

  // Create a default scheduled department
  const deptName = orphanedFAs.length === 1 ? orphanedFAs[0].name : "Schedule";
  const { data: inserted, error: insertErr } = await supabase
    .from("departments")
    .insert({ org_id: orgId, name: deptName, abbr: "", type: "scheduled", sort_order: 0 })
    .select("id")
    .single();
  if (insertErr) throw insertErr;

  const newDeptId = inserted.id as number;

  // Assign all orphaned FAs to this department
  const faIds = orphanedFAs.map((fa) => fa.id);
  const { error: updateErr } = await supabase
    .from("focus_areas")
    .update({ department_id: newDeptId })
    .in("id", faIds);
  if (updateErr) throw updateErr;

  // Bust caches
  await cacheDel(CacheKey.departments(orgId), CacheKey.focusAreas(orgId));
  return true;
}

export async function upsertFocusArea(
  focusArea: Omit<FocusArea, "id"> & { id?: number },
): Promise<FocusArea> {
  const row = {
    org_id: focusArea.orgId,
    department_id: focusArea.departmentId ?? null,
    name: focusArea.name,
    color: normalizePresetBg(focusArea.color),
    sort_order: focusArea.sortOrder,
  };
  if (focusArea.id) {
    const { data, error } = await supabase
      .from("focus_areas")
      .update(row)
      .eq("id", focusArea.id)
      .select()
      .single();
    if (error) throw error;
    await cacheDel(CacheKey.focusAreas(focusArea.orgId));
    void logAudit(
      "focus_area.upserted",
      "focus_area",
      String(focusArea.id),
      { name: focusArea.name },
      focusArea.orgId,
    );
    return rowToFocusArea(data as DbFocusArea);
  }
  const { data, error } = await supabase.from("focus_areas").insert(row).select().single();
  if (error) throw error;
  await cacheDel(CacheKey.focusAreas(focusArea.orgId));
  const result = rowToFocusArea(data as DbFocusArea);
  void logAudit(
    "focus_area.upserted",
    "focus_area",
    String(result.id),
    { name: focusArea.name },
    focusArea.orgId,
  );
  return result;
}

export async function deleteFocusArea(focusAreaId: number, orgId: string): Promise<void> {
  const now = new Date().toISOString();

  // Archive dependent shift_categories for this focus area
  const { error: catErr } = await supabase
    .from("shift_categories")
    .update({ archived_at: now })
    .eq("org_id", orgId)
    .eq("focus_area_id", focusAreaId)
    .is("archived_at", null);
  if (catErr) throw catErr;

  // Remove this focus area from employee focusAreaIds arrays (single batch UPDATE via RPC)
  const { error: empErr } = await supabase.rpc("remove_focus_area_from_employees", {
    p_focus_area_id: focusAreaId,
  });
  if (empErr) throw empErr;

  // Soft-delete the focus area (row persists — all FK/array references remain valid)
  const { error } = await supabase
    .from("focus_areas")
    .update({ archived_at: now })
    .eq("org_id", orgId)
    .eq("id", focusAreaId);
  if (error) throw error;
  await cacheDel(
    CacheKey.focusAreas(orgId),
    CacheKey.assignments(orgId),
    CacheKey.assignments(orgId, true),
    CacheKey.shiftCategories(orgId),
    CacheKey.employees(orgId),
    CacheKey.coverageReqs(orgId),
  );
  void logAudit("focus_area.archived", "focus_area", String(focusAreaId), {}, orgId);
}

export async function restoreFocusArea(focusAreaId: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("focus_areas")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", focusAreaId);
  if (error) throw error;
  await cacheDel(CacheKey.focusAreas(orgId));
  void logAudit("focus_area.restored", "focus_area", String(focusAreaId), {}, orgId);
}

// ── Schedule Assignment Options ───────────────────────────────────────────────

export async function fetchAssignmentDefinitions(
  orgId: string,
  includeArchived = false,
): Promise<AssignmentDefinition[]> {
  return cacheThrough(CacheKey.assignments(orgId, includeArchived), TTL.STABLE, async () => {
    const [focusAreas, shiftCategories, jobs] = await Promise.all([
      fetchFocusAreas(orgId, includeArchived),
      fetchShiftCategories(orgId, includeArchived),
      fetchJobDefinitions(orgId, includeArchived),
    ]);
    return buildScheduleAssignmentOptions({
      orgId,
      focusAreas,
      shiftCategories,
      jobs,
      includeArchived,
    });
  });
}

export async function fetchShiftCategories(
  orgId: string,
  includeArchived = false,
): Promise<ShiftCategory[]> {
  if (!includeArchived) {
    return cacheThrough(CacheKey.shiftCategories(orgId), TTL.STABLE, async () => {
      const { data, error } = await supabase
        .from("shift_categories")
        .select(SHIFT_CATEGORY_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data as DbShiftCategory[]).map(rowToShiftCategory);
    });
  }
  const { data, error } = await supabase
    .from("shift_categories")
    .select(SHIFT_CATEGORY_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (error) throw error;
  return (data as DbShiftCategory[]).map(rowToShiftCategory);
}

export async function fetchJobDefinitions(
  orgId: string,
  includeArchived = false,
): Promise<JobDefinition[]> {
  return cacheThrough(CacheKey.jobs(orgId, includeArchived), TTL.STABLE, async () => {
    let query = supabase.from("jobs").select(JOB_COLS).eq("org_id", orgId);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query.order("sort_order");
    if (error) throw error;
    return (data as DbJobDefinition[]).map(rowToJobDefinition);
  });
}

async function refreshDerivedScheduleCaches(orgId: string): Promise<void> {
  await cacheDel(
    CacheKey.assignments(orgId),
    CacheKey.assignments(orgId, true),
    CacheKey.jobs(orgId),
    CacheKey.jobs(orgId, true),
  );
}

export async function upsertJobDefinition(
  job: Omit<JobDefinition, "id"> & { id?: number },
): Promise<JobDefinition> {
  const focusAreaIds = getStoredJobFocusAreaIds(job);
  const departmentIds = getStoredJobDepartmentIds(job);
  const normalizedTiming = normalizeShiftlessJobTiming(job);
  const isShiftlessJob = (job.assignmentMode ?? "with_shift") === "shiftless";
  const storedStyle = isShiftlessJob
    ? {
        color: job.color,
        borderColor: job.border,
        textColor: job.text,
      }
    : SCHEDULED_JOB_STORAGE_STYLE;
  const row = {
    org_id: job.orgId,
    name: job.name,
    abbr: job.abbr,
    show_on_grid: job.showOnGrid,
    assignment_mode: job.assignmentMode ?? "with_shift",
    eligibility_mode: getJobEligibilityMode(job),
    focus_area_ids: focusAreaIds,
    department_ids: departmentIds,
    applicable_shift_ids: normalizePlacementIds(job.applicableShiftIds),
    eligible_role_ids: job.eligibleRoleIds ?? [],
    required_certification_ids: job.requiredCertificationIds ?? [],
    color: storedStyle.color,
    border_color: storedStyle.borderColor,
    text_color: storedStyle.textColor,
    shift_time_overrides: normalizeShiftTimeOverrides(job.shiftTimeOverrides),
    shift_color_overrides: normalizeShiftColorOverrides(job.shiftColorOverrides),
    default_start_time: normalizedTiming.defaultStartTime,
    default_end_time: normalizedTiming.defaultEndTime,
    default_duration_hours: normalizedTiming.defaultDurationHours,
    default_duration_minutes: normalizedTiming.defaultDurationMinutes,
    sort_order: job.sortOrder,
    system_key: job.systemKey ?? null,
  };

  let saved: DbJobDefinition;
  if (job.id) {
    const { data, error } = await supabase
      .from("jobs")
      .update(row)
      .eq("org_id", job.orgId)
      .eq("id", job.id)
      .select(JOB_COLS)
      .single();
    if (error) throw error;
    saved = data as DbJobDefinition;
  } else {
    const { data, error } = await supabase.from("jobs").insert(row).select(JOB_COLS).single();
    if (error) throw error;
    saved = data as DbJobDefinition;
  }

  await refreshDerivedScheduleCaches(job.orgId);
  void logAudit("job.upserted", "job", String(saved.id), { name: job.name }, job.orgId);
  return rowToJobDefinition(saved);
}

export async function deleteJobDefinition(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({ archived_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await refreshDerivedScheduleCaches(orgId);
  void logAudit("job.archived", "job", String(id), {}, orgId);
}

export async function restoreJobDefinition(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await refreshDerivedScheduleCaches(orgId);
  void logAudit("job.restored", "job", String(id), {}, orgId);
}

export async function upsertShiftCategory(
  cat: Omit<ShiftCategory, "id"> & { id?: number },
): Promise<ShiftCategory> {
  const row = {
    org_id: cat.orgId,
    name: cat.name,
    abbr: cat.abbr ?? null,
    start_time: cat.startTime ?? null,
    end_time: cat.endTime ?? null,
    color: normalizePresetBg(cat.color),
    sort_order: cat.sortOrder,
    focus_area_id: cat.focusAreaId ?? null,
    break_minutes: cat.breakMinutes ?? null,
  };
  if (cat.id) {
    const { data, error } = await supabase
      .from("shift_categories")
      .update(row)
      .eq("id", cat.id)
      .select()
      .single();
    if (error) throw error;
    await cacheDel(CacheKey.shiftCategories(cat.orgId));
    await refreshDerivedScheduleCaches(cat.orgId);
    void logAudit(
      "shift_category.upserted",
      "shift_category",
      String(cat.id),
      { name: cat.name },
      cat.orgId,
    );
    return rowToShiftCategory(data as DbShiftCategory);
  }
  const { data, error } = await supabase.from("shift_categories").insert(row).select().single();
  if (error) throw error;
  await cacheDel(CacheKey.shiftCategories(cat.orgId));
  await refreshDerivedScheduleCaches(cat.orgId);
  void logAudit(
    "shift_category.upserted",
    "shift_category",
    String((data as DbShiftCategory).id),
    { name: cat.name },
    cat.orgId,
  );
  return rowToShiftCategory(data as DbShiftCategory);
}

export async function deleteShiftCategory(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("shift_categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.shiftCategories(orgId));
  await refreshDerivedScheduleCaches(orgId);
  void logAudit("shift_category.archived", "shift_category", String(id), {}, orgId);
}

export async function restoreShiftCategory(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("shift_categories")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.shiftCategories(orgId));
  await refreshDerivedScheduleCaches(orgId);
  void logAudit("shift_category.restored", "shift_category", String(id), {}, orgId);
}

// ── Coverage Requirements ────────────────────────────────────────────────────

export async function fetchCoverageRequirements(orgId: string): Promise<CoverageRequirement[]> {
  return cacheThrough(CacheKey.coverageReqs(orgId), TTL.STABLE, async () => {
    const [{ data, error }, jobs] = await Promise.all([
      supabase.from("coverage_requirements").select(COVERAGE_REQ_COLS).eq("org_id", orgId),
      fetchJobDefinitions(orgId, true),
    ]);
    if (error) throw error;

    const rows = (data as DbCoverageRequirement[] | null) ?? [];
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
    return rows
      .map(rowToCoverageRequirement)
      .filter(
        (requirement) => (requirement.jobId ?? 0) > 0 && visibleJobIds.has(requirement.jobId ?? 0),
      );
  });
}

/**
 * Batch save coverage requirements for a (focus_area, assignment) combo.
 * Replaces all existing rows for that combo (delete + insert).
 */
export async function saveCoverageRequirements(
  orgId: string,
  focusAreaId: number,
  jobId: number,
  preferredShiftId: number | null,
  requirements: { dayOfWeek: number | null; minStaff: number }[],
): Promise<CoverageRequirement[]> {
  let deleteQuery = supabase
    .from("coverage_requirements")
    .delete()
    .eq("org_id", orgId)
    .eq("focus_area_id", focusAreaId)
    .eq("job_id", jobId);
  deleteQuery =
    preferredShiftId == null
      ? deleteQuery.is("preferred_shift_id", null)
      : deleteQuery.eq("preferred_shift_id", preferredShiftId);
  const { error: delError } = await deleteQuery;
  if (delError) throw delError;

  // Filter out zero-value rows and insert
  const rows = requirements
    .filter((r) => r.minStaff > 0)
    .map((r) => ({
      org_id: orgId,
      focus_area_id: focusAreaId,
      job_id: jobId,
      preferred_shift_id: preferredShiftId,
      day_of_week: r.dayOfWeek,
      min_staff: r.minStaff,
    }));

  if (rows.length === 0) {
    await cacheDel(CacheKey.coverageReqs(orgId));
    void logAudit(
      "coverage_requirements.saved",
      "coverage_requirement",
      `${focusAreaId}_${jobId}_${preferredShiftId ?? "null"}`,
      { count: 0 },
      orgId,
    );
    return [];
  }

  const { data, error } = await supabase.from("coverage_requirements").insert(rows).select();
  if (error) throw error;
  await cacheDel(CacheKey.coverageReqs(orgId));
  void logAudit(
    "coverage_requirements.saved",
    "coverage_requirement",
    `${focusAreaId}_${jobId}_${preferredShiftId ?? "null"}`,
    { count: rows.length },
    orgId,
  );
  return (data as DbCoverageRequirement[])
    .map(rowToCoverageRequirement)
    .filter((requirement) => (requirement.jobId ?? 0) > 0);
}

// ── Absence Types ────────────────────────────────────────────────────────────

export async function fetchAbsenceTypes(
  orgId: string,
  includeArchived = false,
): Promise<AbsenceType[]> {
  return cacheThrough(CacheKey.absenceTypes(orgId, includeArchived), TTL.STABLE, async () => {
    let query = supabase.from("absence_types").select(ABSENCE_TYPE_COLS).eq("org_id", orgId);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query.order("sort_order");
    if (error) throw error;
    return (data as DbAbsenceType[]).map(rowToAbsenceType);
  });
}

export async function upsertAbsenceType(
  at: Omit<AbsenceType, "id"> & { id?: number },
): Promise<AbsenceType> {
  const row = {
    org_id: at.orgId,
    label: at.label,
    name: at.name,
    color: at.color,
    border_color: at.border,
    text_color: at.text,
    sort_order: at.sortOrder,
  };

  let saved: DbAbsenceType;
  if (at.id) {
    const { data, error } = await supabase
      .from("absence_types")
      .update(row)
      .eq("id", at.id)
      .select()
      .single();
    if (error) throw error;
    saved = data as DbAbsenceType;
  } else {
    const { data, error } = await supabase.from("absence_types").insert(row).select().single();
    if (error) throw error;
    saved = data as DbAbsenceType;
  }

  await cacheDel(CacheKey.absenceTypes(at.orgId), CacheKey.absenceTypes(at.orgId, true));
  void logAudit(
    "absence_type.upserted",
    "absence_type",
    String(saved.id),
    { label: at.label, name: at.name },
    at.orgId,
  );
  return rowToAbsenceType(saved);
}

export async function deleteAbsenceType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("absence_types")
    .update({ archived_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.absenceTypes(orgId), CacheKey.absenceTypes(orgId, true));
  void logAudit("absence_type.archived", "absence_type", String(id), {}, orgId);
}

export async function restoreAbsenceType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("absence_types")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.absenceTypes(orgId), CacheKey.absenceTypes(orgId, true));
  void logAudit("absence_type.restored", "absence_type", String(id), {}, orgId);
}

// ── Indicator Types ──────────────────────────────────────────────────────────

export async function fetchIndicatorTypes(
  orgId: string,
  includeArchived = false,
): Promise<IndicatorType[]> {
  if (!includeArchived) {
    return cacheThrough(CacheKey.indicatorTypes(orgId), TTL.STABLE, async () => {
      const { data, error } = await supabase
        .from("indicator_types")
        .select(INDICATOR_TYPE_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data as DbIndicatorType[]).map(rowToIndicatorType);
    });
  }
  const { data, error } = await supabase
    .from("indicator_types")
    .select(INDICATOR_TYPE_COLS)
    .eq("org_id", orgId)
    .order("sort_order");
  if (error) throw error;
  return (data as DbIndicatorType[]).map(rowToIndicatorType);
}

export async function upsertIndicatorType(
  indicator: Omit<IndicatorType, "id"> & { id?: number },
): Promise<IndicatorType> {
  const row = {
    org_id: indicator.orgId,
    name: indicator.name,
    color: indicator.color,
    sort_order: indicator.sortOrder,
  };
  if (indicator.id) {
    const { data, error } = await supabase
      .from("indicator_types")
      .update(row)
      .eq("id", indicator.id)
      .select()
      .single();
    if (error) throw error;
    await cacheDel(CacheKey.indicatorTypes(indicator.orgId));
    void logAudit(
      "indicator_type.upserted",
      "indicator_type",
      String(indicator.id),
      { name: indicator.name },
      indicator.orgId,
    );
    return rowToIndicatorType(data as DbIndicatorType);
  }
  const { data, error } = await supabase.from("indicator_types").insert(row).select().single();
  if (error) throw error;
  await cacheDel(CacheKey.indicatorTypes(indicator.orgId));
  void logAudit(
    "indicator_type.upserted",
    "indicator_type",
    String((data as DbIndicatorType).id),
    { name: indicator.name },
    indicator.orgId,
  );
  return rowToIndicatorType(data as DbIndicatorType);
}

export async function deleteIndicatorType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("indicator_types")
    .update({ archived_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.indicatorTypes(orgId));
  void logAudit("indicator_type.archived", "indicator_type", String(id), {}, orgId);
}

export async function restoreIndicatorType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("indicator_types")
    .update({ archived_at: null })
    .eq("org_id", orgId)
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.indicatorTypes(orgId));
  void logAudit("indicator_type.restored", "indicator_type", String(id), {}, orgId);
}
