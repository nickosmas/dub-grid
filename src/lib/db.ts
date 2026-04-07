import { supabase } from "@/lib/supabase";
import { arraysEqual, formatDateKey, iterateDateRange } from "@/lib/utils";
import { MAX_SERIES_OCCURRENCES } from "@/lib/constants";
import { parseHost } from "@/lib/subdomain";
import { cacheThrough, cacheDel, CacheKey, TTL } from "@/lib/cache";
import { logAudit } from "@/lib/audit";

// ── PostgREST filter sanitization ──────────────────────────────────────────
// Values interpolated into .or() filter strings must not contain PostgREST
// operators that could alter query semantics.
const POSTGREST_UNSAFE = /[(),."\\]/;

export function assertSafeFilterValue(value: string, label: string): void {
  if (POSTGREST_UNSAFE.test(value)) {
    throw new Error(`Unsafe PostgREST filter value for ${label}`);
  }
}

import {
  Department,
  DepartmentType,
  Employee,
  EmployeeStatus,
  ShiftMap,
  Organization,
  FocusArea,
  ShiftCategory,
  ShiftCode,
  AbsenceType,
  ScheduleNote,
  IndicatorType,
  RecurringShift,
  ShiftSeries,
  SeriesFrequency,
  OrganizationUser,
  NamedItem,
  DraftKind,
  Invitation,
  AssignableOrganizationRole,
  ShiftRequest,
  ShiftRequestType,
  ShiftRequestStatus,
  CoverageRequirement,
  GridOpenShift,
  OrgActivityMetrics,
  UserMembership,
  Subscription,
  OrganizationRole,
} from "@/types";

// ── Optimistic Locking Error ──────────────────────────────────────────────────

export class OptimisticLockError extends Error {
  constructor(
    public readonly shiftId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion?: number
  ) {
    super(
      `Optimistic lock failed for shift ${shiftId}: expected version ${expectedVersion}${actualVersion !== undefined ? `, but found version ${actualVersion}` : ""
      }`
    );
    this.name = "OptimisticLockError";
  }
}

/** Strip seconds from PostgreSQL TIME values ("HH:MM:SS" → "HH:MM"). */
function trimTime(t: string | null): string | null {
  if (!t) return t;
  const parts = t.split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : t;
}

// ── Shift Types ──────────────────────────────────────────────────────────────

/** Resolve an array of shift_code IDs to a slash-separated label string. */
function resolveCodeLabels(ids: number[], codeMap: Map<number, string>): string {
  return ids.map(id => codeMap.get(id) ?? '?').join('/');
}

// ── DB row shapes ─────────────────────────────────────────────────────────────

export interface DbOrganization {
  id: string;
  name: string;
  slug: string | null;
  address: string;
  phone: string;
  employee_count: number | null;
  focus_area_label: string | null;
  certification_label: string | null;
  role_label: string | null;
  department_label: string | null;
  shift_display_mode: string | null;
  timezone: string | null;
  archived_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  enforce_conflict_prevention: boolean;
  stripe_customer_id: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  subscription_seats: number | null;
  data_retention_days: number;
  feature_overrides: Record<string, boolean>;
}

export interface DbFocusArea {
  id: number;
  org_id: string;
  department_id: number | null;
  name: string;
  color_bg: string;
  color_text: string;
  sort_order: number;
  archived_at: string | null;
}

interface DbDepartment {
  id: number;
  org_id: string;
  name: string;
  abbr: string;
  type: string;
  sort_order: number;
  archived_at: string | null;
  permissions: Record<string, boolean> | null;
}

interface DbShiftCategory {
  id: number;
  org_id: string;
  name: string;
  color: string;
  start_time: string | null;
  end_time: string | null;
  sort_order: number;
  focus_area_id: number | null;
  break_minutes: number | null;
  archived_at: string | null;
}

interface DbCoverageRequirement {
  id: number;
  org_id: string;
  focus_area_id: number;
  shift_code_id: number;
  day_of_week: number | null;
  min_staff: number;
}

export interface DbShiftCode {
  id: number;
  org_id: string;
  label: string;
  name: string;
  color: string;
  border_color: string;
  text_color: string;
  category_id: number | null;
  is_general: boolean;
  focus_area_id: number | null;
  sort_order: number;
  required_certification_ids: number[];
  default_start_time: string | null;
  default_end_time: string | null;
  default_duration_hours: number | null;
  default_duration_minutes: number | null;
  archived_at: string | null;
}

export interface DbEmployee {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  status: EmployeeStatus;
  status_changed_at: string | null;
  status_note: string;
  certification_id: number | null;
  role_ids: number[];
  seniority: number;
  focus_area_ids: number[];
  phone: string;
  email: string;
  contact_notes: string;
  archived_at: string | null;
  user_id: string | null;
  department_ids: number[];
}

interface DbShift {
  emp_id: string;
  date: string;
  draft_shift_code_ids: number[];
  published_shift_code_ids: number[];
  draft_absence_type_id: number | null;
  published_absence_type_id: number | null;
  draft_is_delete: boolean;
  version: number;
  series_id?: string | null;
  from_recurring?: boolean;
  draft_custom_start_time?: string | null;
  draft_custom_end_time?: string | null;
  published_custom_start_time?: string | null;
  published_custom_end_time?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface DbScheduleNote {
  id: number;
  org_id: string;
  emp_id: string;
  date: string;
  indicator_type_id: number;
  focus_area_id: number | null;
  status: 'published' | 'draft' | 'draft_deleted';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Column projections (avoid select('*') to reduce payload) ─────────────────

const ORGANIZATION_COLS = "id, name, slug, address, phone, employee_count, focus_area_label, certification_label, role_label, department_label, shift_display_mode, timezone, archived_at, suspended_at, suspended_reason, enforce_conflict_prevention, stripe_customer_id, subscription_status, trial_ends_at, subscription_seats, data_retention_days, feature_overrides";
const FOCUS_AREA_COLS = "id, org_id, department_id, name, color_bg, color_text, sort_order, archived_at";
const DEPARTMENT_COLS = "id, org_id, name, abbr, type, sort_order, archived_at, permissions";
const SHIFT_CODE_COLS = "id, org_id, label, name, color, border_color, text_color, category_id, is_general, focus_area_id, sort_order, required_certification_ids, default_start_time, default_end_time, default_duration_hours, default_duration_minutes, archived_at";
const SHIFT_CATEGORY_COLS = "id, org_id, name, color, start_time, end_time, sort_order, focus_area_id, break_minutes, archived_at";
const NAMED_ITEM_COLS = "id, org_id, name, abbr, department_id, sort_order, archived_at";
const EMPLOYEE_COLS = "id, org_id, first_name, last_name, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids";
const COVERAGE_REQ_COLS = "id, org_id, focus_area_id, shift_code_id, day_of_week, min_staff";
const ABSENCE_TYPE_COLS = "id, org_id, label, name, color, border_color, text_color, sort_order, archived_at";
const INDICATOR_TYPE_COLS = "id, org_id, name, color, sort_order, archived_at";
const RECURRING_SHIFT_COLS = "id, emp_id, org_id, day_of_week, shift_code_id, absence_type_id, effective_from, effective_until, created_at, updated_at, archived_at";

// ── Mapping helpers ───────────────────────────────────────────────────────────

// ── Named Item (certifications / organization_roles) ─────────────────────────

interface DbNamedItem {
  id: number;
  org_id: string;
  name: string;
  abbr: string;
  department_id: number | null;
  sort_order: number;
  archived_at: string | null;
}

function rowToNamedItem(row: DbNamedItem): NamedItem {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    abbr: row.abbr,
    departmentId: row.department_id ?? null,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
  };
}

function rowToDepartment(row: DbDepartment): Department {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    abbr: row.abbr,
    type: row.type as DepartmentType,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
    permissions: (row.permissions as unknown as import("@/types").AdminPermissions) ?? null,
  };
}

export function rowToOrganization(row: DbOrganization): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? null,
    address: row.address,
    phone: row.phone,
    employeeCount: row.employee_count,
    focusAreaLabel: row.focus_area_label ?? 'Focus Areas',
    certificationLabel: row.certification_label ?? 'Certifications',
    roleLabel: row.role_label ?? 'Roles',
    departmentLabel: row.department_label ?? 'Departments',
    shiftDisplayMode: (row.shift_display_mode as import("@/types").ShiftDisplayMode) ?? 'code',
    timezone: row.timezone ?? null,
    archivedAt: row.archived_at ?? null,
    suspendedAt: row.suspended_at ?? null,
    suspendedReason: row.suspended_reason ?? null,
    enforceConflictPrevention: row.enforce_conflict_prevention ?? false,
    stripeCustomerId: row.stripe_customer_id ?? null,
    subscriptionStatus: row.subscription_status ?? null,
    trialEndsAt: row.trial_ends_at ?? null,
    subscriptionSeats: row.subscription_seats ?? null,
    dataRetentionDays: row.data_retention_days ?? 365,
    featureOverrides: row.feature_overrides ?? {},
  };
}

export function rowToFocusArea(row: DbFocusArea): FocusArea {
  return {
    id: row.id,
    orgId: row.org_id,
    departmentId: row.department_id ?? null,
    name: row.name,
    colorBg: row.color_bg,
    colorText: row.color_text,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
  };
}

function rowToShiftCategory(row: DbShiftCategory): ShiftCategory {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    color: row.color,
    startTime: trimTime(row.start_time) ?? null,
    endTime: trimTime(row.end_time) ?? null,
    sortOrder: row.sort_order,
    focusAreaId: row.focus_area_id ?? null,
    breakMinutes: row.break_minutes ?? null,
    archivedAt: row.archived_at ?? null,
  };
}

function rowToCoverageRequirement(row: DbCoverageRequirement): CoverageRequirement {
  return {
    id: row.id,
    orgId: row.org_id,
    focusAreaId: row.focus_area_id,
    shiftCodeId: row.shift_code_id,
    dayOfWeek: row.day_of_week,
    minStaff: row.min_staff,
  };
}

export function rowToShiftCode(row: DbShiftCode): ShiftCode {
  return {
    id: row.id,
    orgId: row.org_id,
    label: row.label,
    name: row.name,
    color: row.color,
    border: row.border_color,
    text: row.text_color,
    categoryId: row.category_id ?? null,
    isGeneral: row.is_general ?? undefined,
    focusAreaId: row.focus_area_id ?? null,
    sortOrder: row.sort_order,
    requiredCertificationIds: row.required_certification_ids ?? [],
    defaultStartTime: trimTime(row.default_start_time) ?? null,
    defaultEndTime: trimTime(row.default_end_time) ?? null,
    defaultDurationHours: row.default_duration_hours ?? null,
    defaultDurationMinutes: row.default_duration_minutes ?? null,
    archivedAt: row.archived_at ?? null,
  };
}

// ── Absence Types ─────────────────────────────────────────────────────────────

export interface DbAbsenceType {
  id: number;
  org_id: string;
  label: string;
  name: string;
  color: string;
  border_color: string;
  text_color: string;
  sort_order: number;
  archived_at: string | null;
}

export function rowToAbsenceType(row: DbAbsenceType): AbsenceType {
  return {
    id: row.id,
    orgId: row.org_id,
    label: row.label,
    name: row.name,
    color: row.color,
    border: row.border_color,
    text: row.text_color,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
  };
}

export function rowToEmployee(row: DbEmployee): Employee {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status ?? 'active',
    statusChangedAt: row.status_changed_at ?? null,
    statusNote: row.status_note ?? '',
    certificationId: row.certification_id ?? null,
    roleIds: row.role_ids ?? [],
    seniority: row.seniority,
    focusAreaIds: row.focus_area_ids ?? [],
    phone: row.phone ?? "",
    email: row.email ?? "",
    contactNotes: row.contact_notes ?? "",
    archivedAt: row.archived_at ?? null,
    userId: row.user_id ?? null,
    departmentIds: row.department_ids ?? [],
  };
}

export function employeeToRow(emp: Omit<Employee, "id">, orgId: string): Omit<DbEmployee, "id" | "status" | "status_changed_at" | "status_note" | "archived_at" | "user_id"> {
  return {
    org_id: orgId,
    first_name: emp.firstName,
    last_name: emp.lastName,
    certification_id: emp.certificationId,
    role_ids: emp.roleIds ?? [],
    seniority: emp.seniority,
    focus_area_ids: emp.focusAreaIds ?? [],
    phone: emp.phone,
    email: emp.email,
    contact_notes: emp.contactNotes,
    department_ids: emp.departmentIds ?? [],
  };
}

// ── Organization ──────────────────────────────────────────────────────────────

export async function fetchUserOrganization(): Promise<Organization | null> {
  let query = supabase.from("organizations").select(ORGANIZATION_COLS);

  // Client-side: scope by subdomain slug if present
  if (typeof window !== "undefined") {
    const { subdomain } = parseHost(window.location.host);
    if (subdomain && subdomain !== "gridmaster") {
      query = query.eq("slug", subdomain);
    }
  }

  const { data, error } = await query.limit(1).single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`fetchUserOrganization error: ${error.message} (code: ${error.code})`);
  }
  if (!data) return null;

  return rowToOrganization(data as DbOrganization);
}



/** Fetch a single organization by its ID (used during impersonation). */
export async function fetchOrganizationById(orgId: string): Promise<Organization | null> {
  return cacheThrough(CacheKey.organization(orgId), TTL.STABLE, async () => {
    const { data, error } = await supabase
      .from("organizations")
      .select(ORGANIZATION_COLS)
      .eq("id", orgId)
      .maybeSingle();

    if (error) throw new Error(`fetchOrganizationById error: ${error.message}`);
    if (!data) return null;
    return rowToOrganization(data as DbOrganization);
  });
}

