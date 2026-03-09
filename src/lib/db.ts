import { supabase } from "@/lib/supabase";

import {
  Employee,
  ShiftMap,
  Section,
  Organization,
  Wing,
  ShiftType,
  ScheduleNote,
  NoteType,
  RegularShift,
  ShiftSeries,
  SeriesFrequency,
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
  orgId?: string | null;
  userId?: string | null;
  createdBy?: string | null;
}

export interface ShiftV2Update {
  shiftLabel?: string;
  userId?: string | null;
  updatedBy?: string | null;
}

interface DbShiftV2 {
  emp_id: string;
  date: string;
  draft_label: string | null;
  published_label: string | null;
  org_id: string | null;
  user_id: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToShiftV2(row: DbShiftV2): ShiftV2 {
  return {
    empId: row.emp_id,
    date: row.date,
    shiftLabel: row.draft_label ?? row.published_label ?? "",
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
  skill_levels: string[];
  roles: string[];
}

export interface DbWing {
  id: number;
  org_id: string;
  name: string;
  color_bg: string;
  color_text: string;
  sort_order: number;
}

export interface DbShiftType {
  id: number;
  org_id: string;
  label: string;
  name: string;
  color: string;
  border_color: string;
  text_color: string;
  counts_toward_day: boolean;
  counts_toward_eve: boolean;
  counts_toward_night: boolean;
  is_orientation: boolean;
  is_general: boolean;
  wing_name: string | null;
  sort_order: number;
  required_designations: string[];
}

export interface DbEmployee {
  id: string;
  org_id: string;
  name: string;
  designation: string;
  roles: string[];
  fte_weight: number;
  seniority: number;
  wings: string[];
  phone: string;
  email: string;
  contact_notes: string;
}

interface DbShift {
  emp_id: string;
  date: string;
  draft_label: string | null;
  published_label: string | null;
  series_id?: string | null;
  from_regular?: boolean;
}

interface DbScheduleNote {
  id: number;
  org_id: string;
  emp_id: string;
  date: string;
  note_type: NoteType;
  wing_name: string | null;
  status: 'published' | 'draft' | 'draft_deleted';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

export function rowToOrg(row: DbOrganization): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? null,
    address: row.address,
    phone: row.phone,
    employeeCount: row.employee_count,
    skillLevels: row.skill_levels ?? ['JLCSN', 'CSN III', 'CSN II', 'STAFF', '—'],
    roles: row.roles ?? ['DCSN', 'DVCSN', 'Supv', 'Mentor', 'CN', 'SC. Mgr.', 'Activity Coordinator', 'SC/Asst/Act/Cor'],
  };
}

export function rowToWing(row: DbWing): Wing {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    colorBg: row.color_bg,
    colorText: row.color_text,
    sortOrder: row.sort_order,
  };
}

export function rowToShiftType(row: DbShiftType): ShiftType {
  return {
    id: row.id,
    orgId: row.org_id,
    label: row.label,
    name: row.name,
    color: row.color,
    border: row.border_color,
    text: row.text_color,
    countsTowardDay: row.counts_toward_day || undefined,
    countsTowardEve: row.counts_toward_eve || undefined,
    countsTowardNight: row.counts_toward_night || undefined,
    isOrientation: row.is_orientation || undefined,
    isGeneral: row.is_general || undefined,
    wingName: row.wing_name,
    sortOrder: row.sort_order,
    requiredDesignations: row.required_designations ?? [],
  };
}

export function rowToEmployee(row: DbEmployee): Employee {
  return {
    id: row.id,
    name: row.name,
    designation: row.designation,
    roles: row.roles,
    fteWeight: row.fte_weight,
    seniority: row.seniority,
    wings: row.wings as Section[],
    phone: row.phone ?? "",
    email: row.email ?? "",
    contactNotes: row.contact_notes ?? "",
  };
}

export function employeeToRow(emp: Omit<Employee, "id">, orgId: string): Omit<DbEmployee, "id"> {
  return {
    org_id: orgId,
    name: emp.name,
    designation: emp.designation,
    roles: emp.roles,
    fte_weight: emp.fteWeight,
    seniority: emp.seniority,
    wings: emp.wings,
    phone: emp.phone,
    email: emp.email,
    contact_notes: emp.contactNotes,
  };
}

// ── Organization ─────────────────────────────────────────────────────────────

export async function fetchUserOrg(): Promise<Organization | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`fetchUserOrg error: ${error.message} (code: ${error.code})`);
  }
  if (!data) return null;

  return rowToOrg(data as DbOrganization);
}



export async function updateOrganization(org: Organization): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({
      name: org.name,
      address: org.address,
      phone: org.phone,
      employee_count: org.employeeCount,
      skill_levels: org.skillLevels,
      roles: org.roles,
    })
    .eq("id", org.id);
  if (error) throw error;
}


