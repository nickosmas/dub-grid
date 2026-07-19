import {
  supabase,
  cacheThrough,
  cacheDel,
  CacheKey,
  TTL,
  logAudit,
  ORGANIZATION_WITH_BILLING_COLS,
} from "./shared";
import type { DbInvitation, DbOrganization, TenantStats } from "./types";
import { rowToInvitation, rowToOrganization } from "./mappers";
import { removeOrganizationMembershipGuarded, revokeOrganizationInvitationGuarded } from "./access";
import { composeOrganizationAddress } from "@/lib/organization-profile";
import type {
  Organization,
  Invitation,
  OrgActivityMetrics,
  UserMembership,
  Subscription,
  OrganizationRole,
  PlatformRole,
  AuditLogEntry,
  FullAuditLogEntry,
  PlatformUser,
} from "@/types";

async function countScheduleCellsCreatedSince(orgId: string, since: string): Promise<number> {
  const { count, error } = await supabase
    .from("schedule_cells")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

export async function fetchAllOrganizations(options?: {
  limit?: number;
  offset?: number;
}): Promise<Organization[]> {
  const limit = options?.limit ?? 500;
  const offset = options?.offset ?? 0;
  return cacheThrough(`${CacheKey.allOrganizations()}:${offset}:${limit}`, TTL.STABLE, async () => {
    const { data, error } = await supabase
      .from("organizations")
      .select(ORGANIZATION_WITH_BILLING_COLS)
      .order("name")
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return (data ?? []).map((row: unknown) => rowToOrganization(row as DbOrganization));
  });
}

export async function createOrganization(data: Omit<Organization, "id">): Promise<Organization> {
  const address = composeOrganizationAddress(data);
  const { data: row, error } = await supabase
    .from("organizations")
    .insert({
      name: data.name,
      slug: data.slug || null,
      address: address || "",
      address_line_1: data.addressLine1 || "",
      address_line_2: data.addressLine2 || "",
      address_city: data.addressCity || "",
      address_state: data.addressState || "",
      address_postal_code: data.addressPostalCode || "",
      address_country: data.addressCountry || "",
      phone: data.phone || "",
      employee_count: data.employeeCount ?? null,
      focus_area_label: data.focusAreaLabel || null,
      certification_label: data.certificationLabel || null,
      role_label: data.roleLabel || null,
      department_label: data.departmentLabel || null,
      shift_display_mode: data.shiftDisplayMode || "code",
      timezone: data.timezone || null,
      pay_period_start_date: data.payPeriodStartDate || null,
      subscription_status: "trialing",
      // trial_ends_at left NULL: trial is "pending" until the first super_admin
      // logs in (the start_trial_for_org RPC, called from the login flow, starts
      // the clock then).
      enforce_conflict_prevention: data.enforceConflictPrevention ?? false,
      default_shift_enabled: data.defaultShiftEnabled ?? true,
      coverage_rule_config: data.coverageRuleConfig ?? { mentoredCoverageCreditPercent: 100 },
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
  const {
    data: { user: actor },
  } = await supabase.auth.getUser();
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

export async function fetchAllUsers(): Promise<PlatformUser[]> {
  return cacheThrough(CacheKey.allUsers(), TTL.MODERATE, async () => {
    const { data, error } = await supabase.rpc("get_all_users_with_profiles");
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      email: (row.email as string | null) ?? null,
      firstName: null,
      lastName: null,
      platformRole: ((row.platform_role as string) ?? "none") as PlatformRole,
      orgRole: row.org_role as string | null as OrganizationRole | null,
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
}): Promise<AuditLogEntry[]> {
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
}): Promise<FullAuditLogEntry[]> {
  let query = supabase
    .from("audit_log")
    .select(
      "id, org_id, actor_id, actor_email, action, resource_type, resource_id, details, created_at",
    )
    .order("created_at", { ascending: false })
    .range(options?.offset ?? 0, (options?.offset ?? 0) + (options?.limit ?? 50) - 1);
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
    actorName: null,
    action: row.action as string,
    resourceType: row.resource_type as string,
    resourceId: (row.resource_id as string | null) ?? null,
    targetLabel: null,
    targetEmail: null,
    details: (row.details ?? {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
  }));
}

export async function removeUserFromOrganization(userId: string, orgId: string): Promise<void> {
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

  await removeOrganizationMembershipGuarded({
    orgId,
    userId,
    expectedUpdatedAt: membershipRow.updated_at,
  });
  await cacheDel(
    CacheKey.orgUsers(orgId),
    CacheKey.orgDirectory(orgId),
    CacheKey.employees(orgId),
    CacheKey.allUsers(),
    CacheKey.tenantStats(),
  );
}

export async function fetchTenantStats(): Promise<TenantStats[]> {
  return cacheThrough(CacheKey.tenantStats(), TTL.MODERATE, async () => {
    const { data, error } = await supabase.rpc("get_tenant_stats");
    if (error) throw error;
    return (data ?? []).map(
      (row: { org_id: string; user_count: number; employee_count: number }) => ({
        orgId: row.org_id,
        userCount: Number(row.user_count),
        employeeCount: Number(row.employee_count),
      }),
    );
  });
}

export async function fetchInvitationsForOrg(orgId: string): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select(
      "id, org_id, invited_by, email, role_to_assign, expires_at, accepted_at, revoked_at, created_at, updated_at, employee_id, first_name, last_name, phone, department_ids, dept_admin_ids",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: DbInvitation) => rowToInvitation(row));
}

export async function revokeInvitationAsGridmaster(
  invitationId: string,
  orgId: string,
): Promise<void> {
  const { data: invitationRow, error } = await supabase
    .from("invitations")
    .select("updated_at")
    .eq("org_id", orgId)
    .eq("id", invitationId)
    .maybeSingle();
  if (error) throw error;
  if (!invitationRow?.updated_at) {
    throw new Error("Invitation data is out of date. Refresh and try again.");
  }
  await revokeOrganizationInvitationGuarded({
    orgId,
    invitationId,
    expectedUpdatedAt: invitationRow.updated_at,
  });
  await cacheDel(CacheKey.invitations(orgId));
}

export async function fetchUserMemberships(userId: string): Promise<UserMembership[]> {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("org_id, org_role, joined_at, updated_at, admin_permissions, organizations(name, slug)")
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
      updatedAt: (row.updated_at as string | null) ?? null,
      adminPermissions: (row.admin_permissions as UserMembership["adminPermissions"]) ?? null,
    };
  });
}

