/**
 * React Query key factory — organized by scope.
 * Used by all query hooks and for targeted cache invalidation.
 */
export const queryKeys = {
  org: {
    all: (orgId: string) => ["org", orgId] as const,
    detail: (orgId: string) => ["org", orgId, "detail"] as const,
    bySubdomain: () => ["org", "bySubdomain"] as const,
    focusAreas: (orgId: string) => ["org", orgId, "focusAreas"] as const,
    shiftCodes: (orgId: string) => ["org", orgId, "shiftCodes"] as const,
    absenceTypes: (orgId: string) => ["org", orgId, "absenceTypes"] as const,
    shiftCategories: (orgId: string) => ["org", orgId, "shiftCategories"] as const,
    indicatorTypes: (orgId: string) => ["org", orgId, "indicatorTypes"] as const,
    certifications: (orgId: string) => ["org", orgId, "certifications"] as const,
    orgRoles: (orgId: string) => ["org", orgId, "orgRoles"] as const,
    departments: (orgId: string) => ["org", orgId, "departments"] as const,
    coverageRequirements: (orgId: string) => ["org", orgId, "coverageRequirements"] as const,
    coverageRuleConfigs: (orgId: string) => ["org", orgId, "coverageRuleConfigs"] as const,
    employeeCount: (orgId: string) => ["org", orgId, "employeeCount"] as const,
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
  gridmaster: {
    allOrganizations: () => ["gm", "organizations"] as const,
    allUsers: () => ["gm", "users"] as const,
    tenantStats: () => ["gm", "tenantStats"] as const,
  },
} as const;