export async function updateOrganization(org: Organization): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({
      name: org.name,
      address: org.address,
      phone: org.phone,
      employee_count: org.employeeCount,
      focus_area_label: org.focusAreaLabel || null,
      certification_label: org.certificationLabel || null,
      role_label: org.roleLabel || null,
      department_label: org.departmentLabel || null,
      shift_display_mode: org.shiftDisplayMode || 'code',
      timezone: org.timezone || null,
      enforce_conflict_prevention: org.enforceConflictPrevention ?? false,
      data_retention_days: org.dataRetentionDays ?? 365,
      feature_overrides: org.featureOverrides ?? {},
    })
    .eq("id", org.id);
  if (error) throw error;
  await cacheDel(CacheKey.organization(org.id), CacheKey.allOrganizations());
  void logAudit("org.updated", "organization", org.id, { name: org.name }, org.id);
}

// ── Certifications ───────────────────────────────────────────────────────────

export async function fetchCertifications(orgId: string, includeArchived = false): Promise<NamedItem[]> {
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
  const query = supabase
    .from("certifications")
    .select(NAMED_ITEM_COLS)
    .eq("org_id", orgId);
  const { data, error } = await query.order("sort_order");
  if (error) throw error;
  return (data as DbNamedItem[]).map(rowToNamedItem);
}

export async function saveCertifications(
  orgId: string,
  items: NamedItem[],
  existing: NamedItem[],
): Promise<NamedItem[]> {
  const existingIds = new Set(existing.map((e) => e.id));
  const newIds = new Set(items.filter((i) => i.id).map((i) => i.id));

  // Soft-delete removed items (row persists — all FK/array references remain valid)
  const toDelete = existing.filter((e) => !newIds.has(e.id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("certifications")
      .update({ archived_at: new Date().toISOString() })
      .in("id", toDelete.map((d) => d.id));
    if (error) throw error;
  }

  // Separate update + insert to avoid GENERATED ALWAYS identity column errors
  const toUpdate = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
  const toInsert = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id <= 0 || !existingIds.has(item.id));

  for (const { item, sortOrder } of toUpdate) {
    const { error } = await supabase
      .from("certifications")
      .update({ name: item.name, abbr: item.abbr, department_id: item.departmentId ?? null, sort_order: sortOrder, archived_at: null })
      .eq("id", item.id);
    if (error) throw error;
  }
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("certifications")
      .insert(toInsert.map(({ item, sortOrder }) => ({
        org_id: orgId,
        name: item.name,
        abbr: item.abbr,
        department_id: item.departmentId ?? null,
        sort_order: sortOrder,
      })));
    if (error) throw error;
  }

  await cacheDel(CacheKey.certifications(orgId), CacheKey.shiftCodes(orgId), CacheKey.shiftCodes(orgId, true));
  return fetchCertifications(orgId);
}

// ── Organization Roles ──────────────────────────────────────────────────────

export async function fetchOrganizationRoles(orgId: string, includeArchived = false): Promise<NamedItem[]> {
  if (!includeArchived) {
    return cacheThrough(CacheKey.orgRoles(orgId), TTL.STABLE, async () => {
      const { data, error } = await supabase
        .from("organization_roles")
        .select(NAMED_ITEM_COLS)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .order("sort_order");
      if (error) throw error;
      return (data as DbNamedItem[]).map(rowToNamedItem);
    });
  }
  const query = supabase
    .from("organization_roles")
    .select(NAMED_ITEM_COLS)
    .eq("org_id", orgId);
  const { data, error } = await query.order("sort_order");
  if (error) throw error;
  return (data as DbNamedItem[]).map(rowToNamedItem);
}

export async function saveOrganizationRoles(
  orgId: string,
  items: NamedItem[],
  existing: NamedItem[],
): Promise<NamedItem[]> {
  const existingIds = new Set(existing.map((e) => e.id));
  const newIds = new Set(items.filter((i) => i.id).map((i) => i.id));

  // Soft-delete removed items (row persists — all FK/array references remain valid)
  const toDelete = existing.filter((e) => !newIds.has(e.id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("organization_roles")
      .update({ archived_at: new Date().toISOString() })
      .in("id", toDelete.map((d) => d.id));
    if (error) throw error;
  }

  // Separate update + insert to avoid GENERATED ALWAYS identity column errors
  const toUpdate = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
  const toInsert = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id <= 0 || !existingIds.has(item.id));

  for (const { item, sortOrder } of toUpdate) {
    const { error } = await supabase
      .from("organization_roles")
      .update({ name: item.name, abbr: item.abbr, department_id: item.departmentId ?? null, sort_order: sortOrder, archived_at: null })
      .eq("id", item.id);
    if (error) throw error;
  }
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("organization_roles")
      .insert(toInsert.map(({ item, sortOrder }) => ({
        org_id: orgId,
        name: item.name,
        abbr: item.abbr,
        department_id: item.departmentId ?? null,
        sort_order: sortOrder,
      })));
    if (error) throw error;
  }

  await cacheDel(CacheKey.orgRoles(orgId));
  return fetchOrganizationRoles(orgId);
}

// ── Departments ───────────────────────────────────────────────────────────────
// Two types: 'scheduled' (contain focus areas, appear on grid) and
// 'management' (standalone, for non-schedule staff like HR, Reception).

export async function fetchDepartments(
  orgId: string,
  includeArchived = false,
): Promise<Department[]> {
  if (includeArchived) {
    const { data, error } = await supabase
      .from("departments")
      .select(DEPARTMENT_COLS)
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToDepartment);
  }
  return cacheThrough(CacheKey.departments(orgId), TTL.STABLE, async () => {
    const { data, error } = await supabase
      .from("departments")
      .select(DEPARTMENT_COLS)
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(rowToDepartment);
  });
}

export async function saveDepartments(
  orgId: string,
  items: Department[],
  existing: Department[],
): Promise<Department[]> {
  const existingIds = new Set(existing.map((e) => e.id));
  const newIds = new Set(items.filter((i) => i.id).map((i) => i.id));

  const toDelete = existing.filter((e) => !newIds.has(e.id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("departments")
      .update({ archived_at: new Date().toISOString() })
      .in("id", toDelete.map((d) => d.id));
    if (error) throw error;
  }

  // Separate update + insert to avoid GENERATED ALWAYS identity column errors
  const toUpdate = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id > 0 && existingIds.has(item.id));
  const toInsert = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id <= 0 || !existingIds.has(item.id));

  for (const { item, sortOrder } of toUpdate) {
    const { error } = await supabase
      .from("departments")
      .update({ name: item.name, abbr: item.abbr || "", type: item.type, sort_order: sortOrder, archived_at: null, permissions: item.permissions ?? null })
      .eq("id", item.id);
    if (error) throw error;
  }
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("departments")
      .insert(toInsert.map(({ item, sortOrder }) => ({
        org_id: orgId,
        name: item.name,
        abbr: item.abbr || "",
        type: item.type,
        sort_order: sortOrder,
        permissions: item.permissions ?? null,
      })));
    if (error) throw error;
  }

  await cacheDel(CacheKey.departments(orgId));
  return fetchDepartments(orgId);
}

/** Update the permission template for a management department. */
export async function updateDepartmentPermissions(
  departmentId: number,
  permissions: import("@/types").AdminPermissions,
  orgId: string,
): Promise<void> {
  const { error } = await supabase
    .from("departments")
    .update({ permissions })
    .eq("id", departmentId)
    .eq("org_id", orgId);
  if (error) throw error;
  await cacheDel(CacheKey.departments(orgId));
}

/** Fetch department-based permissions for a user (union of all their management dept permissions). */
export async function fetchUserDepartmentPermissions(
  userId: string,
  orgId: string,
): Promise<import("@/types").AdminPermissions | null> {
  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("department_ids")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .single();

  const deptIds: number[] = (membership?.department_ids as number[]) ?? [];
  if (deptIds.length === 0) return null;

  const { data: depts } = await supabase
    .from("departments")
    .select("permissions")
    .in("id", deptIds)
    .eq("type", "management")
    .not("permissions", "is", null);

  if (!depts || depts.length === 0) return null;

  // Union: most permissive wins per boolean field
  const { unionPermissions } = await import("@/hooks/usePermissions");
  return unionPermissions(depts.map((d: { permissions: unknown }) => d.permissions as import("@/types").AdminPermissions));
}

// ── Organization Users (for user management panel) ──────────────────────────

export async function fetchOrganizationUsers(orgId: string): Promise<OrganizationUser[]> {
  return cacheThrough(CacheKey.orgUsers(orgId), TTL.MODERATE, async () => {
    const { data, error } = await supabase.rpc("get_org_users", {
      p_org_id: orgId,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      email: (row.email as string | null) ?? null,
      firstName: (row.first_name as string | null) ?? null,
      lastName: (row.last_name as string | null) ?? null,
      orgRole: (row.org_role as string ?? "user") as import("@/types").OrganizationRole,
      platformRole: (row.platform_role as string) as import("@/types").PlatformRole,
      adminPermissions: (row.admin_permissions ?? null) as import("@/types").AdminPermissions | null,
      createdAt: row.created_at as string,
      lastSignInAt: (row.last_sign_in_at as string | null) ?? null,
      departmentIds: (row.department_ids as number[]) ?? [],
    }));
  });
}

// ── Organization Directory (unified people view) ──────────��─────────────────

export async function fetchOrgDirectory(orgId: string): Promise<import("@/types").DirectoryPerson[]> {
  return cacheThrough(CacheKey.orgDirectory(orgId), TTL.MODERATE, async () => {
    const { data, error } = await supabase.rpc("get_org_directory", {
      p_org_id: orgId,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      personId: row.person_id as string,
      source: row.source as 'employee' | 'user_only' | 'pending_invite',
      employeeId: (row.employee_id as string | null) ?? null,
      userId: (row.user_id as string | null) ?? null,
      firstName: (row.first_name as string) ?? "",
      lastName: (row.last_name as string) ?? "",
      email: (row.email as string) ?? "",
      phone: (row.phone as string) ?? "",
      employeeStatus: (row.employee_status as import("@/types").EmployeeStatus | null) ?? null,
      orgRole: (row.org_role as import("@/types").OrganizationRole | null) ?? null,
      hasAppAccess: (row.has_app_access as boolean) ?? false,
      focusAreaIds: ((row.focus_area_ids as number[]) ?? []),
      certificationId: (row.certification_id as number | null) ?? null,
      roleIds: ((row.role_ids as number[]) ?? []),
      seniority: (row.seniority as number | null) ?? null,
      lastSignInAt: (row.last_sign_in_at as string | null) ?? null,
      invitationStatus: (row.invitation_status as 'pending' | 'expired' | null) ?? null,
      departmentIds: ((row.department_ids as number[]) ?? []),
    }));
  });
}

export async function invalidateOrgDirectory(orgId: string): Promise<void> {
  await cacheDel(CacheKey.orgDirectory(orgId));
}

export async function updateAppOnlyUser(
  userId: string,
  orgId: string,
  data: { firstName?: string; lastName?: string; phone?: string; departmentIds?: number[] },
): Promise<void> {
  // Update profile name
  if (data.firstName !== undefined || data.lastName !== undefined) {
    const profileUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.firstName !== undefined) profileUpdate.first_name = data.firstName;
    if (data.lastName !== undefined) profileUpdate.last_name = data.lastName;
    const { error } = await supabase.from("profiles").update(profileUpdate).eq("id", userId);
    if (error) throw error;
  }
  // Update membership phone + departments
  if (data.phone !== undefined || data.departmentIds !== undefined) {
    const membershipUpdate: Record<string, unknown> = {};
    if (data.phone !== undefined) membershipUpdate.phone = data.phone;
    if (data.departmentIds !== undefined) membershipUpdate.department_ids = data.departmentIds;
    const { error } = await supabase.from("organization_memberships").update(membershipUpdate).eq("user_id", userId).eq("org_id", orgId);
    if (error) throw error;
  }
  await cacheDel(CacheKey.orgDirectory(orgId), CacheKey.orgUsers(orgId));
}

export async function updatePendingInvitation(
  invitationId: string,
  orgId: string,
  data: { firstName?: string; lastName?: string; phone?: string; departmentIds?: number[] },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (data.firstName !== undefined) update.first_name = data.firstName;
  if (data.lastName !== undefined) update.last_name = data.lastName;
  if (data.phone !== undefined) update.phone = data.phone;
  if (data.departmentIds !== undefined) update.department_ids = data.departmentIds;
  const { error } = await supabase.from("invitations").update(update).eq("id", invitationId).eq("org_id", orgId);
  if (error) throw error;
  await cacheDel(CacheKey.orgDirectory(orgId), CacheKey.invitations(orgId));
}

export async function updateAdminPermissions(
  userId: string,
  permissions: import("@/types").AdminPermissions | null,
  orgId: string,
  targetEmail?: string,
): Promise<void> {
  const { error } = await supabase
    .from("organization_memberships")
    .update({ admin_permissions: permissions })
    .eq("user_id", userId)
    .eq("org_id", orgId);
  if (error) throw error;
  await cacheDel(CacheKey.orgUsers(orgId), CacheKey.orgDirectory(orgId));
  void logAudit("permissions.updated", "permissions", userId, { permissions, targetEmail: targetEmail ?? null }, orgId);
}

