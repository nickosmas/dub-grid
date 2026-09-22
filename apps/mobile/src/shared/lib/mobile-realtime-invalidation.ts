import type { QueryClient } from "@tanstack/react-query";
import { mobileQueryKeys } from "./mobile-query-keys";

export type MobileRealtimeTable =
  | "organizations"
  | "focus_areas"
  | "shift_categories"
  | "jobs"
  | "absence_types"
  | "coverage_requirements"
  | "departments"
  | "certifications"
  | "organization_roles"
  | "organization_memberships"
  | "subscriptions"
  | "invitations"
  | "indicator_types"
  | "employees"
  | "shift_requests"
  | "schedule_cells"
  | "schedule_cell_snapshots"
  | "schedule_cell_segments"
  | "schedule_notes"
  | "profile_change_requests"
  | "notifications"
  | "recurring_shifts"
  | "publish_history"
  | "audit_log"
  | "impersonation_sessions";

export function getMobileRealtimeInvalidationKeys(
  accessToken: string,
  table: MobileRealtimeTable,
): readonly (readonly unknown[])[] {
  // Prefix-only key — the bootstrap entry is keyed by user id, which is stable
  // across token refreshes and which this module has no reason to restate.
  const bootstrap = ["mobile", "bootstrap"] as const;
  const profile = mobileQueryKeys.profile(accessToken);
  const people = mobileQueryKeys.people(accessToken);
  const person = mobileQueryKeys.personPrefix(accessToken);
  const schedule = ["mobile", "schedule"] as const;
  const requests = ["mobile", "requests"] as const;
  const profileChangeRequests = mobileQueryKeys.adminProfileChangeRequests(accessToken);
  const profileChangeRequestsOwn = mobileQueryKeys.profileChangeRequests(accessToken);
  const shiftSwapOptions = ["mobile", "shift-swap-options"] as const;
  const notifications = mobileQueryKeys.notificationsPrefix(accessToken);
  const notificationFacets = mobileQueryKeys.notificationFacets(accessToken);
  // Prefix-matches both useAdminDashboard's query key and MyScheduleCard's
  // own dashboard query. AuthSessionProvider clears the cache at an account or
  // organization boundary, so this family prefix can only reach the current
  // identity's remaining entries.
  const dashboard = ["mobile", "dashboard"] as const;

  switch (table) {
    case "organizations":
    case "focus_areas":
    case "shift_categories":
    case "jobs":
    case "absence_types":
    case "coverage_requirements":
    case "departments":
    case "certifications":
    case "organization_roles":
    case "indicator_types":
      return [bootstrap, profile, schedule, requests, person, dashboard];
    case "organization_memberships":
    case "subscriptions":
      return [bootstrap, profile, people, person];
    case "invitations":
      return [bootstrap, profile, people, person, dashboard];
    case "employees":
      return [bootstrap, profile, people, person, schedule, requests, dashboard, shiftSwapOptions];
    case "shift_requests":
      return [requests, schedule, dashboard];
    case "schedule_cells":
    case "schedule_cell_snapshots":
    case "schedule_cell_segments":
      return [schedule, requests, dashboard, shiftSwapOptions];
    case "schedule_notes":
      return [schedule];
    case "profile_change_requests":
      return [profileChangeRequests, profileChangeRequestsOwn];
    case "notifications":
      return [notifications, bootstrap, notificationFacets];
    case "recurring_shifts":
      return [schedule, requests, dashboard, shiftSwapOptions];
    case "publish_history":
      return [schedule, dashboard];
    case "audit_log":
    case "impersonation_sessions":
      return [bootstrap, profile];
  }
}

export function invalidateMobileRealtimeQueries(
  queryClient: QueryClient,
  accessToken: string,
  table: MobileRealtimeTable,
): void {
  for (const queryKey of getMobileRealtimeInvalidationKeys(accessToken, table)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * Every query family the given tables feed, each invalidated once. For a
 * realtime catch-up after a dropped channel, when any of them may have
 * changed unseen; per-table calls would restart the same refetch many times.
 */
export function invalidateMobileRealtimeQueriesForTables(
  queryClient: QueryClient,
  accessToken: string,
  tables: readonly MobileRealtimeTable[],
): void {
  const seen = new Set<string>();
  for (const table of tables) {
    for (const queryKey of getMobileRealtimeInvalidationKeys(accessToken, table)) {
      const id = JSON.stringify(queryKey);
      if (seen.has(id)) continue;
      seen.add(id);
      void queryClient.invalidateQueries({ queryKey });
    }
  }
}
