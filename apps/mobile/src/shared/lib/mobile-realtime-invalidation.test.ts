import { describe, expect, it } from "vitest";
import { getMobileRealtimeInvalidationKeys } from "./mobile-realtime-invalidation";

const DASHBOARD_KEY = ["mobile", "dashboard"];

function tokenFor(userId: string, orgId: string, version: string) {
  const payload = btoa(JSON.stringify({ sub: userId, org_id: orgId }));
  return `header.${payload}.${version}`;
}

const TABLES_THAT_SHOULD_REFRESH_THE_DASHBOARD = [
  "organizations",
  "focus_areas",
  "coverage_requirements",
  "employees",
  "shift_requests",
  "schedule_cells",
  "schedule_cell_snapshots",
  "schedule_cell_segments",
  "recurring_shifts",
  "publish_history",
  "invitations",
] as const;

const TABLES_THAT_SHOULD_NOT_REFRESH_THE_DASHBOARD = [
  "schedule_notes",
  "profile_change_requests",
  "notifications",
  "audit_log",
  "impersonation_sessions",
  "organization_memberships",
  "subscriptions",
] as const;

describe("getMobileRealtimeInvalidationKeys", () => {
  it("keeps identity-scoped realtime targets stable across rotation and disjoint across organizations", () => {
    const first = tokenFor("user-1", "org-1", "v1");
    const rotated = tokenFor("user-1", "org-1", "v2");
    const otherOrg = tokenFor("user-1", "org-2", "v1");
    const firstKeys = getMobileRealtimeInvalidationKeys(first, "employees");

    expect(firstKeys).toEqual(getMobileRealtimeInvalidationKeys(rotated, "employees"));
    expect(firstKeys).not.toEqual(getMobileRealtimeInvalidationKeys(otherOrg, "employees"));
    expect(JSON.stringify(firstKeys)).not.toContain(first);
    expect(JSON.stringify(firstKeys)).not.toContain(rotated);
  });

  it.each(TABLES_THAT_SHOULD_REFRESH_THE_DASHBOARD)(
    "includes the dashboard key prefix for %s changes",
    (table) => {
      const keys = getMobileRealtimeInvalidationKeys("token-1", table);

      expect(keys).toContainEqual(DASHBOARD_KEY);
    },
  );

  it.each(TABLES_THAT_SHOULD_NOT_REFRESH_THE_DASHBOARD)(
    "does not include the dashboard key prefix for %s changes",
    (table) => {
      const keys = getMobileRealtimeInvalidationKeys("token-1", table);

      expect(keys).not.toContainEqual(DASHBOARD_KEY);
    },
  );
});
