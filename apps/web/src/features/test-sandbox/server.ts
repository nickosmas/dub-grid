import { randomUUID } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { DbOrganization } from "@dubgrid/db-types";
import { rowToOrganization } from "@/lib/db/mappers";
import { ORGANIZATION_WITH_BILLING_COLS } from "@/lib/db/shared";
import {
  DEFAULT_SHIFT_JOB_SYSTEM_KEY,
  REGULAR_STAFF_SYSTEM_KEY,
} from "@/lib/system-jobs";

const SANDBOX_TEMPLATE_VERSION = 1;
const SANDBOX_TTL_DAYS = 30;

type Row = Record<string, unknown>;

type SandboxSeedResult = {
  org: ReturnType<typeof rowToOrganization>;
  sourceOrgId: string;
  employeeCount: number;
};

type SandboxPersonName = {
  firstName: string;
  lastName: string;
};

type SandboxSchedulePair = {
  shiftId: number;
  jobId: number;
};

const DEFAULT_DEPARTMENTS = [
  { name: "Residential Care", abbr: "RC", type: "scheduled", sort_order: 0, permissions: null },
  { name: "Community Programs", abbr: "CP", type: "scheduled", sort_order: 1, permissions: null },
  { name: "Training Office", abbr: "TR", type: "management", sort_order: 2, permissions: null },
] as const;

const DEFAULT_FOCUS_AREAS = [
  { name: "North Hall", color: "#DBEAFE", sort_order: 0 },
  { name: "South Hall", color: "#DCFCE7", sort_order: 1 },
] as const;

const DEFAULT_SHIFTS = [
  { name: "Day", abbr: "D", start_time: "07:00", end_time: "15:00", color: "#DBEAFE", sort_order: 0, break_minutes: 30 },
  { name: "Evening", abbr: "E", start_time: "15:00", end_time: "23:00", color: "#FDE68A", sort_order: 1, break_minutes: 30 },
] as const;

const DEFAULT_ABSENCE_TYPES = [
  { label: "PTO", name: "Paid Time Off", color: "#FCE7F3", border_color: "#F9A8D4", text_color: "#831843", sort_order: 0 },
  { label: "TRN", name: "Training", color: "#E0E7FF", border_color: "#A5B4FC", text_color: "#3730A3", sort_order: 1 },
] as const;

const DEFAULT_CERTIFICATIONS = [
  { name: "Medication Support", abbr: "MED", sort_order: 0 },
  { name: "First Aid", abbr: "FA", sort_order: 1 },
] as const;

const DEFAULT_ROLES = [
  { name: "Care Specialist", abbr: "CS", is_schedule_role: true, sort_order: 0 },
  { name: "Team Lead", abbr: "TL", is_schedule_role: true, sort_order: 1 },
] as const;

const DEFAULT_JOBS = [
  {
    name: "Floor Coverage",
    abbr: "FC",
    show_on_grid: true,
    assignment_mode: "with_shift",
    eligibility_mode: "and",
    color: "#E2E8F0",
    border_color: "#CBD5E1",
    text_color: "#1E293B",
    sort_order: 0,
  },
  {
    name: "Mentor",
    abbr: "M",
    show_on_grid: true,
    assignment_mode: "both",
    eligibility_mode: "or",
    color: "#DCFCE7",
    border_color: "#86EFAC",
    text_color: "#14532D",
    sort_order: 1,
  },
] as const;

const FALLBACK_SANDBOX_PEOPLE = [
  ["Avery", "Stone"],
  ["Jordan", "Lee"],
  ["Morgan", "Patel"],
  ["Casey", "Rivera"],
  ["Taylor", "Nguyen"],
] as const;

const PRESERVED_SANDBOX_SYSTEM_JOB_KEYS = new Set([
  DEFAULT_SHIFT_JOB_SYSTEM_KEY,
  REGULAR_STAFF_SYSTEM_KEY,
]);

function futureIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function dateKey(daysFromToday: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function sandboxSlug(actorId: string): string {
  return `test-sandbox-${actorId.slice(0, 8)}-${randomUUID().slice(0, 8)}`;
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function splitDisplayName(displayName: string): SandboxPersonName {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Test Sandbox", lastName: "User" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizePersonName(name: SandboxPersonName): string {
  return `${name.firstName} ${name.lastName}`.trim().toLowerCase();
}

export function buildSandboxPeopleNames(input: {
  actorName: SandboxPersonName;
  sourcePeopleNames: SandboxPersonName[];
}): SandboxPersonName[] {
  const seededNames =
    input.sourcePeopleNames.length > 0
      ? input.sourcePeopleNames
      : FALLBACK_SANDBOX_PEOPLE.map(([firstName, lastName]) => ({
          firstName,
          lastName,
        }));

  const names = [input.actorName, ...seededNames];
  const seen = new Set<string>();
  return names.filter((name) => {
    const normalized = normalizePersonName(name);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function numericArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "number" ? entry : Number(entry)))
    .filter((entry) => Number.isInteger(entry));
}

export function mapSandboxJobSystemKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return PRESERVED_SANDBOX_SYSTEM_JOB_KEYS.has(value) ? value : null;
}

export function buildSandboxOwnerMembership(input: {
  actorId: string;
  sandboxOrgId: string;
  onboardingCompletedAt: string;
}): Row {
  return {
    user_id: input.actorId,
    org_id: input.sandboxOrgId,
    org_role: "super_admin",
    admin_permissions: null,
    department_ids: [],
    dept_admin_ids: [],
    phone: null,
    onboarding_completed_at: input.onboardingCompletedAt,
    archived_at: null,
    archived_by: null,
  };
}

async function selectRows(
  serviceClient: SupabaseClient,
  table: string,
  columns: string,
  orgId: string,
  orderBy: string | null = "sort_order",
  hasArchivedAt = true,
): Promise<Row[]> {
  let query = serviceClient
    .from(table)
    .select(columns)
    .eq("org_id", orgId);
  if (hasArchivedAt) {
    query = query.is("archived_at", null);
  }
  if (orderBy) {
    query = query.order(orderBy, { ascending: true });
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Row[];
}

async function insertRows(
  serviceClient: SupabaseClient,
  table: string,
  rows: Row[],
  select = "id",
): Promise<Row[]> {
  if (rows.length === 0) return [];
  const { data, error } = await serviceClient.from(table).insert(rows).select(select);
  if (error) throw error;
  return (data ?? []) as unknown as Row[];
}

function mapIds(ids: unknown, idMap: Map<number, number>): number[] {
  if (!Array.isArray(ids)) return [];
  return ids
    .map((id) => (typeof id === "number" ? idMap.get(id) : null))
    .filter((id): id is number => typeof id === "number");
}

function mappedId(value: unknown, idMap: Map<number, number>): number | null {
  return typeof value === "number" ? idMap.get(value) ?? null : null;
}

export function mapSandboxShiftKeyedRecord(
  value: unknown,
  shiftMap: Map<number, number>,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([sourceShiftId, entry]) => {
      const parsed = Number(sourceShiftId);
      if (!Number.isInteger(parsed)) return [];
      const sandboxShiftId = shiftMap.get(parsed);
      return sandboxShiftId ? [[String(sandboxShiftId), entry]] : [];
    }),
  );
}

export function buildDefaultSandboxJobRows(input: {
  sandboxOrgId: string;
  fallbackFocusAreaId: number | null;
  fallbackDepartmentId: number | null;
  fallbackRoleId: number | null;
  fallbackCertId: number | null;
  shiftIds: number[];
}): Row[] {
  return DEFAULT_JOBS.map((row) => {
    const assignmentMode = row.assignment_mode as string;
    return {
      ...row,
      org_id: input.sandboxOrgId,
      focus_area_ids: input.fallbackFocusAreaId ? [input.fallbackFocusAreaId] : [],
      department_ids: input.fallbackDepartmentId ? [input.fallbackDepartmentId] : [],
      applicable_shift_ids:
        assignmentMode === "shiftless" ? [] : input.shiftIds,
      eligible_role_ids: input.fallbackRoleId ? [input.fallbackRoleId] : [],
      required_certification_ids: input.fallbackCertId ? [input.fallbackCertId] : [],
      shift_time_overrides: {},
      shift_color_overrides: {},
      default_start_time: null,
      default_end_time: null,
      default_duration_hours: null,
      default_duration_minutes: null,
      system_key: null,
    };
  });
}

