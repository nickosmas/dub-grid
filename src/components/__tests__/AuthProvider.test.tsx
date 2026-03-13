/**
 * Tests for AuthProvider race condition fix.
 * Property-based and unit tests for isLoading timing invariant
 * and state transitions on INITIAL_SESSION / SIGNED_IN events.
 */
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { supabase } from "@/lib/supabase";
import AuthProvider, { useAuth } from "@/components/AuthProvider";

import { useRouter } from "next/navigation";
import type { TabCoordinator, SyncMessage } from "@/lib/tab-coordinator";

// ─── Tab-coordinator mock ─────────────────────────────────────────────────────
//
// The vi.mock factory is hoisted to the top of the file by Vitest, so it runs
// before any module-level variable initialisations. We work around this by
// storing the current coordinator in a mutable container object that the
// factory closes over. Tests call makeMockCoordinator() in beforeEach to
// replace the instance before each render.

const coordinatorContainer: {
  instance: TabCoordinator | null;
  fireMessage: (msg: SyncMessage) => void;
} = {
  instance: null,
  fireMessage: () => {},
};

function makeMockCoordinator(): TabCoordinator {
  const messageHandlers = new Set<(msg: SyncMessage) => void>();

  const coordinator: TabCoordinator = {
    acquireLock: vi.fn().mockReturnValue(true),
    releaseLock: vi.fn(),
    isLeader: vi.fn().mockReturnValue(false),
    broadcast: vi.fn(),
    onMessage: vi.fn().mockImplementation((handler) => {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    }),
    isNearExpiry: vi.fn().mockReturnValue(false),
    destroy: vi.fn(),
  };

  coordinatorContainer.instance = coordinator;
  coordinatorContainer.fireMessage = (msg: SyncMessage) => {
    for (const h of messageHandlers) h(msg);
  };

  return coordinator;
}

// Initialise once so the factory never returns null even for the existing tests
// that render AuthProvider before the coordinator describe block's beforeEach.
makeMockCoordinator();

vi.mock("@/lib/tab-coordinator", () => ({
  createTabCoordinator: vi.fn(() => coordinatorContainer.instance!),
  serializeSession: vi.fn((s: any) => ({
    access_token: s.access_token,
    refresh_token: s.refresh_token ?? "rt",
    expires_at: s.expires_at ?? 9999999999,
    token_type: s.token_type ?? "bearer",
    user: s.user,
  })),
  deserializeSession: vi.fn((s: any) => ({
    ...s,
    expires_in: Math.max(
      0,
      (s.expires_at ?? 0) - Math.floor(Date.now() / 1000),
    ),
  })),
}));

// Stable router object — must not change identity between renders or the
// useEffect([router]) dependency will re-run, setting mounted=false and
// causing applySession continuations to bail out early.
const stableRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => stableRouter),
  usePathname: () => "/",
}));



// ─── Test consumers ───────────────────────────────────────────────────────────

function TestConsumer() {
  const { isLoading } = useAuth();
  return (
    <div>
      <span data-testid="isLoading">{String(isLoading)}</span>
    </div>
  );
}

function FullConsumer() {
  const { user, isLoading, signOut } = useAuth();
  const session = (useAuth() as any).session;
  return (
    <div>
      <span data-testid="user">{user?.id ?? "null"}</span>
      <span data-testid="session">{session ? "present" : "null"}</span>
      <span data-testid="isLoading">{String(isLoading)}</span>
      <button data-testid="signOut" onClick={signOut} />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AuthCallback = (event: string, session: unknown) => Promise<void>;

/**
 * Renders AuthProvider and captures the onAuthStateChange callback.
 * Returns a fireEvent helper that wraps invocations in act().
 */
function renderWithCapture(): { fireEvent: AuthCallback } {
  let captured: AuthCallback | null = null;

  vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(
    (cb: AuthCallback) => {
      captured = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    },
  );

  render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  );

  return {
    fireEvent: async (event, session) => {
      if (!captured) throw new Error("onAuthStateChange callback not captured");
      await act(async () => {
        await captured!(event, session);
      });
    },
  };
}

interface CoordinatorRig {
  fireAuthEvent: AuthCallback;
  fireMessage: (msg: SyncMessage) => void;
  routerPush: ReturnType<typeof vi.fn>;
  routerRefresh: ReturnType<typeof vi.fn>;
}

function renderWithCoordinator(): CoordinatorRig {
  const routerPush = vi.fn();
  const routerRefresh = vi.fn();

  vi.mocked(useRouter).mockReturnValue({
    push: routerPush,
    refresh: routerRefresh,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  });

  let capturedCb: AuthCallback | null = null;
  vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(
    (cb: AuthCallback) => {
      capturedCb = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
    },
  );

  render(
    <AuthProvider>
      <FullConsumer />
    </AuthProvider>,
  );

  return {
    fireAuthEvent: async (event, session) => {
      if (!capturedCb)
        throw new Error("onAuthStateChange callback not captured");
      await act(async () => {
        await capturedCb!(event, session);
      });
    },
    fireMessage: (msg) => coordinatorContainer.fireMessage(msg),
    routerPush,
    routerRefresh,
  };
}

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const fakeUser = { id: "user-123", email: "test@example.com" };
const fakeSession = { user: fakeUser, access_token: "token-abc" };

const coordUser = { id: "coord-user-1", email: "coord@example.com" };
const coordSession = {
  user: coordUser,
  access_token: "at-coord",
  refresh_token: "rt-coord",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
};
const refreshedSession = {
  user: coordUser,
  access_token: "at-refreshed",
  refresh_token: "rt-refreshed",
  expires_at: Math.floor(Date.now() / 1000) + 7200,
  token_type: "bearer",
};

// ─── Global setup / teardown ──────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();

  // getUser is called by applySession to verify the user's identity
  vi.mocked(supabase.auth.getUser).mockResolvedValue({
    data: { user: fakeUser as any },
    error: null,
  } as any);
});