export async function changeOrganizationUserRole(
  targetUserId: string,
  newRole: import("@/types").OrganizationRole,
  orgId?: string,
  targetEmail?: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.rpc("change_user_role", {
    p_target_user_id: targetUserId,
    p_new_role: newRole,
    p_changed_by_id: user.id,
    p_idempotency_key: `${targetUserId}-${newRole}-${Date.now()}`,
    p_org_id: orgId ?? null,
  });
  if (error) throw error;
  const keys = [CacheKey.allUsers(), CacheKey.mwProfile(targetUserId)];
  if (orgId) keys.push(CacheKey.orgUsers(orgId), CacheKey.orgDirectory(orgId));
  await cacheDel(...keys);
  void logAudit("role.changed", "role", targetUserId, { newRole, targetEmail: targetEmail ?? null }, orgId);
}


// ── Focus Areas ──────────────────────────────────────────────────────────────

export async function fetchFocusAreas(orgId: string, includeArchived = false): Promise<FocusArea[]> {
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
  const [depts, fas] = await Promise.all([
    fetchDepartments(orgId),
    fetchFocusAreas(orgId),
  ]);

  const scheduledDepts = depts.filter(d => d.type === 'scheduled');
  const orphanedFAs = fas.filter(fa => fa.departmentId === null);

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
  const faIds = orphanedFAs.map(fa => fa.id);
  const { error: updateErr } = await supabase
    .from("focus_areas")
    .update({ department_id: newDeptId })
    .in("id", faIds);
  if (updateErr) throw updateErr;

  // Bust caches
  await cacheDel(CacheKey.departments(orgId), CacheKey.focusAreas(orgId));
  return true;
}

export async function upsertFocusArea(focusArea: Omit<FocusArea, "id"> & { id?: number }): Promise<FocusArea> {
  const row = {
    org_id: focusArea.orgId,
    department_id: focusArea.departmentId ?? null,
    name: focusArea.name,
    color_bg: focusArea.colorBg,
    color_text: focusArea.colorText,
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
    void logAudit("focus_area.upserted", "focus_area", String(focusArea.id), { name: focusArea.name }, focusArea.orgId);
    return rowToFocusArea(data as DbFocusArea);
  }
  const { data, error } = await supabase
    .from("focus_areas")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  await cacheDel(CacheKey.focusAreas(focusArea.orgId));
  const result = rowToFocusArea(data as DbFocusArea);
  void logAudit("focus_area.upserted", "focus_area", String(result.id), { name: focusArea.name }, focusArea.orgId);
  return result;
}

export async function deleteFocusArea(focusAreaId: number, orgId: string): Promise<void> {
  const now = new Date().toISOString();

  // Archive dependent shift_codes for this focus area
  const { error: scErr } = await supabase
    .from("shift_codes")
    .update({ archived_at: now })
    .eq("focus_area_id", focusAreaId)
    .is("archived_at", null);
  if (scErr) throw scErr;

  // Archive dependent shift_categories for this focus area
  const { error: catErr } = await supabase
    .from("shift_categories")
    .update({ archived_at: now })
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
    .eq("id", focusAreaId);
  if (error) throw error;
  await cacheDel(
    CacheKey.focusAreas(orgId),
    CacheKey.shiftCodes(orgId), CacheKey.shiftCodes(orgId, true),
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
    .eq("id", focusAreaId);
  if (error) throw error;
  await cacheDel(CacheKey.focusAreas(orgId));
  void logAudit("focus_area.restored", "focus_area", String(focusAreaId), {}, orgId);
}

// ── Shift Codes ───────────────────────────────────────────────────────────────

export async function fetchShiftCodes(orgId: string, includeArchived = false): Promise<ShiftCode[]> {
  return cacheThrough(CacheKey.shiftCodes(orgId, includeArchived), TTL.STABLE, async () => {
    let query = supabase
      .from("shift_codes")
      .select(SHIFT_CODE_COLS)
      .eq("org_id", orgId);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query.order("sort_order");
    if (error) throw error;
    return (data as DbShiftCode[]).map(rowToShiftCode);
  });
}

export async function fetchShiftCategories(orgId: string, includeArchived = false): Promise<ShiftCategory[]> {
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

export async function upsertShiftCategory(
  cat: Omit<ShiftCategory, "id"> & { id?: number }
): Promise<ShiftCategory> {
  const row = {
    org_id: cat.orgId,
    name: cat.name,
    color: cat.color,
    start_time: cat.startTime ?? null,
    end_time: cat.endTime ?? null,
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
    return rowToShiftCategory(data as DbShiftCategory);
  }
  const { data, error } = await supabase
    .from("shift_categories")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  await cacheDel(CacheKey.shiftCategories(cat.orgId));
  return rowToShiftCategory(data as DbShiftCategory);
}

export async function deleteShiftCategory(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("shift_categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.shiftCategories(orgId));
}

export async function restoreShiftCategory(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("shift_categories")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.shiftCategories(orgId));
  void logAudit("shift_category.restored", "shift_category", String(id), {}, orgId);
}

// ── Coverage Requirements ─────────────────────────────────────────────────────

export async function fetchCoverageRequirements(orgId: string): Promise<CoverageRequirement[]> {
  return cacheThrough(CacheKey.coverageReqs(orgId), TTL.STABLE, async () => {
    const { data, error } = await supabase
      .from("coverage_requirements")
      .select(COVERAGE_REQ_COLS)
      .eq("org_id", orgId);
    if (error) throw error;
    return (data as DbCoverageRequirement[]).map(rowToCoverageRequirement);
  });
}

/**
 * Batch save coverage requirements for a (focus_area, shift_code) combo.
 * Replaces all existing rows for that combo (delete + insert).
 */
export async function saveCoverageRequirements(
  orgId: string,
  focusAreaId: number,
  shiftCodeId: number,
  requirements: { dayOfWeek: number | null; minStaff: number }[],
): Promise<CoverageRequirement[]> {
  // Delete existing rows for this combo
  const { error: delError } = await supabase
    .from("coverage_requirements")
    .delete()
    .eq("org_id", orgId)
    .eq("focus_area_id", focusAreaId)
    .eq("shift_code_id", shiftCodeId);
  if (delError) throw delError;

  // Filter out zero-value rows and insert
  const rows = requirements
    .filter((r) => r.minStaff > 0)
    .map((r) => ({
      org_id: orgId,
      focus_area_id: focusAreaId,
      shift_code_id: shiftCodeId,
      day_of_week: r.dayOfWeek,
      min_staff: r.minStaff,
    }));

  if (rows.length === 0) {
    await cacheDel(CacheKey.coverageReqs(orgId));
    return [];
  }

  const { data, error } = await supabase
    .from("coverage_requirements")
    .insert(rows)
    .select();
  if (error) throw error;
  await cacheDel(CacheKey.coverageReqs(orgId));
  return (data as DbCoverageRequirement[]).map(rowToCoverageRequirement);
}

// ── Shift Codes ───────────────────────────────────────────────────────────────

export async function upsertShiftCode(
  st: Omit<ShiftCode, "id"> & { id?: number }
): Promise<ShiftCode> {
  const row = {
    org_id: st.orgId,
    label: st.label,
    name: st.name,
    color: st.color,
    border_color: st.border,
    text_color: st.text,
    category_id: st.categoryId ?? null,
    is_general: st.isGeneral ?? false,
    focus_area_id: st.focusAreaId ?? null,
    sort_order: st.sortOrder,
    required_certification_ids: st.requiredCertificationIds ?? [],
    default_start_time: st.defaultStartTime ?? null,
    default_end_time: st.defaultEndTime ?? null,
    default_duration_hours: st.defaultDurationHours ?? null,
    default_duration_minutes: st.defaultDurationMinutes ?? null,
  };

  let saved: DbShiftCode;
  if (st.id) {
    const { data, error } = await supabase
      .from("shift_codes")
      .update(row)
      .eq("id", st.id)
      .select()
      .single();
    if (error) throw error;
    saved = data as DbShiftCode;
  } else {
    const { data, error } = await supabase
      .from("shift_codes")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    saved = data as DbShiftCode;
  }

  await cacheDel(CacheKey.shiftCodes(st.orgId), CacheKey.shiftCodes(st.orgId, true), CacheKey.coverageReqs(st.orgId));
  return rowToShiftCode(saved);
}

export async function deleteShiftCode(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("shift_codes")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.shiftCodes(orgId), CacheKey.shiftCodes(orgId, true), CacheKey.coverageReqs(orgId));
}

export async function restoreShiftCode(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("shift_codes")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.shiftCodes(orgId), CacheKey.shiftCodes(orgId, true), CacheKey.coverageReqs(orgId));
  void logAudit("shift_code.restored", "shift_code", String(id), {}, orgId);
}

// ── Absence Types ─────────────────────────────────────────────────────────────

export async function fetchAbsenceTypes(orgId: string, includeArchived = false): Promise<AbsenceType[]> {
  return cacheThrough(CacheKey.absenceTypes(orgId, includeArchived), TTL.STABLE, async () => {
    let query = supabase
      .from("absence_types")
      .select(ABSENCE_TYPE_COLS)
      .eq("org_id", orgId);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query.order("sort_order");
    if (error) throw error;
    return (data as DbAbsenceType[]).map(rowToAbsenceType);
  });
}

export async function upsertAbsenceType(
  at: Omit<AbsenceType, "id"> & { id?: number }
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
    const { data, error } = await supabase
      .from("absence_types")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    saved = data as DbAbsenceType;
  }

  await cacheDel(CacheKey.absenceTypes(at.orgId), CacheKey.absenceTypes(at.orgId, true));
  return rowToAbsenceType(saved);
}

export async function deleteAbsenceType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("absence_types")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.absenceTypes(orgId), CacheKey.absenceTypes(orgId, true));
}

export async function restoreAbsenceType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("absence_types")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.absenceTypes(orgId), CacheKey.absenceTypes(orgId, true));
  void logAudit("absence_type.restored", "absence_type", String(id), {}, orgId);
}

// ── Employees ─────────────────────────────────────────────────────────────────

export async function fetchEmployees(
  orgId: string,
  statuses?: EmployeeStatus[],
): Promise<Employee[]> {
  let query = supabase
    .from("employees")
    .select(EMPLOYEE_COLS)
    .eq("org_id", orgId);
  // Terminated employees have archived_at set, so skip the filter when fetching them
  const includesTerminated = statuses?.includes("terminated");
  if (!includesTerminated) {
    query = query.is("archived_at", null);
  }
  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }
  const { data, error } = await query.order("seniority");
  if (error) throw error;
  return (data as DbEmployee[]).map(rowToEmployee);
}

export async function insertEmployee(
  data: Omit<Employee, "id">,
  orgId: string,
): Promise<Employee> {
  const { data: row, error } = await supabase
    .from("employees")
    .insert(employeeToRow(data, orgId))
    .select()
    .single();
  if (error) throw error;
  await cacheDel(CacheKey.employees(orgId), CacheKey.orgDirectory(orgId), CacheKey.tenantStats());
  const result = rowToEmployee(row as DbEmployee);
  void logAudit("employee.created", "employee", result.id, { firstName: data.firstName, lastName: data.lastName }, orgId);
  return result;
}

export async function updateEmployee(emp: Employee, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("employees")
    .update(employeeToRow(emp, orgId))
    .eq("id", emp.id);
  if (error) throw error;
  await cacheDel(CacheKey.employees(orgId), CacheKey.employeeDetail(emp.id), CacheKey.orgDirectory(orgId));
  void logAudit("employee.updated", "employee", emp.id, { firstName: emp.firstName, lastName: emp.lastName }, orgId);
}

export async function updateEmployeeDepartments(employeeId: string, departmentIds: number[], orgId: string): Promise<void> {
  const { error } = await supabase
    .from("employees")
    .update({ department_ids: departmentIds })
    .eq("id", employeeId);
  if (error) throw error;
  await cacheDel(CacheKey.employees(orgId), CacheKey.employeeDetail(employeeId), CacheKey.orgDirectory(orgId));
}

export async function deleteEmployee(empId: string, orgId?: string): Promise<void> {
  const now = new Date().toISOString();
  let query = supabase
    .from("employees")
    .update({ archived_at: now, status: 'terminated' as EmployeeStatus, status_changed_at: now })
    .eq("id", empId);
  if (orgId) query = query.eq("org_id", orgId);
  const { error } = await query;
  if (error) throw error;
  const keys = [CacheKey.employeeDetail(empId), CacheKey.tenantStats()];
  if (orgId) keys.push(CacheKey.employees(orgId));
  await cacheDel(...keys);
  void logAudit("employee.archived", "employee", empId, {}, orgId);
}

export async function benchEmployee(empId: string, note?: string, orgId?: string): Promise<void> {
  let query = supabase
    .from("employees")
    .update({
      status: 'benched' as EmployeeStatus,
      status_changed_at: new Date().toISOString(),
      status_note: note ?? '',
    })
    .eq("id", empId);
  if (orgId) query = query.eq("org_id", orgId);
  const { error } = await query;
  if (error) throw error;
  const keys = [CacheKey.employeeDetail(empId), CacheKey.tenantStats()];
  if (orgId) keys.push(CacheKey.employees(orgId));
  await cacheDel(...keys);
  void logAudit("employee.benched", "employee", empId, { note }, orgId);
}

export async function activateEmployee(empId: string, orgId?: string): Promise<void> {
  let query = supabase
    .from("employees")
    .update({
      status: 'active' as EmployeeStatus,
      status_changed_at: new Date().toISOString(),
      status_note: '',
      archived_at: null,
    })
    .eq("id", empId);
  if (orgId) query = query.eq("org_id", orgId);
  const { error } = await query;
  if (error) throw error;
  const keys = [CacheKey.employeeDetail(empId), CacheKey.tenantStats()];
  if (orgId) keys.push(CacheKey.employees(orgId));
  await cacheDel(...keys);
  void logAudit("employee.activated", "employee", empId, {}, orgId);
}

