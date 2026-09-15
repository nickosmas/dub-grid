import { describe, expect, it } from "vitest";
import { getMobileAccountRealtimeInvalidationKeys } from "../lib/mobile-account-realtime-invalidation";
import { mobileQueryKeys } from "../lib/mobile-query-keys";

const TOKEN = "token-1";

function tokenFor(userId: string, orgId: string, version: string) {
  const payload = btoa(JSON.stringify({ sub: userId, org_id: orgId }));
  return `header.${payload}.${version}`;
}

describe("getMobileAccountRealtimeInvalidationKeys", () => {
  it("keeps account realtime targets stable across rotation and isolated by organization", () => {
    const first = tokenFor("user-1", "org-1", "v1");
    const rotated = tokenFor("user-1", "org-1", "v2");
    const otherOrg = tokenFor("user-1", "org-2", "v1");
    const firstKeys = getMobileAccountRealtimeInvalidationKeys(first, "notifications");

    expect(firstKeys).toEqual(getMobileAccountRealtimeInvalidationKeys(rotated, "notifications"));
    expect(firstKeys).not.toEqual(
      getMobileAccountRealtimeInvalidationKeys(otherOrg, "notifications"),
    );
    expect(JSON.stringify(firstKeys)).not.toContain(first);
  });

  it("refreshes bootstrap and the entire profile namespace on profile row changes", () => {
    expect(getMobileAccountRealtimeInvalidationKeys(TOKEN, "profiles")).toEqual([
      ["mobile", "bootstrap"],
      mobileQueryKeys.profile(TOKEN),
    ]);
  });

  it("refreshes the profile namespace on session changes", () => {
    expect(getMobileAccountRealtimeInvalidationKeys(TOKEN, "user_sessions")).toEqual([
      mobileQueryKeys.profileSessions(TOKEN),
    ]);
  });

  it("refreshes the profile namespace and the notification-preferences screen's own query on notification preference changes", () => {
    expect(getMobileAccountRealtimeInvalidationKeys(TOKEN, "notification_preferences")).toEqual([
      mobileQueryKeys.notificationPreferences(TOKEN),
    ]);
  });

  it("refreshes the notifications inbox, bootstrap, facets, and the deep-link detail fallback on a per-user notification event", () => {
    expect(getMobileAccountRealtimeInvalidationKeys(TOKEN, "notifications")).toEqual([
      mobileQueryKeys.notificationsPrefix(TOKEN),
      ["mobile", "bootstrap"],
      mobileQueryKeys.notificationFacets(TOKEN),
      mobileQueryKeys.notificationDetailPrefix(TOKEN),
    ]);
  });
});
