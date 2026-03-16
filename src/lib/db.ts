import { supabase } from "@/lib/supabase";

import {
  Employee,
  EmployeeStatus,
  ShiftMap,
  Organization,
  FocusArea,
  ShiftCategory,
  ShiftCode,
  ScheduleNote,
  NoteType,
  IndicatorType,
  RecurringShift,
  ShiftSeries,
  SeriesFrequency,
  OrganizationUser,
  NamedItem,
  Invitation,
  AssignableOrganizationRole,
  DraftKind,
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

// ── Shift Types ──────────────────────────────────────────────────────────────

export interface ShiftV2 {
  empId: string;
  date: string;
  shiftLabel: string;
  shiftCodeIds: number[];
  orgId: string | null;
  userId: string | null;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftV2Insert {
  empId: string;
  date: string;
  shiftLabel: string;
  shiftCodeIds: number[];
  orgId?: string | null;
  userId?: string | null;
  createdBy?: string | null;
}

export interface ShiftV2Update {
  shiftLabel?: string;
  shiftCodeIds?: number[];
  userId?: string | null;
  updatedBy?: string | null;
}

interface DbShiftV2 {
  emp_id: string;
  date: string;
  draft_shift_code_ids: number[];
  published_shift_code_ids: number[];
  draft_is_delete: boolean;
  org_id: string | null;
  user_id: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Resolve an array of shift_code IDs to a slash-separated label string. */
function resolveCodeLabels(ids: number[], codeMap: Map<number, string>): string {
  return ids.map(id => codeMap.get(id) ?? '?').join('/');
}

function rowToShiftV2(row: DbShiftV2, codeMap: Map<number, string>): ShiftV2 {
  const draftIds = row.draft_shift_code_ids ?? [];
  const pubIds = row.published_shift_code_ids ?? [];
  const effectiveIds = draftIds.length > 0 ? draftIds : pubIds;
  return {
    empId: row.emp_id,
    date: row.date,
    shiftLabel: resolveCodeLabels(effectiveIds, codeMap),
    shiftCodeIds: effectiveIds,
    orgId: row.org_id,
    userId: row.user_id,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  timezone: string | null;
  archived_at: string | null;
}

export interface DbFocusArea {
  id: number;
  org_id: string;
  name: string;
  color_bg: string;
  color_text: string;
  sort_order: number;
  archived_at: string | null;
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
  archived_at: string | null;
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
  is_off_day: boolean;
  focus_area_id: number | null;
  sort_order: number;
  required_certification_ids: number[];
  default_start_time: string | null;
  default_end_time: string | null;
  archived_at: string | null;
}

export interface DbEmployee {
  id: string;
  org_id: string;
  name: string;
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
}

interface DbShift {
  emp_id: string;
  date: string;
  draft_shift_code_ids: number[];
  published_shift_code_ids: number[];
  draft_is_delete: boolean;
  series_id?: string | null;
  from_recurring?: boolean;
  custom_start_time?: string | null;
  custom_end_time?: string | null;
}

interface DbScheduleNote {
  id: number;
  org_id: string;
  emp_id: string;
  date: string;
  note_type: NoteType;
  focus_area_id: number | null;
  status: 'published' | 'draft' | 'draft_deleted';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

// ── Named Item (certifications / organization_roles) ─────────────────────────

interface DbNamedItem {
  id: number;
  org_id: string;
  name: string;
  abbr: string;
  sort_order: number;
  archived_at: string | null;
}

function rowToNamedItem(row: DbNamedItem): NamedItem {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    abbr: row.abbr,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
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
    timezone: row.timezone ?? null,
    archivedAt: row.archived_at ?? null,
  };
}

export function rowToFocusArea(row: DbFocusArea): FocusArea {
  return {
    id: row.id,
    orgId: row.org_id,
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
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    sortOrder: row.sort_order,
    focusAreaId: row.focus_area_id ?? null,
    archivedAt: row.archived_at ?? null,
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
    isGeneral: row.is_general || undefined,
    isOffDay: row.is_off_day || undefined,
    focusAreaId: row.focus_area_id ?? null,
    sortOrder: row.sort_order,
    requiredCertificationIds: row.required_certification_ids ?? [],
    defaultStartTime: row.default_start_time ?? null,
    defaultEndTime: row.default_end_time ?? null,
    archivedAt: row.archived_at ?? null,
  };
}

export function rowToEmployee(row: DbEmployee): Employee {
  return {
    id: row.id,
    name: row.name,
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
  };
}

export function employeeToRow(emp: Omit<Employee, "id">, orgId: string): Omit<DbEmployee, "id" | "status" | "status_changed_at" | "status_note" | "archived_at"> {
  return {
    org_id: orgId,
    name: emp.name,
    certification_id: emp.certificationId,
    role_ids: emp.roleIds ?? [],
    seniority: emp.seniority,
    focus_area_ids: emp.focusAreaIds ?? [],
    phone: emp.phone,
    email: emp.email,
    contact_notes: emp.contactNotes,
  };
}

// ── Organization ──────────────────────────────────────────────────────────────

export async function fetchUserOrganization(): Promise<Organization | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`fetchUserOrganization error: ${error.message} (code: ${error.code})`);
  }
  if (!data) return null;

  return rowToOrganization(data as DbOrganization);
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
      timezone: org.timezone || null,
    })
    .eq("id", org.id);
  if (error) throw error;
}

