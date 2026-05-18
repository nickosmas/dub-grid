import { describe, expect, it } from "vitest";
import { getMobileRealtimeInvalidationKeys } from "../lib/mobile-realtime-invalidation";

describe("getMobileRealtimeInvalidationKeys", () => {
  it("refreshes bootstrap, profile, schedule, and requests for org settings changes", () => {
    expect(
      getMobileRealtimeInvalidationKeys("token-1", "organizations"),
    ).toEqual([
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
    expect(
      getMobileRealtimeInvalidationKeys("token-1", "organization_memberships"),
    ).toEqual([
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
    expect(
      getMobileRealtimeInvalidationKeys("token-1", "subscriptions"),
    ).toEqual([
      ["mobile", "bootstrap", "token-1"],
      ["mobile", "profile", "token-1"],
      ["mobile", "people", "token-1"],
      ["mobile", "person", "token-1"],
    ]);
  });

  it("refreshes schedule and derived request availability for schedule cell changes", () => {
    expect(
      getMobileRealtimeInvalidationKeys("token-1", "schedule_cells"),
    ).toEqual([["mobile", "schedule"], ["mobile", "requests"]]);
  });
});
