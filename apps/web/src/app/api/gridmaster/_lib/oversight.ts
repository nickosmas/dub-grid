import { getRateLimitConfigStatus } from "@/lib/rate-limit";
import { ORGANIZATION_WITH_BILLING_COLS } from "@/lib/db/shared";
import { rowToOrganization } from "@/lib/db/mappers";
import type { DbOrganization } from "@/lib/db/types";
import type {
  GridmasterBillingSummary,
  GridmasterComplianceSummary,
  GridmasterOrgHealthSummary,
  GridmasterOverview,
  GridmasterPlatformActivitySummary,
  GridmasterSecuritySummary,
  Organization,
} from "@/types";

type QueryClient = {
  from: (table: string) => any;
};

type Row = Record<string, unknown>;

const DAY_MS = 86_400_000;
const HIGH_RISK_ACTION_PREFIXES = [
  "billing.",
  "gdpr.",
  "gridmaster_account.",
  "impersonation.",
];
const HIGH_RISK_ACTIONS = new Set([
  "account.deleted",
  "audit.exported",
  "feature_flags.updated",
  "org.archived",
  "org.suspended",
  "user.deactivated",
  "user.force_logout",
  "user.password_reset_sent",
]);
const NORMAL_OPERATION_ACTION_PREFIXES = [
  "absence_type.",
  "assignment.",
  "certification.",
  "coverage_",
  "department.",
  "focus_area.",
  "indicator_type.",
  "invitation.",
  "job.",
  "recurring_",
  "schedule.",
  "schedule_note.",
  "shift.",
  "shift_category.",
  "shift_request.",
  "shift_series.",
];
const NORMAL_OPERATION_ACTIONS = new Set([
  "certifications.saved",
  "employee.activated",
  "employee.archived",
  "employee.benched",
  "employee.created",
  "employee.updated",
  "org_roles.saved",
]);

export async function loadGridmasterOverview(
  serviceClient: QueryClient,
): Promise<GridmasterOverview> {
  const facts = await loadOversightFacts(serviceClient);
  const orgHealth = buildOrgHealthSummaries(facts);
  const billing = buildBillingSummary(facts, orgHealth);
  const security = buildSecuritySummary(facts);
  const compliance = buildComplianceSummary(facts, orgHealth);
  const activitySummary = buildPlatformActivitySummary({
    auditRows: facts.auditRows,
    organizations: facts.organizations,
    now: facts.now,
  });
  const now = facts.now.getTime();
  const staleSessionCount = facts.userSessions.filter(
    (row) => now - dateMs(row.last_active_at) > 30 * DAY_MS,
  ).length;
  const activeSessionCount = facts.userSessions.filter(
    (row) => now - dateMs(row.last_active_at) <= DAY_MS,
  ).length;
  const activeMobileTokenCount = facts.mobileDeviceTokens.filter(
    (row) => !row.disabled_at,
  ).length;
  const pendingSetupCount = orgHealth.filter((org) => !org.setup.isComplete).length;

  return {
    generatedAt: facts.now.toISOString(),
    platformHealth: {
      db: { status: "ok", checkedAt: facts.now.toISOString() },
      redis: getRateLimitConfigStatus(),
      activeSessionCount,
      staleSessionCount,
      activeMobileTokenCount,
    },
    orgRisk: {
      suspendedCount: facts.organizations.filter((org) => !!org.suspendedAt).length,
      archivedCount: facts.organizations.filter((org) => !!org.archivedAt).length,
      noLoginCount: orgHealth.filter((org) => org.riskFlags.includes("no_recent_login")).length,
      pendingSetupCount,
      pendingInvitationCount: sum(orgHealth, (org) => org.supportSnapshot.pendingInvitations),
      openShiftRequestCount: sum(orgHealth, (org) => org.supportSnapshot.openShiftRequests),
      riskiestOrganizations: orgHealth
        .filter((org) => org.riskFlags.length > 0)
        .sort((left, right) => left.oversightScore - right.oversightScore)
        .slice(0, 8),
    },
    businessHealth: {
      trialEndingCount: billing.trialEndingSoon.length,
      trialsNotStartedCount: billing.trialsNotStarted.length,
      billingRiskCount: billing.riskOrganizations.length,
      missingStripeCount: billing.missingStripeCustomer.length,
      seatMismatchCount: billing.seatMismatches.length,
    },
    complianceAlerts: {
      activeImpersonationCount: security.impersonation.activeCount,
      expiredUnendedImpersonationCount: security.impersonation.expiredUnendedCount,
      highRiskAuditCount: security.highRiskAuditEvents.length,
      dataRetentionRiskCount: compliance.dataRetentionRisk.length,
      gdprEventCount: compliance.gdprEvents.length,
    },
    activitySummary,
    recentHighRiskEvents: security.highRiskAuditEvents.slice(0, 10),
  };
}

