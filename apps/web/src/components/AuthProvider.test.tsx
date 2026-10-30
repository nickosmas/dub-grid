import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";

const getBrowserAuthSession = vi.fn();
const getVerifiedBrowserAuthUser = vi.fn();
const clearBrowserAuthState = vi.fn();

vi.mock("@/features/account/client", () => ({
  getBrowserAuthSession: () => getBrowserAuthSession(),
  getVerifiedBrowserAuthUser: () => getVerifiedBrowserAuthUser(),
  clearBrowserAuthState: () => clearBrowserAuthState(),
  isRecoverableBrowserAuthFailure: () => false,
  signOutFromBrowser: vi.fn(),
  subscribeToBrowserAuthChanges: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
}));
vi.mock("@/features/account/client/session-registration", () => ({
  createSessionRegistration: () => vi.fn(async () => {}),
  markSessionReported: vi.fn(),
  wasSessionReportedRecently: () => true,
  SessionRegistrationError: class extends Error {},
}));
vi.mock("@/lib/auth-boundary-broadcast", () => ({ listenForBrowserSignOut: () => () => {} }));
vi.mock("@/lib/sentry", () => ({ setSentryUser: vi.fn() }));

import AuthProvider, { serverVouchedUser, useAuth } from "./AuthProvider";

const NOW_MS = 1_800_000_000_000;
const user = { id: "user-1" } as User;

function sessionFor(u: User, expiresAtMs = Date.now() + 3_600_000): Session {
  return {
    access_token: "token",
    refresh_token: "refresh",
    expires_at: Math.floor(expiresAtMs / 1000),
    user: u,
  } as Session;
}

function AuthState() {
  const { user: current, isLoading } = useAuth();
  return <p>{isLoading ? "loading" : (current?.id ?? "signed out")}</p>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("serverVouchedUser", () => {
  const session = sessionFor(user, NOW_MS + 60_000);

  it("vouches for the session's user when the server verified that user", () => {
    expect(serverVouchedUser(session, "user-1", NOW_MS)).toBe(user);
  });

  it("does not vouch for a different user", () => {
    expect(serverVouchedUser(session, "user-2", NOW_MS)).toBeNull();
  });

  it("does not vouch for a token that has expired", () => {
    expect(serverVouchedUser(sessionFor(user, NOW_MS - 1), "user-1", NOW_MS)).toBeNull();
  });

  it("does not vouch without a server answer or a session", () => {
    expect(serverVouchedUser(session, null, NOW_MS)).toBeNull();
    expect(serverVouchedUser(session, undefined, NOW_MS)).toBeNull();
    expect(serverVouchedUser(null, "user-1", NOW_MS)).toBeNull();
  });
});

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrowserAuthSession.mockResolvedValue(sessionFor(user));
  });

  it("shows the server-verified user before the auth server answers", async () => {
    const check = deferred<User | null>();
    getVerifiedBrowserAuthUser.mockReturnValue(check.promise);

    render(
      <AuthProvider serverVerifiedUserId="user-1">
        <AuthState />
      </AuthProvider>,
    );

    expect(await screen.findByText("user-1")).toBeTruthy();
    await act(async () => check.resolve(user));
    expect(screen.getByText("user-1")).toBeTruthy();
  });

  it("signs out when the auth server then rejects the session", async () => {
    const check = deferred<User | null>();
    getVerifiedBrowserAuthUser.mockReturnValue(check.promise);

    render(
      <AuthProvider serverVerifiedUserId="user-1">
        <AuthState />
      </AuthProvider>,
    );

    expect(await screen.findByText("user-1")).toBeTruthy();
    await act(async () => check.resolve(null));
    await waitFor(() => expect(screen.getByText("signed out")).toBeTruthy());
  });

  it("waits for the auth server when the server verified nobody", async () => {
    const check = deferred<User | null>();
    getVerifiedBrowserAuthUser.mockReturnValue(check.promise);

    render(
      <AuthProvider serverVerifiedUserId={null}>
        <AuthState />
      </AuthProvider>,
    );

    await waitFor(() => expect(getVerifiedBrowserAuthUser).toHaveBeenCalled());
    expect(screen.getByText("loading")).toBeTruthy();
    await act(async () => check.resolve(user));
    expect(await screen.findByText("user-1")).toBeTruthy();
  });

  it("waits for the auth server when the cookie holds someone else", async () => {
    const check = deferred<User | null>();
    getVerifiedBrowserAuthUser.mockReturnValue(check.promise);

    render(
      <AuthProvider serverVerifiedUserId="user-2">
        <AuthState />
      </AuthProvider>,
    );

    await waitFor(() => expect(getVerifiedBrowserAuthUser).toHaveBeenCalled());
    expect(screen.getByText("loading")).toBeTruthy();
  });
});
