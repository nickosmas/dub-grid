import { describe, expect, it } from "vitest";
import { getMobileAccountRealtimeInvalidationKeys } from "../lib/mobile-account-realtime-invalidation";

describe("getMobileAccountRealtimeInvalidationKeys", () => {
  it("refreshes bootstrap and the entire profile namespace on profile row changes", () => {
    expect(
      getMobileAccountRealtimeInvalidationKeys("token-1", "profiles"),
    ).toEqual([
      ["mobile", "bootstrap", "token-1"],
      ["mobile", "profile", "token-1"],
      ["mobile", "profile"],
    ]);
  });

  it("refreshes the profile namespace on session changes", () => {
    expect(
      getMobileAccountRealtimeInvalidationKeys("token-1", "user_sessions"),
    ).toEqual([["mobile", "profile"]]);
  });

  it("refreshes the profile namespace on notification preference changes", () => {
    expect(
      getMobileAccountRealtimeInvalidationKeys(
        "token-1",
        "notification_preferences",
      ),
    ).toEqual([["mobile", "profile"]]);
  });

  it("refreshes the notifications inbox, bootstrap, and facets on a per-user notification event", () => {
    expect(
      getMobileAccountRealtimeInvalidationKeys("token-1", "notifications"),
    ).toEqual([
      ["mobile", "notifications-infinite"],
      ["mobile", "bootstrap", "token-1"],
      ["mobile", "notification-facets", "token-1"],
    ]);
  });
});