// ── Certifications ───────────────────────────────────────────────────────────

export async function fetchCertifications(orgId: string, includeArchived = false): Promise<NamedItem[]> {
  let query = supabase
    .from("certifications")
    .select("*")
    .eq("org_id", orgId);
  if (!includeArchived) query = query.is("archived_at", null);
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

  // Batch upsert: update existing + insert new in two bulk operations
  const toUpdate = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id && existingIds.has(item.id));
  const toInsert = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => !item.id || !existingIds.has(item.id));

  if (toUpdate.length > 0) {
    const { error } = await supabase
      .from("certifications")
      .upsert(
        toUpdate.map(({ item, sortOrder }) => ({
          id: item.id,
          org_id: orgId,
          name: item.name,
          abbr: item.abbr,
          sort_order: sortOrder,
          archived_at: null,
        })),
        { onConflict: "id" },
      );
    if (error) throw error;
  }

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("certifications")
      .insert(
        toInsert.map(({ item, sortOrder }) => ({
          org_id: orgId,
          name: item.name,
          abbr: item.abbr,
          sort_order: sortOrder,
        })),
      );
    if (error) throw error;
  }

  return fetchCertifications(orgId);
}

// ── Organization Roles ──────────────────────────────────────────────────────

export async function fetchOrganizationRoles(orgId: string, includeArchived = false): Promise<NamedItem[]> {
  let query = supabase
    .from("organization_roles")
    .select("*")
    .eq("org_id", orgId);
  if (!includeArchived) query = query.is("archived_at", null);
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

  // Batch upsert: update existing + insert new in two bulk operations
  const toUpdate = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => item.id && existingIds.has(item.id));
  const toInsert = items
    .map((item, i) => ({ item, sortOrder: i }))
    .filter(({ item }) => !item.id || !existingIds.has(item.id));

  if (toUpdate.length > 0) {
    const { error } = await supabase
      .from("organization_roles")
      .upsert(
        toUpdate.map(({ item, sortOrder }) => ({
          id: item.id,
          org_id: orgId,
          name: item.name,
          abbr: item.abbr,
          sort_order: sortOrder,
          archived_at: null,
        })),
        { onConflict: "id" },
      );
    if (error) throw error;
  }

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("organization_roles")
      .insert(
        toInsert.map(({ item, sortOrder }) => ({
          org_id: orgId,
          name: item.name,
          abbr: item.abbr,
          sort_order: sortOrder,
        })),
      );
    if (error) throw error;
  }

  return fetchOrganizationRoles(orgId);
}

// ── Organization Users (for user management panel) ──────────────────────────

export async function fetchOrganizationUsers(orgId: string): Promise<OrganizationUser[]> {
  const { data, error } = await supabase.rpc("get_org_users", {
    p_org_id: orgId,
  });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    email: (row.email as string | null) ?? null,
    firstName: (row.first_name as string | null) ?? null,
    lastName: (row.last_name as string | null) ?? null,
    orgRole: (row.org_role as string ?? "user") as import("@/types").OrganizationRole,
    platformRole: (row.platform_role as string) as import("@/types").PlatformRole,
    adminPermissions: (row.admin_permissions ?? null) as import("@/types").AdminPermissions | null,
    createdAt: row.created_at as string,
  }));
}

export async function updateAdminPermissions(
  userId: string,
  permissions: import("@/types").AdminPermissions | null,
  orgId: string,
): Promise<void> {
  const { error } = await supabase
    .from("organization_memberships")
    .update({ admin_permissions: permissions })
    .eq("user_id", userId)
    .eq("org_id", orgId);
  if (error) throw error;
}

export async function changeOrganizationUserRole(
  targetUserId: string,
  newRole: import("@/types").OrganizationRole
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { error } = await supabase.rpc("change_user_role", {
    p_target_user_id: targetUserId,
    p_new_role: newRole,
    p_changed_by_id: user.id,
    p_idempotency_key: `${targetUserId}-${newRole}-${Date.now()}`,
  });
  if (error) throw error;
}


// ── Focus Areas ──────────────────────────────────────────────────────────────

export async function fetchFocusAreas(orgId: string, includeArchived = false): Promise<FocusArea[]> {
  let query = supabase
    .from("focus_areas")
    .select("*")
    .eq("org_id", orgId);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.order("sort_order");
  if (error) throw error;
  return (data as DbFocusArea[]).map(rowToFocusArea);
}

