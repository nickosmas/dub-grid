import { supabase, cacheThrough, cacheDel, CacheKey, TTL, logAudit, parseHost, ORGANIZATION_COLS } from "./shared";
import type { DbOrganization } from "./types";
import { rowToOrganization } from "./mappers";
import type { Organization, OrganizationUser, OrganizationRole, PlatformRole, AdminPermissions, DirectoryPerson, EmployeeStatus } from "@/types";

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
      orgRole: (row.org_role as string ?? "user") as OrganizationRole,
      platformRole: (row.platform_role as string) as PlatformRole,
      adminPermissions: (row.admin_permissions ?? null) as AdminPermissions | null,
      createdAt: row.created_at as string,
      lastSignInAt: (row.last_sign_in_at as string | null) ?? null,
      departmentIds: (row.department_ids as number[]) ?? [],
      deptAdminIds: (row.dept_admin_ids as number[]) ?? [],
    }));
  });
}

// ── Organization Directory (unified people view) ────────────────────────────

export async function fetchOrgDirectory(orgId: string): Promise<DirectoryPerson[]> {
  return cacheThrough(CacheKey.orgDirectory(orgId), TTL.MODERATE, async () => {
    const { data, error } = await supabase.rpc("get_org_directory", {
      p_org_id: orgId,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => {
      const scheduledDepartmentIds = (row.scheduled_department_ids as number[] | undefined)
        ?? (row.employee_department_ids as number[] | undefined)
        ?? [];
      const scheduledDeptAdminIds = (row.scheduled_dept_admin_ids as number[] | undefined)
        ?? (row.employee_dept_admin_ids as number[] | undefined)
        ?? [];
      const managementDepartmentIds = (row.management_department_ids as number[] | undefined)
        ?? (row.department_ids as number[] | undefined)
        ?? [];
      const managementDeptAdminIds = (row.management_dept_admin_ids as number[] | undefined)
        ?? (row.dept_admin_ids as number[] | undefined)
        ?? [];
      const hasAppAccess = (row.has_app_access as boolean) ?? false;

      return {
        personId: row.person_id as string,
        source: row.source as 'employee' | 'user_only' | 'pending_invite',
        employeeId: (row.employee_id as string | null) ?? null,
        userId: (row.user_id as string | null) ?? null,
        firstName: (row.first_name as string) ?? "",
        lastName: (row.last_name as string) ?? "",
        email: (row.email as string) ?? "",
        phone: (row.phone as string) ?? "",
        employeeStatus: (row.employee_status as EmployeeStatus | null) ?? null,
        orgRole: (row.org_role as OrganizationRole | null) ?? null,
        hasAppAccess,
        focusAreaIds: ((row.focus_area_ids as number[]) ?? []),
        certificationId: (row.certification_id as number | null) ?? null,
        roleIds: ((row.role_ids as number[]) ?? []),
        seniority: (row.seniority as number | null) ?? null,
        lastSignInAt: (row.last_sign_in_at as string | null) ?? null,
        invitationStatus: (row.invitation_status as 'pending' | 'expired' | null) ?? null,
        scheduledDepartmentIds,
        scheduledDeptAdminIds,
        managementDepartmentIds,
        managementDeptAdminIds,
        departmentIds: managementDepartmentIds,
        deptAdminIds: managementDeptAdminIds,
        isManagementUser: hasAppAccess && managementDepartmentIds.length > 0,
      };
    });
  });
}

export async function invalidateOrgDirectory(orgId: string): Promise<void> {
  await cacheDel(CacheKey.orgDirectory(orgId));
}

export async function updateAppOnlyUser(
  userId: string,
  orgId: string,
  data: { firstName?: string; lastName?: string; phone?: string; departmentIds?: number[]; deptAdminIds?: number[] },
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
  if (data.phone !== undefined || data.departmentIds !== undefined || data.deptAdminIds !== undefined) {
    const membershipUpdate: Record<string, unknown> = {};
    if (data.phone !== undefined) membershipUpdate.phone = data.phone;
    if (data.departmentIds !== undefined) {
      membershipUpdate.department_ids = data.departmentIds;
      // Auto-prune dept_admin_ids to remain a subset of department_ids
      if (data.deptAdminIds !== undefined) {
        const deptSet = new Set(data.departmentIds);
        membershipUpdate.dept_admin_ids = data.deptAdminIds.filter(id => deptSet.has(id));
      }
    } else if (data.deptAdminIds !== undefined) {
      membershipUpdate.dept_admin_ids = data.deptAdminIds;
    }
    const { error } = await supabase.from("organization_memberships").update(membershipUpdate).eq("user_id", userId).eq("org_id", orgId);
    if (error) throw error;
  }
  await cacheDel(CacheKey.orgDirectory(orgId), CacheKey.orgUsers(orgId));
}

export async function updatePendingInvitation(
  invitationId: string,
  orgId: string,
  data: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    roleToAssign?: OrganizationRole;
    departmentIds?: number[];
    deptAdminIds?: number[];
  },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (data.firstName !== undefined) update.first_name = data.firstName;
  if (data.lastName !== undefined) update.last_name = data.lastName;
  if (data.phone !== undefined) update.phone = data.phone;
  if (data.email !== undefined) update.email = data.email.toLowerCase();
  if (data.roleToAssign !== undefined) update.role_to_assign = data.roleToAssign;
  if (data.departmentIds !== undefined) {
    update.department_ids = data.departmentIds;
    // Auto-prune dept_admin_ids to remain a subset of department_ids
    if (data.deptAdminIds !== undefined) {
      const deptSet = new Set(data.departmentIds);
      update.dept_admin_ids = data.deptAdminIds.filter(id => deptSet.has(id));
    }
  } else if (data.deptAdminIds !== undefined) {
    update.dept_admin_ids = data.deptAdminIds;
  }
  const { error } = await supabase.from("invitations").update(update).eq("id", invitationId).eq("org_id", orgId);
  if (error) throw error;
  await cacheDel(CacheKey.orgDirectory(orgId), CacheKey.invitations(orgId));
}

export async function updateAdminPermissions(
  userId: string,
  permissions: AdminPermissions | null,
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
  newRole: OrganizationRole,
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
