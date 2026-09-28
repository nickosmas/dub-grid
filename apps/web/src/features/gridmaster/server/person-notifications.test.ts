import { describe, expect, it, vi } from "vitest";
import { loadPersonNotifications, RECENT_NOTIFICATION_LIMIT } from "./person-notifications";

const USER_ID = "user-1";

function makeClient(tables: Record<string, unknown>) {
  const calls: Record<string, Array<[string, ...unknown[]]>> = {};
  const client = {
    from: vi.fn((table: string) => {
      const recorded = (calls[table] ??= []);
      const value = tables[table];
      const chain: Record<string, unknown> = {
        maybeSingle: () => Promise.resolve({ data: value ?? null, error: null }),
        then: (resolve: (result: unknown) => unknown) =>
          Promise.resolve({ data: Array.isArray(value) ? value : [], error: null }).then(resolve),
      };
      for (const op of ["select", "eq", "order", "limit"]) {
        chain[op] = (...args: unknown[]) => {
          recorded.push([op, ...args]);
          return chain;
        };
      }
      return chain;
    }),
  };
  return { client, calls };
}

describe("loadPersonNotifications", () => {
  it("returns the stored preferences and the notifications, newest first and capped", async () => {
    const { client, calls } = makeClient({
      notification_preferences: { prefs: { shift_requests: { push: false, email: true } } },
      notifications: [
        {
          id: "n-1",
          org_id: "org-1",
          type: "shift_request_approved",
          channel: "in_app",
          category: "requests",
          priority: "normal",
          title: "Swap approved",
          message: "Your swap was approved.",
          metadata: { requestId: "req-1" },
          read_at: null,
          archived_at: null,
          created_at: "2026-09-26T10:00:00.000Z",
        },
      ],
    });

    const result = await loadPersonNotifications(client as never, USER_ID);

    expect(result.preferences).toEqual({ shift_requests: { push: false, email: true } });
    expect(result.notifications).toEqual([
      {
        id: "n-1",
        orgId: "org-1",
        type: "shift_request_approved",
        channel: "in_app",
        category: "requests",
        priority: "normal",
        title: "Swap approved",
        message: "Your swap was approved.",
        metadata: null,
        readAt: null,
        archivedAt: null,
        createdAt: "2026-09-26T10:00:00.000Z",
      },
    ]);
    expect(calls.notifications).toEqual(
      expect.arrayContaining([
        ["eq", "user_id", USER_ID],
        ["order", "created_at", { ascending: false }],
        ["limit", RECENT_NOTIFICATION_LIMIT],
      ]),
    );
    expect(RECENT_NOTIFICATION_LIMIT).toBe(50);
    expect(calls.notification_preferences).toEqual(
      expect.arrayContaining([["eq", "user_id", USER_ID]]),
    );
  });

  it("reports no preferences for a person who never saved any, and an empty inbox", async () => {
    const { client } = makeClient({});

    expect(await loadPersonNotifications(client as never, USER_ID)).toEqual({
      preferences: null,
      notifications: [],
    });
  });

  it("keeps no IP address or session id from a new-device alert (F-86)", async () => {
    const { client } = makeClient({
      notifications: [
        {
          id: "n-2",
          org_id: null,
          type: "security_new_device",
          channel: "email",
          title: "New sign-in",
          message: "",
          metadata: {
            platform: "web",
            browserName: "Safari",
            ipAddress: "203.0.113.9",
            dedupe_key: "security_new_device:session-1",
            email_sent: true,
          },
          created_at: "2026-09-26T10:00:00.000Z",
        },
      ],
    });

    const { notifications } = await loadPersonNotifications(client as never, USER_ID);

    expect(notifications[0].metadata).toEqual({
      platform: "web",
      browserName: "Safari",
      email_sent: true,
    });
  });
});