export async function upsertFocusArea(focusArea: Omit<FocusArea, "id"> & { id?: number }): Promise<FocusArea> {
  const row = {
    org_id: focusArea.orgId,
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
    return rowToFocusArea(data as DbFocusArea);
  }
  const { data, error } = await supabase
    .from("focus_areas")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToFocusArea(data as DbFocusArea);
}

export async function deleteFocusArea(focusAreaId: number): Promise<void> {
  const now = new Date().toISOString();

  // Archive dependent shift_codes and shift_categories for this focus area
  await supabase
    .from("shift_codes")
    .update({ archived_at: now })
    .eq("focus_area_id", focusAreaId)
    .is("archived_at", null);
  await supabase
    .from("shift_categories")
    .update({ archived_at: now })
    .eq("focus_area_id", focusAreaId)
    .is("archived_at", null);

  // Soft-delete the focus area (row persists — all FK/array references remain valid)
  const { error } = await supabase
    .from("focus_areas")
    .update({ archived_at: now })
    .eq("id", focusAreaId);
  if (error) throw error;
}

// ── Shift Codes ───────────────────────────────────────────────────────────────

export async function fetchShiftCodes(orgId: string, includeArchived = false): Promise<ShiftCode[]> {
  let query = supabase
    .from("shift_codes")
    .select("*")
    .eq("org_id", orgId);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.order("sort_order");
  if (error) throw error;
  return (data as DbShiftCode[]).map(rowToShiftCode);
}

export async function fetchShiftCategories(orgId: string, includeArchived = false): Promise<ShiftCategory[]> {
  let query = supabase
    .from("shift_categories")
    .select("*")
    .eq("org_id", orgId);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.order("sort_order");
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
  };
  if (cat.id) {
    const { data, error } = await supabase
      .from("shift_categories")
      .update(row)
      .eq("id", cat.id)
      .select()
      .single();
    if (error) throw error;
    return rowToShiftCategory(data as DbShiftCategory);
  }
  const { data, error } = await supabase
    .from("shift_categories")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToShiftCategory(data as DbShiftCategory);
}

export async function deleteShiftCategory(id: number): Promise<void> {
  const { error } = await supabase
    .from("shift_categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

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
    is_off_day: st.isOffDay ?? false,
    focus_area_id: st.focusAreaId ?? null,
    sort_order: st.sortOrder,
    required_certification_ids: st.requiredCertificationIds ?? [],
    default_start_time: st.defaultStartTime ?? null,
    default_end_time: st.defaultEndTime ?? null,
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

  return rowToShiftCode(saved);
}

export async function deleteShiftCode(id: number): Promise<void> {
  const { error } = await supabase
    .from("shift_codes")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Employees ─────────────────────────────────────────────────────────────────

export async function fetchEmployees(
  orgId: string,
  statuses?: EmployeeStatus[],
): Promise<Employee[]> {
  let query = supabase
    .from("employees")
    .select("*")
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
  return rowToEmployee(row as DbEmployee);
}

export async function updateEmployee(emp: Employee, orgId: string): Promise<void> {
  const { error } = await supabase
    .from("employees")
    .update(employeeToRow(emp, orgId))
    .eq("id", emp.id);
  if (error) throw error;
}

export async function deleteEmployee(empId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("employees")
    .update({ archived_at: now, status: 'terminated' as EmployeeStatus, status_changed_at: now })
    .eq("id", empId);
  if (error) throw error;
}

export async function benchEmployee(empId: string, note?: string): Promise<void> {
  const { error } = await supabase
    .from("employees")
    .update({
      status: 'benched' as EmployeeStatus,
      status_changed_at: new Date().toISOString(),
      status_note: note ?? '',
    })
    .eq("id", empId);
  if (error) throw error;
}

export async function activateEmployee(empId: string): Promise<void> {
  const { error } = await supabase
    .from("employees")
    .update({
      status: 'active' as EmployeeStatus,
      status_changed_at: new Date().toISOString(),
      status_note: '',
      archived_at: null,
    })
    .eq("id", empId);
  if (error) throw error;
}

export async function terminateEmployee(empId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("employees")
    .update({
      status: 'terminated' as EmployeeStatus,
      status_changed_at: now,
      archived_at: now,
    })
    .eq("id", empId);
  if (error) throw error;
}

// ── Shifts ────────────────────────────────────────────────────────────────────

export async function fetchShifts(
  orgId: string,
  isScheduler: boolean,
  shiftCodeMap: Map<number, string>,
): Promise<ShiftMap> {
  const { data, error } = await supabase
    .from("shifts")
    .select("emp_id, date, draft_shift_code_ids, published_shift_code_ids, draft_is_delete, series_id, from_recurring, custom_start_time, custom_end_time, employees!inner(org_id)")
    .eq("employees.org_id", orgId);
  if (error) throw error;
  const map: ShiftMap = {};
  for (const row of data as DbShift[]) {
    const draftIds = row.draft_shift_code_ids ?? [];
    const pubIds = row.published_shift_code_ids ?? [];
    const hasDraft = draftIds.length > 0 || row.draft_is_delete;

    // Schedulers see draft preferentially. Staff only see published.
    const effectiveIds = isScheduler
      ? (hasDraft ? draftIds : pubIds)
      : pubIds;

    const isDraft = hasDraft && JSON.stringify(draftIds) !== JSON.stringify(pubIds);

    // Classify draft change type
    let draftKind: DraftKind = null;
    if (isDraft) {
      if (row.draft_is_delete && pubIds.length > 0) {
        draftKind = 'deleted';
      } else if (pubIds.length === 0) {
        draftKind = 'new';
      } else {
        draftKind = 'modified';
      }
    }

    const publishedLabel = pubIds.length > 0 ? resolveCodeLabels(pubIds, shiftCodeMap) : '';

    if (effectiveIds.length > 0 || (isScheduler && row.draft_is_delete)) {
      map[`${row.emp_id}_${row.date}`] = {
        label: row.draft_is_delete && isScheduler ? "OFF" : resolveCodeLabels(effectiveIds, shiftCodeMap),
        shiftCodeIds: effectiveIds,
        isDraft,
        isDelete: row.draft_is_delete,
        draftKind,
        publishedShiftCodeIds: pubIds,
        publishedLabel,
        seriesId: row.series_id ?? null,
        fromRecurring: row.from_recurring ?? false,
        customStartTime: row.custom_start_time ?? null,
        customEndTime: row.custom_end_time ?? null,
      };
    }
  }
  return map;
}

export async function upsertShift(
  empId: string,
  date: string,
  shiftCodeIds: number[],
  orgId?: string | null,
  customStartTime?: string | null,
  customEndTime?: string | null,
): Promise<void> {
  const payload: Record<string, unknown> = {
    emp_id: empId,
    date,
    draft_shift_code_ids: shiftCodeIds,
    draft_is_delete: false,
  };
  if (orgId) payload.org_id = orgId;
  if (customStartTime !== undefined) payload.custom_start_time = customStartTime;
  if (customEndTime !== undefined) payload.custom_end_time = customEndTime;
  const { error } = await supabase
    .from("shifts")
    .upsert(payload, { onConflict: "emp_id,date" });
  if (error) throw error;
}

/** Updates only the custom start/end time for an existing shift row. */
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
      { emp_id: empId, date, org_id: orgId, custom_start_time: customStartTime, custom_end_time: customEndTime },
      { onConflict: "emp_id,date" },
    );
  if (error) throw error;
}