// ── Single Employee Fetch ──────────────────────────────────────────────────────

export async function fetchEmployeeById(
  empId: string,
  orgId: string,
): Promise<Employee | null> {
  return cacheThrough(CacheKey.employeeDetail(empId), TTL.MODERATE, async () => {
    const { data, error } = await supabase
      .from("employees")
      .select(EMPLOYEE_COLS)
      .eq("id", empId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToEmployee(data as DbEmployee);
  });
}

// ── Employee Shifts (date-range scoped) ──────────────────────────────────────

export async function fetchEmployeeShifts(
  empId: string,
  orgId: string,
  shiftCodeMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
  startDate?: string,
  endDate?: string,
): Promise<ShiftMap> {
  let query = supabase
    .from("shifts")
    .select("emp_id, date, draft_shift_code_ids, published_shift_code_ids, draft_absence_type_id, published_absence_type_id, draft_is_delete, version, series_id, from_recurring, draft_custom_start_time, draft_custom_end_time, published_custom_start_time, published_custom_end_time, created_by, updated_by, created_at, updated_at")
    .eq("emp_id", empId);
  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);
  query = query.order("date", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  const atMap = absenceTypeMap ?? new Map<number, string>();
  const map: ShiftMap = {};
  for (const row of data as DbShift[]) {
    const draftIds = row.draft_shift_code_ids ?? [];
    const pubIds = row.published_shift_code_ids ?? [];
    const draftAbsId = row.draft_absence_type_id ?? null;
    const pubAbsId = row.published_absence_type_id ?? null;
    const draftStartTime = row.draft_custom_start_time ?? null;
    const draftEndTime = row.draft_custom_end_time ?? null;
    const pubStartTime = row.published_custom_start_time ?? null;
    const pubEndTime = row.published_custom_end_time ?? null;
    const hasTimeDraft = draftStartTime != null || draftEndTime != null;
    const hasDraft = draftIds.length > 0 || draftAbsId != null || row.draft_is_delete || hasTimeDraft;
    const effectiveIds = hasDraft ? draftIds : pubIds;
    const effectiveAbsId = hasDraft ? draftAbsId : pubAbsId;
    const effectiveStartTime = draftStartTime ?? pubStartTime;
    const effectiveEndTime = draftEndTime ?? pubEndTime;
    const isDraft = hasDraft && (
      !arraysEqual(draftIds, pubIds)
      || draftAbsId !== pubAbsId
      || draftStartTime !== pubStartTime
      || draftEndTime !== pubEndTime
    );

    let draftKind: DraftKind = null;
    if (isDraft) {
      if (row.draft_is_delete && (pubIds.length > 0 || pubAbsId != null)) draftKind = 'deleted';
      else if (pubIds.length === 0 && pubAbsId == null) draftKind = 'new';
      else draftKind = 'modified';
    }

    const publishedLabel = pubAbsId != null
      ? (atMap.get(pubAbsId) ?? '?')
      : pubIds.length > 0 ? pubIds.map(id => shiftCodeMap.get(id) ?? '?').join('/') : '';

    const hasContent = effectiveIds.length > 0 || effectiveAbsId != null || row.draft_is_delete;

    if (hasContent) {
      const label = row.draft_is_delete
        ? "OFF"
        : effectiveAbsId != null
          ? (atMap.get(effectiveAbsId) ?? '?')
          : effectiveIds.map(id => shiftCodeMap.get(id) ?? '?').join('/');

      map[`${row.emp_id}_${row.date}`] = {
        label,
        shiftCodeIds: effectiveIds,
        isDraft,
        isDelete: row.draft_is_delete,
        draftKind,
        publishedShiftCodeIds: pubIds,
        publishedLabel,
        absenceTypeId: effectiveAbsId,
        publishedAbsenceTypeId: pubAbsId,
        seriesId: row.series_id ?? null,
        fromRecurring: row.from_recurring ?? false,
        customStartTime: effectiveStartTime,
        customEndTime: effectiveEndTime,
        publishedCustomStartTime: pubStartTime,
        publishedCustomEndTime: pubEndTime,
        version: row.version,
        createdBy: row.created_by ?? null,
        updatedBy: row.updated_by ?? null,
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
      };
    }
  }
  return map;
}

// ── Employee Role Change History ──────────────────────────────────────────────

export async function fetchEmployeeRoleHistory(
  userId: string,
): Promise<import("@/types").AuditLogEntry[]> {
  const { data, error } = await supabase.rpc("get_audit_log", {
    p_org_id: null,
    p_limit: 50,
    p_offset: 0,
    p_target_user_id: userId,
  });
  if (error) throw error;
  return (data ?? [])
    .map((row: Record<string, unknown>) => ({
      id: row.id as string,
      targetUserId: row.target_user_id as string,
      targetEmail: (row.target_email as string | null) ?? null,
      changedById: row.changed_by_id as string,
      changedByEmail: (row.changed_by_email as string | null) ?? null,
      fromRole: row.from_role as string,
      toRole: row.to_role as string,
      createdAt: row.created_at as string,
      orgId: (row.org_id as string | null) ?? null,
      orgName: (row.org_name as string | null) ?? null,
    }));
}

// ── Employee Invitations ─────────────────────────────────────────────────────

export async function fetchEmployeeInvitations(
  orgId: string,
  employeeId: string,
): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, employee_id")
    .eq("org_id", orgId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    orgId: row.org_id as string,
    invitedBy: (row.invited_by as string) ?? null,
    email: row.email as string,
    roleToAssign: row.role_to_assign as AssignableOrganizationRole,
    expiresAt: row.expires_at as string,
    acceptedAt: (row.accepted_at as string) ?? null,
    revokedAt: (row.revoked_at as string) ?? null,
    createdAt: row.created_at as string,
    employeeId: (row.employee_id as string) ?? null,
  }));
}

// ── Shifts ────────────────────────────────────────────────────────────────────

export async function fetchShifts(
  orgId: string,
  isScheduler: boolean,
  shiftCodeMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
  startDate?: string,
  endDate?: string,
): Promise<ShiftMap> {
  let query = supabase
    .from("shifts")
    .select("emp_id, date, draft_shift_code_ids, published_shift_code_ids, draft_absence_type_id, published_absence_type_id, draft_is_delete, version, series_id, from_recurring, draft_custom_start_time, draft_custom_end_time, published_custom_start_time, published_custom_end_time, created_by, updated_by, created_at, updated_at, employees!inner(org_id)")
    .eq("employees.org_id", orgId);
  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);
  const { data, error } = await query;
  if (error) throw error;

  const atMap = absenceTypeMap ?? new Map<number, string>();
  const map: ShiftMap = {};
  for (const row of data as DbShift[]) {
    const draftIds = row.draft_shift_code_ids ?? [];
    const pubIds = row.published_shift_code_ids ?? [];
    const draftAbsId = row.draft_absence_type_id ?? null;
    const pubAbsId = row.published_absence_type_id ?? null;
    const draftStartTime = row.draft_custom_start_time ?? null;
    const draftEndTime = row.draft_custom_end_time ?? null;
    const pubStartTime = row.published_custom_start_time ?? null;
    const pubEndTime = row.published_custom_end_time ?? null;
    const hasTimeDraft = draftStartTime != null || draftEndTime != null;
    const hasDraft = draftIds.length > 0 || draftAbsId != null || row.draft_is_delete || hasTimeDraft;

    // Schedulers see draft preferentially. Staff only see published.
    const effectiveIds = isScheduler
      ? (hasDraft ? draftIds : pubIds)
      : pubIds;
    const effectiveAbsId = isScheduler
      ? (hasDraft ? draftAbsId : pubAbsId)
      : pubAbsId;
    const effectiveStartTime = isScheduler
      ? (draftStartTime ?? pubStartTime)
      : pubStartTime;
    const effectiveEndTime = isScheduler
      ? (draftEndTime ?? pubEndTime)
      : pubEndTime;

    const isDraft = hasDraft && (
      !arraysEqual(draftIds, pubIds)
      || draftAbsId !== pubAbsId
      || draftStartTime !== pubStartTime
      || draftEndTime !== pubEndTime
    );

    // Classify draft change type
    let draftKind: DraftKind = null;
    if (isDraft) {
      if (row.draft_is_delete && (pubIds.length > 0 || pubAbsId != null)) {
        draftKind = 'deleted';
      } else if (pubIds.length === 0 && pubAbsId == null) {
        draftKind = 'new';
      } else {
        draftKind = 'modified';
      }
    }

    const publishedLabel = pubAbsId != null
      ? (atMap.get(pubAbsId) ?? '?')
      : pubIds.length > 0 ? resolveCodeLabels(pubIds, shiftCodeMap) : '';

    const hasContent = effectiveIds.length > 0 || effectiveAbsId != null || (isScheduler && row.draft_is_delete);

    if (hasContent) {
      const label = row.draft_is_delete && isScheduler
        ? "OFF"
        : effectiveAbsId != null
          ? (atMap.get(effectiveAbsId) ?? '?')
          : resolveCodeLabels(effectiveIds, shiftCodeMap);

      map[`${row.emp_id}_${row.date}`] = {
        label,
        shiftCodeIds: effectiveIds,
        isDraft,
        isDelete: row.draft_is_delete,
        draftKind,
        publishedShiftCodeIds: pubIds,
        publishedLabel,
        absenceTypeId: effectiveAbsId,
        publishedAbsenceTypeId: pubAbsId,
        seriesId: row.series_id ?? null,
        fromRecurring: row.from_recurring ?? false,
        customStartTime: effectiveStartTime,
        customEndTime: effectiveEndTime,
        publishedCustomStartTime: pubStartTime,
        publishedCustomEndTime: pubEndTime,
        version: row.version,
        createdBy: row.created_by ?? null,
        updatedBy: row.updated_by ?? null,
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
      };
    }
  }
  return map;
}

/**
 * Checks if any shift codes in the array have overlapping default time ranges.
 * Returns the first overlapping pair or null if no conflicts.
 * Mirrors the DB trigger logic for immediate client-side feedback.
 */
export async function checkShiftCodeOverlap(
  shiftCodeIds: number[],
): Promise<{ labelA: string; labelB: string } | null> {
  if (shiftCodeIds.length < 2) return null;

  const { data: codes, error } = await supabase
    .from("shift_codes")
    .select("id, label, default_start_time, default_end_time")
    .in("id", shiftCodeIds);

  if (error || !codes) return null;

  // Convert TIME string "HH:MM:SS" to minutes from midnight
  function toMinutes(time: string | null): number | null {
    if (!time) return null;
    const parts = time.split(":");
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  const parsed = codes
    .map((c: { id: number; label: string; default_start_time: string | null; default_end_time: string | null }) => ({
      id: c.id,
      label: c.label,
      start: toMinutes(c.default_start_time),
      end: toMinutes(c.default_end_time),
    }))
    .filter((c: { start: number | null; end: number | null }) => c.start !== null && c.end !== null);

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i];
      const b = parsed[j];
      // Normalise overnight shifts: if end <= start, add 24h
      const aEnd = a.end! <= a.start! ? a.end! + 1440 : a.end!;
      const bEnd = b.end! <= b.start! ? b.end! + 1440 : b.end!;
      if (a.start! < bEnd && b.start! < aEnd) {
        return { labelA: a.label, labelB: b.label };
      }
    }
  }
  return null;
}

export async function upsertShift(
  empId: string,
  date: string,
  shiftCodeIds: number[],
  orgId?: string | null,
  customStartTime?: string | null,
  customEndTime?: string | null,
  expectedVersion?: number,
  absenceTypeId?: number | null,
): Promise<void> {
  // Client-side overlap check for immediate feedback
  if (shiftCodeIds.length >= 2 && absenceTypeId == null) {
    const overlap = await checkShiftCodeOverlap(shiftCodeIds);
    if (overlap) {
      throw new Error(
        `Shift codes "${overlap.labelA}" and "${overlap.labelB}" have overlapping time ranges`,
      );
    }
  }

  const payload: Record<string, unknown> = {
    emp_id: empId,
    date,
    draft_shift_code_ids: absenceTypeId != null ? [] : shiftCodeIds,
    draft_absence_type_id: absenceTypeId ?? null,
    draft_is_delete: false,
  };
  if (orgId) payload.org_id = orgId;
  if (customStartTime !== undefined) payload.draft_custom_start_time = customStartTime;
  if (customEndTime !== undefined) payload.draft_custom_end_time = customEndTime;

  if (expectedVersion !== undefined) {
    // Existing shift: use update with optimistic lock
    payload.version = expectedVersion + 1;
    const { data, error } = await supabase
      .from("shifts")
      .update(payload)
      .eq("emp_id", empId)
      .eq("date", date)
      .eq("version", expectedVersion)
      .select("version")
      .single();
    if (error) {
      if (error.code === "PGRST116") {
        const { data: currentShift } = await supabase
          .from("shifts")
          .select("version")
          .eq("emp_id", empId)
          .eq("date", date)
          .single();
        throw new OptimisticLockError(
          `${empId}:${date}`,
          expectedVersion,
          currentShift?.version,
        );
      }
      throw error;
    }
    if (!data) {
      throw new OptimisticLockError(`${empId}:${date}`, expectedVersion);
    }
  } else {
    // New shift: plain upsert (version starts at 0 via DB default)
    const { error } = await supabase
      .from("shifts")
      .upsert(payload, { onConflict: "emp_id,date" });
    if (error) throw error;
  }
  const action = expectedVersion !== undefined ? "shift.updated" : "shift.created";
  void logAudit(action, "shift", `${empId}:${date}`, { shiftCodeIds, absenceTypeId }, orgId);
}