// ── Wings ────────────────────────────────────────────────────────────────────

export async function fetchWings(orgId: string): Promise<Wing[]> {
  const { data, error } = await supabase
    .from("wings")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order");
  if (error) throw error;
  return (data as DbWing[]).map(rowToWing);
}

export async function upsertWing(wing: Omit<Wing, "id"> & { id?: number }): Promise<Wing> {
  const row = {
    org_id: wing.orgId,
    name: wing.name,
    color_bg: wing.colorBg,
    color_text: wing.colorText,
    sort_order: wing.sortOrder,
  };
  if (wing.id) {
    const { data, error } = await supabase
      .from("wings")
      .update(row)
      .eq("id", wing.id)
      .select()
      .single();
    if (error) throw error;
    return rowToWing(data as DbWing);
  }
  const { data, error } = await supabase
    .from("wings")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToWing(data as DbWing);
}

export async function deleteWing(wingId: number): Promise<void> {
  const { error } = await supabase.from("wings").delete().eq("id", wingId);
  if (error) throw error;
}

// ── Shift Types ───────────────────────────────────────────────────────────────

export async function fetchShiftTypes(orgId: string): Promise<ShiftType[]> {
  const { data, error } = await supabase
    .from("shift_types")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order");
  if (error) throw error;
  return (data as DbShiftType[]).map(rowToShiftType);
}

export async function upsertShiftType(
  st: Omit<ShiftType, "id"> & { id?: number }
): Promise<ShiftType> {
  const row = {
    org_id: st.orgId,
    label: st.label,
    name: st.name,
    color: st.color,
    border_color: st.border,
    text_color: st.text,
    counts_toward_day: st.countsTowardDay ?? false,
    counts_toward_eve: st.countsTowardEve ?? false,
    counts_toward_night: st.countsTowardNight ?? false,
    is_orientation: st.isOrientation ?? false,
    is_general: st.isGeneral ?? false,
    wing_name: st.wingName ?? null,
    sort_order: st.sortOrder,
    required_designations: st.requiredDesignations ?? [],
  };
  if (st.id) {
    const { data, error } = await supabase
      .from("shift_types")
      .update(row)
      .eq("id", st.id)
      .select()
      .single();
    if (error) throw error;
    return rowToShiftType(data as DbShiftType);
  }
  const { data, error } = await supabase
    .from("shift_types")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return rowToShiftType(data as DbShiftType);
}

export async function deleteShiftType(id: number): Promise<void> {
  const { error } = await supabase.from("shift_types").delete().eq("id", id);
  if (error) throw error;
}

// ── Employees ─────────────────────────────────────────────────────────────────

export async function fetchEmployees(orgId: string): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("org_id", orgId)
    .order("seniority");
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
  const { error } = await supabase
    .from("employees")
    .delete()
    .eq("id", empId);
  if (error) throw error;
}

// ── Shifts ────────────────────────────────────────────────────────────────────

export async function fetchShifts(orgId: string, isScheduler: boolean): Promise<ShiftMap> {
  const { data, error } = await supabase
    .from("shifts")
    .select("emp_id, date, draft_label, published_label, series_id, from_regular, employees!inner(org_id)")
    .eq("employees.org_id", orgId);
  if (error) throw error;
  const map: ShiftMap = {};
  for (const row of data as DbShift[]) {
    // Schedulers see draft preferentially. Staff only see published.
    const effectiveLabel = isScheduler
      ? (row.draft_label ?? row.published_label)
      : row.published_label;

    const isDraft = row.draft_label !== null && row.draft_label !== row.published_label;

    if (effectiveLabel) {
      map[`${row.emp_id}_${row.date}`] = {
        label: effectiveLabel,
        isDraft,
        seriesId: row.series_id ?? null,
        fromRegular: row.from_regular ?? false,
      };
    }
  }
  return map;
}

export async function upsertShift(
  empId: string,
  date: string,
  shiftLabel: string, // the new draft label to set
  orgId: string,
): Promise<void> {
  // Always upsert the draft_label.
  const { error } = await supabase
    .from("shifts")
    .upsert(
      { emp_id: empId, date, draft_label: shiftLabel, org_id: orgId },
      { onConflict: "emp_id,date" },
    );
  if (error) throw error;
}