export async function deleteShift(empId: string, date: string): Promise<void> {
  // Soft delete: set draft_is_delete so the publish RPC knows to clear it.
  const { error } = await supabase
    .from("shifts")
    .upsert(
      { emp_id: empId, date, draft_shift_code_ids: [], draft_is_delete: true },
      { onConflict: "emp_id,date" },
    );
  if (error) throw error;
}

export async function publishSchedule(
  orgId: string,
  startDate: Date,
  endDate: Date
): Promise<void> {
  const { error } = await supabase.rpc("publish_schedule", {
    p_org_id: orgId,
    p_start_date: startDate.toISOString().split("T")[0],
    p_end_date: endDate.toISOString().split("T")[0],
  });
  if (error) throw error;
}

export async function discardScheduleDrafts(
  orgId: string,
  startDate: Date,
  endDate: Date
): Promise<void> {
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  // 1. Fetch all shifts in the date range (filter by org via employees join)
  const { data: shifts, error: fetchError } = await supabase
    .from("shifts")
    .select("emp_id, date, draft_shift_code_ids, published_shift_code_ids, draft_is_delete, employees!inner(org_id)")
    .eq("employees.org_id", orgId)
    .gte("date", startStr)
    .lte("date", endStr);

  if (fetchError) throw fetchError;
  if (!shifts || shifts.length === 0) return;

  // 2. Identify which rows need updating or deleting
  const toUpsert: { emp_id: string; date: string; draft_shift_code_ids: number[]; published_shift_code_ids: number[]; draft_is_delete: boolean }[] = [];
  const toDelete: { emp_id: string; date: string }[] = [];

  for (const shift of shifts) {
    const draftIds = shift.draft_shift_code_ids ?? [];
    const pubIds = shift.published_shift_code_ids ?? [];
    const hasDraftChange = shift.draft_is_delete ||
      (draftIds.length > 0 && JSON.stringify(draftIds) !== JSON.stringify(pubIds));

    if (hasDraftChange) {
      if (pubIds.length > 0) {
        // Was edited from an existing published shift, restore the original
        toUpsert.push({
          emp_id: shift.emp_id,
          date: shift.date,
          draft_shift_code_ids: pubIds,
          published_shift_code_ids: pubIds,
          draft_is_delete: false,
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
    const orClauses = toDelete.map(d => `and(emp_id.eq.${d.emp_id},date.eq.${d.date})`).join(",");
    const { error: deleteError } = await supabase
      .from("shifts")
      .delete()
      .or(orClauses);
    if (deleteError) throw deleteError;
  }

  // 4. Handle Schedule Notes Drafts
  const { error: noteDeleteError } = await supabase
    .from("schedule_notes")
    .delete()
    .eq("org_id", orgId)
    .gte("date", startStr)
    .lte("date", endStr)
    .eq("status", "draft");

  if (noteDeleteError) throw noteDeleteError;

  const { error: noteRevertError } = await supabase
    .from("schedule_notes")
    .update({ status: "published" })
    .eq("org_id", orgId)
    .gte("date", startStr)
    .lte("date", endStr)
    .eq("status", "draft_deleted");

  if (noteRevertError) throw noteRevertError;
}

// ── Schedule Notes ───────────────────────────────────────────────────────────

export async function fetchScheduleNotes(orgId: string): Promise<ScheduleNote[]> {
  const { data, error } = await supabase
    .from("schedule_notes")
    .select("id, org_id, emp_id, date, note_type, focus_area_id, status, created_by, created_at, updated_at")
    .eq("org_id", orgId);
  if (error) throw error;

  return (data as DbScheduleNote[]).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    empId: row.emp_id,
    date: row.date,
    noteType: row.note_type,
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
  noteType: NoteType,
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
      note_type: noteType,
      focus_area_id: focusAreaId,
      status,
    },
    { onConflict: "emp_id,date,note_type,focus_area_id" },
  );
  if (error) throw error;
}

export async function deleteScheduleNote(
  empId: string,
  date: string,
  noteType: NoteType,
  focusAreaId: number,
  existingStatus?: 'published' | 'draft' | 'draft_deleted',
): Promise<void> {
  if (existingStatus === 'draft') {
    // If it was a new draft note, just delete it
    const { error } = await supabase
      .from("schedule_notes")
      .delete()
      .eq("emp_id", empId)
      .eq("date", date)
      .eq("note_type", noteType)
      .eq("focus_area_id", focusAreaId);
    if (error) throw error;
  } else {
    // If it was already published, mark it as draft_deleted
    const { error } = await supabase
      .from("schedule_notes")
      .update({ status: 'draft_deleted' })
      .eq("emp_id", empId)
      .eq("date", date)
      .eq("note_type", noteType)
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
  let query = supabase
    .from("indicator_types")
    .select("*")
    .eq("org_id", orgId);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.order("sort_order");
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
    return rowToIndicatorType(data as DbIndicatorType);
  }
  const { data, error } = await supabase
    .from("indicator_types")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToIndicatorType(data as DbIndicatorType);
}

export async function deleteIndicatorType(id: number): Promise<void> {
  const { error } = await supabase
    .from("indicator_types")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}


// ── Shift Operations ─────────────────────────────────────────────────────────

/**
 * Updates a shift with optimistic locking.
 * @throws OptimisticLockError if the version doesn't match
 */
export async function updateShiftV2(
  empId: string,
  date: string,
  updates: ShiftV2Update,
  expectedVersion: number,
  shiftCodeMap?: Map<number, string>,
): Promise<ShiftV2> {
  const updateData: Record<string, unknown> = {
    version: expectedVersion + 1,
  };

  if (updates.shiftCodeIds !== undefined) {
    updateData.draft_shift_code_ids = updates.shiftCodeIds;
    updateData.draft_is_delete = false;
  }
  if (updates.userId !== undefined) {
    updateData.user_id = updates.userId;
  }
  if (updates.updatedBy !== undefined) {
    updateData.updated_by = updates.updatedBy;
  }

  const { data, error } = await supabase
    .from("shifts")
    .update(updateData)
    .eq("emp_id", empId)
    .eq("date", date)
    .eq("version", expectedVersion)
    .select()
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
        currentShift?.version
      );
    }
    throw error;
  }

  if (!data) {
    throw new OptimisticLockError(`${empId}:${date}`, expectedVersion);
  }

  return rowToShiftV2(data as DbShiftV2, shiftCodeMap ?? new Map());
}

