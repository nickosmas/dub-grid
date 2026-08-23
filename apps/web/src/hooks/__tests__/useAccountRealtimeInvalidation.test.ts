import { describe, expect, it } from "vitest";
import { getAccountRealtimeInvalidationKeys } from "../useAccountRealtimeInvalidation";
import { queryKeys } from "@/lib/query-keys";

const USER = "user-1";

describe("getAccountRealtimeInvalidationKeys", () => {
  it("invalidates every account.* variant and bootstrap on profile changes", () => {
    expect(getAccountRealtimeInvalidationKeys(USER, "profiles")).toEqual([
      ["account", USER],
      [...queryKeys.org.bootstrap()],
    ]);
  });

  it("invalidates the session list on user_sessions changes", () => {
    expect(getAccountRealtimeInvalidationKeys(USER, "user_sessions")).toEqual([
      [...queryKeys.account.sessions(USER)],
    ]);
  });

  it("invalidates notification preferences on notification_preferences changes", () => {
    expect(getAccountRealtimeInvalidationKeys(USER, "notification_preferences")).toEqual([
      [...queryKeys.account.notificationPrefs(USER)],
    ]);
  });
});