export function buildSandboxSchedulePairs(input: {
  jobRows: Row[];
  jobs: Row[];
  shifts: Row[];
  focusAreas: Row[];
}): SandboxSchedulePair[] {
  const focusAreaDepartmentById = new Map<number, number | null>();
  input.focusAreas.forEach((row) => {
    if (typeof row.id !== "number") return;
    focusAreaDepartmentById.set(
      row.id,
      typeof row.department_id === "number" ? row.department_id : null,
    );
  });

  const shiftRows = input.shifts
    .map((row) => ({
      id: typeof row.id === "number" ? row.id : null,
      focusAreaId:
        typeof row.focus_area_id === "number" ? row.focus_area_id : null,
    }))
    .filter((row): row is { id: number; focusAreaId: number | null } =>
      typeof row.id === "number",
    );

  return input.jobRows.flatMap((jobRow, index) => {
    if (jobRow.assignment_mode === "shiftless") return [];
    const jobId = input.jobs[index]?.id;
    if (typeof jobId !== "number") return [];

    const applicableShiftIds = new Set(numericArray(jobRow.applicable_shift_ids));
    const focusAreaIds = new Set(numericArray(jobRow.focus_area_ids));
    const departmentIds = new Set(numericArray(jobRow.department_ids));

    return shiftRows
      .filter((shift) => {
        if (applicableShiftIds.size > 0 && !applicableShiftIds.has(shift.id)) {
          return false;
        }
        if (focusAreaIds.size > 0) {
          return shift.focusAreaId != null && focusAreaIds.has(shift.focusAreaId);
        }
        if (departmentIds.size > 0) {
          const departmentId =
            shift.focusAreaId == null
              ? null
              : focusAreaDepartmentById.get(shift.focusAreaId) ?? null;
          return departmentId != null && departmentIds.has(departmentId);
        }
        return true;
      })
      .map((shift) => ({
        shiftId: shift.id,
        jobId,
      }));
  });
}

async function loadSourceOrganization(
  serviceClient: SupabaseClient,
  sourceOrgId: string,
) {
  const { data, error } = await serviceClient
    .from("organizations")
    .select(ORGANIZATION_WITH_BILLING_COLS)
    .eq("id", sourceOrgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Source workspace not found");
  const org = rowToOrganization(data as DbOrganization);
  if (org.archivedAt) {
    throw new Error("Choose an active workspace before opening the test sandbox.");
  }
  if (org.workspaceKind === "sandbox") {
    throw new Error("Choose a real workspace before opening the test sandbox.");
  }
  return org;
}

async function loadActorSandboxName(
  serviceClient: SupabaseClient,
  actor: User,
): Promise<SandboxPersonName> {
  const { data, error } = await serviceClient
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", actor.id)
    .maybeSingle();
  if (error) throw error;

  const profileFirstName = cleanString((data as Row | null)?.first_name);
  const profileLastName = cleanString((data as Row | null)?.last_name);
  if (profileFirstName || profileLastName) {
    return {
      firstName: profileFirstName || profileLastName,
      lastName: profileFirstName ? profileLastName : "",
    };
  }

  const metadata = actor.user_metadata ?? {};
  const metadataFirstName = cleanString(metadata.first_name);
  const metadataLastName = cleanString(metadata.last_name);
  if (metadataFirstName || metadataLastName) {
    return {
      firstName: metadataFirstName || metadataLastName,
      lastName: metadataFirstName ? metadataLastName : "",
    };
  }

  const displayName =
    cleanString(metadata.full_name) ||
    cleanString(metadata.name) ||
    cleanString(actor.email?.split("@")[0]);
  return splitDisplayName(displayName || "Test Sandbox User");
}

async function loadSourcePeopleNames(
  serviceClient: SupabaseClient,
  sourceOrgId: string,
): Promise<SandboxPersonName[]> {
  const { data, error } = await serviceClient
    .from("employees")
    .select("first_name, last_name")
    .eq("org_id", sourceOrgId)
    .is("archived_at", null)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as Row[])
    .map((row) => ({
      firstName: cleanString(row.first_name),
      lastName: cleanString(row.last_name),
    }))
    .filter((name) => name.firstName || name.lastName);
}

async function archiveSandboxOrgById(
  serviceClient: SupabaseClient,
  sandboxOrgId: string,
  archivedBy?: string | null,
): Promise<void> {
  const archivedAt = new Date().toISOString();
  const { error } = await serviceClient
    .from("organizations")
    .update({ archived_at: archivedAt })
    .eq("id", sandboxOrgId)
    .eq("workspace_kind", "sandbox");
  if (error) throw error;

  const { error: membershipError } = await serviceClient
    .from("organization_memberships")
    .update({
      archived_at: archivedAt,
      archived_by: archivedBy ?? null,
    })
    .eq("org_id", sandboxOrgId)
    .is("archived_at", null);
  if (membershipError) throw membershipError;
}

