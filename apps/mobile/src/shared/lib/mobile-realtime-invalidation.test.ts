import { describe, expect, it } from "vitest";
import { getMobileRealtimeInvalidationKeys } from "./mobile-realtime-invalidation";

const DASHBOARD_KEY = ["mobile", "dashboard"];

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
