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

vi.mock("@/lib/sentry", () => ({
  captureMessage: vi.fn(),
  setTag: vi.fn(),
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

  it("recovers from 'Lock stolen' error on getSession by retrying", async () => {
    mockGetSession
      .mockResolvedValueOnce({
        data: { session: null },
        error: {
          name: "Error",
          message: "Lock 'lock:sb-127-auth-token' was released because another request stole it",
        },
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: "abc" } },
        error: null,
      });

    const result = await getBrowserSession();
    expect(result).toEqual({ access_token: "abc" });
    expect(mockGetSession).toHaveBeenCalledTimes(2);
  });

  it("retries a getUser request that never reached the auth server", async () => {
    vi.useFakeTimers();
    try {
      const networkFailure = {
        data: { user: null },
        error: { name: "AuthRetryableFetchError", message: "NetworkError", status: 0 },
      };
      mockGetUser
        .mockResolvedValueOnce(networkFailure)
        .mockResolvedValueOnce(networkFailure)
        .mockResolvedValueOnce({ data: { user: { id: "u-1" } }, error: null });

      const result = getVerifiedBrowserUser();
      await vi.runAllTimersAsync();

      await expect(result).resolves.toEqual({ id: "u-1" });
      expect(mockGetUser).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still fails when the auth server stays unreachable", async () => {
    vi.useFakeTimers();
    try {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { name: "AuthRetryableFetchError", message: "NetworkError", status: 0 },
      });

      const result = getVerifiedBrowserUser();
      const settled = expect(result).rejects.toMatchObject({ name: "AuthRetryableFetchError" });
      await vi.runAllTimersAsync();

      await settled;
      expect(mockGetUser).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry an answer from the auth server", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { name: "AuthApiError", message: "invalid JWT", status: 401 },
    });

    await expect(getVerifiedBrowserUser()).rejects.toMatchObject({ status: 401 });
    expect(mockGetUser).toHaveBeenCalledTimes(1);
  });

  it("recovers from 'Lock broken with steal option' AbortError on getUser", async () => {
    mockGetUser
      .mockResolvedValueOnce({
        data: { user: null },
        error: {
          name: "AbortError",
          message: "Lock broken by another request with the 'steal' option.",
        },
      })
      .mockResolvedValueOnce({
        data: { user: { id: "u-1" } },
        error: null,
      });

    const result = await getVerifiedBrowserUser();
    expect(result).toEqual({ id: "u-1" });
    expect(mockGetUser).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent getBrowserSession callers onto a single underlying call", async () => {
    mockGetSession.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: { session: { access_token: "abc" } },
                error: null,
              }),
            10,
          ),
        ),
    );

    const [a, b, c] = await Promise.all([
      getBrowserSession(),
      getBrowserSession(),
      getBrowserSession(),
    ]);

    expect(a).toEqual({ access_token: "abc" });
    expect(b).toEqual({ access_token: "abc" });
    expect(c).toEqual({ access_token: "abc" });
    // Three concurrent callers, one underlying SDK call.
    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent getVerifiedBrowserUser callers onto a single underlying call", async () => {
    mockGetUser.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: { user: { id: "u-1" } }, error: null }), 10),
        ),
    );

    const [a, b] = await Promise.all([getVerifiedBrowserUser(), getVerifiedBrowserUser()]);

    expect(a).toEqual({ id: "u-1" });
    expect(b).toEqual({ id: "u-1" });
    expect(mockGetUser).toHaveBeenCalledTimes(1);
  });

  it("calls getSession then getUser sequentially (not in parallel)", async () => {
    const order: string[] = [];

    mockGetSession.mockImplementation(() => {
      order.push("session:start");
      return new Promise((resolve) =>
        setTimeout(() => {
          order.push("session:end");
          resolve({
            data: { session: { access_token: "abc" } },
            error: null,
          });
        }, 10),
      );
    });

    mockGetUser.mockImplementation(() => {
      order.push("user:start");
      return new Promise((resolve) =>
        setTimeout(() => {
          order.push("user:end");
          resolve({ data: { user: { id: "u-1" } }, error: null });
        }, 10),
      );
    });

    await getVerifiedBrowserAuth();

    // Sequential — user does not start until session has fully resolved.
    expect(order).toEqual(["session:start", "session:end", "user:start", "user:end"]);
  });

  it("clearSupabaseBrowserAuthState releases the in-flight dedupe slots so a hung call can't deadlock future callers", async () => {
    // Simulate the stale-cookie hang: first getSession() never resolves.
    let neverResolve!: () => void;
    mockGetSession.mockImplementationOnce(
      () =>
        new Promise(() => {
          // Held forever — this is the hung promise.
          neverResolve = () => {};
        }),
    );

    // Kick off the hung call; intentionally do NOT await it.
    const hungPromise = getBrowserSession();

    // The slot is now occupied by the hung promise. Without clearing it,
    // any subsequent caller would await `hungPromise` forever.
    clearSupabaseBrowserAuthState();

    // Now a fresh caller should get a brand-new underlying SDK call, not
    // the hung one.
    mockGetSession.mockResolvedValueOnce({
      data: { session: { access_token: "fresh" } },
      error: null,
    });
    const fresh = await getBrowserSession();
    expect(fresh).toEqual({ access_token: "fresh" });
    expect(mockGetSession).toHaveBeenCalledTimes(2);

    // The hung promise stays alive but is now orphaned; tests don't care.
    expect(hungPromise).toBeInstanceOf(Promise);
    // Reference neverResolve so its assignment isn't dead-code-eliminated.
    expect(typeof neverResolve).toBe("function");
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

  it.each([
    ["http://localhost:3000", []],
    ["http://calmhaven.localhost:3000", []],
    ["http://127.0.0.1:3000", []],
    ["http://[::1]:3000", []],
    [
      "https://acme.dubgrid.com",
      ["acme.dubgrid.com", ".acme.dubgrid.com", "dubgrid.com", ".dubgrid.com"],
    ],
    ["https://dubgrid.com", ["dubgrid.com", ".dubgrid.com"]],
    ["https://preview.vercel.app", ["preview.vercel.app", ".preview.vercel.app"]],
  ])("only attempts valid auth-cookie deletion scopes on %s", (href, domains) => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { value: new URL(href), configurable: true });
    const readCookie = vi
      .spyOn(document, "cookie", "get")
      .mockReturnValue("sb-test-auth-token=secret; preference=keep");
    const writeCookie = vi.spyOn(document, "cookie", "set").mockImplementation(() => {});
    try {
      clearSupabaseBrowserAuthState();
      expect(writeCookie.mock.calls.map(([value]) => value)).toEqual([
        "sb-test-auth-token=; Max-Age=0; path=/",
        ...domains.map((domain) => `sb-test-auth-token=; Max-Age=0; path=/; domain=${domain}`),
      ]);
    } finally {
      readCookie.mockRestore();
      writeCookie.mockRestore();
      Object.defineProperty(window, "location", { value: originalLocation, configurable: true });
    }
  });
});
