/**
 * Tests for the simplified AuthProvider.
 * Verifies: initial session check, auth state changes, sign-out flow.
 */
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ─── Mock account client ─────────────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockGetUser = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignOut = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/features/account/client", () => ({
  clearBrowserAuthState: vi.fn(),
  getBrowserAuthSession: (...args: unknown[]) => mockGetSession(...args),
  getVerifiedBrowserAuthUser: (...args: unknown[]) => mockGetUser(...args),
  isRecoverableBrowserAuthFailure: () => false,
  signOutFromBrowser: (...args: unknown[]) => mockSignOut(...args),
  subscribeToBrowserAuthChanges: (...args: unknown[]) => mockOnAuthStateChange(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import AuthProvider, { useAuth } from "@/components/AuthProvider";

// ─── Test consumers ──────────────────────────────────────────────────────────

function TestConsumer() {
  const { user, session, isLoading, signOut } = useAuth();
  return (
    <div>
      <span data-testid="user">{user?.id ?? "null"}</span>
      <span data-testid="token">{session?.access_token ?? "null"}</span>
      <span data-testid="isLoading">{String(isLoading)}</span>
      <button data-testid="signOut" onClick={signOut} />
    </div>
  );
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fakeUser = { id: "user-123", email: "test@example.com" };
const fakeSession = { user: fakeUser, access_token: "token-abc" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function accessToken(sessionId: string): string {
  return `header.${btoa(JSON.stringify({ session_id: sessionId }))}.signature`;
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  // Default: no session
  mockGetSession.mockResolvedValue(null);
  mockGetUser.mockResolvedValue(null);
  // Default: subscription setup
  mockOnAuthStateChange.mockImplementation(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  }));
  mockSignOut.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AuthProvider — initial session", () => {
  it("starts with isLoading=true, then sets isLoading=false after getSession resolves", async () => {
    mockGetSession.mockResolvedValue(null);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    // isLoading starts true
    expect(screen.getByTestId("isLoading")).toHaveTextContent("true");

    // After getSession resolves, isLoading becomes false
    await waitFor(() => {
      expect(screen.getByTestId("isLoading")).toHaveTextContent("false");
    });
  });

  it("sets user from existing session on mount", async () => {
    mockGetSession.mockResolvedValue(fakeSession);
    mockGetUser.mockResolvedValue(fakeUser);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("user-123");
      expect(screen.getByTestId("isLoading")).toHaveTextContent("false");
    });
  });

  it("sets user to null when getSession returns no session", async () => {
    mockGetSession.mockResolvedValue(null);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("null");
      expect(screen.getByTestId("isLoading")).toHaveTextContent("false");
    });
  });

  it("handles getSession errors gracefully", async () => {
    mockGetSession.mockRejectedValue(new Error("network error"));

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("null");
      expect(screen.getByTestId("isLoading")).toHaveTextContent("false");
    });
  });
});

