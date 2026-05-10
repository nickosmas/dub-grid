/**
 * React Query key factory — organized by scope.
 * Used by all query hooks and for targeted cache invalidation.
 */
export const queryKeys = {
  org: {
    bootstrapAll: () => ["org", "bootstrap"] as const,
    bootstrap: (orgId: string | null, includeAssignments: boolean) =>
      ["org", "bootstrap", orgId ?? "auto", includeAssignments] as const,
    all: (orgId: string) => ["org", orgId] as const,
    detail: (orgId: string) => ["org", orgId, "detail"] as const,
    bySubdomain: () => ["org", "bySubdomain"] as const,
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
    users: (orgId: string) => ["org", orgId, "users"] as const,
    directory: (orgId: string) => ["org", orgId, "directory"] as const,
    invitations: (orgId: string) => ["org", orgId, "invitations"] as const,
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
    operations: (
      orgId: string,
      startDate: string,
      endDate: string,
      filters = "",
    ) => ["reports", "operations", orgId, startDate, endDate, filters] as const,
  },
  account: {
    self: (userId: string, orgId: string | null) =>
      ["account", userId, orgId ?? "no-org", "self"] as const,
  },
  gridmaster: {
    all: () => ["gm"] as const,
    dashboard: () => ["gm", "dashboard"] as const,
    overview: () => ["gm", "overview"] as const,
    allOrganizations: () => ["gm", "organizations"] as const,
    allUsers: () => ["gm", "users"] as const,
    accounts: () => ["gm", "accounts"] as const,
    security: () => ["gm", "security"] as const,
    sessions: () => ["gm", "security", "sessions"] as const,
    billing: () => ["gm", "billing"] as const,
    compliance: () => ["gm", "compliance"] as const,
    orgHealth: (orgId: string | null) => ["gm", "org-health", orgId ?? "all"] as const,
    userMemberships: (userId: string) => ["gm", "users", userId, "memberships"] as const,
    tenantStats: () => ["gm", "tenantStats"] as const,
    org: (orgId: string) => ["gm", "org", orgId] as const,
    orgUsers: (orgId: string) => ["gm", "org", orgId, "users"] as const,
    orgEmployees: (orgId: string) => ["gm", "org", orgId, "employees"] as const,
    orgInvitations: (orgId: string) => ["gm", "org", orgId, "invitations"] as const,
    orgConfig: (orgId: string) => ["gm", "org", orgId, "config"] as const,
    auditAll: () => ["gm", "audit"] as const,
    orgAudit: (orgId: string | null, page: number, limit: number, filters = "") =>
      ["gm", "audit", orgId ?? "platform", page, limit, filters] as const,
    orgSchedule: (
      orgId: string,
      startDate: string,
      endDate: string,
    ) => ["gm", "org", orgId, "schedule", startDate, endDate] as const,
    impersonation: () => ["gm", "impersonation"] as const,
    impersonationHistory: (page: number, limit: number) =>
      ["gm", "impersonation", "history", page, limit] as const,
  },
} as const;
