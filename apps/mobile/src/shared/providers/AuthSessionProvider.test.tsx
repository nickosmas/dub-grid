import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthSessionProvider,
  replaceAuthSession,
  SESSION_RESTORE_TIMEOUT_MS,
  shouldClearLocalAuthForRestoreError,
  useSessionState,
} from "./AuthSessionProvider";
import type { Session } from "@supabase/supabase-js";

const getSession = vi.fn();
const signOut = vi.fn();
const unsubscribe = vi.fn();
const onAuthStateChange = vi.fn(
  (_callback: (event: string, session: { access_token: string } | null) => void) => ({
    data: {
      subscription: {
        unsubscribe,
      },
    },
  }),
);
const { cancelQueries, clearQueryClient, registerMobileSessionPresence } = vi.hoisted(() => ({
  cancelQueries: vi.fn(),
  clearQueryClient: vi.fn(),
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

vi.mock("../lib/query-client", () => ({
  queryClient: {
    cancelQueries,
    clear: clearQueryClient,
  },
}));

function sessionFor(userId: string, orgId: string, version: string): Session {
  const payload = btoa(JSON.stringify({ sub: userId, org_id: orgId }));
  return {
    access_token: `header.${payload}.${version}`,
    refresh_token: `refresh-${version}`,
    token_type: "bearer",
    expires_in: 3_600,
    user: { id: userId },
  } as Session;
}

function SessionProbe() {
  const { accessToken, isLoading, restoreError, retryRestore, clearSessionAndSignIn } =
    useSessionState();

  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="token">{accessToken ?? "none"}</span>
      <span data-testid="restore-error">{String(restoreError)}</span>
      <button onClick={() => void retryRestore()}>Retry restore</button>
      <button onClick={() => void clearSessionAndSignIn()}>Sign in again</button>
    </div>
  );
}

function MountedContent({ onMount, onUnmount }: { onMount: () => void; onUnmount: () => void }) {
  useEffect(() => {
    onMount();
    return onUnmount;
  }, [onMount, onUnmount]);

  return <span>Mounted content</span>;
}

describe("AuthSessionProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelQueries.mockResolvedValue(undefined);
    registerMobileSessionPresence.mockResolvedValue({ success: true });
  });

  it("registers each restored token once even when auth state replays it", async () => {
    const session = sessionFor("user-1", "org-1", "v1");
    getSession.mockResolvedValueOnce({
      data: { session },
    });

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("token")).toHaveTextContent(session.access_token);
    });

    expect(registerMobileSessionPresence).toHaveBeenCalledWith(session.access_token);
    expect(registerMobileSessionPresence).toHaveBeenCalledTimes(1);

    const authStateCallback = onAuthStateChange.mock.calls[0]?.[0];
    act(() => {
      authStateCallback?.("SIGNED_IN", session);
    });

    expect(registerMobileSessionPresence).toHaveBeenCalledTimes(1);
    expect(clearQueryClient).not.toHaveBeenCalled();
  });

  it("registers a newly observed token after the session changes", async () => {
    const firstSession = sessionFor("user-1", "org-1", "v1");
    const refreshedSession = sessionFor("user-1", "org-1", "v2");
    getSession.mockResolvedValueOnce({
      data: { session: firstSession },
    });

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(registerMobileSessionPresence).toHaveBeenCalledWith(firstSession.access_token);
    });

    const authStateCallback = onAuthStateChange.mock.calls[0]?.[0];
    act(() => {
      authStateCallback?.("TOKEN_REFRESHED", refreshedSession);
    });

    expect(registerMobileSessionPresence).toHaveBeenCalledTimes(2);
    expect(registerMobileSessionPresence).toHaveBeenLastCalledWith(refreshedSession.access_token);
    expect(screen.getByTestId("token")).toHaveTextContent(refreshedSession.access_token);
    expect(clearQueryClient).not.toHaveBeenCalled();
  });

  it("keeps mounted content in place during a same-identity token rotation", async () => {
    const onMount = vi.fn();
    const onUnmount = vi.fn();
    const firstSession = sessionFor("user-1", "org-1", "v1");
    const refreshedSession = sessionFor("user-1", "org-1", "v2");
    getSession.mockResolvedValueOnce({ data: { session: firstSession } });

    render(
      <AuthSessionProvider>
        <SessionProbe />
        <MountedContent onMount={onMount} onUnmount={onUnmount} />
      </AuthSessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("token")).toHaveTextContent(firstSession.access_token),
    );

    const authStateCallback = onAuthStateChange.mock.calls[0]?.[0];
    act(() => {
      authStateCallback?.("TOKEN_REFRESHED", refreshedSession);
    });

    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onUnmount).not.toHaveBeenCalled();
    expect(screen.getByText("Mounted content")).toBeInTheDocument();
    expect(clearQueryClient).not.toHaveBeenCalled();
  });

  it("keeps a newer auth event when an older startup restore resolves later", async () => {
    let finishRestore!: (value: { data: { session: Session } }) => void;
    const restoredSession = sessionFor("user-1", "org-1", "old");
    const newerSession = sessionFor("user-1", "org-1", "new");
    getSession.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRestore = resolve;
      }),
    );

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    const authStateCallback = onAuthStateChange.mock.calls[0]?.[0];
    act(() => {
      authStateCallback?.("TOKEN_REFRESHED", newerSession);
    });
    await act(async () => {
      finishRestore({ data: { session: restoredSession } });
      await Promise.resolve();
    });

    expect(screen.getByTestId("token")).toHaveTextContent(newerSession.access_token);
    expect(registerMobileSessionPresence).toHaveBeenCalledTimes(1);
    expect(registerMobileSessionPresence).toHaveBeenCalledWith(newerSession.access_token);
  });

  it("keeps a terminal sign-out when an older startup restore resolves later", async () => {
    let finishRestore!: (value: { data: { session: Session } }) => void;
    const restoredSession = sessionFor("user-1", "org-1", "old");
    getSession.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRestore = resolve;
      }),
    );

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    const authStateCallback = onAuthStateChange.mock.calls[0]?.[0];
    act(() => {
      authStateCallback?.("SIGNED_OUT", null);
    });
    await act(async () => {
      finishRestore({ data: { session: restoredSession } });
      await Promise.resolve();
    });

    expect(screen.getByTestId("token")).toHaveTextContent("none");
    expect(registerMobileSessionPresence).not.toHaveBeenCalled();
  });

  it("lets forced expiry supersede an older startup restore", async () => {
    let finishRestore!: (value: { data: { session: Session } }) => void;
    const restoredSession = sessionFor("user-1", "org-1", "old");
    getSession.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRestore = resolve;
      }),
    );

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    act(() => replaceAuthSession(null));
    await act(async () => {
      finishRestore({ data: { session: restoredSession } });
      await Promise.resolve();
    });

    expect(screen.getByTestId("token")).toHaveTextContent("none");
    expect(registerMobileSessionPresence).not.toHaveBeenCalled();
  });

  it("clears authenticated queries when a different account signs in", async () => {
    const firstSession = sessionFor("user-1", "org-1", "v1");
    const nextSession = sessionFor("user-2", "org-1", "v1");
    getSession.mockResolvedValueOnce({ data: { session: firstSession } });

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("token")).toHaveTextContent(firstSession.access_token),
    );

    const authStateCallback = onAuthStateChange.mock.calls[0]?.[0];
    act(() => {
      authStateCallback?.("SIGNED_IN", nextSession);
    });

    expect(cancelQueries).toHaveBeenCalledTimes(1);
    expect(clearQueryClient).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("token")).toHaveTextContent(nextSession.access_token);
  });

  it("commits an explicit organization switch and clears the previous organization once", async () => {
    const firstSession = sessionFor("user-1", "org-1", "v1");
    const nextSession = sessionFor("user-1", "org-2", "v2");
    getSession.mockResolvedValueOnce({ data: { session: firstSession } });

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("token")).toHaveTextContent(firstSession.access_token),
    );

    let committed = false;
    act(() => {
      committed = replaceAuthSession(nextSession);
    });

    expect(committed).toBe(true);
    expect(cancelQueries).toHaveBeenCalledTimes(1);
    expect(clearQueryClient).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("token")).toHaveTextContent(nextSession.access_token);

    // Supabase can emit the same session after refreshSession resolves. The
    // replay is same-identity and must not tear the destination cache down.
    const authStateCallback = onAuthStateChange.mock.calls[0]?.[0];
    act(() => {
      authStateCallback?.("SIGNED_IN", nextSession);
    });
    expect(clearQueryClient).toHaveBeenCalledTimes(1);
  });

  it("clears authenticated queries when the live session signs out", async () => {
    const session = sessionFor("user-1", "org-1", "v1");
    getSession.mockResolvedValueOnce({ data: { session } });

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("token")).toHaveTextContent(session.access_token),
    );

    const authStateCallback = onAuthStateChange.mock.calls[0]?.[0];
    act(() => {
      authStateCallback?.("SIGNED_OUT", null);
    });

    expect(cancelQueries).toHaveBeenCalledTimes(1);
    expect(clearQueryClient).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("token")).toHaveTextContent("none");
  });

  it("fails closed when an auth event carries an unreadable token", async () => {
    const firstSession = sessionFor("user-1", "org-1", "v1");
    getSession.mockResolvedValueOnce({ data: { session: firstSession } });

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("token")).toHaveTextContent(firstSession.access_token),
    );

    const authStateCallback = onAuthStateChange.mock.calls[0]?.[0];
    act(() => {
      authStateCallback?.("TOKEN_REFRESHED", {
        ...firstSession,
        access_token: "not-a-jwt",
      });
    });

    expect(screen.getByTestId("token")).toHaveTextContent("none");
    // Unreadable storage used to strand the user on a retry that replayed it
    // forever. It is cleared, and the user goes to sign-in instead.
    expect(screen.getByTestId("restore-error")).toHaveTextContent("false");
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(cancelQueries).toHaveBeenCalledTimes(1);
    expect(clearQueryClient).toHaveBeenCalledTimes(1);
  });

  it("clears a stored session the provider rejects with any stale-session code", async () => {
    getSession.mockRejectedValueOnce(
      Object.assign(new Error("Refresh token already used"), {
        code: "refresh_token_already_used",
        status: 400,
      }),
    );
    signOut.mockResolvedValueOnce({ error: null });

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.getByTestId("restore-error")).toHaveTextContent("false");
  });

  it("keeps a connection failure on the retry screen without discarding the session", async () => {
    getSession.mockRejectedValueOnce(new TypeError("Network request failed"));

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("restore-error")).toHaveTextContent("true"));
    expect(signOut).not.toHaveBeenCalled();
  });

  it("offers a way out of recovery that always ends signed out", async () => {
    getSession.mockRejectedValueOnce(new TypeError("Network request failed"));
    signOut.mockReturnValueOnce(new Promise(() => undefined));
    vi.useFakeTimers();

    render(
      <AuthSessionProvider>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId("restore-error")).toHaveTextContent("true");

    fireEvent.click(screen.getByText("Sign in again"));
    await act(async () => vi.advanceTimersByTimeAsync(5_000));

    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.getByTestId("restore-error")).toHaveTextContent("false");
    expect(screen.getByTestId("token")).toHaveTextContent("none");
    vi.useRealTimers();
  });

  it("tells a dead session from an unreachable provider", () => {
    expect(shouldClearLocalAuthForRestoreError({ code: "session_not_found", status: 403 })).toBe(
      true,
    );
    expect(shouldClearLocalAuthForRestoreError({ status: 400, message: "bad" })).toBe(true);
    expect(
      shouldClearLocalAuthForRestoreError({ name: "AuthRetryableFetchError", status: 0 }),
    ).toBe(false);
    expect(shouldClearLocalAuthForRestoreError({ status: 503 })).toBe(false);
    expect(shouldClearLocalAuthForRestoreError({ status: 429 })).toBe(false);
    expect(shouldClearLocalAuthForRestoreError(new TypeError("Network request failed"))).toBe(
      false,
    );
  });

  it("releases startup into recovery when the stored session restore hangs", async () => {
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
      expect(screen.getByTestId("restore-error")).toHaveTextContent("true");
      expect(signOut).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores the same valid session after a timed-out attempt is retried", async () => {
    vi.useFakeTimers();
    const restoredSession = sessionFor("user-1", "org-1", "restored");
    getSession
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce({ data: { session: restoredSession } });

    try {
      render(
        <AuthSessionProvider>
          <SessionProbe />
        </AuthSessionProvider>,
      );

      await act(async () => vi.advanceTimersByTimeAsync(SESSION_RESTORE_TIMEOUT_MS));
      expect(screen.getByTestId("restore-error")).toHaveTextContent("true");

      await act(async () => fireEvent.click(screen.getByText("Retry restore")));

      expect(screen.getByTestId("token")).toHaveTextContent(restoredSession.access_token);
      expect(screen.getByTestId("restore-error")).toHaveTextContent("false");
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
    expect(screen.getByTestId("restore-error")).toHaveTextContent("false");
  });
});