async function archiveExpiredSandboxWorkspaces(
  serviceClient: SupabaseClient,
  archivedBy: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await serviceClient
    .from("organizations")
    .select("id")
    .eq("workspace_kind", "sandbox")
    .eq("sandbox_owner_user_id", archivedBy)
    .is("archived_at", null)
    .lt("sandbox_expires_at", now);
  if (error) throw error;

  for (const row of data ?? []) {
    await archiveSandboxOrgById(serviceClient, row.id as string, archivedBy);
  }
}

async function archiveActiveSandboxWorkspacesForOwner(input: {
  serviceClient: SupabaseClient;
  ownerUserId: string;
  sourceOrgId: string;
}): Promise<void> {
  const { data, error } = await input.serviceClient
    .from("organizations")
    .select("id")
    .eq("workspace_kind", "sandbox")
    .eq("sandbox_owner_user_id", input.ownerUserId)
    .eq("sandbox_source_org_id", input.sourceOrgId)
    .is("archived_at", null);
  if (error) throw error;

  for (const row of data ?? []) {
    await archiveSandboxOrgById(
      input.serviceClient,
      row.id as string,
      input.ownerUserId,
    );
  }
}

async function copyConfiguration(
  serviceClient: SupabaseClient,
  sourceOrgId: string,
  sandboxOrgId: string,
) {
  const sourceDepartments = await selectRows(
    serviceClient,
    "departments",
    "id, name, abbr, type, sort_order, permissions",
    sourceOrgId,
  );
  const departmentRows = sourceDepartments.length > 0
    ? sourceDepartments.map((row) => ({
        org_id: sandboxOrgId,
        name: row.name,
        abbr: row.abbr ?? "",
        type: row.type ?? "management",
        sort_order: row.sort_order ?? 0,
        permissions: row.permissions ?? null,
      }))
    : DEFAULT_DEPARTMENTS.map((row) => ({ ...row, org_id: sandboxOrgId }));
  const departments = await insertRows(
    serviceClient,
    "departments",
    departmentRows,
    "id, name, type",
  );
  const departmentMap = new Map<number, number>();
  sourceDepartments.forEach((row, index) => {
    if (typeof row.id === "number" && departments[index]?.id) {
      departmentMap.set(row.id, departments[index].id as number);
    }
  });

  const sourceFocusAreas = await selectRows(
    serviceClient,
    "focus_areas",
    "id, department_id, name, color, sort_order",
    sourceOrgId,
  );
  const scheduledDepartmentIds = departments
    .filter((row) => row.type === "scheduled")
    .map((row) => row.id as number);
  const fallbackDepartmentId = scheduledDepartmentIds[0] ?? null;
  const focusAreaRows = sourceFocusAreas.length > 0
    ? sourceFocusAreas.map((row) => ({
        org_id: sandboxOrgId,
        department_id: mappedId(row.department_id, departmentMap) ?? fallbackDepartmentId,
        name: row.name,
        color: row.color ?? "#E2E8F0",
        sort_order: row.sort_order ?? 0,
      }))
    : DEFAULT_FOCUS_AREAS.map((row, index) => ({
        ...row,
        org_id: sandboxOrgId,
        department_id: scheduledDepartmentIds[index % Math.max(scheduledDepartmentIds.length, 1)] ?? null,
      }));
  const focusAreas = await insertRows(
    serviceClient,
    "focus_areas",
    focusAreaRows,
    "id, name, department_id",
  );
  const focusAreaMap = new Map<number, number>();
  sourceFocusAreas.forEach((row, index) => {
    if (typeof row.id === "number" && focusAreas[index]?.id) {
      focusAreaMap.set(row.id, focusAreas[index].id as number);
    }
  });

  const sourceCertifications = await selectRows(
    serviceClient,
    "certifications",
    "id, department_id, name, abbr, sort_order",
    sourceOrgId,
  );
  const certificationRows = sourceCertifications.length > 0
    ? sourceCertifications.map((row) => ({
        org_id: sandboxOrgId,
        department_id: mappedId(row.department_id, departmentMap),
        name: row.name,
        abbr: row.abbr ?? "",
        sort_order: row.sort_order ?? 0,
      }))
    : DEFAULT_CERTIFICATIONS.map((row) => ({ ...row, org_id: sandboxOrgId, department_id: fallbackDepartmentId }));
  const certifications = await insertRows(serviceClient, "certifications", certificationRows, "id, name");
  const certificationMap = new Map<number, number>();
  sourceCertifications.forEach((row, index) => {
    if (typeof row.id === "number" && certifications[index]?.id) {
      certificationMap.set(row.id, certifications[index].id as number);
    }
  });

  const sourceRoles = await selectRows(
    serviceClient,
    "organization_roles",
    "id, department_id, name, abbr, is_schedule_role, sort_order",
    sourceOrgId,
  );
  const roleRows = sourceRoles.length > 0
    ? sourceRoles.map((row) => ({
        org_id: sandboxOrgId,
        department_id: mappedId(row.department_id, departmentMap),
        name: row.name,
        abbr: row.abbr ?? "",
        is_schedule_role: row.is_schedule_role ?? true,
        sort_order: row.sort_order ?? 0,
      }))
    : DEFAULT_ROLES.map((row) => ({ ...row, org_id: sandboxOrgId, department_id: fallbackDepartmentId }));
  const roles = await insertRows(serviceClient, "organization_roles", roleRows, "id, name");
  const roleMap = new Map<number, number>();
  sourceRoles.forEach((row, index) => {
    if (typeof row.id === "number" && roles[index]?.id) {
      roleMap.set(row.id, roles[index].id as number);
    }
  });

  const sourceShifts = await selectRows(
    serviceClient,
    "shift_categories",
    "id, focus_area_id, name, abbr, start_time, end_time, color, sort_order, break_minutes",
    sourceOrgId,
  );
  const fallbackFocusAreaId = (focusAreas[0]?.id as number | undefined) ?? null;
  const shiftRows = sourceShifts.length > 0
    ? sourceShifts.map((row) => ({
        org_id: sandboxOrgId,
        focus_area_id: mappedId(row.focus_area_id, focusAreaMap) ?? fallbackFocusAreaId,
        name: row.name,
        abbr: row.abbr ?? "",
        start_time: row.start_time ?? null,
        end_time: row.end_time ?? null,
        color: row.color ?? "#E2E8F0",
        sort_order: row.sort_order ?? 0,
        break_minutes: row.break_minutes ?? null,
      }))
    : DEFAULT_SHIFTS.map((row) => ({ ...row, org_id: sandboxOrgId, focus_area_id: fallbackFocusAreaId }));
  const shifts = await insertRows(
    serviceClient,
    "shift_categories",
    shiftRows,
    "id, name, focus_area_id",
  );
  const shiftMap = new Map<number, number>();
  sourceShifts.forEach((row, index) => {
    if (typeof row.id === "number" && shifts[index]?.id) {
      shiftMap.set(row.id, shifts[index].id as number);
    }
  });

  const sourceAbsenceTypes = await selectRows(
    serviceClient,
    "absence_types",
    "id, label, name, color, border_color, text_color, sort_order",
    sourceOrgId,
  );
  const absenceRows = sourceAbsenceTypes.length > 0
    ? sourceAbsenceTypes.map((row) => ({
        org_id: sandboxOrgId,
        label: row.label,
        name: row.name,
        color: row.color ?? "#E2E8F0",
        border_color: row.border_color ?? "transparent",
        text_color: row.text_color ?? "#1E293B",
        sort_order: row.sort_order ?? 0,
      }))
    : DEFAULT_ABSENCE_TYPES.map((row) => ({ ...row, org_id: sandboxOrgId }));
  await insertRows(serviceClient, "absence_types", absenceRows);

  const sourceJobs = await selectRows(
    serviceClient,
    "jobs",
    "id, name, abbr, show_on_grid, assignment_mode, eligibility_mode, focus_area_ids, department_ids, applicable_shift_ids, eligible_role_ids, required_certification_ids, color, border_color, text_color, shift_time_overrides, shift_color_overrides, default_start_time, default_end_time, default_duration_hours, default_duration_minutes, sort_order, system_key",
    sourceOrgId,
  );
  const fallbackRoleId = (roles[0]?.id as number | undefined) ?? null;
  const fallbackCertId = (certifications[0]?.id as number | undefined) ?? null;
  const shiftIds = shifts.map((row) => row.id as number).filter(Boolean);
  const jobRows = sourceJobs.length > 0
    ? sourceJobs.map((row) => ({
        org_id: sandboxOrgId,
        name: row.name,
        abbr: row.abbr ?? "",
        show_on_grid: row.show_on_grid ?? true,
        assignment_mode: row.assignment_mode ?? "with_shift",
        eligibility_mode: row.eligibility_mode ?? "and",
        focus_area_ids: mapIds(row.focus_area_ids, focusAreaMap),
        department_ids: mapIds(row.department_ids, departmentMap),
        applicable_shift_ids: mapIds(row.applicable_shift_ids, shiftMap),
        eligible_role_ids: mapIds(row.eligible_role_ids, roleMap),
        required_certification_ids: mapIds(row.required_certification_ids, certificationMap),
        color: row.color ?? "#E2E8F0",
        border_color: row.border_color ?? "transparent",
        text_color: row.text_color ?? "#1E293B",
        shift_time_overrides: mapSandboxShiftKeyedRecord(
          row.shift_time_overrides,
          shiftMap,
        ),
        shift_color_overrides: mapSandboxShiftKeyedRecord(
          row.shift_color_overrides,
          shiftMap,
        ),
        default_start_time: row.default_start_time ?? null,
        default_end_time: row.default_end_time ?? null,
        default_duration_hours: row.default_duration_hours ?? null,
        default_duration_minutes: row.default_duration_minutes ?? null,
        sort_order: row.sort_order ?? 0,
        system_key: mapSandboxJobSystemKey(row.system_key),
      }))
    : buildDefaultSandboxJobRows({
        sandboxOrgId,
        fallbackFocusAreaId,
        fallbackDepartmentId,
        fallbackRoleId,
        fallbackCertId,
        shiftIds,
      });
  const jobs = await insertRows(serviceClient, "jobs", jobRows, "id, name");
  const jobMap = new Map<number, number>();
  sourceJobs.forEach((row, index) => {
    if (typeof row.id === "number" && jobs[index]?.id) {
      jobMap.set(row.id, jobs[index].id as number);
    }
  });

  const sourceCoverage = await selectRows(
    serviceClient,
    "coverage_requirements",
    "id, focus_area_id, job_id, preferred_shift_id, day_of_week, min_staff",
    sourceOrgId,
    null,
    false,
  );
  const coverageRows = sourceCoverage
    .map((row) => ({
      org_id: sandboxOrgId,
      focus_area_id: mappedId(row.focus_area_id, focusAreaMap),
      job_id: mappedId(row.job_id, jobMap),
      preferred_shift_id: mappedId(row.preferred_shift_id, shiftMap),
      day_of_week: row.day_of_week ?? null,
      min_staff: row.min_staff ?? 0,
    }))
    .filter((row) => row.focus_area_id && row.job_id);
  await insertRows(serviceClient, "coverage_requirements", coverageRows);

  return {
    focusAreas,
    shifts,
    jobs,
    schedulePairs: buildSandboxSchedulePairs({
      jobRows,
      jobs,
      shifts,
      focusAreas,
    }),
    certifications,
    roles,
    scheduledDepartmentIds,
  };
}

