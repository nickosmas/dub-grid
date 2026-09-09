import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestTimeoutError } from "@/lib/fetch-with-timeout";

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("@/lib/browser-auth", () => ({
  clearSupabaseBrowserAuthState: vi.fn(),
  getBrowserSession: vi.fn(),
  getVerifiedBrowserUser: vi.fn(),
  isRecoverableBrowserAuthError: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { signOut: (...args: unknown[]) => mocks.signOut(...args) },
    channel: vi.fn(),
  },
}));

import { signOutFromBrowser } from "./auth";

describe("signOutFromBrowser recovery", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    mocks.signOut.mockReset();
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
  });
});
