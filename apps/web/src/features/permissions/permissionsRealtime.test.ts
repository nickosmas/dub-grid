import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { AdminPermissions } from "@/types";
import { buildPerms } from "./shared";

type Listener = { table: string; topic: string; event?: string; onEvent: () => void };
const subscriptions: { listeners: Listener[]; released: boolean }[] = [];

vi.mock("@dubgrid/realtime-core", () => ({
  userTopic: (userId: string) => `user:${userId}`,
  subscribeToTableChanges: (_client: unknown, listeners: Listener[]) => {
    const subscription = { listeners, released: false };
    subscriptions.push(subscription);
    return () => {
      subscription.released = true;
    };
  },
}));
vi.mock("@/features/account/client", () => ({ getBrowserSupabaseClient: () => ({}) }));

const { acquirePermissionsSubscription } = await import("./permissionsRealtime");

const ORG = "org-1";
const USER = "user-1";
const adminPerms = { canEditShifts: true, canPublishSchedule: false } as AdminPermissions;

function wire(perms: ReturnType<typeof buildPerms>) {
  return JSON.parse(JSON.stringify(perms)) as ReturnType<typeof buildPerms>;
}

describe("acquirePermissionsSubscription", () => {
  beforeEach(() => {
    subscriptions.length = 0;
  });

  it("follows the person's own topic once and leaves it with the last consumer", () => {
    const client = new QueryClient();
    const releases = Array.from({ length: 10 }, () => acquirePermissionsSubscription(USER, client));

    expect(subscriptions).toHaveLength(1);
    expect(
      subscriptions[0].listeners.map(({ table, topic, event }) => [table, topic, event]),
    ).toEqual([
      ["organization_memberships", "user:user-1", "UPDATE"],
      ["employees", "user:user-1", "UPDATE"],
    ]);

    releases.slice(0, 9).forEach((release) => release());
    releases[0]();
    expect(subscriptions[0].released).toBe(false);

    releases[9]();
    expect(subscriptions[0].released).toBe(true);
  });

  // A membership update that only stamped Schedule never reaches this topic
  // (migration 140), so every one that does may move the permissions.
  it("refetches the cached permissions on a membership or staff record change", () => {
    const client = new QueryClient();
    const key = queryKeys.account.permissions(USER, ORG);
    const fresh = () =>
      client.setQueryData(key, { permissions: wire(buildPerms("admin", ORG, false, adminPerms)) });
    const isStale = () => client.getQueryState(key)?.isInvalidated;
    fresh();
    const release = acquirePermissionsSubscription(USER, client);
    const [membership, employees] = subscriptions[0].listeners;

    membership.onEvent();
    expect(isStale()).toBe(true);

    fresh();
    employees.onEvent();
    expect(isStale()).toBe(true);

    release();
  });
});