async function seedFakePeopleAndSchedule(
  serviceClient: SupabaseClient,
  sandboxOrgId: string,
  actor: User,
  config: Awaited<ReturnType<typeof copyConfiguration>>,
  peopleNames: SandboxPersonName[],
) {
  const focusAreaIds = config.focusAreas.map((row) => row.id as number).filter(Boolean);
  const roleIds = config.roles.map((row) => row.id as number).filter(Boolean);
  const certificationIds = config.certifications.map((row) => row.id as number).filter(Boolean);
  const schedulePairs = config.schedulePairs;
  const departmentIds = config.scheduledDepartmentIds;

  const employees = await insertRows(
    serviceClient,
    "employees",
    peopleNames.map(({ firstName, lastName }, index) => ({
      org_id: sandboxOrgId,
      first_name: firstName,
      last_name: lastName,
      seniority: index,
      phone: "",
      email: "",
      contact_notes: "",
      certification_id: certificationIds[index % Math.max(certificationIds.length, 1)] ?? null,
      role_ids: roleIds.length > 0 ? [roleIds[index % roleIds.length]] : [],
      focus_area_ids: focusAreaIds.length > 0 ? [focusAreaIds[index % focusAreaIds.length]] : [],
      employment_type: "full_time",
      status: "active",
      status_changed_at: null,
      status_note: "",
      user_id: index === 0 ? actor.id : null,
      department_ids: index === 0 && departmentIds.length > 0 ? [departmentIds[0]] : [],
      dept_admin_ids: [],
      version: 0,
    })),
    "id, first_name, last_name",
  );

  if (employees.length === 0 || schedulePairs.length === 0) {
    return employees;
  }

  const cellInputs: Row[] = [];
  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    employees.slice(0, 4).forEach((employee, employeeIndex) => {
      cellInputs.push({
        org_id: sandboxOrgId,
        emp_id: employee.id,
        date: dateKey(dayOffset),
        focus_area_id: focusAreaIds[employeeIndex % Math.max(focusAreaIds.length, 1)] ?? null,
        version: 0,
      });
    });
  }

  const cells = await insertRows(serviceClient, "schedule_cells", cellInputs, "id, emp_id, date");
  const snapshots = await insertRows(
    serviceClient,
    "schedule_cell_snapshots",
    cells.map((cell) => ({
      cell_id: cell.id,
      org_id: sandboxOrgId,
      snapshot_kind: "published",
      state_kind: "worked",
      absence_type_id: null,
      custom_start_time: null,
      custom_end_time: null,
    })),
    "id",
  );

  await insertRows(
    serviceClient,
    "schedule_cell_segments",
    snapshots.map((snapshot, index) => ({
      snapshot_id: snapshot.id,
      org_id: sandboxOrgId,
      position: 0,
      shift_id: schedulePairs[index % schedulePairs.length].shiftId,
      job_id: schedulePairs[index % schedulePairs.length].jobId,
      is_mentored: index % 5 === 0,
    })),
  );

  const requester = employees[1];
  if (requester) {
    const requestPair = schedulePairs[0];
    await insertRows(serviceClient, "shift_requests", [
      {
        org_id: sandboxOrgId,
        type: "pickup",
        status: "open",
        requester_emp_id: requester.id,
        requester_shift_date: dateKey(2),
        requester_state: {
          kind: "worked",
          segments: [
            { shiftId: requestPair.shiftId, jobId: requestPair.jobId, position: 0 },
          ],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        target_emp_id: null,
        target_shift_date: null,
        target_state: null,
        absence_type_id: null,
        parent_request_id: null,
        admin_user_id: null,
        admin_note: null,
      },
    ]);
  }

  return employees;
}

