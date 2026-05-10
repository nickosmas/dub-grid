import { supabase, cacheThrough, cacheDel, CacheKey, TTL, logAudit, parseHost, ORGANIZATION_COLS } from "./shared";
import type { DbOrganization } from "./types";
import { rowToOrganization, rowToOrganizationUser } from "./mappers";
import type {
  AdminPermissions,
  DirectoryPerson,
  EmployeeStatus,
  Organization,
  OrganizationRole,
  OrganizationUser,
} from "@/types";
import { composeOrganizationAddress } from "@/lib/organization-profile";
import type { OrganizationSettingsEditable } from "@/lib/organization-settings";
import {
  updateOrganizationInvitationGuarded,
  updateOrganizationMembershipGuarded,
} from "./access";

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
  const address = composeOrganizationAddress(org);
  const { error } = await supabase
    .from("organizations")
    .update({
      name: org.name,
      address,
      address_line_1: org.addressLine1,
      address_line_2: org.addressLine2,
      address_city: org.addressCity,
      address_state: org.addressState,
      address_postal_code: org.addressPostalCode,
      address_country: org.addressCountry,
      phone: org.phone,
      focus_area_label: org.focusAreaLabel || null,
      certification_label: org.certificationLabel || null,
      role_label: org.roleLabel || null,
      department_label: org.departmentLabel || null,
      shift_display_mode: org.shiftDisplayMode || 'code',
      timezone: org.timezone || null,
      pay_period_start_date: org.payPeriodStartDate || null,
      enforce_conflict_prevention: org.enforceConflictPrevention ?? false,
      coverage_rule_config: org.coverageRuleConfig ?? { mentoredCoverageCreditPercent: 100 },
      data_retention_days: org.dataRetentionDays ?? 365,
      feature_overrides: org.featureOverrides ?? {},
    })
    .eq("id", org.id);
  if (error) throw error;
  await cacheDel(CacheKey.organization(org.id), CacheKey.allOrganizations());
  void logAudit("org.updated", "organization", org.id, { name: org.name, address }, org.id);
}

export interface UpdateOrganizationSettingsInput
  extends Partial<OrganizationSettingsEditable> {
  orgId: string;
  expectedUpdatedAt: string;
}

export class OrganizationSettingsConflictError extends Error {
  constructor(public readonly latestOrganization: Organization) {
    super("Organization settings were updated by someone else.");
    this.name = "OrganizationSettingsConflictError";
  }
}

export async function updateOrganizationSettings(
  input: UpdateOrganizationSettingsInput,
): Promise<Organization> {
  const response = await fetch("/api/organizations/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.status === 409) {
    const latestOrganization =
      body &&
      typeof body === "object" &&
      "organization" in body &&
      body.organization &&
      typeof body.organization === "object"
        ? (body.organization as Organization)
        : null;

    if (latestOrganization) {
      throw new OrganizationSettingsConflictError(latestOrganization);
    }
  }

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Failed to update organization settings";
    throw new Error(message);
  }

  const organization =
    body &&
    typeof body === "object" &&
    "organization" in body &&
    body.organization &&
    typeof body.organization === "object"
      ? (body.organization as Organization)
      : null;

  if (!organization) {
    throw new Error("Organization settings response did not include organization data");
  }

  await cacheDel(CacheKey.organization(input.orgId), CacheKey.allOrganizations());
  return organization;
}

export async function fetchOrganizationUsers(orgId: string): Promise<OrganizationUser[]> {
  return cacheThrough(CacheKey.orgUsers(orgId), TTL.MODERATE, async () => {
    const { data, error } = await supabase.rpc("get_org_users", {
      p_org_id: orgId,
    });
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) =>
      rowToOrganizationUser(row),
    );
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
  const { data: invitationRow, error } = await supabase
    .from("invitations")
    .select("updated_at")
    .eq("id", invitationId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw error;
  if (!invitationRow?.updated_at) {
    throw new Error("Invitation data is out of date. Refresh and try again.");
  }

  await updateOrganizationInvitationGuarded({
    orgId,
    invitationId,
    expectedUpdatedAt: invitationRow.updated_at,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone,
    email: data.email?.toLowerCase(),
    roleToAssign: data.roleToAssign,
    departmentIds: data.departmentIds,
    deptAdminIds: data.deptAdminIds,
  });
  await cacheDel(CacheKey.orgDirectory(orgId), CacheKey.invitations(orgId));
}

export async function updateAdminPermissions(
  userId: string,
  permissions: AdminPermissions | null,
  orgId: string,
): Promise<void> {
  const { data: membershipRow, error } = await supabase
    .from("organization_memberships")
    .select("updated_at")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!membershipRow?.updated_at) {
    throw new Error("User access data is out of date. Refresh and try again.");
  }

  await updateOrganizationMembershipGuarded({
    orgId,
    userId,
    expectedUpdatedAt: membershipRow.updated_at,
    adminPermissions: permissions,
  });
  await cacheDel(CacheKey.orgUsers(orgId), CacheKey.orgDirectory(orgId));
}

export async function changeOrganizationUserRole(
  targetUserId: string,
  newRole: OrganizationRole,
  orgId?: string,
): Promise<void> {
  if (!orgId) {
    throw new Error("Organization context is required to update roles safely.");
  }

  const { data: membershipRow, error } = await supabase
    .from("organization_memberships")
    .select("updated_at, admin_permissions")
    .eq("user_id", targetUserId)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!membershipRow?.updated_at) {
    throw new Error("User access data is out of date. Refresh and try again.");
  }

  await updateOrganizationMembershipGuarded({
    orgId,
    userId: targetUserId,
    expectedUpdatedAt: membershipRow.updated_at,
    orgRole: newRole,
    adminPermissions: newRole === "admin"
      ? ((membershipRow.admin_permissions as AdminPermissions | null) ?? null)
      : null,
  });
  await cacheDel(CacheKey.allUsers(), CacheKey.mwProfile(targetUserId), CacheKey.orgUsers(orgId), CacheKey.orgDirectory(orgId));
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
