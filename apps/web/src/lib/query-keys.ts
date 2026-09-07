/**
 * React Query key factory — organized by scope.
 * Used by all query hooks and for targeted cache invalidation.
 */
export const queryKeys = {
  org: {
    /**
     * The one org-bootstrap key. Deliberately takes no arguments.
     *
     * It used to be keyed by (orgId, includeAssignments), which meant a single
     * page load could fire the same request under three different keys: the
     * shell's `(null, false)`, the header's `(uuid, false)` and the page's
     * `(uuid, true)`. Nothing about the request varies by org — the server
     * resolves it from the caller's claims and sandbox cookie, not from an
     * argument — and every transition that changes the active org either
     * hard-reloads (sandbox enter/exit/reset) or clears the cache
     * (impersonation, org switch, logout). One key, one fetch.
     */
    bootstrap: () => ["org", "bootstrap"] as const,
    all: (orgId: string) => ["org", orgId] as const,
    detail: (orgId: string) => ["org", orgId, "detail"] as const,
    bySubdomain: () => ["org", "bySubdomain"] as const,
    /** Org-level, not org-id keyed: the server resolves the org from the caller. */
    accessStatus: () => ["org", "accessStatus"] as const,
    focusAreas: (orgId: string) => ["org", orgId, "focusAreas"] as const,
    assignments: (orgId: string) => ["org", orgId, "assignments"] as const,
    jobs: (orgId: string) => ["org", orgId, "jobs"] as const,
    absenceTypes: (orgId: string) => ["org", orgId, "absenceTypes"] as const,
    shiftCategories: (orgId: string) => ["org", orgId, "shiftCategories"] as const,
    indicatorTypes: (orgId: string) => ["org", orgId, "indicatorTypes"] as const,
    certifications: (orgId: string) => ["org", orgId, "certifications"] as const,
    orgRoles: (orgId: string) => ["org", orgId, "orgRoles"] as const,
    departments: (orgId: string) => ["org", orgId, "departments"] as const,
    coverageRequirements: (orgId: string) => ["org", orgId, "coverageRequirements"] as const,
    employeeCount: (orgId: string) => ["org", orgId, "employeeCount"] as const,
    billing: (orgId: string) => ["org", orgId, "billing"] as const,
    trialWelcome: (orgId: string) => ["org", orgId, "trialWelcome"] as const,
    users: (orgId: string) => ["org", orgId, "users"] as const,
    directory: (orgId: string) => ["org", orgId, "directory"] as const,
    invitations: (orgId: string) => ["org", orgId, "invitations"] as const,
    peopleChangeRequests: (orgId: string, status: string) =>
      ["org", orgId, "peopleChangeRequests", status] as const,
    publishHistory: (orgId: string) => ["org", orgId, "publishHistory"] as const,
    // Bare prefix: also covers every per-person activity timeline in the org
    // (["org", orgId, "auditLog", "employee", employeeId]).
    auditLog: (orgId: string) => ["org", orgId, "auditLog"] as const,
    // Both sit under the `auditLog` prefix, so realtime invalidation of
    // audit_log and role_change_log refreshes every period and probe at once.
    auditLogRange: (orgId: string, startAt: string, endAt: string, page: number, filters: string) =>
      ["org", orgId, "auditLog", "range", startAt, endAt, page, filters] as const,
    auditLogLatestBefore: (orgId: string, before: string, filters: string) =>
      ["org", orgId, "auditLog", "latestBefore", before, filters] as const,
  },
  employees: {
    all: (orgId: string) => ["employees", orgId] as const,
    detail: (empId: string) => ["employees", "detail", empId] as const,
  },
  shifts: {
    all: (orgId: string) => ["shifts", orgId] as const,
  },
  recurringShifts: {
    all: (orgId: string) => ["recurringShifts", orgId] as const,
  },
  shiftRequests: {
    all: (orgId: string) => ["shiftRequests", orgId] as const,
  },
  reports: {
    operations: (orgId: string, startDate: string, endDate: string, filters = "") =>
      ["reports", "operations", orgId, startDate, endDate, filters] as const,
    // Bare prefix — matches every cached date-range/filter variant of the
    // operations report for the org, for realtime invalidation.
    operationsAll: (orgId: string) => ["reports", "operations", orgId] as const,
  },
  account: {
    /**
     * The caller's org id + gridmaster flag. Deliberately not keyed by user or
     * org: it is what *resolves* those, and every transition that could change
     * it either hard-reloads the page (sandbox enter/exit/reset) or clears the
     * whole cache (impersonation, org switch, logout).
     */
    orgContext: () => ["account", "orgContext"] as const,
    /**
     * Keyed by org as well as user: one person can be an admin in one
     * organization and a plain member in another, so a user-only key served the
     * previous org's role and admin_permissions across a same-user org switch.
     */
    permissions: (userId: string | null, orgId: string | null) =>
      ["account", userId ?? "anon", orgId ?? "no-org", "permissions"] as const,
    self: (userId: string, orgId: string | null) =>
      ["account", userId, orgId ?? "no-org", "self"] as const,
    sessions: (userId: string) => ["account", userId, "sessions"] as const,
    notificationPrefs: (userId: string) => ["account", userId, "notificationPrefs"] as const,
    terms: (userId: string) => ["account", userId, "terms"] as const,
  },
  // Every endpoint behind these keys is org-filtered server-side (it reads
  // claims.org_id), so the org belongs in the key: a user in two orgs would
  // otherwise read one org's alerts out of the cache while signed into the
  // other. Today web only changes org via a full document load, which throws
  // the cache away — this keeps that from being the only thing protecting it.
  // `all` stays a bare user prefix on purpose: it exists to invalidate every
  // variant below, and it still matches them with the org segment inserted.
  notifications: {
    all: (userId: string) => ["notifications", userId] as const,
    unreadCount: (userId: string, orgId: string | null) =>
      ["notifications", userId, orgId ?? "no-org", "unreadCount"] as const,
    recent: (userId: string, orgId: string | null) =>
      ["notifications", userId, orgId ?? "no-org", "recent"] as const,
    search: (userId: string, orgId: string | null) =>
      ["notifications", userId, orgId ?? "no-org", "search"] as const,
    facets: (userId: string, orgId: string | null) =>
      ["notifications", userId, orgId ?? "no-org", "facets"] as const,
  },
  gridmaster: {
    all: () => ["gm"] as const,
    dashboard: () => ["gm", "dashboard"] as const,
    overview: () => ["gm", "overview"] as const,
    allOrganizations: () => ["gm", "organizations"] as const,
    allUsers: () => ["gm", "users"] as const,
    accounts: () => ["gm", "accounts"] as const,
    security: () => ["gm", "security"] as const,
    sessions: (page: number, limit: number, filters = "") =>
      ["gm", "security", "sessions", page, limit, filters] as const,
    billing: () => ["gm", "billing"] as const,
    compliance: () => ["gm", "compliance"] as const,
    orgHealth: (orgId: string | null) => ["gm", "org-health", orgId ?? "all"] as const,
    userMemberships: (userId: string) => ["gm", "users", userId, "memberships"] as const,
    tenantStats: () => ["gm", "tenantStats"] as const,
    org: (orgId: string) => ["gm", "org", orgId] as const,
    platformFlags: () => ["gm", "platform-flags"] as const,
    orgUsers: (orgId: string) => ["gm", "org", orgId, "users"] as const,
    orgEmployees: (orgId: string) => ["gm", "org", orgId, "employees"] as const,
    orgInvitations: (orgId: string) => ["gm", "org", orgId, "invitations"] as const,
    orgConfig: (orgId: string) => ["gm", "org", orgId, "config"] as const,
    auditAll: () => ["gm", "audit"] as const,
    orgAudit: (orgId: string | null, page: number, limit: number, filters = "") =>
      ["gm", "audit", orgId ?? "platform", page, limit, filters] as const,
    orgSchedule: (orgId: string, startDate: string, endDate: string) =>
      ["gm", "org", orgId, "schedule", startDate, endDate] as const,
    // Bare prefix — matches every cached date-range variant of orgSchedule
    // for the org, for realtime invalidation.
    orgScheduleAll: (orgId: string) => ["gm", "org", orgId, "schedule"] as const,
    impersonation: () => ["gm", "impersonation"] as const,
    impersonationHistory: (page: number, limit: number) =>
      ["gm", "impersonation", "history", page, limit] as const,
  },
  // Client-visible subset of platform kill switches (stripe/csv_import/csv_export) —
  // not org-scoped, see apps/web/src/hooks/useClientFeatureFlags.ts.
  featureFlags: () => ["featureFlags"] as const,
} as const;