export async function createSandboxWorkspace(input: {
  serviceClient: SupabaseClient;
  requestClient: SupabaseClient;
  actor: User;
  sourceOrgId: string;
  archiveExistingActive?: boolean;
}): Promise<SandboxSeedResult> {
  const sourceOrg = await loadSourceOrganization(input.serviceClient, input.sourceOrgId);
  const [actorName, sourcePeopleNames] = await Promise.all([
    loadActorSandboxName(input.serviceClient, input.actor),
    loadSourcePeopleNames(input.serviceClient, sourceOrg.id),
  ]);

  await archiveExpiredSandboxWorkspaces(input.serviceClient, input.actor.id);
  if (input.archiveExistingActive) {
    await archiveActiveSandboxWorkspacesForOwner({
      serviceClient: input.serviceClient,
      ownerUserId: input.actor.id,
      sourceOrgId: sourceOrg.id,
    });
  }

  const { data: orgRow, error } = await input.serviceClient
    .from("organizations")
    .insert({
      name: sourceOrg.name,
      slug: sandboxSlug(input.actor.id),
      address: sourceOrg.address ?? "",
      address_line_1: sourceOrg.addressLine1 ?? "",
      address_line_2: sourceOrg.addressLine2 ?? "",
      address_city: sourceOrg.addressCity ?? "",
      address_state: sourceOrg.addressState ?? "",
      address_postal_code: sourceOrg.addressPostalCode ?? "",
      address_country: sourceOrg.addressCountry ?? "",
      phone: sourceOrg.phone ?? "",
      employee_count: sourceOrg.employeeCount ?? null,
      focus_area_label: sourceOrg.focusAreaLabel,
      certification_label: sourceOrg.certificationLabel,
      role_label: sourceOrg.roleLabel,
      department_label: sourceOrg.departmentLabel,
      shift_display_mode: sourceOrg.shiftDisplayMode,
      timezone: sourceOrg.timezone ?? "UTC",
      pay_period_start_date: sourceOrg.payPeriodStartDate,
      workspace_kind: "sandbox",
      sandbox_source_org_id: sourceOrg.id,
      sandbox_owner_user_id: input.actor.id,
      sandbox_expires_at: futureIso(SANDBOX_TTL_DAYS),
      sandbox_template_version: SANDBOX_TEMPLATE_VERSION,
      subscription_status: "active",
      trial_ends_at: null,
      enforce_conflict_prevention: sourceOrg.enforceConflictPrevention,
      coverage_rule_config: sourceOrg.coverageRuleConfig ?? { mentoredCoverageCreditPercent: 100 },
      data_retention_days: 30,
      feature_overrides: {
        ...sourceOrg.featureOverrides,
        sandbox: true,
      },
    })
    .select(ORGANIZATION_WITH_BILLING_COLS)
    .single();
  if (error) throw error;

  const org = rowToOrganization(orgRow as DbOrganization);

  try {
    const { error: membershipError } = await input.serviceClient
      .from("organization_memberships")
      .upsert(
        buildSandboxOwnerMembership({
          actorId: input.actor.id,
          sandboxOrgId: org.id,
          onboardingCompletedAt: new Date().toISOString(),
        }),
        { onConflict: "user_id,org_id" },
      );
    if (membershipError) throw membershipError;

    const config = await copyConfiguration(input.serviceClient, sourceOrg.id, org.id);
    const employees = await seedFakePeopleAndSchedule(
      input.serviceClient,
      org.id,
      input.actor,
      config,
      buildSandboxPeopleNames({ actorName, sourcePeopleNames }),
    );

    const { error: switchError } = await input.requestClient.rpc("switch_org", {
      target_org_id: org.id,
    });
    if (switchError) throw switchError;

    return {
      org,
      sourceOrgId: sourceOrg.id,
      employeeCount: employees.length,
    };
  } catch (error) {
    try {
      await archiveSandboxOrgById(input.serviceClient, org.id, input.actor.id);
    } catch {
      // Keep the original creation error visible to the caller.
    }
    throw error;
  }
}