/**
 * Inserts or replaces a shift (upsert by primary key emp_id + date).
 */
export async function insertShiftV2(
  shift: ShiftV2Insert,
  shiftCodeMap?: Map<number, string>,
): Promise<ShiftV2 | null> {
  const insertData = {
    emp_id: shift.empId,
    date: shift.date,
    draft_shift_code_ids: shift.shiftCodeIds,
    draft_is_delete: false,
    org_id: shift.orgId ?? null,
    user_id: shift.userId ?? null,
    created_by: shift.createdBy ?? null,
  };

  const { data, error } = await supabase
    .from("shifts")
    .upsert(insertData, { onConflict: "emp_id,date" })
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data ? rowToShiftV2(data as DbShiftV2, shiftCodeMap ?? new Map()) : null;
}

/**
 * Fetches a shift by employee + date.
 */
export async function fetchShiftV2(
  empId: string,
  date: string,
  shiftCodeMap?: Map<number, string>,
): Promise<ShiftV2 | null> {
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .eq("emp_id", empId)
    .eq("date", date)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data ? rowToShiftV2(data as DbShiftV2, shiftCodeMap ?? new Map()) : null;
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
}

export async function fetchUserSessions() {
  const { data, error } = await supabase
    .from("user_sessions")
    .select("id, user_id, device_label, ip_address, last_active_at, created_at, refresh_token_hash")
    .order("last_active_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
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

export async function startImpersonation(targetUserId: string) {
  const { data, error } = await supabase.rpc("start_impersonation", {
    p_target_user_id: targetUserId,
  });
  if (error) throw error;
  return data as { session_id: string; expires_at: string };
}

export async function endImpersonation(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc("end_impersonation", {
    p_session_id: sessionId,
  });
  if (error) throw error;
}

export async function forceLogoutUser(targetUserId: string): Promise<void> {
  const { error } = await supabase.rpc("force_logout_user", {
    p_target_user_id: targetUserId,
  });
  if (error) throw error;
}

// ── Invitations ───────────────────────────────────────────────────────────────

export async function sendInvitation(
  email: string,
  role: AssignableOrganizationRole,
  orgId: string,
): Promise<{ invitationId: string; token: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc("send_invitation", {
    p_email: email,
    p_role: role,
    p_org_id: orgId,
  });
  if (error) throw error;
  return {
    invitationId: data.invitation_id,
    token: data.token,
    expiresAt: data.expires_at,
  };
}

export async function acceptInvitation(
  token: string,
): Promise<{ status: string; orgId: string; role: string }> {
  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });
  if (error) throw error;
  return {
    status: data.status,
    orgId: data.org_id,
    role: data.role,
  };
}

