import { describe, expect, it } from "vitest";
import { getMobileAccountRealtimeInvalidationKeys } from "../lib/mobile-account-realtime-invalidation";

describe("getMobileAccountRealtimeInvalidationKeys", () => {
  it("refreshes bootstrap and the entire profile namespace on profile row changes", () => {
    expect(getMobileAccountRealtimeInvalidationKeys("token-1", "profiles")).toEqual([
      ["mobile", "bootstrap"],
      ["mobile", "profile", "token-1"],
      ["mobile", "profile"],
    ]);
  });

  it("refreshes the profile namespace on session changes", () => {
    expect(getMobileAccountRealtimeInvalidationKeys("token-1", "user_sessions")).toEqual([
      ["mobile", "profile"],
    ]);
  });

  it("refreshes the profile namespace and the notification-preferences screen's own query on notification preference changes", () => {
    expect(getMobileAccountRealtimeInvalidationKeys("token-1", "notification_preferences")).toEqual(
      [
        ["mobile", "profile"],
        ["mobile", "notification-preferences", "token-1"],
      ],
    );
  });

  it("refreshes the notifications inbox, bootstrap, facets, and the deep-link detail fallback on a per-user notification event", () => {
    expect(getMobileAccountRealtimeInvalidationKeys("token-1", "notifications")).toEqual([
      ["mobile", "notifications-infinite"],
      ["mobile", "bootstrap"],
      ["mobile", "notification-facets", "token-1"],
      ["mobile", "notification-detail"],
    ]);
  });
});
