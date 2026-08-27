import { beforeEach, describe, expect, it, vi } from "vitest";

const registerPushToken = vi.fn();
const loadStoredPushDevice = vi.fn();
const getSession = vi.fn();
const signOut = vi.fn();
const replaceAuthSession = vi.fn();
const routerReplace = vi.fn();
const queryClientClear = vi.fn();

vi.mock("expo-router", () => ({
  router: { replace: (...args: unknown[]) => routerReplace(...args) },
}));

vi.mock("../providers/AuthSessionProvider", () => ({
  replaceAuthSession: (...args: unknown[]) => replaceAuthSession(...args),
}));

vi.mock("./api", () => ({
  registerPushToken: (...args: unknown[]) => registerPushToken(...args),
}));

vi.mock("./query-client", () => ({
  queryClient: { clear: (...args: unknown[]) => queryClientClear(...args) },
}));

vi.mock("./session", () => ({
  loadStoredPushDevice: (...args: unknown[]) => loadStoredPushDevice(...args),
}));

vi.mock("./supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      signOut: (...args: unknown[]) => signOut(...args),
    },
  }),
}));

import { disablePushForCurrentDevice, handleExpiredMobileSession } from "./auth-reset";

const DEVICE = { expoPushToken: "ExponentPushToken[abc]", platform: "ios" as const };

describe("auth-reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    loadStoredPushDevice.mockResolvedValue(DEVICE);
    registerPushToken.mockResolvedValue(undefined);
    signOut.mockResolvedValue({ error: null });
  });

  describe("disablePushForCurrentDevice", () => {
    it("revokes the stored device so a signed-out phone stops receiving pushes", async () => {
      await disablePushForCurrentDevice();

      expect(registerPushToken).toHaveBeenCalledWith("token-123", { ...DEVICE, disabled: true });
    });

    it("no-ops when the session is already gone", async () => {
      getSession.mockResolvedValue({ data: { session: null } });

      await disablePushForCurrentDevice();

      expect(registerPushToken).not.toHaveBeenCalled();
    });

    it("no-ops when this device never registered for push", async () => {
      loadStoredPushDevice.mockResolvedValue(null);

      await disablePushForCurrentDevice();

      expect(registerPushToken).not.toHaveBeenCalled();
    });

    it("swallows a failing revoke so it can never block sign-out", async () => {
      registerPushToken.mockRejectedValue(new Error("offline"));

      await expect(disablePushForCurrentDevice()).resolves.toBeUndefined();
    });
  });

  describe("handleExpiredMobileSession", () => {
    it("revokes push, clears the cache, signs out and returns to login", async () => {
      await handleExpiredMobileSession();

      expect(registerPushToken).toHaveBeenCalled();
      expect(queryClientClear).toHaveBeenCalled();
      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(replaceAuthSession).toHaveBeenCalledWith(null);
      expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
    });

    // `skipSignOut` callers have already signed out, so the token is dead by
    // now — they revoke push themselves, before signing out.
    it("skips both sign-out and push revocation when the caller owns them", async () => {
      await handleExpiredMobileSession({ skipSignOut: true });

      expect(signOut).not.toHaveBeenCalled();
      expect(registerPushToken).not.toHaveBeenCalled();
      expect(queryClientClear).toHaveBeenCalled();
      expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
    });

    it("de-dupes concurrent resets into a single teardown", async () => {
      await Promise.all([handleExpiredMobileSession(), handleExpiredMobileSession()]);

      expect(signOut).toHaveBeenCalledTimes(1);
      expect(routerReplace).toHaveBeenCalledTimes(1);
    });

    it("still completes the reset when local sign-out throws", async () => {
      signOut.mockRejectedValue(new Error("nope"));

      await handleExpiredMobileSession();

      expect(replaceAuthSession).toHaveBeenCalledWith(null);
      expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
    });

    it("still returns to login when local sign-out never settles", async () => {
      vi.useFakeTimers();
      try {
        signOut.mockImplementation(() => new Promise(() => {}));

        const reset = handleExpiredMobileSession();
        await vi.advanceTimersByTimeAsync(5_000);
        await reset;

        expect(replaceAuthSession).toHaveBeenCalledWith(null);
        expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