/** Updates only the draft custom start/end time for an existing shift row. */
export async function upsertShiftTimes(
  empId: string,
  date: string,
  customStartTime: string | null,
  customEndTime: string | null,
  orgId: string,
): Promise<void> {
  const { error } = await supabase
    .from("shifts")
    .upsert(
      { emp_id: empId, date, org_id: orgId, draft_custom_start_time: customStartTime, draft_custom_end_time: customEndTime },
      { onConflict: "emp_id,date" },
    );
  if (error) throw error;
}

export async function deleteShift(empId: string, date: string, orgId?: string): Promise<void> {
  // Soft delete: set draft_is_delete so the publish RPC knows to clear it.
  // Uses update (not upsert) to avoid creating orphaned rows when no shift exists.
  const { error } = await supabase
    .from("shifts")
    .update({ draft_shift_code_ids: [], draft_absence_type_id: null, draft_is_delete: true })
    .eq("emp_id", empId)
    .eq("date", date);
  if (error) throw error;
  void logAudit("shift.deleted", "shift", `${empId}:${date}`, {}, orgId);
}

/**
 * Atomically moves a shift from one employee+date to another.
 * Uses a SECURITY DEFINER RPC with advisory locks to prevent partial failures.
 */
export async function moveShift(
  orgId: string,
  sourceEmpId: string,
  sourceDate: string,
  targetEmpId: string,
  targetDate: string,
  shiftCodeIds: number[],
  expectedVersion?: number,
): Promise<void> {
  const { error } = await supabase.rpc("move_shift", {
    p_org_id: orgId,
    p_source_emp_id: sourceEmpId,
    p_source_date: sourceDate,
    p_target_emp_id: targetEmpId,
    p_target_date: targetDate,
    p_shift_code_ids: shiftCodeIds,
    p_expected_version: expectedVersion ?? null,
  });
  if (error) {
    if (error.message?.includes("Optimistic lock failed")) {
      throw new OptimisticLockError(
        `${sourceEmpId}:${sourceDate}`,
        expectedVersion ?? 0,
      );
    }
    throw error;
  }
  void logAudit("shift.moved", "shift", `${sourceEmpId}:${sourceDate}`, { targetEmpId, targetDate, shiftCodeIds }, orgId);
}

export async function publishSchedule(
  orgId: string,
  startDate: Date,
  endDate: Date
): Promise<string | null> {
  const startKey = formatDateKey(startDate);
  const endKey = formatDateKey(endDate);
  const { data, error } = await supabase.rpc("publish_schedule", {
    p_org_id: orgId,
    p_start_date: startKey,
    p_end_date: endKey,
  });
  if (error) throw error;
  void logAudit("schedule.published", "schedule", orgId, {
    startDate: startKey,
    endDate: endKey,
  }, orgId);
  return data as string | null;
}

/**
 * Fetch publish history entries since a given timestamp (or last 24 hours as fallback).
 * Returns newest-first. An empty array means nothing was published recently.
 */
export async function fetchRecentPublishHistory(
  orgId: string,
  since?: string | null,
): Promise<import("@/types").PublishHistoryEntry[]> {
  const cutoff = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("publish_history")
    .select("id, org_id, published_by, start_date, end_date, change_count, changes, published_at")
    .eq("org_id", orgId)
    .gte("published_at", cutoff)
    .order("published_at", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((row: any) => ({
    id: row.id,
    publishedBy: row.published_by,
    startDate: row.start_date,
    endDate: row.end_date,
    changeCount: row.change_count,
    changes: row.changes as import("@/types").PublishChange[],
    publishedAt: row.published_at,
  }));
}

/**
 * Returns date ranges that have been published at least once for the given org
 * and date window. Used to gate coverage-gap open shifts so they only appear
 * after the schedule has been published for those dates.
 */
export async function fetchPublishedDateRanges(
  orgId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ startDate: string; endDate: string }[]> {
  const { data, error } = await supabase
    .from("publish_history")
    .select("start_date, end_date")
    .eq("org_id", orgId)
    .lte("start_date", rangeEnd)
    .gte("end_date", rangeStart);
  if (error) throw error;
  if (!data || data.length === 0) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((row: any) => ({
    startDate: row.start_date,
    endDate: row.end_date,
  }));
}

/**
 * Fire-and-forget: records when the current user last viewed the schedule.
 */
export async function updateScheduleLastViewed(orgId: string): Promise<void> {
  await supabase.rpc("update_schedule_last_viewed", { p_org_id: orgId });
}

/**
 * Returns when the current user last viewed the schedule (ISO string or null).
 */
export async function getScheduleLastViewed(orgId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_schedule_last_viewed", { p_org_id: orgId });
  if (error) throw error;
  return data as string | null;
}

/**
 * Fetch paginated publish history with publisher names resolved.
 */
export async function fetchPublishHistory(
  orgId: string,
  limit = 20,
  offset = 0,
): Promise<import("@/types").PublishHistoryEntryWithName[]> {
  const { data, error } = await supabase.rpc("get_publish_history", {
    p_org_id: orgId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    id: row.id,
    publishedBy: row.published_by,
    publishedByName: row.published_by_name,
    startDate: row.start_date,
    endDate: row.end_date,
    changeCount: row.change_count,
    changes: row.changes as import("@/types").PublishChange[],
    publishedAt: row.published_at,
  }));
}

export async function discardScheduleDrafts(
  orgId: string,
  userId?: string,
): Promise<void> {
  // 1. Fetch shifts — scoped to this user if userId provided, otherwise all org drafts
  let query = supabase
    .from("shifts")
    .select("emp_id, date, draft_shift_code_ids, published_shift_code_ids, draft_absence_type_id, published_absence_type_id, draft_is_delete, draft_custom_start_time, draft_custom_end_time, published_custom_start_time, published_custom_end_time, employees!inner(org_id)")
    .eq("employees.org_id", orgId);
  if (userId) query = query.eq("updated_by", userId);
  const { data: shifts, error: fetchError } = await query;

  if (fetchError) throw fetchError;
  if (!shifts || shifts.length === 0) return;

  // 2. Identify which rows need updating or deleting
  const toUpsert: { emp_id: string; date: string; draft_shift_code_ids: number[]; published_shift_code_ids: number[]; draft_absence_type_id: number | null; published_absence_type_id: number | null; draft_is_delete: boolean; draft_custom_start_time: string | null; draft_custom_end_time: string | null }[] = [];
  const toDelete: { emp_id: string; date: string }[] = [];

  for (const shift of shifts as DbShift[]) {
    const draftIds = shift.draft_shift_code_ids ?? [];
    const pubIds = shift.published_shift_code_ids ?? [];
    const draftAbsId = shift.draft_absence_type_id ?? null;
    const pubAbsId = shift.published_absence_type_id ?? null;
    const draftStartTime = shift.draft_custom_start_time ?? null;
    const draftEndTime = shift.draft_custom_end_time ?? null;
    const pubStartTime = shift.published_custom_start_time ?? null;
    const pubEndTime = shift.published_custom_end_time ?? null;
    const hasDraftChange = shift.draft_is_delete ||
      (draftIds.length > 0 && !arraysEqual(draftIds, pubIds)) ||
      (draftAbsId != null && draftAbsId !== pubAbsId) ||
      (draftStartTime != null && draftStartTime !== pubStartTime) ||
      (draftEndTime != null && draftEndTime !== pubEndTime);

    if (hasDraftChange) {
      if (pubIds.length > 0 || pubAbsId != null) {
        // Was edited from an existing published shift, restore the original
        toUpsert.push({
          emp_id: shift.emp_id,
          date: shift.date,
          draft_shift_code_ids: pubIds,
          published_shift_code_ids: pubIds,
          draft_absence_type_id: pubAbsId,
          published_absence_type_id: pubAbsId,
          draft_is_delete: false,
          draft_custom_start_time: pubStartTime,
          draft_custom_end_time: pubEndTime,
        });
      } else {
        // Was created as a draft but never published
        toDelete.push({ emp_id: shift.emp_id, date: shift.date });
      }
    }
  }

  // 3. Execute bulk operations
  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from("shifts")
      .upsert(toUpsert, { onConflict: "emp_id,date" });
    if (upsertError) throw upsertError;
  }

  if (toDelete.length > 0) {
    for (const d of toDelete) {
      assertSafeFilterValue(d.emp_id, "emp_id");
      assertSafeFilterValue(d.date, "date");
    }
    const orClauses = toDelete.map(d => `and(emp_id.eq.${d.emp_id},date.eq.${d.date})`).join(",");
    const { error: deleteError } = await supabase
      .from("shifts")
      .delete()
      .or(orClauses);
    if (deleteError) throw deleteError;
  }

  // 4. Handle Schedule Notes Drafts
  let noteDeleteQuery = supabase
    .from("schedule_notes")
    .delete()
    .eq("org_id", orgId)
    .eq("status", "draft");
  if (userId) noteDeleteQuery = noteDeleteQuery.eq("updated_by", userId);
  const { error: noteDeleteError } = await noteDeleteQuery;

  if (noteDeleteError) throw noteDeleteError;

  let noteRevertQuery = supabase
    .from("schedule_notes")
    .update({ status: "published" })
    .eq("org_id", orgId)
    .eq("status", "draft_deleted");
  if (userId) noteRevertQuery = noteRevertQuery.eq("updated_by", userId);
  const { error: noteRevertError } = await noteRevertQuery;

  if (noteRevertError) throw noteRevertError;
}

// ── Schedule Notes ───────────────────────────────────────────────────────────

export async function fetchScheduleNotes(orgId: string, startDate?: string, endDate?: string): Promise<ScheduleNote[]> {
  let query = supabase
    .from("schedule_notes")
    .select("id, org_id, emp_id, date, indicator_type_id, focus_area_id, status, created_by, created_at, updated_at")
    .eq("org_id", orgId);
  if (startDate) query = query.gte("date", startDate);
  if (endDate) query = query.lte("date", endDate);
  const { data, error } = await query;
  if (error) throw error;

  return (data as DbScheduleNote[]).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    empId: row.emp_id,
    date: row.date,
    indicatorTypeId: row.indicator_type_id,
    focusAreaId: row.focus_area_id,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function upsertScheduleNote(
  orgId: string,
  empId: string,
  date: string,
  indicatorTypeId: number,
  focusAreaId: number,
  existingStatus?: 'published' | 'draft' | 'draft_deleted',
): Promise<void> {
  let status: 'draft' | 'published' | 'draft_deleted' = 'draft';

  // If we are "adding" a note that was marked for deletion, set it back to published
  if (existingStatus === 'draft_deleted') {
    status = 'published';
  }

  const { error } = await supabase.from("schedule_notes").upsert(
    {
      org_id: orgId,
      emp_id: empId,
      date,
      indicator_type_id: indicatorTypeId,
      focus_area_id: focusAreaId,
      status,
    },
    { onConflict: "emp_id,date,indicator_type_id,focus_area_id" },
  );
  if (error) throw error;
}

export async function deleteScheduleNote(
  orgId: string,
  empId: string,
  date: string,
  indicatorTypeId: number,
  focusAreaId: number,
  existingStatus?: 'published' | 'draft' | 'draft_deleted',
): Promise<void> {
  if (existingStatus === 'draft') {
    // If it was a new draft note, just delete it
    const { error } = await supabase
      .from("schedule_notes")
      .delete()
      .eq("org_id", orgId)
      .eq("emp_id", empId)
      .eq("date", date)
      .eq("indicator_type_id", indicatorTypeId)
      .eq("focus_area_id", focusAreaId);
    if (error) throw error;
  } else {
    // If it was already published, mark it as draft_deleted
    const { error } = await supabase
      .from("schedule_notes")
      .update({ status: 'draft_deleted' })
      .eq("org_id", orgId)
      .eq("emp_id", empId)
      .eq("date", date)
      .eq("indicator_type_id", indicatorTypeId)
      .eq("focus_area_id", focusAreaId);
    if (error) throw error;
  }
}


// ── Indicator Types ───────────────────────────────────────────────────────────

interface DbIndicatorType {
  id: number;
  org_id: string;
  name: string;
  color: string;
  sort_order: number;
  archived_at: string | null;
}

function rowToIndicatorType(row: DbIndicatorType): IndicatorType {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
  };
}

export async function fetchIndicatorTypes(orgId: string, includeArchived = false): Promise<IndicatorType[]> {
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
  indicator: Omit<IndicatorType, "id"> & { id?: number }
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
    return rowToIndicatorType(data as DbIndicatorType);
  }
  const { data, error } = await supabase
    .from("indicator_types")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  await cacheDel(CacheKey.indicatorTypes(indicator.orgId));
  return rowToIndicatorType(data as DbIndicatorType);
}

export async function deleteIndicatorType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("indicator_types")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.indicatorTypes(orgId));
}

export async function restoreIndicatorType(id: number, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("indicator_types")
    .update({ archived_at: null })
    .eq("id", id);
  if (error) throw error;
  await cacheDel(CacheKey.indicatorTypes(orgId));
  void logAudit("indicator_type.restored", "indicator_type", String(id), {}, orgId);
}


// ── RBAC helper operations ───────────────────────────────────────────────────

export async function assignOrgRoleByEmail(
  orgId: string,
  email: string,
  role: string,
): Promise<void> {
  const { error } = await supabase.rpc("assign_org_role_by_email", {
    p_email: email,
    p_org_id: orgId,
    p_org_role: role,
  });
  if (error) throw error;
  await cacheDel(CacheKey.orgUsers(orgId), CacheKey.orgDirectory(orgId), CacheKey.allUsers());
}

