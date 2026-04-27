import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthSessionProvider, useSessionState } from "./AuthSessionProvider";

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

vi.mock("../lib/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession,
      onAuthStateChange,
      signOut,
    },
  }),
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
  it("clears local auth state when the stored refresh token is invalid", async () => {
    getSession.mockRejectedValueOnce(
      new Error("Invalid Refresh Token: Refresh Token Not Found"),
    );
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
