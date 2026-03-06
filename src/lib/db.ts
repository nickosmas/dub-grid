import { supabase } from "@/lib/supabase";
import { Employee, ShiftMap, Section, Organization, Wing, ShiftType } from "@/types";

// ── DB row shapes ─────────────────────────────────────────────────────────────

export interface DbOrganization {
  id: string;
  name: string;
  address: string;
  phone: string;
  employee_count: number | null;
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
}

export interface DbEmployee {
  id: number;
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
  emp_id: number;
  date: string;
  shift_label: string;
}

// ── Mapping helpers ───────────────────────────────────────────────────────────

export function rowToOrg(row: DbOrganization): Organization {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    employeeCount: row.employee_count,
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
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("User not authenticated. Please log in.");

  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .limit(1)
    .single();

  if (error || !data) {
    return null; // The user has no accessible organization yet (pending assignment)
  }

  return rowToOrg(data as DbOrganization);
}

export async function checkIsSuperAdmin(userId?: string): Promise<boolean> {
  if (!userId) {
    const { data: sessionData } = await supabase.auth.getSession();
    userId = sessionData.session?.user?.id;
  }
  if (!userId) return false;

  // Direct query — requires the RLS policy on super_admins to use
  // USING (user_id = auth.uid()) instead of the self-referencing EXISTS.
  const { data } = await supabase
    .from("super_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  return !!data;
}

export async function updateOrganization(org: Organization): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({
      name: org.name,
      address: org.address,
      phone: org.phone,
      employee_count: org.employeeCount,
    })
    .eq("id", org.id);
  if (error) throw error;
}

// ── Super Admin Methods ────────────────────────────────────────────────────────

export interface SuperAdminProfile {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export async function fetchSuperAdminProfile(): Promise<SuperAdminProfile> {
  const isSuper = await checkIsSuperAdmin();
  if (!isSuper) throw new Error("Unauthorized");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Not logged in");

  const { data, error } = await supabase
    .from("super_admins")
    .select("*")
    .eq("user_id", session.user.id)
    .single();

  if (error) throw error;
  return data as SuperAdminProfile;
}

export async function updateSuperAdminProfile(profile: Partial<SuperAdminProfile>): Promise<void> {
  const isSuper = await checkIsSuperAdmin();
  if (!isSuper) throw new Error("Unauthorized");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Not logged in");

  const { error } = await supabase
    .from("super_admins")
    .update({
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email
    })
    .eq("user_id", session.user.id);

  if (error) throw error;
}

export async function fetchAllOrganizationsAsSuperAdmin(): Promise<Organization[]> {
  const isSuper = await checkIsSuperAdmin();
  if (!isSuper) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as DbOrganization[]).map(rowToOrg);
}

export async function createOrganizationAsSuperAdmin(name: string): Promise<Organization> {
  const isSuper = await checkIsSuperAdmin();
  if (!isSuper) throw new Error("Unauthorized");

  const { data: newOrg, error: insertErr } = await supabase
    .from("organizations")
    .insert({ name, address: "", phone: "" })
    .select()
    .single();

  if (insertErr) throw insertErr;
  return rowToOrg(newOrg as DbOrganization);
}

export async function assignOrgAdminByEmail(orgId: string, email: string): Promise<void> {
  const isSuper = await checkIsSuperAdmin();
  if (!isSuper) throw new Error("Unauthorized");

  const { error } = await supabase.rpc("assign_org_admin_by_email", {
    target_org_id: orgId,
    target_email: email,
  });

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

export async function deleteEmployee(empId: number): Promise<void> {
  const { error } = await supabase
    .from("employees")
    .delete()
    .eq("id", empId);
  if (error) throw error;
}

// ── Shifts ────────────────────────────────────────────────────────────────────

export async function fetchShifts(orgId: string): Promise<ShiftMap> {
  const { data, error } = await supabase
    .from("shifts")
    .select("emp_id, date, shift_label, employees!inner(org_id)")
    .eq("employees.org_id", orgId);
  if (error) throw error;
  const map: ShiftMap = {};
  for (const row of data as DbShift[]) {
    map[`${row.emp_id}_${row.date}`] = row.shift_label;
  }
  return map;
}

export async function upsertShift(
  empId: number,
  date: string,
  shiftLabel: string,
): Promise<void> {
  const { error } = await supabase
    .from("shifts")
    .upsert(
      { emp_id: empId, date, shift_label: shiftLabel },
      { onConflict: "emp_id,date" },
    );
  if (error) throw error;
}

export async function deleteShift(empId: number, date: string): Promise<void> {
  const { error } = await supabase
    .from("shifts")
    .delete()
    .eq("emp_id", empId)
    .eq("date", date);
  if (error) throw error;
}
