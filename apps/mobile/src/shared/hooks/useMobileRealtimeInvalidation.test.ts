import { renderHook } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMobileRealtimeInvalidationKeys,
  invalidateMobileRealtimeQueriesForTables,
} from "../lib/mobile-realtime-invalidation";
import { mobileQueryKeys } from "../lib/mobile-query-keys";

const subscribeOrgScopedRealtime = vi.fn(
  (_options: { onReconnectAfterError: () => void }) => () => {},
);

vi.mock("@dubgrid/realtime-core", () => ({
  subscribeOrgScopedRealtime: (options: { onReconnectAfterError: () => void }) =>
    subscribeOrgScopedRealtime(options),
}));
vi.mock("../lib/supabase", () => ({
  getSupabaseClient: () => ({ channel: () => ({}), removeChannel: () => {} }),
}));

import { useMobileRealtimeInvalidation } from "./useMobileRealtimeInvalidation";

const TOKEN = "token-1";

describe("getMobileRealtimeInvalidationKeys", () => {
  it("refreshes bootstrap, profile, schedule, requests, and the dashboard for org settings changes", () => {
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "organizations")).toEqual([
      ["mobile", "bootstrap"],
      mobileQueryKeys.profile(TOKEN),
      ["mobile", "schedule"],
      ["mobile", "requests"],
      mobileQueryKeys.personPrefix(TOKEN),
      ["mobile", "dashboard"],
    ]);
  });

  it("refreshes people-facing caches and the dashboard for employee changes", () => {
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "employees")).toEqual([
      ["mobile", "bootstrap"],
      mobileQueryKeys.profile(TOKEN),
      mobileQueryKeys.people(TOKEN),
      mobileQueryKeys.personPrefix(TOKEN),
      ["mobile", "schedule"],
      ["mobile", "requests"],
      ["mobile", "dashboard"],
      ["mobile", "shift-swap-options"],
    ]);
  });

  it("refreshes people-facing caches for people directory relationship changes", () => {
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "organization_memberships")).toEqual([
      ["mobile", "bootstrap"],
      mobileQueryKeys.profile(TOKEN),
      mobileQueryKeys.people(TOKEN),
      mobileQueryKeys.personPrefix(TOKEN),
    ]);
    // invitations also feeds the dashboard's activity feed (accepted
    // invitations show up as "user_signup" activity items).
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "invitations")).toEqual([
      ["mobile", "bootstrap"],
      mobileQueryKeys.profile(TOKEN),
      mobileQueryKeys.people(TOKEN),
      mobileQueryKeys.personPrefix(TOKEN),
      ["mobile", "dashboard"],
    ]);
  });

  it("refreshes bootstrap-owned data when subscription access changes", () => {
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "subscriptions")).toEqual([
      ["mobile", "bootstrap"],
      mobileQueryKeys.profile(TOKEN),
      mobileQueryKeys.people(TOKEN),
      mobileQueryKeys.personPrefix(TOKEN),
    ]);
  });

  it("refreshes schedule, derived request availability, and the dashboard for schedule cell changes", () => {
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "schedule_cells")).toEqual([
      ["mobile", "schedule"],
      ["mobile", "requests"],
      ["mobile", "dashboard"],
      ["mobile", "shift-swap-options"],
    ]);
  });

  it("refreshes the profile-change-requests queue when a request row changes", () => {
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "profile_change_requests")).toEqual([
      mobileQueryKeys.adminProfileChangeRequests(TOKEN),
      mobileQueryKeys.profileChangeRequests(TOKEN),
    ]);
  });

  it("refreshes the notifications inbox, bootstrap, and facets when a notification row changes", () => {
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "notifications")).toEqual([
      mobileQueryKeys.notificationsPrefix(TOKEN),
      ["mobile", "bootstrap"],
      mobileQueryKeys.notificationFacets(TOKEN),
    ]);
  });

  it("refreshes schedule + requests + the dashboard when recurring shifts change", () => {
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "recurring_shifts")).toEqual([
      ["mobile", "schedule"],
      ["mobile", "requests"],
      ["mobile", "dashboard"],
      ["mobile", "shift-swap-options"],
    ]);
  });

  it("refreshes schedule and the dashboard on publish history changes", () => {
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "publish_history")).toEqual([
      ["mobile", "schedule"],
      ["mobile", "dashboard"],
    ]);
  });

  it("refreshes bootstrap + profile for audit-log and impersonation events", () => {
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "audit_log")).toEqual([
      ["mobile", "bootstrap"],
      mobileQueryKeys.profile(TOKEN),
    ]);
    expect(getMobileRealtimeInvalidationKeys(TOKEN, "impersonation_sessions")).toEqual([
      ["mobile", "bootstrap"],
      mobileQueryKeys.profile(TOKEN),
    ]);
  });
});

describe("invalidateMobileRealtimeQueriesForTables", () => {
  it("invalidates each family once across the tables that share it", () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    invalidateMobileRealtimeQueriesForTables(queryClient, TOKEN, [
      "schedule_cells",
      "schedule_cell_snapshots",
      "publish_history",
    ]);

    expect(invalidateQueries.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ["mobile", "schedule"],
      ["mobile", "requests"],
      ["mobile", "dashboard"],
      ["mobile", "shift-swap-options"],
    ]);
  });
});

describe("useMobileRealtimeInvalidation", () => {
  beforeEach(() => {
    subscribeOrgScopedRealtime.mockClear();
  });

  it("refreshes every family the channel watches when it recovers from a gap", () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    renderHook(() =>
      useMobileRealtimeInvalidation({ accessToken: TOKEN, orgId: "org-1", queryClient }),
    );

    expect(subscribeOrgScopedRealtime).toHaveBeenCalledTimes(1);
    subscribeOrgScopedRealtime.mock.calls[0][0].onReconnectAfterError();

    const keys = invalidateQueries.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    expect(new Set(keys).size).toBe(keys.length);
    for (const expected of [
      ["mobile", "bootstrap"],
      ["mobile", "schedule"],
      ["mobile", "requests"],
      ["mobile", "dashboard"],
      mobileQueryKeys.people(TOKEN),
      mobileQueryKeys.profile(TOKEN),
      mobileQueryKeys.adminProfileChangeRequests(TOKEN),
    ]) {
      expect(keys).toContain(JSON.stringify(expected));
    }
  });
});