export async function fetchUserSessions() {
  const { data, error } = await supabase
    .from("user_sessions")
    .select("id, user_id, device_label, ip_address, last_active_at, created_at, refresh_token_hash")
    .order("last_active_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    userId: row.user_id as string,
    deviceLabel: (row.device_label as string | null) ?? null,
    ipAddress: (row.ip_address as string | null) ?? null,
    lastActiveAt: row.last_active_at as string,
    createdAt: row.created_at as string,
    refreshTokenHash: row.refresh_token_hash as string,
  }));
}

export async function revokeUserSession(refreshTokenHash: string): Promise<void> {
  const { error } = await supabase
    .from("user_sessions")
    .delete()
    .eq("refresh_token_hash", refreshTokenHash);

  if (error) throw error;
}

export async function startImpersonation(
  targetUserId: string,
  justification: string,
  ipAddress?: string,
  userAgent?: string,
  targetOrgId?: string,
) {
  const { data, error } = await supabase.rpc("start_impersonation", {
    p_target_user_id: targetUserId,
    p_justification: justification,
    p_ip_address: ipAddress ?? null,
    p_user_agent: userAgent ?? null,
    p_target_org_id: targetOrgId ?? null,
  });
  if (error) throw error;
  const result = data as { session_id: string; expires_at: string };
  void logAudit("impersonation.started", "impersonation_session", result.session_id, { targetUserId, justification }, targetOrgId);
  return result;
}

export async function endImpersonation(sessionId: string, reason: string = 'manual'): Promise<void> {
  const { error } = await supabase.rpc("end_impersonation", {
    p_session_id: sessionId,
    p_reason: reason,
  });
  if (error) throw error;
  void logAudit("impersonation.ended", "impersonation_session", sessionId, { reason });
}

export async function fetchImpersonationHistory(options?: {
  limit?: number;
  offset?: number;
}): Promise<import("@/types").ImpersonationHistoryEntry[]> {
  const { data, error } = await supabase.rpc("get_impersonation_history", {
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    sessionId: row.session_id as string,
    gridmasterId: row.gridmaster_id as string,
    gridmasterEmail: row.gridmaster_email as string,
    targetUserId: row.target_user_id as string,
    targetEmail: row.target_email as string,
    targetOrgId: row.target_org_id as string,
    targetOrgName: (row.target_org_name as string | null) ?? null,
    justification: (row.justification as string) ?? "",
    ipAddress: (row.ip_address as string | null) ?? null,
    userAgent: (row.user_agent as string | null) ?? null,
    createdAt: row.created_at as string,
    endedAt: (row.ended_at as string | null) ?? null,
    endReason: (row.end_reason as string | null) ?? null,
    expiresAt: row.expires_at as string,
  }));
}

export async function fetchNotifications(options?: {
  limit?: number;
  offset?: number;
}): Promise<import("@/types").Notification[]> {
  const { data, error } = await supabase.rpc("get_notifications", {
    p_limit: options?.limit ?? 20,
    p_offset: options?.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    type: row.type as import("@/types").NotificationType,
    channel: (row.channel as 'in_app' | 'email') ?? 'in_app',
    category: (row.category as string | null) ?? null,
    title: row.title as string,
    message: row.message as string,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { data, error } = await supabase.rpc("get_unread_notification_count");
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
}

export async function acceptInvitation(
  token: string,
): Promise<{ status: string; orgId: string; role: string; orgSlug: string | null }> {
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });
  if (error) throw error;
  return {
    status: data.status,
    orgId: data.org_id,
    role: data.role,
    orgSlug: data.org_slug ?? null,
  };
}

export async function sendInvitation(
  email: string,
  role: AssignableOrganizationRole,
  orgId: string,
  employeeId?: string,
  opts?: { firstName?: string; lastName?: string; phone?: string; departmentIds?: number[] },
): Promise<{ invitationId: string; token: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc("send_invitation", {
    p_email: email,
    p_role: role,
    p_org_id: orgId,
    p_employee_id: employeeId ?? null,
    p_first_name: opts?.firstName ?? null,
    p_last_name: opts?.lastName ?? null,
    p_phone: opts?.phone ?? null,
    p_department_ids: opts?.departmentIds ?? [],
  });
  if (error) throw error;
  await cacheDel(CacheKey.orgDirectory(orgId), CacheKey.invitations(orgId));
  void logAudit("invitation.sent", "invitation", data.invitation_id, { email, role }, orgId);
  return {
    invitationId: data.invitation_id,
    token: data.token,
    expiresAt: data.expires_at,
  };
}

export async function fetchInvitations(orgId: string): Promise<Invitation[]> {
  return cacheThrough(CacheKey.invitations(orgId), TTL.MODERATE, async () => {
    const { data, error } = await supabase
      .from("invitations")
      .select("id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, employee_id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      orgId: row.org_id as string,
      invitedBy: (row.invited_by as string) ?? null,
      email: row.email as string,
      roleToAssign: row.role_to_assign as AssignableOrganizationRole,
      expiresAt: row.expires_at as string,
      acceptedAt: (row.accepted_at as string) ?? null,
      revokedAt: (row.revoked_at as string) ?? null,
      createdAt: row.created_at as string,
      employeeId: (row.employee_id as string) ?? null,
    }));
  });
}

export async function revokeInvitation(invitationId: string, orgId?: string): Promise<void> {
  let query = supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (orgId) query = query.eq("org_id", orgId);
  const { error } = await query;
  if (error) throw error;
  if (orgId) await cacheDel(CacheKey.invitations(orgId));
  void logAudit("invitation.revoked", "invitation", invitationId, {}, orgId);
}

export async function resendInvitation(
  invitationId: string,
  orgId: string,
): Promise<{ token: string; expiresAt: string }> {
  const newToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("invitations")
    .update({ token: newToken, expires_at: expiresAt, revoked_at: null })
    .eq("id", invitationId)
    .eq("org_id", orgId)
    .is("accepted_at", null);
  if (error) throw error;
  await cacheDel(CacheKey.invitations(orgId));
  void logAudit("invitation.resent", "invitation", invitationId, {}, orgId);
  return { token: newToken, expiresAt };
}

export async function linkEmployeeToUser(
  employeeId: string,
  userId: string,
  orgId: string,
): Promise<{ status: string }> {
  const { data, error } = await supabase.rpc("link_employee_to_user", {
    p_employee_id: employeeId,
    p_user_id: userId,
    p_org_id: orgId,
  });
  if (error) throw error;
  await cacheDel(CacheKey.employees(orgId), CacheKey.employeeDetail(employeeId), CacheKey.orgUsers(orgId), CacheKey.orgDirectory(orgId));
  return { status: data.status };
}

// ── Recurring Shifts ──────────────────────────────────────────────────────────

interface DbRecurringShift {
  id: string;
  emp_id: string;
  org_id: string;
  day_of_week: number;
  shift_code_id: number | null;
  absence_type_id: number | null;
  effective_from: string;
  effective_until: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function rowToRecurringShift(
  row: DbRecurringShift,
  codeMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
): RecurringShift {
  let label = '?';
  if (row.shift_code_id != null) {
    label = codeMap.get(row.shift_code_id) ?? '?';
  } else if (row.absence_type_id != null) {
    label = absenceTypeMap?.get(row.absence_type_id) ?? '?';
  }
  return {
    id: row.id,
    empId: row.emp_id,
    orgId: row.org_id,
    dayOfWeek: row.day_of_week,
    shiftCodeId: row.shift_code_id,
    absenceTypeId: row.absence_type_id,
    shiftLabel: label,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
  };
}

export async function fetchRecurringShifts(
  orgId: string,
  empId?: string,
  shiftCodeMap?: Map<number, string>,
  includeArchived = false,
  absenceTypeMap?: Map<number, string>,
): Promise<RecurringShift[]> {
  let query = supabase
    .from("recurring_shifts")
    .select(RECURRING_SHIFT_COLS)
    .eq("org_id", orgId)
    .order("day_of_week")
    .order("effective_from", { ascending: false });
  if (!includeArchived) query = query.is("archived_at", null);
  if (empId) query = query.eq("emp_id", empId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as DbRecurringShift[]).map(r => rowToRecurringShift(r, shiftCodeMap ?? new Map(), absenceTypeMap));
}

export async function upsertRecurringShift(
  empId: string,
  orgId: string,
  dayOfWeek: number,
  shiftCodeId: number | null,
  effectiveFrom: string,
  absenceTypeId?: number | null,
): Promise<void> {
  // Archive ALL existing active rows for this (emp, day) first.
  // This avoids duplicate active rows when the effectiveFrom date differs
  // and prevents unique-constraint violations from multi-row updates.
  const { error: archiveError } = await supabase
    .from("recurring_shifts")
    .update({ archived_at: new Date().toISOString() })
    .eq("emp_id", empId)
    .eq("day_of_week", dayOfWeek)
    .is("archived_at", null);

  if (archiveError) throw new Error(archiveError.message);

  // Insert a fresh row with the current effectiveFrom.
  // Mutually exclusive: either shift_code_id or absence_type_id, never both.
  const { error: insertError } = await supabase
    .from("recurring_shifts")
    .insert({
      emp_id: empId,
      org_id: orgId,
      day_of_week: dayOfWeek,
      shift_code_id: absenceTypeId != null ? null : shiftCodeId,
      absence_type_id: absenceTypeId ?? null,
      effective_from: effectiveFrom,
    });
  if (insertError) throw new Error(insertError.message);
}

export async function deleteRecurringShift(empId: string, dayOfWeek: number): Promise<void> {
  const { error } = await supabase
    .from("recurring_shifts")
    .update({ archived_at: new Date().toISOString() })
    .eq("emp_id", empId)
    .eq("day_of_week", dayOfWeek)
    .is("archived_at", null);
  if (error) throw new Error(error.message);
}

/**
 * Applies recurring shift templates to a date range as drafts.
 * Delegates to the `apply_recurring_schedules` SECURITY DEFINER RPC which:
 * - Checks canApplyRecurringSchedule permission
 * - Uses DST-safe PostgreSQL DATE arithmetic
 * - Reads fresh recurring_shifts + shifts from DB (no stale client data)
 * - Picks most recent template per employee via effectiveFrom DESC
 * - Skips archived shift codes
 */
export async function applyRecurringSchedules(
  orgId: string,
  startDate: Date,
  endDate: Date,
): Promise<{ empId: string; date: string; label: string; shiftCodeId?: number; absenceTypeId?: number }[]> {
  const { data, error } = await supabase.rpc("apply_recurring_schedules", {
    p_org_id: orgId,
    p_start_date: formatDateKey(startDate),
    p_end_date: formatDateKey(endDate),
  });
  if (error) throw new Error(error.message);
  return (data?.shifts ?? []) as { empId: string; date: string; label: string; shiftCodeId?: number; absenceTypeId?: number }[];
}

// ── Recurring Shifts Draft Sessions ───────────────────────────────────────────

export interface RecurringDraft {
  id: string;
  orgId: string;
  savedBy: string;
  draftData: Record<string, Record<number, string>>;
  savedAt: string;
}

export async function getRecurringDraft(orgId: string): Promise<RecurringDraft | null> {
  const { data, error } = await supabase
    .from("recurring_shifts_draft_sessions")
    .select("id, org_id, saved_by, draft_data, saved_at")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    orgId: data.org_id,
    savedBy: data.saved_by,
    draftData: data.draft_data as Record<string, Record<number, string>>,
    savedAt: data.saved_at,
  };
}

export async function saveRecurringDraft(
  orgId: string,
  savedBy: string,
  draftData: Record<string, Record<number, string>>,
): Promise<void> {
  const { data: existing } = await supabase
    .from("recurring_shifts_draft_sessions")
    .select("id")
    .eq("org_id", orgId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("recurring_shifts_draft_sessions")
      .update({
        saved_by: savedBy,
        draft_data: draftData,
        saved_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("recurring_shifts_draft_sessions")
      .insert({
        org_id: orgId,
        saved_by: savedBy,
        draft_data: draftData,
        saved_at: new Date().toISOString(),
      });
    if (error) throw error;
  }
}

export async function deleteRecurringDraft(orgId: string): Promise<void> {
  const { error } = await supabase
    .from("recurring_shifts_draft_sessions")
    .delete()
    .eq("org_id", orgId);
  if (error) throw error;
}

// ── Shift Series ──────────────────────────────────────────────────────────────

function generateSeriesDates(
  frequency: SeriesFrequency,
  daysOfWeek: number[] | null,
  startDate: string,
  endDate: string | null,
  maxOccurrences: number | null,
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const cap = maxOccurrences ?? MAX_SERIES_OCCURRENCES;

  // Compute an upper-bound end date for iteration if none specified
  const maxEnd = endDate
    ? new Date(endDate + 'T00:00:00')
    : new Date(start.getFullYear(), start.getMonth() + 7, start.getDate()); // ~7 months
  const startDayOfWeek = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())).getUTCDay();

  // DST-safe iteration using UTC arithmetic
  for (const { dateKey, dayOfWeek, dayIndex } of iterateDateRange(start, maxEnd)) {
    if (dates.length >= cap) break;

    let include = false;
    const dayMatch = (daysOfWeek === null || daysOfWeek.length === 0)
      ? dayOfWeek === startDayOfWeek
      : daysOfWeek.includes(dayOfWeek);

    if (frequency === 'daily') {
      include = true;
    } else if (frequency === 'weekly') {
      include = dayMatch;
    } else if (frequency === 'biweekly') {
      // dayIndex is a reliable day counter (immune to DST)
      const weekNum = Math.floor(dayIndex / 7);
      include = weekNum % 2 === 0 && dayMatch;
    }

    if (include) dates.push(dateKey);
  }

  return dates;
}

