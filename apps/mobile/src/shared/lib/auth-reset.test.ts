import { beforeEach, describe, expect, it, vi } from "vitest";

const disablePushToken = vi.fn();
const signOutMobileSessions = vi.fn();
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
  disablePushToken: (...args: unknown[]) => disablePushToken(...args),
  signOutMobileSessions: (...args: unknown[]) => signOutMobileSessions(...args),
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

import {
  disablePushForCurrentDevice,
  handleExpiredMobileSession,
  handleRejectedMobileToken,
} from "./auth-reset";

const DEVICE = { expoPushToken: "ExponentPushToken[abc]", platform: "ios" as const };

describe("auth-reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: { access_token: "token-123" } } });
    loadStoredPushDevice.mockResolvedValue(DEVICE);
    disablePushToken.mockResolvedValue(undefined);
    signOut.mockResolvedValue({ error: null });
    signOutMobileSessions.mockResolvedValue({ success: true });
  });

  describe("disablePushForCurrentDevice", () => {
    it("revokes the stored device so a signed-out phone stops receiving pushes", async () => {
      await disablePushForCurrentDevice();

      expect(disablePushToken).toHaveBeenCalledWith("token-123", DEVICE);
    });

    it("no-ops when the session is already gone", async () => {
      getSession.mockResolvedValue({ data: { session: null } });

      await disablePushForCurrentDevice();

      expect(disablePushToken).not.toHaveBeenCalled();
    });

    it("no-ops when this device never registered for push", async () => {
      loadStoredPushDevice.mockResolvedValue(null);

      await disablePushForCurrentDevice();

      expect(disablePushToken).not.toHaveBeenCalled();
    });

    it("swallows a failing revoke so it can never block sign-out", async () => {
      disablePushToken.mockRejectedValue(new Error("offline"));

      await expect(disablePushForCurrentDevice()).resolves.toBeUndefined();
    });
  });

  describe("handleExpiredMobileSession", () => {
    it("revokes push, clears the cache, signs out and returns to login", async () => {
      await handleExpiredMobileSession();

      expect(disablePushToken).toHaveBeenCalled();
      expect(queryClientClear).toHaveBeenCalled();
      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(replaceAuthSession).toHaveBeenCalledWith(null);
      expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
    });

    it("records the revocation in DubGrid before the device drops its token", async () => {
      await handleExpiredMobileSession();

      expect(signOutMobileSessions).toHaveBeenCalledWith("token-123", { scope: "local" });
      expect(signOutMobileSessions.mock.invocationCallOrder[0]).toBeLessThan(
        signOut.mock.invocationCallOrder[0],
      );
    });

    it("still signs out locally when DubGrid can't be reached", async () => {
      signOutMobileSessions.mockRejectedValue(new Error("offline"));

      await handleExpiredMobileSession();

      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
      expect(routerReplace).toHaveBeenCalledWith("/(auth)/login");
    });

    // `skipSignOut` callers have already signed out, so the token is dead by
    // now — they revoke push themselves, before signing out.
    it("skips both sign-out and push revocation when the caller owns them", async () => {
      await handleExpiredMobileSession({ skipSignOut: true });

      expect(signOut).not.toHaveBeenCalled();
      expect(disablePushToken).not.toHaveBeenCalled();
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

  describe("handleRejectedMobileToken", () => {
    it("leaves a newer session alone when a stale request is rejected", async () => {
      getSession.mockResolvedValue({ data: { session: { access_token: "token-new" } } });

      await handleRejectedMobileToken("token-old");

      expect(signOut).not.toHaveBeenCalled();
      expect(queryClientClear).not.toHaveBeenCalled();
      expect(routerReplace).not.toHaveBeenCalled();
    });

    // A teardown already finished; a request that outlived it used to run
    // another and reset a login form the person had started (41d1).
    it("does nothing when no session remains", async () => {
      getSession.mockResolvedValue({ data: { session: null } });

      await handleRejectedMobileToken("token-123");

      expect(signOut).not.toHaveBeenCalled();
      expect(queryClientClear).not.toHaveBeenCalled();
      expect(routerReplace).not.toHaveBeenCalled();
    });

    it("still tears down when the session lookup itself failed", async () => {
      getSession.mockResolvedValue({ data: { session: null }, error: new Error("refresh failed") });

      await handleRejectedMobileToken("token-123");

      expect(queryClientClear).toHaveBeenCalled();
    });

    it("tears down when the rejected token is the live one", async () => {
      getSession.mockResolvedValue({ data: { session: { access_token: "token-123" } } });

      await handleRejectedMobileToken("token-123");

      expect(queryClientClear).toHaveBeenCalled();
    });
  });
});