export async function deleteShift(empId: string, date: string, orgId: string): Promise<void> {
  // Instead of a hard delete, we set draft_label to 'OFF' so the publish RPC knows to clear it.
  const { error } = await supabase
    .from("shifts")
    .upsert(
      { emp_id: empId, date, draft_label: "OFF", org_id: orgId },
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

  // 1. Fetch all shifts in the date range
  const { data: shifts, error: fetchError } = await supabase
    .from("shifts")
    .select("emp_id, date, draft_label, published_label")
    .eq("org_id", orgId)
    .gte("date", startStr)
    .lte("date", endStr);

  if (fetchError) throw fetchError;
  if (!shifts || shifts.length === 0) return;

  // 2. Identify which rows need updating or deleting
  const toUpsert: { emp_id: string; date: string; org_id: string; draft_label: string; published_label: string }[] = [];
  const toDelete: { emp_id: string; date: string }[] = [];

  for (const shift of shifts) {
    if (shift.draft_label !== shift.published_label) {
      if (shift.published_label) {
        // Was edited from an existing published shift, restore the original
        toUpsert.push({
          emp_id: shift.emp_id,
          date: shift.date,
          org_id: orgId,
          draft_label: shift.published_label,
          published_label: shift.published_label,
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
    // Supabase JS doesn't have an easy bulk-delete by composite key without an IN clause matching both,
    // so we can execute deletes iteratively (there shouldn't be too many for a single scheduling session)
    // or use a matching 'or' filter. We'll map them to an 'or' query.
    const orClauses = toDelete.map(d => `and(emp_id.eq.${d.emp_id},date.eq.${d.date})`).join(",");
    const { error: deleteError } = await supabase
      .from("shifts")
      .delete()
      .or(orClauses);
    if (deleteError) throw deleteError;
  }

  // 4. Handle Schedule Notes Drafts
  // - Delete notes with status 'draft'
  // - Revert notes with status 'draft_deleted' to 'published'
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
    .select("id, org_id, emp_id, date, note_type, wing_name, status, created_by, created_at, updated_at")
    .eq("org_id", orgId);
  if (error) throw error;

  return (data as DbScheduleNote[]).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    empId: row.emp_id,
    date: row.date,
    noteType: row.note_type,
    wingName: row.wing_name,
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
  wingName: string,
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
      wing_name: wingName,
      status,
    },
    { onConflict: "emp_id,date,note_type,wing_name" },
  );
  if (error) throw error;
}

export async function deleteScheduleNote(
  empId: string,
  date: string,
  noteType: NoteType,
  wingName: string,
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
      .eq("wing_name", wingName);
    if (error) throw error;
  } else {
    // If it was already published, mark it as draft_deleted
    const { error } = await supabase
      .from("schedule_notes")
      .update({ status: 'draft_deleted' })
      .eq("emp_id", empId)
      .eq("date", date)
      .eq("note_type", noteType)
      .eq("wing_name", wingName);
    if (error) throw error;
  }
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
  expectedVersion: number
): Promise<ShiftV2> {
  const updateData: Record<string, unknown> = {
    version: expectedVersion + 1,
  };

  if (updates.shiftLabel !== undefined) {
    updateData.draft_label = updates.shiftLabel; // V2 acts on drafts
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

  return rowToShiftV2(data as DbShiftV2);
}

/**
 * Inserts or replaces a shift (upsert by primary key emp_id + date).
 */
export async function insertShiftV2(
  shift: ShiftV2Insert
): Promise<ShiftV2 | null> {
  const insertData = {
    emp_id: shift.empId,
    date: shift.date,
    draft_label: shift.shiftLabel, // V2 inserts act as drafts
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

  return data ? rowToShiftV2(data as DbShiftV2) : null;
}

/**
 * Fetches a shift by employee + date.
 */
export async function fetchShiftV2(
  empId: string,
  date: string
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

  return data ? rowToShiftV2(data as DbShiftV2) : null;
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

// ── Regular Shifts ────────────────────────────────────────────────────────────

interface DbRegularShift {
  id: string;
  emp_id: string;
  org_id: string;
  day_of_week: number;
  shift_label: string;
  effective_from: string;
  effective_until: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRegularShift(row: DbRegularShift): RegularShift {
  return {
    id: row.id,
    empId: row.emp_id,
    orgId: row.org_id,
    dayOfWeek: row.day_of_week,
    shiftLabel: row.shift_label,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchRegularShifts(orgId: string, empId?: string): Promise<RegularShift[]> {
  let query = supabase
    .from("regular_shifts")
    .select("*")
    .eq("org_id", orgId)
    .order("day_of_week");
  if (empId) query = query.eq("emp_id", empId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as DbRegularShift[]).map(rowToRegularShift);
}

export async function upsertRegularShift(
  empId: string,
  orgId: string,
  dayOfWeek: number,
  shiftLabel: string,
  effectiveFrom: string,
): Promise<void> {
  // Insert without .select() to avoid RLS RETURNING issues.
  const { error } = await supabase
    .from("regular_shifts")
    .upsert(
      { emp_id: empId, org_id: orgId, day_of_week: dayOfWeek, shift_label: shiftLabel, effective_from: effectiveFrom },
      { onConflict: "emp_id,day_of_week,effective_from" },
    );
  if (error) throw new Error(error.message);
}

export async function deleteRegularShift(empId: string, dayOfWeek: number, effectiveFrom: string): Promise<void> {
  const { error } = await supabase
    .from("regular_shifts")
    .delete()
    .eq("emp_id", empId)
    .eq("day_of_week", dayOfWeek)
    .eq("effective_from", effectiveFrom);
  if (error) throw new Error(error.message);
}

/**
 * Applies regular shift templates to a date range as drafts.
 * Only fills slots where no shift currently exists (uses ignoreDuplicates).
 * Returns keys of newly created shifts.
 */
export async function applyRegularSchedules(
  orgId: string,
  startDate: Date,
  endDate: Date,
  regularShifts: RegularShift[],
  existingShifts: ShiftMap,
): Promise<{ empId: string; date: string; label: string }[]> {
  // Group regular shifts by employee
  const byEmp: Record<string, RegularShift[]> = {};
  for (const rs of regularShifts) {
    if (!byEmp[rs.empId]) byEmp[rs.empId] = [];
    byEmp[rs.empId].push(rs);
  }

  const toInsert: { emp_id: string; date: string; draft_label: string; org_id: string; from_regular: boolean }[] = [];
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
      const regular = shifts.find(rs => {
        const from = new Date(rs.effectiveFrom + 'T00:00:00');
        const until = rs.effectiveUntil ? new Date(rs.effectiveUntil + 'T00:00:00') : null;
        return (
          rs.dayOfWeek === dayOfWeek &&
          from <= effective_from_cmp &&
          (!until || until >= effective_from_cmp)
        );
      });

      if (regular) {
        toInsert.push({ emp_id: empId, date: dateKey, draft_label: regular.shiftLabel, org_id: orgId, from_regular: true });
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

// ── Shift Series ──────────────────────────────────────────────────────────────

interface DbShiftSeries {
  id: string;
  emp_id: string;
  org_id: string;
  shift_label: string;
  frequency: SeriesFrequency;
  days_of_week: number[] | null;
  start_date: string;
  end_date: string | null;
  max_occurrences: number | null;
  created_at: string;
  updated_at: string;
}

function rowToShiftSeries(row: DbShiftSeries): ShiftSeries {
  return {
    id: row.id,
    empId: row.emp_id,
    orgId: row.org_id,
    shiftLabel: row.shift_label,
    frequency: row.frequency,
    daysOfWeek: row.days_of_week,
    startDate: row.start_date,
    endDate: row.end_date,
    maxOccurrences: row.max_occurrences,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
  shiftLabel: string,
  frequency: SeriesFrequency,
  daysOfWeek: number[] | null,
  startDate: string,
  endDate: string | null,
  maxOccurrences: number | null,
): Promise<ShiftSeries> {
  // Pre-generate the UUID so we can link occurrence rows without needing RETURNING.
  // This avoids the RLS RETURNING issue where SELECT policy can block the returned row.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // 1. Create the series master record (no .select() needed)
  const { error } = await supabase
    .from("shift_series")
    .insert({
      id,
      emp_id: empId,
      org_id: orgId,
      shift_label: shiftLabel,
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
      draft_label: shiftLabel,
      org_id: orgId,
      series_id: id,
    }));
    const { error: insertError } = await supabase
      .from("shifts")
      .upsert(rows, { onConflict: "emp_id,date" });
    if (insertError) throw new Error(insertError.message);
  }

  // 3. Return a constructed ShiftSeries (no re-fetch needed)
  return {
    id,
    empId,
    orgId,
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
 * Updates draft_label for all shifts in a series (bulk edit all).
 */
export async function updateSeriesAllShifts(seriesId: string, newLabel: string): Promise<void> {
  const { error } = await supabase
    .from("shifts")
    .update({ draft_label: newLabel })
    .eq("series_id", seriesId);
  if (error) throw new Error(error.message);

  const { error: seriesError } = await supabase
    .from("shift_series")
    .update({ shift_label: newLabel })
    .eq("id", seriesId);
  if (seriesError) throw new Error(seriesError.message);
}

/**
 * Deletes all shifts in a series (sets draft_label to 'OFF' for published ones,
 * hard-deletes pure drafts). Also deletes the series master record.
 */
export async function deleteShiftSeries(seriesId: string): Promise<void> {
  const { error } = await supabase
    .from("shifts")
    .update({ draft_label: 'OFF', series_id: null })
    .eq("series_id", seriesId)
    .is("published_label", null);
  if (error) throw new Error(error.message);

  const { error: pubError } = await supabase
    .from("shifts")
    .update({ draft_label: 'OFF', series_id: null })
    .eq("series_id", seriesId)
    .not("published_label", "is", null);
  if (pubError) throw new Error(pubError.message);

  const { error: seriesError } = await supabase
    .from("shift_series")
    .delete()
    .eq("id", seriesId);
  if (seriesError) throw new Error(seriesError.message);
}
