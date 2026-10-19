import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { AdminPermissions } from "@/types";
import { buildPerms } from "./shared";

type Handler = (payload: unknown) => void;
const channels: { name: string; table: string; handler: Handler }[] = [];
const removed: string[] = [];

vi.mock("@/features/account/client", () => ({
  createBrowserRealtimeChannel: (name: string) => {
    const channel = {
      name,
      on: (_type: string, filter: { table: string }, handler: Handler) => {
        channels.push({ name, table: filter.table, handler });
        return channel;
      },
      subscribe: () => channel,
    };
    return channel;
  },
  removeBrowserRealtimeChannel: async (channel: { name: string }) => {
    removed.push(channel.name);
  },
}));

const { acquirePermissionsSubscription, membershipUpdateMayChangePermissions } =
  await import("./permissionsRealtime");

const ORG = "org-1";
const USER = "user-1";
// The stored JSONB is often partial; buildPerms fills the rest from the role.
const adminPerms = { canEditShifts: true, canPublishSchedule: false } as AdminPermissions;

function membershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: USER,
    org_id: ORG,
    org_role: "admin",
    admin_permissions: adminPerms,
    archived_at: null,
    schedule_last_viewed_at: "2026-10-18T10:00:00Z",
    ...overrides,
  };
}

function wire(perms: ReturnType<typeof buildPerms>) {
  return JSON.parse(JSON.stringify(perms)) as ReturnType<typeof buildPerms>;
}

describe("membershipUpdateMayChangePermissions", () => {
  const cached = wire(buildPerms("admin", ORG, false, adminPerms));

  it("skips a write that leaves role, grants and archive state as cached", () => {
    expect(membershipUpdateMayChangePermissions(membershipRow(), cached)).toBe(false);
  });

  it("re-resolves when the role, grants or archive state moved", () => {
    expect(membershipUpdateMayChangePermissions(membershipRow({ org_role: "user" }), cached)).toBe(
      true,
    );
    expect(
      membershipUpdateMayChangePermissions(
        membershipRow({ admin_permissions: { ...adminPerms, canPublishSchedule: true } }),
        cached,
      ),
    ).toBe(true);
    expect(
      membershipUpdateMayChangePermissions(
        membershipRow({ archived_at: "2026-10-18T10:00:00Z" }),
        cached,
      ),
    ).toBe(true);
  });

  it("re-resolves whenever the payload or cache cannot prove nothing changed", () => {
    const { admin_permissions: _omitted, ...withoutGrants } = membershipRow();
    expect(membershipUpdateMayChangePermissions(withoutGrants, cached)).toBe(true);
    expect(membershipUpdateMayChangePermissions(membershipRow(), undefined)).toBe(true);
    expect(membershipUpdateMayChangePermissions(undefined, cached)).toBe(true);
    expect(membershipUpdateMayChangePermissions(membershipRow({ org_id: "org-2" }), cached)).toBe(
      true,
    );
    expect(
      membershipUpdateMayChangePermissions(
        membershipRow(),
        wire(buildPerms("admin", ORG, false, adminPerms, false, true)),
      ),
    ).toBe(true);
    expect(
      membershipUpdateMayChangePermissions(
        membershipRow(),
        wire(buildPerms("admin", ORG, false, adminPerms, true)),
      ),
    ).toBe(true);
  });
});

describe("acquirePermissionsSubscription", () => {
  beforeEach(() => {
    channels.length = 0;
    removed.length = 0;
  });

  it("shares one channel pair per user and tears it down with the last consumer", () => {
    const client = new QueryClient();
    const releases = Array.from({ length: 10 }, () => acquirePermissionsSubscription(USER, client));
    expect(channels.map((c) => c.table)).toEqual(["organization_memberships", "employees"]);

    releases.slice(0, 9).forEach((release) => release());
    releases[0]();
    expect(removed).toEqual([]);

    releases[9]();
    expect(removed).toHaveLength(2);
  });

  it("invalidates the cached permissions only when a membership write can move them", () => {
    const client = new QueryClient();
    const key = queryKeys.account.permissions(USER, ORG);
    client.setQueryData(key, { permissions: wire(buildPerms("admin", ORG, false, adminPerms)) });
    const release = acquirePermissionsSubscription(USER, client);
    const isStale = () => client.getQueryState(key)?.isInvalidated;

    const membership = channels.find((c) => c.table === "organization_memberships")!;
    const employees = channels.find((c) => c.table === "employees")!;

    membership.handler({ new: membershipRow() });
    expect(isStale()).toBe(false);

    membership.handler({ new: membershipRow({ org_role: "super_admin" }) });
    expect(isStale()).toBe(true);

    client.setQueryData(key, { permissions: wire(buildPerms("admin", ORG, false, adminPerms)) });
    employees.handler({ new: {} });
    expect(isStale()).toBe(true);

    release();
  });
});
