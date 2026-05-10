import { describe, expect, it } from "vitest";
import {
  getGridmasterRealtimeInvalidationKeys,
  resolveGridmasterRealtimeOrgId,
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

  it("refreshes impersonation history and compliance/security summaries", () => {
    expect(getGridmasterRealtimeInvalidationKeys("impersonation_sessions", orgId)).toEqual([
      queryKeys.gridmaster.impersonation(),
      queryKeys.gridmaster.security(),
      queryKeys.gridmaster.overview(),
      queryKeys.gridmaster.compliance(),
      queryKeys.gridmaster.orgAudit(orgId, 0, 50),
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