export async function loadGridmasterOrgHealth(
  serviceClient: QueryClient,
  orgId?: string,
): Promise<GridmasterOrgHealthSummary[]> {
  const facts = await loadOversightFacts(serviceClient);
  const summaries = buildOrgHealthSummaries(facts);
  return orgId ? summaries.filter((summary) => summary.orgId === orgId) : summaries;
}

export async function loadGridmasterSecurity(
  serviceClient: QueryClient,
): Promise<GridmasterSecuritySummary> {
  return buildSecuritySummary(await loadOversightFacts(serviceClient));
}

export async function loadGridmasterBilling(
  serviceClient: QueryClient,
): Promise<GridmasterBillingSummary> {
  const facts = await loadOversightFacts(serviceClient);
  return buildBillingSummary(facts, buildOrgHealthSummaries(facts));
}

export async function loadGridmasterCompliance(
  serviceClient: QueryClient,
): Promise<GridmasterComplianceSummary> {
  const facts = await loadOversightFacts(serviceClient);
  return buildComplianceSummary(facts, buildOrgHealthSummaries(facts));
}

async function loadOversightFacts(serviceClient: QueryClient) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const [
    organizations,
    memberships,
    employees,
    invitations,
    scheduleCells,
    shiftRequests,
    userSessions,
    mobileDeviceTokens,
    auditRows,
    impersonationSessions,
    subscriptions,
    departments,
    focusAreas,
    shiftCategories,
    jobs,
    certifications,
    orgRoles,
    profileChangeRequests,
    termsCount,
    consentCount,
  ] = await Promise.all([
    selectRows(serviceClient, "organizations", ORGANIZATION_WITH_BILLING_COLS).then((rows) =>
      rows.map((row) => rowToOrganization(row as unknown as DbOrganization)),
    ),
    selectRows(serviceClient, "organization_memberships", "org_id, user_id, org_role, joined_at, updated_at, archived_at").then((rows) =>
      rows.filter((row) => !row.archived_at),
    ),
    selectRows(serviceClient, "employees", "org_id, status, user_id, created_at, updated_at, archived_at").then((rows) =>
      rows.filter((row) => !row.archived_at),
    ),
    selectRows(serviceClient, "invitations", "org_id, email, accepted_at, revoked_at, expires_at, created_at, updated_at"),
    // L-3: push the 30-day window into the query instead of fetching the entire
    // schedule_cells table and filtering in JS (which both over-fetched and hit
    // PostgREST's silent max-rows truncation).
    serviceClient
      .from("schedule_cells")
      .select("org_id, created_at, updated_at")
      .gte("created_at", thirtyDaysAgo)
      .then(
        (res: { data: Array<Record<string, unknown>> | null }) => res.data ?? [],
      ),
    selectRows(serviceClient, "shift_requests", "org_id, type, status, created_at, updated_at, resolved_at, expires_at"),
    selectRows(serviceClient, "user_sessions", "user_id, platform, app_version, device_label, last_active_at, created_at"),
    selectRows(serviceClient, "mobile_device_tokens", "user_id, org_id, platform, last_seen_at, disabled_at, created_at"),
    serviceClient
      .from("audit_log")
      .select("id, org_id, actor_id, actor_email, action, resource_type, resource_id, details, created_at, impersonation_session_id")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(toRows),
    serviceClient
      .from("impersonation_sessions")
      .select("session_id, gridmaster_id, target_user_id, target_org_id, justification, ip_address, user_agent, expires_at, created_at, ended_at, end_reason")
      .order("created_at", { ascending: false })
      .limit(250)
      .then(toRows),
    selectRows(serviceClient, "subscriptions", "org_id, stripe_subscription_id, stripe_customer_id, status, quantity, current_period_end, cancel_at, canceled_at, trial_end, updated_at"),
    selectRows(serviceClient, "departments", "id, org_id, type, archived_at"),
    selectRows(serviceClient, "focus_areas", "id, org_id, department_id, archived_at"),
    selectRows(serviceClient, "shift_categories", "id, org_id, focus_area_id, archived_at"),
    selectRows(serviceClient, "jobs", "id, org_id, show_on_grid, assignment_mode, focus_area_ids, department_ids, applicable_shift_ids, archived_at"),
    selectRows(serviceClient, "certifications", "id, org_id, archived_at"),
    selectRows(serviceClient, "organization_roles", "id, org_id, archived_at"),
    selectRows(serviceClient, "profile_change_requests", "org_id, status, created_at, resolved_at, cancelled_at"),
    countRows(serviceClient, "terms_acceptances"),
    countRows(serviceClient, "cookie_consents"),
  ]);

  return {
    now,
    organizations,
    memberships,
    employees,
    invitations,
    scheduleCells,
    shiftRequests,
    userSessions,
    mobileDeviceTokens,
    auditRows,
    impersonationSessions,
    subscriptions,
    departments,
    focusAreas,
    shiftCategories,
    jobs,
    certifications,
    orgRoles,
    profileChangeRequests,
    termsCount,
    consentCount,
  };
}

