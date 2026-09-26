import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setSession: vi.fn(),
  signOut: vi.fn(),
  clear: vi.fn(),
  broadcast: vi.fn(),
}));

vi.mock("@/lib/browser-auth", () => ({
  clearSupabaseBrowserAuthState: mocks.clear,
  getBrowserSession: vi.fn(),
  getVerifiedBrowserUser: vi.fn(),
  isRecoverableBrowserAuthError: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      setSession: (...args: unknown[]) => mocks.setSession(...args),
      signOut: (...args: unknown[]) => mocks.signOut(...args),
    },
  },
}));
vi.mock("@/lib/auth-boundary-broadcast", () => ({
  broadcastBrowserSignOut: mocks.broadcast,
}));

import { syncBrowserSessionInBackground } from "./auth";

const SESSION = { access_token: "access", refresh_token: "refresh" };

describe("syncBrowserSessionInBackground", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    mocks.setSession.mockReset();
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    mocks.clear.mockClear();
    mocks.broadcast.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("hands the session to the auth client and leaves it signed in", async () => {
    mocks.setSession.mockResolvedValue({ data: {}, error: null });

    await syncBrowserSessionInBackground(SESSION);

    expect(mocks.setSession).toHaveBeenCalledExactlyOnceWith(SESSION);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it("signs out when the auth client refuses the session", async () => {
    mocks.setSession.mockResolvedValue({ data: {}, error: new Error("invalid JWT") });

    await syncBrowserSessionInBackground(SESSION);

    expect(fetch).toHaveBeenCalledWith("/api/auth/sign-out", expect.anything());
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.broadcast).toHaveBeenCalledOnce();
  });

  it("settles even when that sign-out stalls, having cleared the browser's state", async () => {
    vi.useFakeTimers();
    mocks.setSession.mockResolvedValue({ data: {}, error: new Error("invalid JWT") });
    mocks.signOut.mockReturnValue(new Promise(() => {}));

    const sync = syncBrowserSessionInBackground(SESSION);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(sync).resolves.toBeUndefined();
    expect(mocks.clear).toHaveBeenCalledOnce();
  });
});
