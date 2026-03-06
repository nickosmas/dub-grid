/**
 * Tests for AuthProvider race condition fix.
 * Property-based and unit tests for isLoading timing invariant
 * and state transitions on INITIAL_SESSION / SIGNED_IN events.
 */
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { supabase } from "@/lib/supabase";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import { checkIsSuperAdmin } from "@/lib/db";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/lib/db", () => ({
  checkIsSuperAdmin: vi.fn().mockResolvedValue(false),
}));

// ─── Test consumer ────────────────────────────────────────────────────────────

function TestConsumer() {
  const { isSuperAdmin, isLoading } = useAuth();
  return (
    <div>
      <span data-testid="isSuperAdmin">{String(isSuperAdmin)}</span>
      <span data-testid="isLoading">{String(isLoading)}</span>
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

const fakeUser = { id: "user-123", email: "test@example.com" };
const fakeSession = { user: fakeUser, access_token: "token-abc" };

beforeEach(() => {
  vi.mocked(checkIsSuperAdmin).mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
});

// ─── Property-based test ──────────────────────────────────────────────────────

/**
 * Feature: login-auth-fix, Property 1: isLoading stays true while checkIsSuperAdmin is pending
 * Validates: Requirements 1.1, 1.3
 *
 * For any session and delay, isLoading must be true while checkIsSuperAdmin is
 * pending and false only after it resolves.
 */
describe("Property 1: isLoading stays true while checkIsSuperAdmin is pending", () => {
  it("isLoading remains true for the entire duration checkIsSuperAdmin is pending, for arbitrary sessions and delays", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 20 }), // delay in ms
        fc.boolean(), // isSuperAdmin result
        fc.constantFrom("INITIAL_SESSION", "SIGNED_IN"),
        async (delayMs, superAdminResult, event) => {
          let resolveCheck!: (v: boolean) => void;
          const pendingCheck = new Promise<boolean>((res) => {
            resolveCheck = res;
          });

          // isLoading captured after React flushes setIsLoading(true) but
          // before checkIsSuperAdmin resolves.
          let isLoadingWhilePending: boolean | null = null;

          vi.mocked(checkIsSuperAdmin).mockImplementationOnce(async () => {
            // Yield so React can flush the setIsLoading(true) state update
            await Promise.resolve();
            if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
            isLoadingWhilePending =
              screen.getByTestId("isLoading").textContent === "true";
            return pendingCheck;
          });

          const { fireEvent } = renderWithCapture();

          // Start the event; resolve the deferred check after snapshot is taken
          const firePromise = fireEvent(event, fakeSession);
          // Give the mock time to reach the snapshot point
          await new Promise((r) => setTimeout(r, delayMs + 5));
          resolveCheck(superAdminResult);
          await firePromise;

          expect(isLoadingWhilePending).toBe(true);

          await waitFor(() => {
            expect(screen.getByTestId("isLoading")).toHaveTextContent("false");
          });

          cleanup();
        },
      ),
      { numRuns: 20 },
    );
  });
});

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe("AuthProvider state transitions", () => {
  describe("INITIAL_SESSION with no session", () => {
    it("sets isLoading=false immediately and isSuperAdmin=false", async () => {
      const { fireEvent } = renderWithCapture();
      await fireEvent("INITIAL_SESSION", null);

      expect(screen.getByTestId("isLoading")).toHaveTextContent("false");
      expect(screen.getByTestId("isSuperAdmin")).toHaveTextContent("false");
    });
  });

  describe("INITIAL_SESSION with session + checkIsSuperAdmin resolves", () => {
    it("sets isLoading=false and isSuperAdmin matches the resolved value", async () => {
      vi.mocked(checkIsSuperAdmin).mockResolvedValueOnce(true);

      const { fireEvent } = renderWithCapture();
      await fireEvent("INITIAL_SESSION", fakeSession);

      await waitFor(() =>
        expect(screen.getByTestId("isLoading")).toHaveTextContent("false"),
      );
      expect(screen.getByTestId("isSuperAdmin")).toHaveTextContent("true");
    });
  });

  describe("INITIAL_SESSION with session + checkIsSuperAdmin throws", () => {
    it("sets isSuperAdmin=false and isLoading=false", async () => {
      vi.mocked(checkIsSuperAdmin).mockRejectedValueOnce(new Error("db error"));

      const { fireEvent } = renderWithCapture();
      await fireEvent("INITIAL_SESSION", fakeSession);

      await waitFor(() =>
        expect(screen.getByTestId("isLoading")).toHaveTextContent("false"),
      );
      expect(screen.getByTestId("isSuperAdmin")).toHaveTextContent("false");
    });
  });

  describe("SIGNED_IN event", () => {
    it("sets isLoading=true while checkIsSuperAdmin is pending, then false after it resolves", async () => {
      let resolveCheck!: (v: boolean) => void;
      const pendingCheck = new Promise<boolean>((res) => {
        resolveCheck = res;
      });

      vi.mocked(checkIsSuperAdmin).mockImplementationOnce(() => pendingCheck);

      // Capture the auth callback directly so we can invoke it without act
      // wrapping the entire async chain (which would hide intermediate states).
      let capturedCb: AuthCallback | null = null;
      vi.mocked(supabase.auth.onAuthStateChange).mockImplementation(
        (cb: AuthCallback) => {
          capturedCb = cb;
          return { data: { subscription: { unsubscribe: vi.fn() } } } as any;
        },
      );

      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>,
      );

      // Clear initial loading state via INITIAL_SESSION with no session
      await act(async () => {
        await capturedCb!("INITIAL_SESSION", null);
      });
      expect(screen.getByTestId("isLoading")).toHaveTextContent("false");

      // Fire SIGNED_IN without awaiting the full chain — let it run in background
      act(() => {
        capturedCb!("SIGNED_IN", fakeSession);
      });

      // isLoading should become true (setIsLoading(true) fires synchronously
      // at the top of the handler, React flushes it when act() exits)
      await waitFor(() =>
        expect(screen.getByTestId("isLoading")).toHaveTextContent("true"),
      );

      // Resolve checkIsSuperAdmin — isLoading should then become false
      await act(async () => {
        resolveCheck(false);
        // Wait for the pending promise chain to settle
        await pendingCheck;
      });

      await waitFor(() =>
        expect(screen.getByTestId("isLoading")).toHaveTextContent("false"),
      );
    });
  });
});