export function buildPlatformActivitySummary(input: {
  auditRows: Array<Record<string, unknown>>;
  organizations: Array<Pick<Organization, "id" | "name">>;
  now: Date;
}): GridmasterPlatformActivitySummary {
  const nowMs = input.now.getTime();
  const last24h = input.auditRows.filter((row) => nowMs - dateMs(row.created_at) <= DAY_MS);
  const last7d = input.auditRows.filter((row) => nowMs - dateMs(row.created_at) <= 7 * DAY_MS);
  const organizationNames = new Map(input.organizations.map((org) => [org.id, org.name]));
  const categoryCounts = new Map<string, number>();

  for (const row of last7d) {
    const category = actionCategory(String(row.action ?? ""));
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  const busiestOrganizations = [...groupRows(last7d, "org_id").entries()]
    .filter(([orgId]) => Boolean(orgId))
    .map(([orgId, rows]) => buildOrgActivitySignal(orgId, rows, organizationNames))
    .sort((left, right) => {
      if (right.actionCount !== left.actionCount) return right.actionCount - left.actionCount;
      return Date.parse(right.latestAt ?? "") - Date.parse(left.latestAt ?? "");
    })
    .slice(0, 6);

  return {
    last24hCount: last24h.length,
    last7dCount: last7d.length,
    topCategories: [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6),
    busiestOrganizations,
    reviewRecommendedOrganizations: busiestOrganizations.filter(
      (signal) => signal.classification === "review_recommended",
    ),
  };
}

function buildOrgActivitySignal(
  orgId: string,
  rows: Row[],
  organizationNames: Map<string, string>,
): GridmasterPlatformActivitySummary["busiestOrganizations"][number] {
  const highRiskActionCount = rows.filter(isHighRiskAuditRow).length;
  const operationalActionCount = rows.filter(isNormalOperationAuditRow).length;
  const dominantCategory = topCategory(rows);
  const latestAt = latestDate(rows.map((row) => stringOrNull(row.created_at)));
  const classification =
    highRiskActionCount > 0 ? "review_recommended" : "normal_operation";

  return {
    orgId,
    orgName: organizationNames.get(orgId) ?? orgId.slice(0, 8),
    actionCount: rows.length,
    operationalActionCount,
    highRiskActionCount,
    latestAt,
    dominantCategory,
    classification,
    reason:
      classification === "review_recommended"
        ? `${highRiskActionCount} review-worthy audited action${highRiskActionCount === 1 ? "" : "s"}`
        : "Normal operational activity",
  };
}

function actionCategory(action: string) {
  return action.split(".")[0] || "other";
}

function topCategory(rows: Row[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const category = actionCategory(String(row.action ?? ""));
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function buildOrgHealthSummaries(facts: Awaited<ReturnType<typeof loadOversightFacts>>): GridmasterOrgHealthSummary[] {
  const userIdsByOrg = groupSet(facts.memberships, "org_id", "user_id");
  const membershipCount = groupCount(facts.memberships, "org_id");
  const employeeCount = groupCount(facts.employees, "org_id");
  const pendingInvites = groupCount(
    facts.invitations.filter((row) => isPendingInvite(row, facts.now)),
    "org_id",
  );
  const openRequests = groupCount(
    facts.shiftRequests.filter((row) => ["open", "pending_approval"].includes(String(row.status))),
    "org_id",
  );
  const scheduleCells30d = groupCount(facts.scheduleCells, "org_id");
  const activeMobileTokens = groupCount(
    facts.mobileDeviceTokens.filter((row) => !row.disabled_at),
    "org_id",
  );
  const auditByOrg = groupRows(facts.auditRows, "org_id");
  const sessionsByUser = groupRows(facts.userSessions, "user_id");
  const profiles30dByOrg = new Map<string, number>();
  const lastLoginByOrg = new Map<string, string | null>();
  const nowMs = facts.now.getTime();

  for (const [orgId, userIds] of userIdsByOrg) {
    const sessions = [...userIds].flatMap((userId) => sessionsByUser.get(userId) ?? []);
    const active30d = new Set(
      sessions
        .filter((row) => nowMs - dateMs(row.last_active_at) <= 30 * DAY_MS)
        .map((row) => String(row.user_id)),
    );
    profiles30dByOrg.set(orgId, active30d.size);
    lastLoginByOrg.set(orgId, latestDate(sessions.map((row) => stringOrNull(row.last_active_at))));
  }

  return facts.organizations.map((org) => {
    const setup = computeSetupSummary(facts, org.id);
    const auditRows = auditByOrg.get(org.id) ?? [];
    const lastPublish = latestDate(
      auditRows
        .filter((row) => row.action === "schedule.published")
        .map((row) => stringOrNull(row.created_at)),
    );
    const lastSettingsChange = latestDate(
      auditRows
        .filter((row) => String(row.action).startsWith("org.") || row.action === "feature_flags.updated")
        .map((row) => stringOrNull(row.created_at)),
    );
    const riskFlags: GridmasterOrgHealthSummary["riskFlags"] = [];
    if (org.suspendedAt) riskFlags.push("suspended");
    if (org.archivedAt) riskFlags.push("archived");
    if (!setup.isComplete) riskFlags.push("setup_incomplete");
    const lastLoginAt = lastLoginByOrg.get(org.id) ?? null;
    if (!lastLoginAt || nowMs - Date.parse(lastLoginAt) > 90 * DAY_MS) {
      riskFlags.push("no_recent_login");
    }
    if (pendingInvites.get(org.id) ?? 0) riskFlags.push("pending_invites");
    if (openRequests.get(org.id) ?? 0) riskFlags.push("open_requests");
    if (isBillingRisk(org)) riskFlags.push("billing_risk");

    const oversightScore = Math.max(
      0,
      100 -
        riskFlags.reduce((total, flag) => total + riskPenalty(flag), 0),
    );

    return {
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      status: org.archivedAt ? "archived" : org.suspendedAt ? "suspended" : "active",
      oversightScore,
      riskFlags,
      setup,
      supportSnapshot: {
        userCount: membershipCount.get(org.id) ?? 0,
        employeeCount: employeeCount.get(org.id) ?? 0,
        activeUsers30d: profiles30dByOrg.get(org.id) ?? 0,
        activeSessions: countOrgSessions(userIdsByOrg.get(org.id), facts.userSessions, facts.now),
        mobileDevices: activeMobileTokens.get(org.id) ?? 0,
        pendingInvitations: pendingInvites.get(org.id) ?? 0,
        openShiftRequests: openRequests.get(org.id) ?? 0,
        scheduleCellsCreated30d: scheduleCells30d.get(org.id) ?? 0,
        lastLoginAt,
        lastSchedulePublishAt: lastPublish,
        recentSettingsChangeAt: lastSettingsChange,
      },
      billing: {
        subscriptionStatus: org.subscriptionStatus ?? null,
        trialStartedAt: org.trialStartedAt ?? null,
        trialEndsAt: org.trialEndsAt ?? null,
        subscriptionSeats: org.subscriptionSeats ?? null,
        stripeCustomerId: org.stripeCustomerId ?? null,
      },
      featureOverrides: org.featureOverrides ?? {},
    };
  });
}

function buildSecuritySummary(facts: Awaited<ReturnType<typeof loadOversightFacts>>): GridmasterSecuritySummary {
  const nowMs = facts.now.getTime();
  const activeImpersonations = facts.impersonationSessions.filter(
    (row: Row) => !row.ended_at && dateMs(row.expires_at) > nowMs,
  );
  const expiredUnended = facts.impersonationSessions.filter(
    (row: Row) => !row.ended_at && dateMs(row.expires_at) <= nowMs,
  );
  const forceLogoutEvents = facts.auditRows.filter((row: Row) => row.action === "user.force_logout");
  return {
    generatedAt: facts.now.toISOString(),
    sessionSummary: {
      active24h: facts.userSessions.filter((row) => nowMs - dateMs(row.last_active_at) <= DAY_MS).length,
      stale30d: facts.userSessions.filter((row) => nowMs - dateMs(row.last_active_at) > 30 * DAY_MS).length,
      web: facts.userSessions.filter((row) => row.platform === "web").length,
      ios: facts.userSessions.filter((row) => row.platform === "ios").length,
      android: facts.userSessions.filter((row) => row.platform === "android").length,
    },
    mobileDeviceSummary: {
      active: facts.mobileDeviceTokens.filter((row) => !row.disabled_at).length,
      disabled: facts.mobileDeviceTokens.filter((row) => !!row.disabled_at).length,
    },
    impersonation: {
      activeCount: activeImpersonations.length,
      expiredUnendedCount: expiredUnended.length,
      recent: facts.impersonationSessions.slice(0, 25).map(mapImpersonationRow),
    },
    forceLogoutEvents: forceLogoutEvents.slice(0, 25).map(mapAuditRow),
    highRiskAuditEvents: facts.auditRows.filter(isHighRiskAuditRow).slice(0, 25).map(mapAuditRow),
  };
}

function buildBillingSummary(
  facts: Awaited<ReturnType<typeof loadOversightFacts>>,
  orgHealth: GridmasterOrgHealthSummary[],
): GridmasterBillingSummary {
  const subscriptionByOrg = new Map(facts.subscriptions.map((row) => [String(row.org_id), row]));
  const organizations = facts.organizations.map((org) => {
    const health = orgHealth.find((summary) => summary.orgId === org.id);
    const subscription = subscriptionByOrg.get(org.id);
    const seats = org.subscriptionSeats ?? numberOrNull(subscription?.quantity);
    const appUsers = billableAppUserCountForOrg(facts, org.id);
    const seatDelta = seats == null ? null : seats - appUsers;
    const status = org.subscriptionStatus ?? stringOrNull(subscription?.status);
    const trialEndsAt = org.trialEndsAt ?? stringOrNull(subscription?.trial_end);
    return {
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      status,
      stripeCustomerId: org.stripeCustomerId ?? stringOrNull(subscription?.stripe_customer_id),
      stripeSubscriptionId: stringOrNull(subscription?.stripe_subscription_id),
      trialStartedAt: org.trialStartedAt ?? null,
      trialEndsAt,
      currentPeriodEnd: stringOrNull(subscription?.current_period_end),
      cancelAt: stringOrNull(subscription?.cancel_at),
      canceledAt: stringOrNull(subscription?.canceled_at),
      seats,
      appUsers,
      employeeCount: health?.supportSnapshot.employeeCount ?? 0,
      seatDelta,
      updatedAt: stringOrNull(subscription?.updated_at),
    };
  });
  const nowMs = facts.now.getTime();
  const trialEndingSoon = organizations.filter((row) => {
    if (!row.trialEndsAt) return false;
    const diff = Date.parse(row.trialEndsAt) - nowMs;
    return diff >= 0 && diff <= 14 * DAY_MS;
  });
  // Trialing orgs with no end date = trial pending (no super_admin has signed in
  // yet, so the clock has not started).
  const trialsNotStarted = organizations.filter(
    (row) => !row.trialEndsAt && (row.status === "trialing" || !row.status),
  );
  const riskOrganizations = organizations.filter((row) =>
    ["past_due", "canceled", "unpaid", "incomplete", "incomplete_expired"].includes(row.status ?? ""),
  );
  const missingStripeCustomer = organizations.filter((row) => !row.stripeCustomerId);
  const seatMismatches = organizations.filter(
    (row) => row.seatDelta != null && row.seatDelta < 0,
  );
  return {
    generatedAt: facts.now.toISOString(),
    organizations,
    trialEndingSoon,
    trialsNotStarted,
    riskOrganizations,
    missingStripeCustomer,
    seatMismatches,
  };
}

function billableAppUserCountForOrg(
  facts: Awaited<ReturnType<typeof loadOversightFacts>>,
  orgId: string,
): number {
  const employees = facts.employees.filter((row) => row.org_id === orgId);
  const linkedEmployeeUserIds = new Set(
    employees
      .map((row) => stringOrNull(row.user_id))
      .filter((userId): userId is string => Boolean(userId)),
  );
  const managementOnlyMemberships = facts.memberships.filter((row) => {
    const userId = stringOrNull(row.user_id);
    return row.org_id === orgId && userId && !linkedEmployeeUserIds.has(userId);
  });
  return employees.length + managementOnlyMemberships.length;
}

function buildComplianceSummary(
  facts: Awaited<ReturnType<typeof loadOversightFacts>>,
  orgHealth: GridmasterOrgHealthSummary[],
): GridmasterComplianceSummary {
  const dataRetentionRisk = facts.organizations
    .filter((org) => (org.dataRetentionDays ?? 365) > 365)
    .map((org) => ({
      orgId: org.id,
      orgName: org.name,
      dataRetentionDays: org.dataRetentionDays ?? 365,
    }));
  const gdprEvents = facts.auditRows.filter((row: Row) => String(row.action).startsWith("gdpr."));
  const deletionEvents = facts.auditRows.filter((row: Row) => row.action === "account.deleted");
  const pendingProfileChangeRequests = facts.profileChangeRequests.filter((row: Row) => row.status === "pending");
  return {
    generatedAt: facts.now.toISOString(),
    termsAcceptanceCount: facts.termsCount,
    cookieConsentCount: facts.consentCount,
    pendingProfileChangeRequestCount: pendingProfileChangeRequests.length,
    dataRetentionRisk,
    gdprEvents: gdprEvents.slice(0, 25).map(mapAuditRow),
    accountDeletionEvents: deletionEvents.slice(0, 25).map(mapAuditRow),
    impersonationEvidence: facts.impersonationSessions.slice(0, 25).map(mapImpersonationRow),
    orgRetention: orgHealth.map((org) => ({
      orgId: org.orgId,
      orgName: org.orgName,
      dataRetentionDays:
        facts.organizations.find((candidate) => candidate.id === org.orgId)?.dataRetentionDays ?? 365,
    })),
  };
}

async function selectRows(client: QueryClient, table: string, columns: string): Promise<Row[]> {
  return toRows(await client.from(table).select(columns));
}

async function countRows(client: QueryClient, table: string): Promise<number> {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

function toRows(result: { data?: unknown; error?: unknown }): Row[] {
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? (result.data as Row[]) : [];
}

function computeSetupSummary(
  facts: Awaited<ReturnType<typeof loadOversightFacts>>,
  orgId: string,
): GridmasterOrgHealthSummary["setup"] {
  const departments = facts.departments.filter((row) => row.org_id === orgId && !row.archived_at);
  const scheduledDepartmentIds = new Set(
    departments.filter((row) => row.type === "scheduled").map((row) => Number(row.id)),
  );
  const focusAreas = facts.focusAreas.filter((row) => row.org_id === orgId && !row.archived_at);
  const focusAreaIds = new Set(focusAreas.map((row) => Number(row.id)));
  const focusAreasPlaced =
    scheduledDepartmentIds.size > 0 &&
    focusAreas.length > 0 &&
    focusAreas.every((row) => scheduledDepartmentIds.has(Number(row.department_id)));
  const shifts = facts.shiftCategories.filter((row) => row.org_id === orgId && !row.archived_at);
  const shiftsPlaced =
    shifts.length > 0 &&
    shifts.every((row) => row.focus_area_id != null && focusAreaIds.has(Number(row.focus_area_id)));
  const shiftIds = new Set(shifts.map((row) => Number(row.id)));
  const visibleJobs = facts.jobs.filter(
    (row) => row.org_id === orgId && !row.archived_at && row.show_on_grid !== false,
  );
  const jobsPlaced =
    visibleJobs.length > 0 &&
    visibleJobs.every((job) => {
      if (job.assignment_mode === "shiftless") return true;
      const departmentIds = numberArray(job.department_ids);
      const focusAreaPlacementIds = numberArray(job.focus_area_ids);
      const applicableShiftIds = numberArray(job.applicable_shift_ids);
      return (
        (departmentIds.some((id) => scheduledDepartmentIds.has(id)) ||
          focusAreaPlacementIds.some((id) => focusAreaIds.has(id))) &&
        applicableShiftIds.length > 0 &&
        applicableShiftIds.every((id) => shiftIds.has(id))
      );
    });
  const certificationsReady = facts.certifications.some(
    (row) => row.org_id === orgId && !row.archived_at,
  );
  const rolesReady = facts.orgRoles.some((row) => row.org_id === orgId && !row.archived_at);
  const scheduleDefinitions = shiftsPlaced && jobsPlaced;
  const missing: GridmasterOrgHealthSummary["setup"]["missing"] = [];
  if (!focusAreasPlaced) missing.push("focusAreas");
  if (!scheduleDefinitions) missing.push("scheduleDefinitions");
  if (!certificationsReady) missing.push("certifications");
  if (!rolesReady) missing.push("orgRoles");
  return {
    isComplete: missing.length === 0,
    missing,
  };
}

function mapAuditRow(row: Row) {
  return {
    id: Number(row.id),
    orgId: stringOrNull(row.org_id),
    actorId: stringOrNull(row.actor_id),
    actorEmail: stringOrNull(row.actor_email),
    action: String(row.action ?? ""),
    resourceType: String(row.resource_type ?? ""),
    resourceId: stringOrNull(row.resource_id),
    details: objectOrEmpty(row.details),
    createdAt: String(row.created_at ?? ""),
  };
}

function mapImpersonationRow(row: Row) {
  return {
    sessionId: String(row.session_id ?? ""),
    gridmasterId: String(row.gridmaster_id ?? ""),
    targetUserId: String(row.target_user_id ?? ""),
    targetOrgId: String(row.target_org_id ?? ""),
    justification: String(row.justification ?? ""),
    ipAddress: stringOrNull(row.ip_address),
    userAgent: stringOrNull(row.user_agent),
    expiresAt: String(row.expires_at ?? ""),
    createdAt: String(row.created_at ?? ""),
    endedAt: stringOrNull(row.ended_at),
    endReason: stringOrNull(row.end_reason),
  };
}

function isHighRiskAuditRow(row: Row) {
  const action = String(row.action ?? "");
  return HIGH_RISK_ACTIONS.has(action) || HIGH_RISK_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix));
}

function isNormalOperationAuditRow(row: Row) {
  const action = String(row.action ?? "");
  const details = objectOrEmpty(row.details);
  return (
    details.bulkImport === true ||
    NORMAL_OPERATION_ACTIONS.has(action) ||
    NORMAL_OPERATION_ACTION_PREFIXES.some((prefix) => action.startsWith(prefix))
  );
}

function isBillingRisk(org: Organization) {
  return ["past_due", "canceled", "unpaid", "incomplete", "incomplete_expired"].includes(
    org.subscriptionStatus ?? "",
  );
}

function riskPenalty(flag: GridmasterOrgHealthSummary["riskFlags"][number]) {
  switch (flag) {
    case "suspended":
    case "archived":
      return 35;
    case "billing_risk":
      return 25;
    case "setup_incomplete":
    case "no_recent_login":
      return 20;
    case "open_requests":
    case "pending_invites":
      return 10;
  }
}

function isPendingInvite(row: Row, now: Date) {
  return !row.accepted_at && !row.revoked_at && dateMs(row.expires_at) >= now.getTime();
}

function countOrgSessions(userIds: Set<string> | undefined, sessions: Row[], now: Date) {
  if (!userIds) return 0;
  return sessions.filter(
    (row) => userIds.has(String(row.user_id)) && now.getTime() - dateMs(row.last_active_at) <= DAY_MS,
  ).length;
}

function groupCount(rows: Row[], key: string) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const value = stringOrNull(row[key]);
    if (value) map.set(value, (map.get(value) ?? 0) + 1);
  }
  return map;
}

function groupRows(rows: Row[], key: string) {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const value = stringOrNull(row[key]);
    if (!value) continue;
    const list = map.get(value) ?? [];
    list.push(row);
    map.set(value, list);
  }
  return map;
}

function groupSet(rows: Row[], key: string, valueKey: string) {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const keyValue = stringOrNull(row[key]);
    const value = stringOrNull(row[valueKey]);
    if (!keyValue || !value) continue;
    const set = map.get(keyValue) ?? new Set<string>();
    set.add(value);
    map.set(keyValue, set);
  }
  return map;
}

function latestDate(values: Array<string | null>) {
  const latest = values
    .filter(Boolean)
    .map((value) => Date.parse(value as string))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0];
  return latest ? new Date(latest).toISOString() : null;
}

function dateMs(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    : [];
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function sum<T>(items: T[], picker: (item: T) => number) {
  return items.reduce((total, item) => total + picker(item), 0);
}
