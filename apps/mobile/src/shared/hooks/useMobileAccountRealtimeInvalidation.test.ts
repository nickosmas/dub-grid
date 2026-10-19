import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { buildBootstrapQueryKey } from "../../features/auth/hooks/useBootstrap";
import {
  applyMobileNotificationInsert,
  getMobileAccountRealtimeInvalidationKeys,
  getNotificationInsertBootstrapEffect,
} from "../lib/mobile-account-realtime-invalidation";
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

describe("getNotificationInsertBootstrapEffect", () => {
  const unread = { read_at: null, archived_at: null, channel: "in_app", org_id: "org-1" };

  it("counts an unread in-app row for this organization or none", () => {
    expect(getNotificationInsertBootstrapEffect(unread, "org-1")).toBe("increment");
    expect(getNotificationInsertBootstrapEffect({ ...unread, org_id: null }, "org-1")).toBe(
      "increment",
    );
  });

  it("ignores a row inserted read, archived, for another channel or organization", () => {
    expect(
      getNotificationInsertBootstrapEffect(
        { ...unread, read_at: "2026-10-18T00:00:00Z", archived_at: "2026-10-18T00:00:00Z" },
        "org-1",
      ),
    ).toBe("none");
    expect(getNotificationInsertBootstrapEffect({ ...unread, channel: "push" }, "org-1")).toBe(
      "none",
    );
    expect(getNotificationInsertBootstrapEffect(unread, "org-2")).toBe("none");
  });

  it("falls back to a refetch when the row does not say", () => {
    expect(getNotificationInsertBootstrapEffect(undefined, "org-1")).toBe("invalidate");
    expect(getNotificationInsertBootstrapEffect({ id: "n-1" }, "org-1")).toBe("invalidate");
  });
});

describe("applyMobileNotificationInsert", () => {
  const token = tokenFor("user-1", "org-1", "v1");
  const unread = { read_at: null, archived_at: null, channel: "in_app", org_id: "org-1" };

  function clientWithBootstrap(count: number | null) {
    const queryClient = new QueryClient();
    if (count !== null) {
      queryClient.setQueryData(buildBootstrapQueryKey(token), { unreadNotificationCount: count });
    }
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    return { queryClient, invalidateQueries };
  }

  const invalidatedKeys = (spy: {
    mock: { calls: Array<[{ queryKey?: unknown }?, ...unknown[]]> };
  }) => spy.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));

  it("adds one to the cached unread count without refetching bootstrap", () => {
    const { queryClient, invalidateQueries } = clientWithBootstrap(2);

    applyMobileNotificationInsert(queryClient, token, unread);

    expect(queryClient.getQueryData(buildBootstrapQueryKey(token))).toEqual({
      unreadNotificationCount: 3,
    });
    expect(invalidatedKeys(invalidateQueries)).not.toContain(
      JSON.stringify(["mobile", "bootstrap"]),
    );
    expect(invalidatedKeys(invalidateQueries)).toContain(
      JSON.stringify(mobileQueryKeys.notificationsPrefix(token)),
    );
  });

  it("leaves bootstrap alone for a row inserted already read and archived", () => {
    const { queryClient, invalidateQueries } = clientWithBootstrap(2);

    applyMobileNotificationInsert(queryClient, token, {
      ...unread,
      read_at: "2026-10-18T00:00:00Z",
      archived_at: "2026-10-18T00:00:00Z",
    });

    expect(queryClient.getQueryData(buildBootstrapQueryKey(token))).toEqual({
      unreadNotificationCount: 2,
    });
    expect(invalidatedKeys(invalidateQueries)).not.toContain(
      JSON.stringify(["mobile", "bootstrap"]),
    );
  });

  it("refetches bootstrap when there is no cached count to update", () => {
    const { queryClient, invalidateQueries } = clientWithBootstrap(null);

    applyMobileNotificationInsert(queryClient, token, unread);

    expect(invalidatedKeys(invalidateQueries)).toContain(JSON.stringify(["mobile", "bootstrap"]));
  });
});