export async function createShiftSeries(
  empId: string,
  orgId: string,
  shiftCodeId: number,
  shiftLabel: string,
  frequency: SeriesFrequency,
  daysOfWeek: number[] | null,
  startDate: string,
  endDate: string | null,
  maxOccurrences: number | null,
): Promise<ShiftSeries> {
  // Pre-generate the UUID so we can link occurrence rows without needing RETURNING.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // 1. Create the series master record
  const { error } = await supabase
    .from("shift_series")
    .insert({
      id,
      emp_id: empId,
      org_id: orgId,
      shift_code_id: shiftCodeId,
      frequency,
      days_of_week: daysOfWeek,
      start_date: startDate,
      end_date: endDate,
      max_occurrences: maxOccurrences,
    });
  if (error) throw new Error(error.message);

  // 2. Generate and upsert occurrence rows
  const dates = generateSeriesDates(frequency, daysOfWeek, startDate, endDate, maxOccurrences);
  if (dates.length > 0) {
    const rows = dates.map(date => ({
      emp_id: empId,
      date,
      draft_shift_code_ids: [shiftCodeId],
      draft_is_delete: false,
      org_id: orgId,
      series_id: id,
    }));
    const { error: insertError } = await supabase
      .from("shifts")
      .upsert(rows, { onConflict: "emp_id,date" });
    if (insertError) throw new Error(insertError.message);
  }

  // 3. Return a constructed ShiftSeries
  return {
    id,
    empId,
    orgId,
    shiftCodeId,
    shiftLabel,
    frequency,
    daysOfWeek,
    startDate,
    endDate,
    maxOccurrences,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates draft_shift_code_ids for all shifts in a series (bulk edit all).
 */
export async function updateSeriesAllShifts(seriesId: string, newShiftCodeId: number): Promise<void> {
  const { error } = await supabase
    .from("shifts")
    .update({ draft_shift_code_ids: [newShiftCodeId], draft_is_delete: false })
    .eq("series_id", seriesId);
  if (error) throw new Error(error.message);

  const { error: seriesError } = await supabase
    .from("shift_series")
    .update({ shift_code_id: newShiftCodeId })
    .eq("id", seriesId);
  if (seriesError) throw new Error(seriesError.message);
}

/**
 * Deletes all shifts in a series (sets draft_is_delete for all).
 * Also archives the series master record (soft-delete).
 */
export async function deleteShiftSeries(seriesId: string): Promise<number> {
  const { data, error } = await supabase
    .from("shifts")
    .update({ draft_is_delete: true, draft_shift_code_ids: [], series_id: null })
    .eq("series_id", seriesId)
    .select("emp_id");
  if (error) throw new Error(error.message);

  const { error: seriesError } = await supabase
    .from("shift_series")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", seriesId);
  if (seriesError) throw new Error(seriesError.message);

  return data?.length ?? 0;
}

// ── Gridmaster: Tenant Management ─────────────────────────────────────────────

export async function fetchAllOrganizations(): Promise<Organization[]> {
  return cacheThrough(CacheKey.allOrganizations(), TTL.STABLE, async () => {
    const { data, error } = await supabase
      .from("organizations")
      .select(ORGANIZATION_COLS)
      .order("name");
    if (error) throw error;
    return (data ?? []).map((row: unknown) => rowToOrganization(row as DbOrganization));
  });
}

export interface TenantStats {
  orgId: string;
  userCount: number;
  employeeCount: number;
}

export async function createOrganization(data: Omit<Organization, 'id'>): Promise<Organization> {
  const { data: row, error } = await supabase
    .from("organizations")
    .insert({
      name: data.name,
      slug: data.slug || null,
      address: data.address || '',
      phone: data.phone || '',
      employee_count: data.employeeCount ?? null,
      focus_area_label: data.focusAreaLabel || null,
      certification_label: data.certificationLabel || null,
      role_label: data.roleLabel || null,
      department_label: data.departmentLabel || null,
      shift_display_mode: data.shiftDisplayMode || 'code',
      timezone: data.timezone || null,
      enforce_conflict_prevention: data.enforceConflictPrevention ?? false,
      data_retention_days: data.dataRetentionDays ?? 365,
      feature_overrides: data.featureOverrides ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  await cacheDel(CacheKey.allOrganizations(), CacheKey.tenantStats());
  const result = rowToOrganization(row as DbOrganization);
  void logAudit("org.created", "organization", result.id, { name: data.name }, result.id);
  return result;
}

export async function archiveOrganization(orgId: string): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", orgId);
  if (error) throw error;
  await cacheDel(CacheKey.organization(orgId), CacheKey.allOrganizations(), CacheKey.tenantStats());
  void logAudit("org.archived", "organization", orgId, {}, orgId);
}

export async function restoreOrganization(orgId: string): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({ archived_at: null })
    .eq("id", orgId);
  if (error) throw error;
  await cacheDel(CacheKey.organization(orgId), CacheKey.allOrganizations(), CacheKey.tenantStats());
  void logAudit("org.restored", "organization", orgId, {}, orgId);
}

export async function deactivateUser(userId: string, orgId: string): Promise<void> {
  const { data: { user: actor } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("profiles")
    .update({ deactivated_at: new Date().toISOString(), deactivated_by: actor?.id ?? null })
    .eq("id", userId);
  if (error) throw error;
  await cacheDel(CacheKey.orgUsers(orgId), CacheKey.orgDirectory(orgId), CacheKey.allUsers());
  void logAudit("user.deactivated", "role", userId, {}, orgId);
}

export async function reactivateUser(userId: string, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ deactivated_at: null, deactivated_by: null })
    .eq("id", userId);
  if (error) throw error;
  await cacheDel(CacheKey.orgUsers(orgId), CacheKey.orgDirectory(orgId), CacheKey.allUsers());
  void logAudit("user.reactivated", "role", userId, {}, orgId);
}

export async function suspendOrganization(orgId: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: reason })
    .eq("id", orgId);
  if (error) throw error;
  await cacheDel(CacheKey.organization(orgId), CacheKey.allOrganizations());
  void logAudit("org.suspended", "organization", orgId, { reason }, orgId);
}

export async function unsuspendOrganization(orgId: string): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({ suspended_at: null, suspended_reason: null })
    .eq("id", orgId);
  if (error) throw error;
  await cacheDel(CacheKey.organization(orgId), CacheKey.allOrganizations());
  void logAudit("org.unsuspended", "organization", orgId, {}, orgId);
}

export async function fetchAllUsers(): Promise<import("@/types").PlatformUser[]> {
  return cacheThrough(CacheKey.allUsers(), TTL.MODERATE, async () => {
    const { data, error } = await supabase.rpc("get_all_users_with_profiles");
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      email: (row.email as string | null) ?? null,
      firstName: null,
      lastName: null,
      platformRole: (row.platform_role as string ?? 'none') as import("@/types").PlatformRole,
      orgRole: (row.org_role as string | null) as import("@/types").OrganizationRole | null,
      orgId: (row.org_id as string | null) ?? null,
      orgName: (row.org_name as string | null) ?? null,
      orgSlug: (row.org_slug as string | null) ?? null,
      createdAt: row.created_at as string,
      lastSignInAt: (row.last_sign_in_at as string | null) ?? null,
      deactivatedAt: (row.deactivated_at as string | null) ?? null,
    }));
  });
}

export async function fetchAuditLog(options?: {
  orgId?: string;
  limit?: number;
  offset?: number;
}): Promise<import("@/types").AuditLogEntry[]> {
  const { data, error } = await supabase.rpc("get_audit_log", {
    p_org_id: options?.orgId ?? null,
    p_limit: options?.limit ?? 50,
    p_offset: options?.offset ?? 0,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    targetUserId: row.target_user_id as string,
    targetEmail: (row.target_email as string | null) ?? null,
    changedById: row.changed_by_id as string,
    changedByEmail: (row.changed_by_email as string | null) ?? null,
    fromRole: row.from_role as string,
    toRole: row.to_role as string,
    createdAt: row.created_at as string,
    orgId: (row.org_id as string | null) ?? null,
    orgName: (row.org_name as string | null) ?? null,
  }));
}

export async function fetchFullAuditLog(options?: {
  orgId?: string;
  action?: string;
  actionPrefix?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
}): Promise<import("@/types").FullAuditLogEntry[]> {
  let query = supabase
    .from("audit_log")
    .select("id, org_id, actor_id, actor_email, action, resource_type, resource_id, details, created_at")
    .order("created_at", { ascending: false })
    .range(
      options?.offset ?? 0,
      (options?.offset ?? 0) + (options?.limit ?? 50) - 1,
    );
  if (options?.orgId) query = query.eq("org_id", options.orgId);
  if (options?.action) query = query.eq("action", options.action);
  if (options?.actionPrefix) query = query.like("action", `${options.actionPrefix}%`);
  if (options?.resourceType) query = query.eq("resource_type", options.resourceType);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as number,
    orgId: (row.org_id as string | null) ?? null,
    actorId: (row.actor_id as string | null) ?? null,
    actorEmail: (row.actor_email as string | null) ?? null,
    action: row.action as string,
    resourceType: row.resource_type as string,
    resourceId: (row.resource_id as string | null) ?? null,
    details: (row.details ?? {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
  }));
}

export async function removeUserFromOrganization(
  userId: string,
  orgId: string,
): Promise<void> {
  const { data: { user: actor } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("organization_memberships")
    .update({ archived_at: new Date().toISOString(), archived_by: actor?.id ?? null })
    .eq("user_id", userId)
    .eq("org_id", orgId);
  if (error) throw error;
  await cacheDel(CacheKey.orgUsers(orgId), CacheKey.orgDirectory(orgId), CacheKey.employees(orgId), CacheKey.allUsers(), CacheKey.tenantStats());
  void logAudit("user.removed_from_org", "role", userId, {}, orgId);
}

export async function fetchTenantStats(): Promise<TenantStats[]> {
  return cacheThrough(CacheKey.tenantStats(), TTL.MODERATE, async () => {
    const { data, error } = await supabase.rpc("get_tenant_stats");
    if (error) throw error;
    return (data ?? []).map((row: { org_id: string; user_count: number; employee_count: number }) => ({
      orgId: row.org_id,
      userCount: Number(row.user_count),
      employeeCount: Number(row.employee_count),
    }));
  });
}

export async function fetchInvitationsForOrg(orgId: string): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, employee_id")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    orgId: row.org_id as string,
    invitedBy: (row.invited_by as string) ?? null,
    email: row.email as string,
    roleToAssign: row.role_to_assign as AssignableOrganizationRole,
    expiresAt: row.expires_at as string,
    acceptedAt: (row.accepted_at as string) ?? null,
    revokedAt: (row.revoked_at as string) ?? null,
    createdAt: row.created_at as string,
    employeeId: (row.employee_id as string) ?? null,
  }));
}

export async function revokeInvitationAsGridmaster(invitationId: string, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (error) throw error;
  await cacheDel(CacheKey.invitations(orgId));
  void logAudit("invitation.revoked", "invitation", invitationId, { revokedBy: "gridmaster" }, orgId);
}

export async function fetchUserMemberships(userId: string): Promise<UserMembership[]> {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("org_id, org_role, joined_at, admin_permissions, organizations(name, slug)")
    .eq("user_id", userId)
    .is("archived_at", null);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => {
    const org = row.organizations as { name: string; slug: string | null } | null;
    return {
      orgId: row.org_id as string,
      orgName: org?.name ?? "Unknown",
      orgSlug: org?.slug ?? null,
      orgRole: row.org_role as OrganizationRole,
      joinedAt: row.joined_at as string,
      adminPermissions: (row.admin_permissions as UserMembership["adminPermissions"]) ?? null,
    };
  });
}

