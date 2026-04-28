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

vi.mock("@/features/account/client", () => ({
  clearBrowserAuthState: vi.fn(),
  getBrowserAuthSession: (...args: unknown[]) => mockGetSession(...args),
  getVerifiedBrowserAuthUser: (...args: unknown[]) => mockGetUser(...args),
  isRecoverableBrowserAuthFailure: () => false,
  signOutFromBrowser: (...args: unknown[]) => mockSignOut(...args),
  subscribeToBrowserAuthChanges: (...args: unknown[]) =>
    mockOnAuthStateChange(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import AuthProvider, { useAuth } from "@/components/AuthProvider";

// ─── Test consumers ──────────────────────────────────────────────────────────

function TestConsumer() {
  const { user, isLoading, signOut } = useAuth();
  return (
    <div>
      <span data-testid="user">{user?.id ?? "null"}</span>
      <span data-testid="isLoading">{String(isLoading)}</span>
      <button data-testid="signOut" onClick={signOut} />
    </div>
  );
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const fakeUser = { id: "user-123", email: "test@example.com" };
const fakeSession = { user: fakeUser, access_token: "token-abc" };

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
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
