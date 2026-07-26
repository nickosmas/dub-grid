import { describe, expect, it } from "vitest";
import {
  getGridmasterRealtimeInvalidationKeys,
  resolveGridmasterRealtimeOrgId,
  resolveGridmasterRealtimeUserId,
} from "@/hooks/useGridmasterRealtimeInvalidation";
import { queryKeys } from "@/lib/query-keys";

const orgId = "11111111-1111-4111-8111-111111111111";

describe("getGridmasterRealtimeInvalidationKeys", () => {
  it("refreshes platform and selected organization data for organization changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("organizations", orgId)).toEqual([
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.billing(),
      queryKeys.gridmaster.compliance(),
      queryKeys.gridmaster.org(orgId),
      queryKeys.gridmaster.orgHealth(orgId),
      queryKeys.gridmaster.orgAudit(orgId, 0, 50),
    ]);
  });

  it("refreshes billing summaries and derived risk views for subscription changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("subscriptions", orgId)).toEqual([
      queryKeys.gridmaster.billing(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.orgHealth(orgId),
    ]);
  });

  it("refreshes every audit-log page through the audit prefix", () => {
    expect(getGridmasterRealtimeInvalidationKeys("audit_log", orgId)).toEqual([
      queryKeys.gridmaster.auditAll(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.security(),
      queryKeys.gridmaster.compliance(),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.orgAudit(orgId, 0, 50),
    ]);
  });

  it("refreshes impersonation history, compliance/security summaries, and every audit page", () => {
    expect(getGridmasterRealtimeInvalidationKeys("impersonation_sessions", orgId)).toEqual([
      queryKeys.gridmaster.impersonation(),
      queryKeys.gridmaster.security(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.compliance(),
      queryKeys.gridmaster.auditAll(),
      queryKeys.gridmaster.orgAudit(orgId, 0, 50),
    ]);
  });

  it("refreshes every audit-log page through the audit prefix for role changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("role_change_log", orgId)).toEqual([
      queryKeys.gridmaster.auditAll(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.security(),
      queryKeys.gridmaster.compliance(),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.orgAudit(orgId, 0, 50),
    ]);
  });

  it("refreshes the security sessions view and compliance summary for session changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("user_sessions", orgId)).toEqual([
      queryKeys.gridmaster.security(),
      queryKeys.gridmaster.compliance(),
    ]);
  });

  it("refreshes the accounts and all-users views for profile changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("profiles", orgId)).toEqual([
      queryKeys.gridmaster.accounts(),
      queryKeys.gridmaster.allUsers(),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
    ]);
  });

  it("refreshes the affected user's membership drill-down when a userId is resolved", () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    expect(
      getGridmasterRealtimeInvalidationKeys("organization_memberships", orgId, userId),
    ).toEqual([
      queryKeys.gridmaster.allUsers(),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.orgUsers(orgId),
      queryKeys.gridmaster.orgHealth(orgId),
      queryKeys.gridmaster.userMemberships(userId),
    ]);
  });

  it("refreshes invitations through the audit prefix as well", () => {
    expect(getGridmasterRealtimeInvalidationKeys("invitations", orgId)).toEqual([
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.auditAll(),
      queryKeys.gridmaster.orgInvitations(orgId),
      queryKeys.gridmaster.orgHealth(orgId),
      queryKeys.gridmaster.orgAudit(orgId, 0, 50),
    ]);
  });

  it("refreshes the org's live schedule view and the platform dashboard for schedule cell changes", () => {
    expect(getGridmasterRealtimeInvalidationKeys("schedule_cells", orgId)).toEqual([
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.dashboard(),
      queryKeys.gridmaster.org(orgId),
      queryKeys.gridmaster.orgHealth(orgId),
      queryKeys.gridmaster.orgScheduleAll(orgId),
    ]);
  });

  it("refreshes organization detail, config, and oversight data for settings tables", () => {
    expect(getGridmasterRealtimeInvalidationKeys("jobs", orgId)).toEqual([
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.orgHealth(null),
      queryKeys.gridmaster.org(orgId),
      queryKeys.gridmaster.orgConfig(orgId),
      queryKeys.gridmaster.orgHealth(orgId),
    ]);
  });
});

describe("resolveGridmasterRealtimeOrgId", () => {
  it("uses id for organization rows", () => {
    expect(
      resolveGridmasterRealtimeOrgId("organizations", {
        new: { id: orgId },
      }),
    ).toBe(orgId);
  });

  it("uses target_org_id for impersonation rows", () => {
    expect(
      resolveGridmasterRealtimeOrgId("impersonation_sessions", {
        new: { target_org_id: orgId },
      }),
    ).toBe(orgId);
  });

  it("falls back to old row data for deletes", () => {
    expect(
      resolveGridmasterRealtimeOrgId("employees", {
        old: { org_id: orgId },
      }),
    ).toBe(orgId);
  });
});

describe("resolveGridmasterRealtimeUserId", () => {
  const userId = "22222222-2222-4222-8222-222222222222";

  it("resolves user_id for organization_memberships rows", () => {
    expect(
      resolveGridmasterRealtimeUserId("organization_memberships", {
        new: { user_id: userId },
      }),
    ).toBe(userId);
  });

  it("returns null for tables with no per-user invalidation target", () => {
    expect(
      resolveGridmasterRealtimeUserId("employees", {
        new: { user_id: userId },
      }),
    ).toBeNull();
  });
});
