import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestTimeoutError } from "@/lib/fetch-with-timeout";

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), getSession: vi.fn(), clear: vi.fn() }));

vi.mock("@/lib/browser-auth", () => ({
  clearSupabaseBrowserAuthState: mocks.clear,
  getBrowserSession: mocks.getSession,
  getVerifiedBrowserUser: vi.fn(),
  isRecoverableBrowserAuthError: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signOut: (...args: unknown[]) => mocks.signOut(...args) },
    channel: vi.fn(),
  },
}));

import { completeBrowserPasswordRecovery, signOutFromBrowser } from "./auth";

describe("signOutFromBrowser recovery", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    mocks.signOut.mockReset();
    mocks.getSession.mockResolvedValue({ access_token: "exact-token" });
    mocks.clear.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not remain pending forever when the auth provider stalls", async () => {
    vi.useFakeTimers();
    mocks.signOut.mockReturnValue(new Promise(() => {}));
    const request = signOutFromBrowser("local");
    const assertion = expect(request).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.clear).toHaveBeenCalledOnce();
  });

  it("sends others unchanged and never invokes the browser SDK's bulk bypass", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await signOutFromBrowser("others");
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer exact-token" }),
        body: JSON.stringify({ scope: "others" }),
      }),
    );
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("propagates structured step-up denial without any provider bulk call", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "Confirm", code: "STEP_UP_REQUIRED", method: "totp" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(signOutFromBrowser("others")).rejects.toMatchObject({
      status: 403,
      code: "STEP_UP_REQUIRED",
      method: "totp",
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("still exits locally when legacy global sign-out is denied, without claiming bulk success", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Confirm", code: "STEP_UP_REQUIRED", method: "password" }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(signOutFromBrowser("global")).rejects.toMatchObject({
      status: 403,
      code: "STEP_UP_REQUIRED",
    });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(mocks.clear).toHaveBeenCalledOnce();
  });

  it("completes recovery through the dedicated global revocation path and clears locally", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true })));

    await completeBrowserPasswordRecovery();

    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ scope: "global", reason: "password_recovery" }),
      }),
    );
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
});
