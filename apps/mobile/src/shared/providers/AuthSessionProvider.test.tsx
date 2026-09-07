import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthSessionProvider,
  SESSION_RESTORE_TIMEOUT_MS,
  useSessionState,
} from "./AuthSessionProvider";

const getSession = vi.fn();
const signOut = vi.fn();
const unsubscribe = vi.fn();
const onAuthStateChange = vi.fn(() => ({
  data: {
    subscription: {
      unsubscribe,
    },
  },
}));
const { registerMobileSessionPresence } = vi.hoisted(() => ({
  registerMobileSessionPresence: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession,
      onAuthStateChange,
      signOut,
    },
  }),
}));

vi.mock("../lib/api", () => ({
  registerMobileSessionPresence,
}));

function SessionProbe() {
  const { accessToken, isLoading } = useSessionState();

  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="token">{accessToken ?? "none"}</span>
    </div>
  );
}

describe("AuthSessionProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerMobileSessionPresence.mockResolvedValue({ success: true });
  });

  it("registers restored mobile sessions", async () => {
    getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: "access-token-1",
        },
      },
    });

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("token")).toHaveTextContent("access-token-1");
    });

    expect(registerMobileSessionPresence).toHaveBeenCalledWith("access-token-1");
  });

  it("releases startup when the stored session restore hangs", async () => {
    vi.useFakeTimers();
    getSession.mockReturnValueOnce(new Promise(() => {}));

    try {
      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      expect(screen.getByTestId("loading")).toHaveTextContent("true");

      act(() => {
        vi.advanceTimersByTime(SESSION_RESTORE_TIMEOUT_MS - 1);
      });

      expect(screen.getByTestId("loading")).toHaveTextContent("true");

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(screen.getByTestId("loading")).toHaveTextContent("false");
      expect(screen.getByTestId("token")).toHaveTextContent("none");
      expect(signOut).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not apply a stale restore that resolves after startup has timed out", async () => {
    vi.useFakeTimers();
    let resolveRestore!: (value: { data: { session: { access_token: string } | null } }) => void;
    getSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRestore = resolve;
      }),
    );

    try {
      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SESSION_RESTORE_TIMEOUT_MS);
      });
      expect(screen.getByTestId("token")).toHaveTextContent("none");

      await act(async () => {
        resolveRestore({ data: { session: { access_token: "stale-token" } } });
      });

      expect(screen.getByTestId("token")).toHaveTextContent("none");
      expect(registerMobileSessionPresence).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears local auth state when the stored refresh token is invalid", async () => {
    getSession.mockRejectedValueOnce(new Error("Invalid Refresh Token: Refresh Token Not Found"));
    signOut.mockResolvedValueOnce({ error: null });

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.getByTestId("token")).toHaveTextContent("none");
  });
});
