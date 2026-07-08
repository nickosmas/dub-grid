import { describe, expect, it } from "vitest";
import { getMobileRealtimeInvalidationKeys } from "../lib/mobile-realtime-invalidation";

describe("getMobileRealtimeInvalidationKeys", () => {
  it("refreshes bootstrap, profile, schedule, and requests for org settings changes", () => {
    expect(getMobileRealtimeInvalidationKeys("token-1", "organizations")).toEqual([
      ["mobile", "bootstrap", "token-1"],
      ["mobile", "profile", "token-1"],
      ["mobile", "schedule"],
      ["mobile", "requests"],
      ["mobile", "person", "token-1"],
    ]);
  });

  it("refreshes people-facing caches for employee changes", () => {
    expect(getMobileRealtimeInvalidationKeys("token-1", "employees")).toEqual([
      ["mobile", "bootstrap", "token-1"],
      ["mobile", "profile", "token-1"],
      ["mobile", "people", "token-1"],
      ["mobile", "person", "token-1"],
      ["mobile", "schedule"],
      ["mobile", "requests"],
    ]);
  });

  it("refreshes people-facing caches for people directory relationship changes", () => {
    expect(getMobileRealtimeInvalidationKeys("token-1", "organization_memberships")).toEqual([
      ["mobile", "bootstrap", "token-1"],
      ["mobile", "profile", "token-1"],
      ["mobile", "people", "token-1"],
      ["mobile", "person", "token-1"],
    ]);
    expect(getMobileRealtimeInvalidationKeys("token-1", "invitations")).toEqual([
      ["mobile", "bootstrap", "token-1"],
      ["mobile", "profile", "token-1"],
      ["mobile", "people", "token-1"],
      ["mobile", "person", "token-1"],
    ]);
  });

  it("refreshes bootstrap-owned data when subscription access changes", () => {
    expect(getMobileRealtimeInvalidationKeys("token-1", "subscriptions")).toEqual([
      ["mobile", "bootstrap", "token-1"],
      ["mobile", "profile", "token-1"],
      ["mobile", "people", "token-1"],
      ["mobile", "person", "token-1"],
    ]);
  });

  it("refreshes schedule and derived request availability for schedule cell changes", () => {
    expect(getMobileRealtimeInvalidationKeys("token-1", "schedule_cells")).toEqual([
      ["mobile", "schedule"],
      ["mobile", "requests"],
    ]);
  });

  it("refreshes the profile-change-requests queue when a request row changes", () => {
    expect(getMobileRealtimeInvalidationKeys("token-1", "profile_change_requests")).toEqual([
      ["mobile", "profile-change-requests"],
    ]);
  });

  it("refreshes the notifications inbox, bootstrap, and facets when a notification row changes", () => {
    expect(getMobileRealtimeInvalidationKeys("token-1", "notifications")).toEqual([
      ["mobile", "notifications-infinite"],
      ["mobile", "bootstrap", "token-1"],
      ["mobile", "notification-facets", "token-1"],
    ]);
  });

  it("refreshes schedule + requests when recurring shifts change", () => {
    expect(getMobileRealtimeInvalidationKeys("token-1", "recurring_shifts")).toEqual([
      ["mobile", "schedule"],
      ["mobile", "requests"],
    ]);
  });

  it("refreshes schedule on publish history changes", () => {
    expect(getMobileRealtimeInvalidationKeys("token-1", "publish_history")).toEqual([
      ["mobile", "schedule"],
    ]);
  });

  it("refreshes bootstrap + profile for audit-log and impersonation events", () => {
    expect(getMobileRealtimeInvalidationKeys("token-1", "audit_log")).toEqual([
      ["mobile", "bootstrap", "token-1"],
      ["mobile", "profile", "token-1"],
    ]);
    expect(getMobileRealtimeInvalidationKeys("token-1", "impersonation_sessions")).toEqual([
      ["mobile", "bootstrap", "token-1"],
      ["mobile", "profile", "token-1"],
    ]);
  });
});