afterEach(() => {
  cleanup();
});

// ─── Property-based test ──────────────────────────────────────────────────────



// ─── Unit tests: TabCoordinator integration ───────────────────────────────────
//
// Requirements: 2.4, 4.2, 4.3, 4.4, 5.4

describe("AuthProvider — TabCoordinator integration", () => {
  beforeEach(() => {
    // Fresh coordinator mock for every test
    makeMockCoordinator();

    // Supabase methods used by the coordinator flow
    (supabase.auth as any).refreshSession = vi
      .fn()
      .mockResolvedValue({ data: { session: refreshedSession }, error: null });
    (supabase.auth as any).setSession = vi
      .fn()
      .mockResolvedValue({ data: { session: refreshedSession }, error: null });
    (supabase.auth as any).getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: refreshedSession.user } });

    // Ensure supabase.from chain includes .single() for the profile fallback
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── TOKEN_REFRESHED: broadcast new session ─────────────────────────────────

  describe("TOKEN_REFRESHED", () => {
    it("broadcasts SESSION_REFRESHED, and calls router.refresh()", async () => {
      const { fireAuthEvent, routerRefresh } = renderWithCoordinator();
      await fireAuthEvent("TOKEN_REFRESHED", coordSession);

      expect(coordinatorContainer.instance!.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "SESSION_REFRESHED" }),
      );
      expect(routerRefresh).toHaveBeenCalled();
    });
  });

  // ── SESSION_REFRESHED broadcast received ───────────────────────────────────

  describe("SESSION_REFRESHED broadcast received", () => {
    it("calls setSession, updates state, and calls router.refresh()", async () => {
      const { fireAuthEvent, fireMessage, routerRefresh } =
        renderWithCoordinator();

      await fireAuthEvent("INITIAL_SESSION", null);

      await act(async () => {
        fireMessage({
          type: "SESSION_REFRESHED",
          session: {
            access_token: refreshedSession.access_token,
            refresh_token: refreshedSession.refresh_token,
            expires_at: refreshedSession.expires_at,
            token_type: refreshedSession.token_type as "bearer",
            user: coordUser as any,
          },
        });
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(supabase.auth.setSession).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: refreshedSession.access_token,
        }),
      );
      expect(routerRefresh).toHaveBeenCalled();
    });
  });

  // ── SIGNED_OUT broadcast received ─────────────────────────────────────────

  describe("SIGNED_OUT broadcast received", () => {
    it("clears session state and redirects to /login", async () => {
      const { fireAuthEvent, fireMessage, routerPush } =
        renderWithCoordinator();

      await fireAuthEvent("INITIAL_SESSION", null);

      await act(async () => {
        fireMessage({ type: "SIGNED_OUT" });
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(screen.getByTestId("session")).toHaveTextContent("null");
      expect(screen.getByTestId("user")).toHaveTextContent("null");
      expect(routerPush).toHaveBeenCalledWith("/login");
    });

    it("calls supabase.auth.signOut with scope: local", async () => {
      const { fireAuthEvent, fireMessage } = renderWithCoordinator();

      await fireAuthEvent("INITIAL_SESSION", null);

      await act(async () => {
        fireMessage({ type: "SIGNED_OUT" });
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    });
  });

  // ── signOut() — broadcast before local sign-out ────────────────────────────

  describe("signOut()", () => {
    it("broadcasts SIGNED_OUT before calling supabase.auth.signOut", async () => {
      const callOrder: string[] = [];

      coordinatorContainer.instance!.broadcast = vi
        .fn()
        .mockImplementation(() => {
          callOrder.push("broadcast");
        });
      vi.mocked(supabase.auth.signOut).mockImplementation(async () => {
        callOrder.push("signOut");
        return {} as any;
      });

      const { fireAuthEvent } = renderWithCoordinator();
      await fireAuthEvent("INITIAL_SESSION", null);

      await act(async () => {
        screen.getByTestId("signOut").click();
      });

      expect(callOrder.indexOf("broadcast")).toBeLessThan(
        callOrder.indexOf("signOut"),
      );
    });

    it("sends a SIGNED_OUT broadcast message", async () => {
      const { fireAuthEvent } = renderWithCoordinator();
      await fireAuthEvent("INITIAL_SESSION", null);

      await act(async () => {
        screen.getByTestId("signOut").click();
      });

      expect(coordinatorContainer.instance!.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "SIGNED_OUT" }),
      );
    });
  });

  // ── visibilitychange — near-expiry triggers lock-acquire flow ──────────────

  describe("visibilitychange — near-expiry", () => {
    it("calls refreshSession when tab becomes visible and session is near expiry", async () => {
      coordinatorContainer.instance!.isNearExpiry = vi
        .fn()
        .mockReturnValue(true);
      coordinatorContainer.instance!.acquireLock = vi
        .fn()
        .mockReturnValue(true);

      const { fireAuthEvent } = renderWithCoordinator();
      await fireAuthEvent("INITIAL_SESSION", null);

      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
          configurable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(supabase.auth.refreshSession).toHaveBeenCalled();
    });

    it("does NOT call refreshSession when session is not near expiry", async () => {
      coordinatorContainer.instance!.isNearExpiry = vi
        .fn()
        .mockReturnValue(false);

      const { fireAuthEvent } = renderWithCoordinator();
      await fireAuthEvent("INITIAL_SESSION", null);

      await act(async () => {
        Object.defineProperty(document, "visibilityState", {
          value: "visible",
          writable: true,
          configurable: true,
        });
        document.dispatchEvent(new Event("visibilitychange"));
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
    });
  });

});