export async function isSandboxWorkspace(
  serviceClient: SupabaseClient,
  orgId: string | null | undefined,
): Promise<boolean> {
  if (!orgId) return false;
  const { data, error } = await serviceClient
    .from("organizations")
    .select("workspace_kind")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data?.workspace_kind === "sandbox";
}

export async function resolveSandboxWorkspaceReset(input: {
  serviceClient: SupabaseClient;
  actor: User;
  sandboxOrgId: string;
}): Promise<{ sourceOrgId: string }> {
  const { data: org, error } = await input.serviceClient
    .from("organizations")
    .select("id, workspace_kind, sandbox_source_org_id, sandbox_owner_user_id")
    .eq("id", input.sandboxOrgId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!org || org.workspace_kind !== "sandbox") {
    throw new Error("Only sandbox workspaces can be reset");
  }
  if (org.sandbox_owner_user_id && org.sandbox_owner_user_id !== input.actor.id) {
    throw new Error("Only the sandbox owner can reset this test sandbox");
  }
  const sourceOrgId = org.sandbox_source_org_id as string | null;
  if (!sourceOrgId) {
    throw new Error("Sandbox source workspace is unavailable");
  }

  return { sourceOrgId };
}

export async function archiveSandboxWorkspace(input: {
  serviceClient: SupabaseClient;
  actor: User;
  sandboxOrgId: string;
}): Promise<{ sourceOrgId: string }> {
  const { sourceOrgId } = await resolveSandboxWorkspaceReset(input);

  await archiveSandboxOrgById(
    input.serviceClient,
    input.sandboxOrgId,
    input.actor.id,
  );

  return { sourceOrgId };
}