describe("AuthProvider — auth state changes", () => {
  it("updates user when onAuthStateChange fires SIGNED_IN", async () => {
    let authCallback: (event: string, session: unknown) => void = () => {};
    mockGetUser.mockResolvedValue(fakeUser);

    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("isLoading")).toHaveTextContent("false");
    });

    await act(async () => {
      authCallback("SIGNED_IN", fakeSession);
    });

    expect(screen.getByTestId("user")).toHaveTextContent("user-123");
  });

  it("clears user when onAuthStateChange fires SIGNED_OUT", async () => {
    mockGetSession.mockResolvedValue(fakeSession);
    mockGetUser.mockResolvedValue(fakeUser);

    let authCallback: (event: string, session: unknown) => void = () => {};

    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("user-123");
    });

    await act(async () => {
      authCallback("SIGNED_OUT", null);
    });

    expect(screen.getByTestId("user")).toHaveTextContent("null");
  });

  it("does not let a late initial restore revive a signed-out session", async () => {
    const restored = deferred<typeof fakeSession | null>();
    let authCallback: (event: string, session: unknown) => void = () => {};
    mockGetSession.mockReturnValue(restored.promise);
    mockGetUser.mockResolvedValue(fakeUser);
    mockOnAuthStateChange.mockImplementation(
      (callback: (event: string, session: unknown) => void) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await act(async () => {
      authCallback("SIGNED_OUT", null);
    });
    expect(screen.getByTestId("user")).toHaveTextContent("null");

    await act(async () => {
      restored.resolve(fakeSession);
      await restored.promise;
    });

    expect(screen.getByTestId("user")).toHaveTextContent("null");
    expect(screen.getByTestId("isLoading")).toHaveTextContent("false");
  });

  it("does not let late verification overwrite a newer signed-in user", async () => {
    const oldUser = { id: "user-old", email: "old@example.com" };
    const newUser = { id: "user-new", email: "new@example.com" };
    const oldSession = { user: oldUser, access_token: "token-old" };
    const newSession = { user: newUser, access_token: "token-new" };
    const verification = deferred<typeof oldUser | null>();
    let authCallback: (event: string, session: unknown) => void = () => {};
    mockGetUser.mockReturnValue(verification.promise);
    mockOnAuthStateChange.mockImplementation(
      (callback: (event: string, session: unknown) => void) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("isLoading")).toHaveTextContent("false");
    });

    await act(async () => {
      authCallback("INITIAL_SESSION", oldSession);
      authCallback("SIGNED_IN", newSession);
    });
    expect(screen.getByTestId("user")).toHaveTextContent("user-new");

    await act(async () => {
      verification.resolve(oldUser);
      await verification.promise;
    });

    expect(screen.getByTestId("user")).toHaveTextContent("user-new");
    expect(screen.getByTestId("token")).toHaveTextContent("token-new");
  });

  it("keeps the newest token across repeated refresh events", async () => {
    let authCallback: (event: string, session: unknown) => void = () => {};
    mockOnAuthStateChange.mockImplementation(
      (callback: (event: string, session: unknown) => void) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("isLoading")).toHaveTextContent("false");
    });

    await act(async () => {
      authCallback("TOKEN_REFRESHED", { ...fakeSession, access_token: "token-rotated-1" });
      authCallback("TOKEN_REFRESHED", { ...fakeSession, access_token: "token-rotated-2" });
    });

    expect(screen.getByTestId("user")).toHaveTextContent("user-123");
    expect(screen.getByTestId("token")).toHaveTextContent("token-rotated-2");
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("registers one restored session when overlapping auth events carry the same session id", async () => {
    const trackedSession = {
      ...fakeSession,
      access_token: accessToken("restored-session"),
      refresh_token: "refresh-token",
    };
    let authCallback: (event: string, session: unknown) => void = () => {};
    mockGetSession.mockResolvedValue(trackedSession);
    mockGetUser.mockResolvedValue(fakeUser);
    mockOnAuthStateChange.mockImplementation(
      (callback: (event: string, session: unknown) => void) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("user-123");
    });

    await act(async () => {
      authCallback("SIGNED_IN", trackedSession);
      authCallback("TOKEN_REFRESHED", trackedSession);
    });

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.filter(([url]) => url === "/api/auth/track-session"),
      ).toHaveLength(1);
    });
  });
});

describe("AuthProvider — signOut", () => {
  it("calls account client signOut when signOut is invoked", async () => {
    mockGetSession.mockResolvedValue(fakeSession);
    mockGetUser.mockResolvedValue(fakeUser);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("user")).toHaveTextContent("user-123");
    });

    await act(async () => {
      screen.getByTestId("signOut").click();
    });

    expect(mockSignOut).toHaveBeenCalled();
  });
});

describe("AuthProvider — subscription cleanup", () => {
  it("unsubscribes from onAuthStateChange on unmount", async () => {
    const unsubscribe = vi.fn();
    mockOnAuthStateChange.mockImplementation(() => ({
      data: { subscription: { unsubscribe } },
    }));

    const { unmount } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("isLoading")).toHaveTextContent("false");
    });

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
