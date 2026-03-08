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
}

interface DbScheduleNote {
  id: number;
  org_id: string;
  emp_id: string;
  date: string;
  note_type: NoteType;
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
    .select("emp_id, date, draft_label, published_label, employees!inner(org_id)")
    .eq("employees.org_id", orgId);
  if (error) throw error;
  const map: ShiftMap = {};
  for (const row of data as DbShift[]) {
    // Schedulers see draft preferentially. Staff only see published.
    const effectiveLabel = isScheduler
      ? (row.draft_label ?? row.published_label)
      : row.published_label;

    const isDraft = row.draft_label !== null && row.draft_label !== row.published_label;

    // An 'OFF' draft acts as a deletion for a draft, but we only set it to the map if it's not 'OFF'
    // Actually, if it's OFF, we shouldn't show a shift in the UI.
    // So if effectiveLabel is null or 'OFF', we leave it absent from the map.
    // But wait, if it's OFF and isDraft, it means they deleted a published shift and we need to know it's a draft change.
    // To keep the map correct but identify changes, we'll store OFF as well but let the UI filter it from being shown.
    if (effectiveLabel) {
      map[`${row.emp_id}_${row.date}`] = { label: effectiveLabel, isDraft };
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
}

// ── Schedule Notes ───────────────────────────────────────────────────────────

export async function fetchScheduleNotes(orgId: string): Promise<ScheduleNote[]> {
  const { data, error } = await supabase
    .from("schedule_notes")
    .select("id, org_id, emp_id, date, note_type, created_by, created_at, updated_at")
    .eq("org_id", orgId);
  if (error) throw error;

  return (data as DbScheduleNote[]).map((row) => ({
    id: row.id,
    orgId: row.org_id,
    empId: row.emp_id,
    date: row.date,
    noteType: row.note_type,
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
): Promise<void> {
  const { error } = await supabase.from("schedule_notes").upsert(
    {
      org_id: orgId,
      emp_id: empId,
      date,
      note_type: noteType,
    },
    { onConflict: "emp_id,date,note_type" },
  );
  if (error) throw error;
}

export async function deleteScheduleNote(
  empId: string,
  date: string,
  noteType: NoteType,
): Promise<void> {
  const { error } = await supabase
    .from("schedule_notes")
    .delete()
    .eq("emp_id", empId)
    .eq("date", date)
    .eq("note_type", noteType);
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