export async function findActiveSandboxForUser(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<DbOrganization | null> {
  const { data, error } = await serviceClient
    .from("organizations")
    .select(ORGANIZATION_WITH_BILLING_COLS)
    .eq("workspace_kind", "sandbox")
    .eq("sandbox_owner_user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as DbOrganization | null) ?? null;
}

export async function deleteSandboxWorkspace(input: {
  serviceClient: SupabaseClient;
  requestClient: SupabaseClient;
  actor: User;
  sandboxOrgId: string;
}): Promise<{ sourceOrgId: string; sourceOrgSlug: string | null }> {
  const { sourceOrgId } = await resolveSandboxWorkspaceReset({
    serviceClient: input.serviceClient,
    actor: input.actor,
    sandboxOrgId: input.sandboxOrgId,
  });

  const { data: sourceOrg, error: sourceOrgError } = await input.serviceClient
    .from("organizations")
    .select("slug")
    .eq("id", sourceOrgId)
    .maybeSingle();
  if (sourceOrgError) throw sourceOrgError;

  // Switch the caller's session back to the source workspace before the
  // sandbox row disappears so they don't end up authenticated against a
  // deleted org.
  const { error: switchError } = await input.requestClient.rpc("switch_org", {
    target_org_id: sourceOrgId,
  });
  if (switchError) throw switchError;

  const { error: deleteError } = await input.serviceClient
    .from("organizations")
    .delete()
    .eq("id", input.sandboxOrgId)
    .eq("workspace_kind", "sandbox");
  if (deleteError) throw deleteError;

  return {
    sourceOrgId,
    sourceOrgSlug: (sourceOrg?.slug as string | null) ?? null,
  };
}
