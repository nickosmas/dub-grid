import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { buildBootstrapQueryKey } from "../../auth/hooks/useBootstrap";
import { setBootstrapUnreadCount } from "./unread-cache";

function tokenFor(orgId: string, version: string) {
  const payload = btoa(JSON.stringify({ sub: "user-1", org_id: orgId }));
  return `header.${payload}.${version}`;
}

describe("setBootstrapUnreadCount", () => {
  it("patches the same bootstrap entry after token rotation without touching another organization", () => {
    const queryClient = new QueryClient();
    const first = tokenFor("org-1", "v1");
    const rotated = tokenFor("org-1", "v2");
    const otherOrg = tokenFor("org-2", "v1");
    queryClient.setQueryData(buildBootstrapQueryKey(first), { unreadNotificationCount: 4 });
    queryClient.setQueryData(buildBootstrapQueryKey(otherOrg), { unreadNotificationCount: 9 });

    setBootstrapUnreadCount(queryClient, rotated, 2);

    expect(queryClient.getQueryData(buildBootstrapQueryKey(first))).toEqual({
      unreadNotificationCount: 2,
    });
    expect(queryClient.getQueryData(buildBootstrapQueryKey(otherOrg))).toEqual({
      unreadNotificationCount: 9,
    });
  });
});