export async function fetchOrgActivityMetrics(orgId: string): Promise<OrgActivityMetrics> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Fetch the org's member user IDs once, then reuse for both profile queries
  // below (this previously ran as two identical nested sub-queries).
  const { data: memberRows } = await supabase
    .from("organization_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .is("archived_at", null);
  const memberUserIds = (memberRows ?? []).map((r: { user_id: string }) => r.user_id);

  const [lastLoginResult, activeUsersResult, shiftsResult, pendingInvResult, acceptedInvResult] =
    await Promise.all([
      // Last login across all org users
      supabase
        .from("profiles")
        .select("last_sign_in_at")
        .in("id", memberUserIds)
        .not("last_sign_in_at", "is", null)
        .order("last_sign_in_at", { ascending: false })
        .limit(1),

      // Active users in last 30 days
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("id", memberUserIds)
        .gte("last_sign_in_at", thirtyDaysAgo),

      // Schedule cells created in last 30 days
      countScheduleCellsCreatedSince(orgId, thirtyDaysAgo),

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
    shiftsCreated30d: shiftsResult ?? 0,
    invitationsPending: pendingInvResult.count ?? 0,
    invitationsAccepted30d: acceptedInvResult.count ?? 0,
  };
}

export async function deleteOrganizationPermanently(orgId: string): Promise<void> {
  // Audit BEFORE deletion since audit entries for this org will be removed
  void logAudit("org.deleted", "organization", orgId, { permanent: true }, orgId);

  try {
    // Delete in dependency order — children before parents.
    // Keep in sync with /api/gridmaster/delete-org/route.ts
    const tables = [
      "schedule_notes",
      "shifts",
      "recurring_shifts",
      "shift_series",
      "coverage_requirements",
      "shift_categories",
      "absence_types",
      "focus_areas",
      "certifications",
      "organization_roles",
      "indicator_types",
      "employees",
      "invitations",
      "notifications",
      "schedule_draft_sessions",
      "publish_history",
      "organization_memberships",
      "subscriptions",
      "shift_requests",
    ];

    for (const table of tables) {
      await supabase.from(table).delete().eq("org_id", orgId);
    }

    // Audit log entries for this org
    await supabase.from("audit_log").delete().eq("org_id", orgId);

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
      CacheKey.assignments(orgId),
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
    .select(
      "id, org_id, stripe_subscription_id, stripe_customer_id, status, price_id, quantity, current_period_start, current_period_end, cancel_at, canceled_at, trial_end, created_at, updated_at",
    )
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