export async function fetchOrgActivityMetrics(orgId: string): Promise<OrgActivityMetrics> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const [lastLoginResult, activeUsersResult, shiftsResult, pendingInvResult, acceptedInvResult] =
    await Promise.all([
      // Last login across all org users
      supabase
        .from("profiles")
        .select("last_sign_in_at")
        .in(
          "id",
          (await supabase
            .from("organization_memberships")
            .select("user_id")
            .eq("org_id", orgId)
            .is("archived_at", null)
          ).data?.map((r: { user_id: string }) => r.user_id) ?? [],
        )
        .not("last_sign_in_at", "is", null)
        .order("last_sign_in_at", { ascending: false })
        .limit(1),

      // Active users in last 30 days
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in(
          "id",
          (await supabase
            .from("organization_memberships")
            .select("user_id")
            .eq("org_id", orgId)
            .is("archived_at", null)
          ).data?.map((r: { user_id: string }) => r.user_id) ?? [],
        )
        .gte("last_sign_in_at", thirtyDaysAgo),

      // Shifts created in last 30 days
      supabase
        .from("shifts")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .gte("created_at", thirtyDaysAgo),

      // Pending invitations (not accepted, not revoked, not expired)
      supabase
        .from("invitations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gte("expires_at", now),

      // Invitations accepted in last 30 days
      supabase
        .from("invitations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .gte("accepted_at", thirtyDaysAgo),
    ]);

  const lastLoginRow = lastLoginResult.data?.[0] as { last_sign_in_at: string } | undefined;

  return {
    orgId,
    lastLoginAt: lastLoginRow?.last_sign_in_at ?? null,
    activeUsers30d: activeUsersResult.count ?? 0,
    shiftsCreated30d: shiftsResult.count ?? 0,
    invitationsPending: pendingInvResult.count ?? 0,
    invitationsAccepted30d: acceptedInvResult.count ?? 0,
  };
}

export async function deleteOrganizationPermanently(orgId: string): Promise<void> {
  // Audit BEFORE deletion since audit entries for this org will be removed
  void logAudit("org.deleted", "organization", orgId, { permanent: true }, orgId);

  try {
    // Delete in dependency order — children before parents
    // Schedule data
    await supabase.from("schedule_notes").delete().eq("org_id", orgId);
    await supabase.from("shifts").delete().eq("org_id", orgId);
    await supabase.from("recurring_shifts").delete().eq("org_id", orgId);
    await supabase.from("shift_series").delete().eq("org_id", orgId);

    // Coverage
    await supabase.from("coverage_requirements").delete().eq("org_id", orgId);

    // Config items
    await supabase.from("shift_codes").delete().eq("org_id", orgId);
    await supabase.from("shift_categories").delete().eq("org_id", orgId);
    await supabase.from("absence_types").delete().eq("org_id", orgId);
    await supabase.from("focus_areas").delete().eq("org_id", orgId);
    await supabase.from("certifications").delete().eq("org_id", orgId);
    await supabase.from("organization_roles").delete().eq("org_id", orgId);
    await supabase.from("indicator_types").delete().eq("org_id", orgId);

    // Employees
    await supabase.from("employees").delete().eq("org_id", orgId);

    // Invitations
    await supabase.from("invitations").delete().eq("org_id", orgId);

    // Notifications
    await supabase.from("notifications").delete().eq("org_id", orgId);

    // Shift requests
    await supabase.from("shift_requests").delete().eq("org_id", orgId);

    // Memberships
    await supabase.from("organization_memberships").delete().eq("org_id", orgId);

    // Audit log entries for this org
    await supabase.from("audit_log").delete().eq("org_id", orgId);

    // Subscriptions
    await supabase.from("subscriptions").delete().eq("org_id", orgId);

    // The organization itself
    const { error } = await supabase.from("organizations").delete().eq("id", orgId);
    if (error) throw error;

    await cacheDel(
      CacheKey.organization(orgId),
      CacheKey.allOrganizations(),
      CacheKey.tenantStats(),
      CacheKey.employees(orgId),
      CacheKey.orgUsers(orgId),
      CacheKey.invitations(orgId),
      CacheKey.focusAreas(orgId),
      CacheKey.shiftCodes(orgId),
      CacheKey.shiftCategories(orgId),
      CacheKey.indicatorTypes(orgId),
      CacheKey.certifications(orgId),
      CacheKey.orgRoles(orgId),
      CacheKey.coverageReqs(orgId),
      CacheKey.absenceTypes(orgId),
    );
  } catch (err) {
    console.error("Failed to permanently delete organization", orgId, err);
    throw err;
  }
}

export async function fetchOrgSubscription(orgId: string): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, org_id, stripe_subscription_id, stripe_customer_id, status, price_id, quantity, current_period_start, current_period_end, cancel_at, canceled_at, trial_end, created_at, updated_at")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: row.id as number,
    orgId: row.org_id as string,
    stripeSubscriptionId: (row.stripe_subscription_id as string) ?? null,
    stripeCustomerId: (row.stripe_customer_id as string) ?? null,
    status: row.status as string,
    priceId: (row.price_id as string) ?? null,
    quantity: row.quantity as number,
    currentPeriodStart: (row.current_period_start as string) ?? null,
    currentPeriodEnd: (row.current_period_end as string) ?? null,
    cancelAt: (row.cancel_at as string) ?? null,
    canceledAt: (row.canceled_at as string) ?? null,
    trialEnd: (row.trial_end as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}


// ══════════════════════════════════════════════════════════════════════════════
// SHIFT REQUESTS — Pickup & Swap
// ══════════════════════════════════════════════════════════════════════════════

interface DbShiftRequest {
  id: string;
  org_id: string;
  type: ShiftRequestType;
  status: ShiftRequestStatus;
  requester_emp_id: string;
  requester_shift_date: string;
  requester_shift_code_ids: number[];
  requester_focus_area_id: number | null;
  requester_custom_start_time: string | null;
  requester_custom_end_time: string | null;
  target_emp_id: string | null;
  target_shift_date: string | null;
  target_shift_code_ids: number[] | null;
  target_focus_area_id: number | null;
  target_custom_start_time: string | null;
  target_custom_end_time: string | null;
  absence_type_id: number | null;
  parent_request_id: string | null;
  admin_user_id: string | null;
  admin_note: string | null;
  expires_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields from employees
  requester_first_name?: string;
  requester_last_name?: string;
  target_first_name?: string | null;
  target_last_name?: string | null;
}

function rowToShiftRequest(
  row: DbShiftRequest,
  shiftCodeMap: Map<number, string>
): ShiftRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    type: row.type,
    status: row.status,
    requesterEmpId: row.requester_emp_id,
    requesterName: [row.requester_first_name, row.requester_last_name]
      .filter(Boolean)
      .join(" ") || "Unknown",
    requesterShiftDate: row.requester_shift_date,
    requesterShiftCodeIds: row.requester_shift_code_ids ?? [],
    requesterShiftLabel: resolveCodeLabels(
      row.requester_shift_code_ids ?? [],
      shiftCodeMap
    ),
    requesterFocusAreaId: row.requester_focus_area_id,
    requesterCustomStartTime: row.requester_custom_start_time,
    requesterCustomEndTime: row.requester_custom_end_time,
    targetEmpId: row.target_emp_id,
    targetName: row.target_first_name
      ? [row.target_first_name, row.target_last_name]
          .filter(Boolean)
          .join(" ")
      : null,
    targetShiftDate: row.target_shift_date,
    targetShiftCodeIds: row.target_shift_code_ids,
    targetShiftLabel: row.target_shift_code_ids
      ? resolveCodeLabels(row.target_shift_code_ids, shiftCodeMap)
      : null,
    targetFocusAreaId: row.target_focus_area_id,
    targetCustomStartTime: row.target_custom_start_time,
    targetCustomEndTime: row.target_custom_end_time,
    absenceTypeId: row.absence_type_id,
    parentRequestId: row.parent_request_id,
    adminUserId: row.admin_user_id,
    adminNote: row.admin_note,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchShiftRequests(
  orgId: string,
  shiftCodeMap: Map<number, string>,
  filters?: {
    status?: ShiftRequestStatus[];
    type?: ShiftRequestType;
    empId?: string;
  }
): Promise<ShiftRequest[]> {
  let query = supabase
    .from("shift_requests")
    .select(
      `*,
       requester:employees!shift_requests_requester_emp_id_fkey(first_name, last_name),
       target:employees!shift_requests_target_emp_id_fkey(first_name, last_name)`
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (filters?.status?.length) {
    query = query.in("status", filters.status);
  }
  if (filters?.type) {
    query = query.eq("type", filters.type);
  }
  if (filters?.empId) {
    assertSafeFilterValue(filters.empId, "empId");
    query = query.or(
      `requester_emp_id.eq.${filters.empId},target_emp_id.eq.${filters.empId}`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const requester = row.requester as {
      first_name: string;
      last_name: string;
    } | null;
    const target = row.target as {
      first_name: string;
      last_name: string;
    } | null;
    const mapped: DbShiftRequest = {
      id: row.id as string,
      org_id: row.org_id as string,
      type: row.type as ShiftRequestType,
      status: row.status as ShiftRequestStatus,
      requester_emp_id: row.requester_emp_id as string,
      requester_shift_date: row.requester_shift_date as string,
      requester_shift_code_ids: row.requester_shift_code_ids as number[],
      requester_focus_area_id: row.requester_focus_area_id as number | null,
      requester_custom_start_time: row.requester_custom_start_time as string | null,
      requester_custom_end_time: row.requester_custom_end_time as string | null,
      target_emp_id: row.target_emp_id as string | null,
      target_shift_date: row.target_shift_date as string | null,
      target_shift_code_ids: row.target_shift_code_ids as number[] | null,
      target_focus_area_id: row.target_focus_area_id as number | null,
      target_custom_start_time: row.target_custom_start_time as string | null,
      target_custom_end_time: row.target_custom_end_time as string | null,
      absence_type_id: row.absence_type_id as number | null,
      parent_request_id: row.parent_request_id as string | null,
      admin_user_id: row.admin_user_id as string | null,
      admin_note: row.admin_note as string | null,
      expires_at: row.expires_at as string,
      resolved_at: row.resolved_at as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      requester_first_name: requester?.first_name,
      requester_last_name: requester?.last_name,
      target_first_name: target?.first_name ?? null,
      target_last_name: target?.last_name ?? null,
    };
    return rowToShiftRequest(mapped, shiftCodeMap);
  });
}

export async function fetchPendingApprovalCount(
  orgId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("shift_requests")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "pending_approval");
  if (error) throw error;
  return count ?? 0;
}

export async function createShiftRequest(
  orgId: string,
  type: ShiftRequestType,
  requesterEmpId: string,
  requesterShiftDate: string,
  targetEmpId?: string,
  targetShiftDate?: string,
  absenceTypeId?: number
): Promise<string> {
  const { data, error } = await supabase.rpc("create_shift_request", {
    p_org_id: orgId,
    p_type: type,
    p_requester_emp_id: requesterEmpId,
    p_requester_shift_date: requesterShiftDate,
    p_target_emp_id: targetEmpId ?? null,
    p_target_shift_date: targetShiftDate ?? null,
    p_absence_type_id: absenceTypeId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function claimShiftRequest(
  requestId: string,
  claimerEmpId: string
): Promise<void> {
  const { error } = await supabase.rpc("claim_shift_request", {
    p_request_id: requestId,
    p_claimer_emp_id: claimerEmpId,
  });
  if (error) throw error;
}

export async function volunteerForOpenShift(
  orgId: string,
  empId: string,
  shiftDate: string,
  shiftCodeIds: number[],
  focusAreaId: number,
  customStartTime: string | null,
  customEndTime: string | null
): Promise<string> {
  const { data, error } = await supabase.rpc("volunteer_for_open_shift", {
    p_org_id: orgId,
    p_emp_id: empId,
    p_shift_date: shiftDate,
    p_shift_code_ids: shiftCodeIds,
    p_focus_area_id: focusAreaId,
    p_custom_start_time: customStartTime,
    p_custom_end_time: customEndTime,
  });
  if (error) throw error;
  return data as string;
}

export async function respondToShiftRequest(
  requestId: string,
  empId: string,
  accept: boolean
): Promise<void> {
  const { error } = await supabase.rpc("respond_to_shift_request", {
    p_request_id: requestId,
    p_emp_id: empId,
    p_accept: accept,
  });
  if (error) throw error;
}

export async function resolveShiftRequest(
  requestId: string,
  approved: boolean,
  note?: string
): Promise<void> {
  const { error } = await supabase.rpc("resolve_shift_request", {
    p_request_id: requestId,
    p_approved: approved,
    p_note: note ?? null,
  });
  if (error) throw error;
}

export async function cancelShiftRequest(
  requestId: string,
  empId: string
): Promise<void> {
  const { error } = await supabase.rpc("cancel_shift_request", {
    p_request_id: requestId,
    p_emp_id: empId,
  });
  if (error) throw error;
}

// ── Open Shifts for Grid ──────────────────────────────────────────────────

export async function fetchCalloffOpenShifts(
  orgId: string,
  startDate: string,
  endDate: string,
  shiftCodeMap: Map<number, string>
): Promise<GridOpenShift[]> {
  // Fetch pickup requests spawned from approved calloffs (parent_request_id IS NOT NULL)
  const { data, error } = await supabase
    .from("shift_requests")
    .select(
      `*, requester:employees!shift_requests_requester_emp_id_fkey(first_name, last_name, focus_area_ids)`
    )
    .eq("org_id", orgId)
    .eq("type", "pickup")
    .eq("status", "open")
    .not("parent_request_id", "is", null)
    .gte("requester_shift_date", startDate)
    .lte("requester_shift_date", endDate);

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const requester = row.requester as {
      first_name: string;
      last_name: string;
      focus_area_ids: number[];
    } | null;
    const codeIds = (row.requester_shift_code_ids as number[]) ?? [];
    return {
      id: row.id as string,
      source: "calloff" as const,
      date: row.requester_shift_date as string,
      focusAreaId: (row.requester_focus_area_id as number) ?? requester?.focus_area_ids?.[0] ?? 0,
      shiftCodeIds: codeIds,
      shiftCodeLabel: resolveCodeLabels(codeIds, shiftCodeMap),
      customStartTime: (row.requester_custom_start_time as string) ?? null,
      customEndTime: (row.requester_custom_end_time as string) ?? null,
      calledOffBy: [requester?.first_name, requester?.last_name]
        .filter(Boolean)
        .join(" ") || undefined,
      requestId: row.id as string,
      needed: 1,
    };
  });
}

// ── Onboarding ────────────────────────────────────────────────────────────────

export async function fetchOnboardingStatus(
  userId: string,
  orgId: string,
): Promise<{ completed: boolean; completedAt: string | null }> {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("onboarding_completed_at")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return {
    completed: !!data?.onboarding_completed_at,
    completedAt: data?.onboarding_completed_at ?? null,
  };
}

export async function completeOnboarding(
  _userId: string,
  orgId: string,
): Promise<void> {
  const { error } = await supabase.rpc("complete_onboarding", {
    p_org_id: orgId,
  });
  if (error) throw error;
}
