import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
  },
}));

import {
  clearSupabaseBrowserAuthState,
  getBrowserSession,
  getVerifiedBrowserAuth,
  getVerifiedBrowserUser,
  isRecoverableBrowserAuthError,
} from "@/lib/browser-auth";

describe("browser auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = "sb-test-auth-token=; Max-Age=0; path=/";
  });

  it("treats missing-session getUser errors as anonymous visitors", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: {
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
        status: 400,
      },
    });

    await expect(getVerifiedBrowserUser()).resolves.toBeNull();
  });

  it("treats missing-session getSession errors as no session", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: {
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
        status: 400,
      },
    });

    await expect(getBrowserSession()).resolves.toBeNull();
  });

  it("treats stale refresh token errors as a recoverable anonymous session", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: {
        name: "AuthApiError",
        message: "Invalid Refresh Token: Refresh Token Not Found",
        status: 400,
      },
    });

    await expect(getBrowserSession()).resolves.toBeNull();
  });

  it("returns a null auth payload when the browser has no session", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: {
        name: "AuthSessionMissingError",
        message: "Auth session missing!",
        status: 400,
      },
    });

    await expect(getVerifiedBrowserAuth()).resolves.toEqual({
      session: null,
      user: null,
    });
  });

  it("still rethrows real auth errors", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error("network error"),
    });

    await expect(getVerifiedBrowserUser()).rejects.toThrow("network error");
  });

  it("flags stale refresh token errors as recoverable", () => {
    expect(
      isRecoverableBrowserAuthError({
        name: "AuthApiError",
        message: "Invalid Refresh Token: Refresh Token Not Found",
        status: 400,
      }),
    ).toBe(true);
  });

  it("clears persisted Supabase auth keys from storage and cookies", () => {
    window.localStorage.setItem("sb-test-auth-token", "local");
    window.sessionStorage.setItem("sb-test-code-verifier", "session");
    document.cookie = "sb-test-auth-token=cookie-value; path=/";

    clearSupabaseBrowserAuthState();

    expect(window.localStorage.getItem("sb-test-auth-token")).toBeNull();
    expect(window.sessionStorage.getItem("sb-test-code-verifier")).toBeNull();
    expect(document.cookie).not.toContain("sb-test-auth-token=");
  });
});
