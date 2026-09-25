import { describe, expect, it, vi } from "vitest";
import {
  deliverMobilePushNotifications,
  isAccountWidePushType,
  type MobileExpoPushMessage,
} from "./push";

const payload = { title: "New sign-in", body: "A new device signed in.", data: {} };

function deps(rows: string[]) {
  return {
    fetchPushTokens: vi.fn(async () => rows.map((expo_push_token) => ({ expo_push_token }))),
    sendMessages: vi.fn(async (_messages: MobileExpoPushMessage[]) => ({ ok: true, status: 200 })),
  };
}

describe("deliverMobilePushNotifications", () => {
  it("treats every security type as account-wide and nothing else", () => {
    expect(isAccountWidePushType("security_new_device")).toBe(true);
    expect(isAccountWidePushType("security_mfa_changed")).toBe(true);
    expect(isAccountWidePushType("schedule_published")).toBe(false);
  });

  it("reaches every device on the account once, even with no organization", async () => {
    const d = deps(["token-a", "token-b", "token-a"]);

    await deliverMobilePushNotifications(
      { userId: "user-1", orgId: null, payload, accountWide: true },
      d,
    );

    expect(d.fetchPushTokens).toHaveBeenCalledWith({ userId: "user-1", orgId: null });
    const sent = d.sendMessages.mock.calls[0]?.[0] ?? [];
    expect(sent.map((message) => message.to)).toEqual(["token-a", "token-b"]);
  });

  it("ignores the event's organization for an account-wide push", async () => {
    const d = deps(["token-a"]);

    await deliverMobilePushNotifications(
      { userId: "user-1", orgId: "org-1", payload, accountWide: true },
      d,
    );

    expect(d.fetchPushTokens).toHaveBeenCalledWith({ userId: "user-1", orgId: null });
  });

  it("keeps other pushes scoped to the event's organization", async () => {
    const d = deps(["token-a"]);

    await deliverMobilePushNotifications({ userId: "user-1", orgId: "org-1", payload }, d);
    expect(d.fetchPushTokens).toHaveBeenCalledWith({ userId: "user-1", orgId: "org-1" });

    d.fetchPushTokens.mockClear();
    await deliverMobilePushNotifications({ userId: "user-1", orgId: null, payload }, d);
    expect(d.fetchPushTokens).not.toHaveBeenCalled();
  });
});
