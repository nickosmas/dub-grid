import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CookieToSet = { name: string; value: string; options: Record<string, unknown> };

const setSession = vi.fn();
let cookieMethods: {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: CookieToSet[]) => void;
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: typeof cookieMethods }) => {
    cookieMethods = options.cookies;
    return { auth: { setSession: (...args: unknown[]) => setSession(...args) } };
  },
}));

vi.mock("@/lib/logger", () => ({ default: { warn: vi.fn() } }));

import { authCookiesForSession } from "./session-cookies";

const SESSION = { access_token: "access", refresh_token: "refresh" };
const AUTH_COOKIE: CookieToSet = {
  name: "sb-example-auth-token",
  value: "base64-session",
  options: { path: "/", sameSite: "lax", httpOnly: false, maxAge: 34_560_000 },
};

function request(cookie?: string) {
  return new NextRequest("https://calmhaven.example.com/api/auth/login", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
}

describe("authCookiesForSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "anon-key";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the cookies the auth client writes for the session", async () => {
    setSession.mockImplementationOnce(async () => {
      cookieMethods.setAll([AUTH_COOKIE]);
      return { error: null };
    });

    await expect(authCookiesForSession(request(), SESSION)).resolves.toEqual([AUTH_COOKIE]);
    expect(setSession).toHaveBeenCalledExactlyOnceWith(SESSION);
  });

  it("reads the request's cookies so stale chunks of an earlier session are cleared", async () => {
    setSession.mockImplementationOnce(async () => {
      cookieMethods.setAll([AUTH_COOKIE]);
      return { error: null };
    });

    await authCookiesForSession(request("sb-example-auth-token.1=old-chunk"), SESSION);

    expect(cookieMethods.getAll()).toEqual([
      expect.objectContaining({ name: "sb-example-auth-token.1", value: "old-chunk" }),
    ]);
  });

  it("returns null when the auth server refuses the session", async () => {
    setSession.mockResolvedValueOnce({ error: new Error("invalid JWT") });

    await expect(authCookiesForSession(request(), SESSION)).resolves.toBeNull();
  });

  it("returns null when the auth server does not answer in time", async () => {
    vi.useFakeTimers();
    setSession.mockReturnValueOnce(new Promise(() => {}));

    const result = authCookiesForSession(request(), SESSION);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(result).resolves.toBeNull();
  });

  it("returns null when nothing was written", async () => {
    setSession.mockResolvedValueOnce({ error: null });

    await expect(authCookiesForSession(request(), SESSION)).resolves.toBeNull();
  });
});