export async function fetchInvitations(orgId: string): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    orgId: row.org_id as string,
    invitedBy: (row.invited_by as string) ?? null,
    email: row.email as string,
    roleToAssign: row.role_to_assign as AssignableOrganizationRole,
    token: row.token as string,
    expiresAt: row.expires_at as string,
    acceptedAt: (row.accepted_at as string) ?? null,
    revokedAt: (row.revoked_at as string) ?? null,
    createdAt: row.created_at as string,
  }));
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (error) throw error;
}

// ── Recurring Shifts ──────────────────────────────────────────────────────────

interface DbRecurringShift {
  id: string;
  emp_id: string;
  org_id: string;
  day_of_week: number;
  shift_code_id: number;
  effective_from: string;
  effective_until: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function rowToRecurringShift(row: DbRecurringShift, codeMap: Map<number, string>): RecurringShift {
  return {
    id: row.id,
    empId: row.emp_id,
    orgId: row.org_id,
    dayOfWeek: row.day_of_week,
    shiftCodeId: row.shift_code_id,
    shiftLabel: codeMap.get(row.shift_code_id) ?? '?',
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
): Promise<RecurringShift[]> {
  let query = supabase
    .from("recurring_shifts")
    .select("*")
    .eq("org_id", orgId)
    .order("day_of_week");
  if (!includeArchived) query = query.is("archived_at", null);
  if (empId) query = query.eq("emp_id", empId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as DbRecurringShift[]).map(r => rowToRecurringShift(r, shiftCodeMap ?? new Map()));
}

export async function upsertRecurringShift(
  empId: string,
  orgId: string,
  dayOfWeek: number,
  shiftCodeId: number,
  effectiveFrom: string,
): Promise<void> {
  // Cannot use .upsert() because the unique constraint is a partial index
  // (WHERE archived_at IS NULL) which ON CONFLICT doesn't support.
  const { data, error: updateError } = await supabase
    .from("recurring_shifts")
    .update({ shift_code_id: shiftCodeId })
    .eq("emp_id", empId)
    .eq("day_of_week", dayOfWeek)
    .eq("effective_from", effectiveFrom)
    .is("archived_at", null)
    .select("id");

  if (updateError) throw new Error(updateError.message);

  if (!data || data.length === 0) {
    const { error: insertError } = await supabase
      .from("recurring_shifts")
      .insert({ emp_id: empId, org_id: orgId, day_of_week: dayOfWeek, shift_code_id: shiftCodeId, effective_from: effectiveFrom });
    if (insertError) throw new Error(insertError.message);
  }
}

export async function deleteRecurringShift(empId: string, dayOfWeek: number, effectiveFrom: string): Promise<void> {
  const { error } = await supabase
    .from("recurring_shifts")
    .update({ archived_at: new Date().toISOString() })
    .eq("emp_id", empId)
    .eq("day_of_week", dayOfWeek)
    .eq("effective_from", effectiveFrom);
  if (error) throw new Error(error.message);
}

/**
 * Applies recurring shift templates to a date range as drafts.
 * Only fills slots where no shift currently exists (uses ignoreDuplicates).
 * Returns keys of newly created shifts.
 */
export async function applyRecurringSchedules(
  orgId: string,
  startDate: Date,
  endDate: Date,
  recurringShifts: RecurringShift[],
  existingShifts: ShiftMap,
): Promise<{ empId: string; date: string; label: string }[]> {
  // Group recurring shifts by employee
  const byEmp: Record<string, RecurringShift[]> = {};
  for (const rs of recurringShifts) {
    if (!byEmp[rs.empId]) byEmp[rs.empId] = [];
    byEmp[rs.empId].push(rs);
  }

  const toInsert: { emp_id: string; date: string; draft_shift_code_ids: number[]; draft_is_delete: boolean; org_id: string; from_recurring: boolean }[] = [];
  const generated: { empId: string; date: string; label: string }[] = [];

  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;
    const dayOfWeek = current.getDay();

    for (const [empId, shifts] of Object.entries(byEmp)) {
      const mapKey = `${empId}_${dateKey}`;
      // Skip if a shift already exists for this slot
      if (existingShifts[mapKey]) continue;

      const effective_from_cmp = new Date(current);
      // Find the best matching recurring shift for this day-of-week:
      // 1. Prefer a template whose effectiveFrom <= this date (and not expired)
      // 2. Fall back to the earliest template for this day-of-week (covers days
      //    before the template was created, so the full pay period gets filled)
      const candidates = shifts.filter(rs => rs.dayOfWeek === dayOfWeek);
      let regular = candidates.find(rs => {
        const from = new Date(rs.effectiveFrom + 'T00:00:00');
        const until = rs.effectiveUntil ? new Date(rs.effectiveUntil + 'T00:00:00') : null;
        return from <= effective_from_cmp && (!until || until >= effective_from_cmp);
      });
      if (!regular && candidates.length > 0) {
        // Fall back to the template with the earliest effectiveFrom
        regular = candidates.reduce((earliest, rs) =>
          rs.effectiveFrom < earliest.effectiveFrom ? rs : earliest
        );
        // Still respect effectiveUntil — don't apply expired templates
        if (regular.effectiveUntil && new Date(regular.effectiveUntil + 'T00:00:00') < effective_from_cmp) {
          regular = undefined;
        }
      }

      if (regular) {
        toInsert.push({ emp_id: empId, date: dateKey, draft_shift_code_ids: [regular.shiftCodeId], draft_is_delete: false, org_id: orgId, from_recurring: true });
        generated.push({ empId, date: dateKey, label: regular.shiftLabel });
      }
    }

    current.setDate(current.getDate() + 1);
  }

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("shifts")
      .upsert(toInsert, { onConflict: "emp_id,date", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  return generated;
}

// ── Draft Sessions ────────────────────────────────────────────────────────────

export interface DraftSession {
  id: string;
  orgId: string;
  savedBy: string;
  startDate: string;
  endDate: string;
  savedAt: string;
}

export async function getDraftSession(orgId: string): Promise<DraftSession | null> {
  const { data, error } = await supabase
    .from("schedule_draft_sessions")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    orgId: data.org_id,
    savedBy: data.saved_by,
    startDate: data.start_date,
    endDate: data.end_date,
    savedAt: data.saved_at,
  };
}

export async function saveDraftSession(
  orgId: string,
  savedBy: string,
  startDate: Date,
  endDate: Date,
): Promise<void> {
  const { error } = await supabase
    .from("schedule_draft_sessions")
    .upsert(
      {
        org_id: orgId,
        saved_by: savedBy,
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        saved_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
  if (error) throw error;
}

export async function deleteDraftSession(orgId: string): Promise<void> {
  const { error } = await supabase
    .from("schedule_draft_sessions")
    .delete()
    .eq("org_id", orgId);
  if (error) throw error;
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
    .select("*")
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
  const { error } = await supabase
    .from("recurring_shifts_draft_sessions")
    .upsert(
      {
        org_id: orgId,
        saved_by: savedBy,
        draft_data: draftData,
        saved_at: new Date().toISOString(),
      },
      { onConflict: "org_id" },
    );
  if (error) throw error;
}

export async function deleteRecurringDraft(orgId: string): Promise<void> {
  const { error } = await supabase
    .from("recurring_shifts_draft_sessions")
    .delete()
    .eq("org_id", orgId);
  if (error) throw error;
}

// ── Shift Series ──────────────────────────────────────────────────────────────

interface DbShiftSeries {
  id: string;
  emp_id: string;
  org_id: string;
  shift_code_id: number;
  frequency: SeriesFrequency;
  days_of_week: number[] | null;
  start_date: string;
  end_date: string | null;
  max_occurrences: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function rowToShiftSeries(row: DbShiftSeries, codeMap: Map<number, string>): ShiftSeries {
  return {
    id: row.id,
    empId: row.emp_id,
    orgId: row.org_id,
    shiftCodeId: row.shift_code_id,
    shiftLabel: codeMap.get(row.shift_code_id) ?? '?',
    frequency: row.frequency,
    daysOfWeek: row.days_of_week,
    startDate: row.start_date,
    endDate: row.end_date,
    maxOccurrences: row.max_occurrences,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
  };
}

function generateSeriesDates(
  frequency: SeriesFrequency,
  daysOfWeek: number[] | null,
  startDate: string,
  endDate: string | null,
  maxOccurrences: number | null,
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = endDate ? new Date(endDate + 'T00:00:00') : null;
  const cap = maxOccurrences ?? 730; // Safety cap: 2 years of daily shifts

  const current = new Date(start);

  while (dates.length < cap) {
    const y = current.getFullYear();
    const mo = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    const dateKey = `${y}-${mo}-${d}`;

    if (end && current > end) break;

    const dayOfWeek = current.getDay();

    let include = false;
    if (frequency === 'daily') {
      include = true;
    } else if (frequency === 'weekly') {
      include = !daysOfWeek?.length || daysOfWeek.includes(dayOfWeek);
    } else if (frequency === 'biweekly') {
      const diffDays = Math.round((current.getTime() - start.getTime()) / 86400000);
      const weekNum = Math.floor(diffDays / 7);
      include = weekNum % 2 === 0 && (!daysOfWeek?.length || daysOfWeek.includes(dayOfWeek));
    }

    if (include) dates.push(dateKey);
    current.setDate(current.getDate() + 1);
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
export async function deleteShiftSeries(seriesId: string): Promise<void> {
  const { error } = await supabase
    .from("shifts")
    .update({ draft_is_delete: true, draft_shift_code_ids: [], series_id: null })
    .eq("series_id", seriesId);
  if (error) throw new Error(error.message);

  const { error: seriesError } = await supabase
    .from("shift_series")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", seriesId);
  if (seriesError) throw new Error(seriesError.message);
}

// ── Gridmaster: Tenant Management ─────────────────────────────────────────────

export async function fetchAllOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((row: any) => rowToOrganization(row as DbOrganization));
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
      focus_area_label: data.focusAreaLabel || null,
      certification_label: data.certificationLabel || null,
      role_label: data.roleLabel || null,
      timezone: data.timezone || null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToOrganization(row as DbOrganization);
}

export async function archiveOrganization(orgId: string): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", orgId);
  if (error) throw error;
}

export async function restoreOrganization(orgId: string): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({ archived_at: null })
    .eq("id", orgId);
  if (error) throw error;
}

export async function fetchAllUsers(): Promise<import("@/types").PlatformUser[]> {
  const { data, error } = await supabase.rpc("get_all_users_with_profiles");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    email: (row.email as string | null) ?? null,
    firstName: null, // auth.users doesn't expose first_name; profiles may be joined separately
    lastName: null,
    platformRole: (row.platform_role as string ?? 'none') as import("@/types").PlatformRole,
    orgRole: (row.org_role as string | null) as import("@/types").OrganizationRole | null,
    orgId: (row.org_id as string | null) ?? null,
    orgName: (row.org_name as string | null) ?? null,
    createdAt: row.created_at as string,
    lastSignInAt: (row.last_sign_in_at as string | null) ?? null,
  }));
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
  return (data ?? []).map((row: any) => ({
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

export async function fetchOrganizationMemberships(
  orgId: string,
): Promise<import("@/types").OrganizationMembership[]> {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id, user_id, org_id, org_role, admin_permissions, joined_at")
    .eq("org_id", orgId)
    .order("joined_at");
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id as number,
    userId: row.user_id as string,
    orgId: row.org_id as string,
    orgRole: row.org_role as import("@/types").OrganizationRole,
    adminPermissions: (row.admin_permissions ?? null) as import("@/types").AdminPermissions | null,
    joinedAt: row.joined_at as string,
    email: null,
    firstName: null,
    lastName: null,
  }));
}

export async function removeUserFromOrganization(
  userId: string,
  orgId: string,
): Promise<void> {
  const { error } = await supabase
    .from("organization_memberships")
    .delete()
    .eq("user_id", userId)
    .eq("org_id", orgId);
  if (error) throw error;
}

export async function fetchTenantStats(): Promise<TenantStats[]> {
  const [{ data: profileData, error: pErr }, { data: empData, error: eErr }] =
    await Promise.all([
      supabase.from("profiles").select("org_id").neq("platform_role", "gridmaster"),
      supabase.from("employees").select("org_id").is("archived_at", null),
    ]);
  if (pErr) throw pErr;
  if (eErr) throw eErr;

  const statsMap = new Map<string, TenantStats>();

  for (const row of profileData ?? []) {
    const cid = row.org_id;
    if (!cid) continue;
    const entry = statsMap.get(cid) ?? { orgId: cid, userCount: 0, employeeCount: 0 };
    entry.userCount++;
    statsMap.set(cid, entry);
  }

  for (const row of empData ?? []) {
    const cid = row.org_id;
    if (!cid) continue;
    const entry = statsMap.get(cid) ?? { orgId: cid, userCount: 0, employeeCount: 0 };
    entry.employeeCount++;
    statsMap.set(cid, entry);
  }

  return Array.from(statsMap.values());
}
