import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STARTUP_MIN_SPLASH_MS } from "@dubgrid/design-tokens";
import { ProtectedRoute } from "./RouteGuards";

let authState: { user: { id: string } | null; isLoading: boolean } = {
  user: null,
  isLoading: true,
};
let transitionPending = false;

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => authState,
}));

vi.mock("@/lib/auth-transition", () => ({
  isAuthTransitionPending: () => transitionPending,
  useAuthTransitionPending: () => transitionPending,
  consumeAuthTransition: vi.fn(),
  getAuthTransitionStartedAt: () => Date.now(),
}));

vi.mock("@/hooks/useLogout", () => ({
  useLogout: () => ({ signOut: vi.fn() }),
}));

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authState = { user: null, isLoading: true };
    transitionPending = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The web app used to open on nothing at all while the session restored,
  // which is the blank frame a startup surface exists to prevent.
  it("shows the branded startup surface once a session restore outlasts the flicker threshold", async () => {
    render(
      <ProtectedRoute>
        <div>app</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_MIN_SPLASH_MS);
    });

    expect(screen.getByRole("progressbar", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Loading your workspace" })).toBeInTheDocument();
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });

  // A restore that beats the threshold should go straight to the app rather
  // than flash a brand surface on the way past.
  it("paints nothing for a restore that resolves inside the flicker threshold", async () => {
    const view = render(
      <ProtectedRoute>
        <div>app</div>
      </ProtectedRoute>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_MIN_SPLASH_MS - 1);
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    authState = { user: { id: "user-1" }, isLoading: false };
    view.rerender(
      <ProtectedRoute>
        <div>app</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("app")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  // Claiming to load a workspace while bouncing to the sign-in page would name
  // a session this branch has just established does not exist.
  it("stays blank while redirecting an unauthenticated visitor", async () => {
    authState = { user: null, isLoading: false };

    render(
      <ProtectedRoute>
        <div>app</div>
      </ProtectedRoute>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STARTUP_MIN_SPLASH_MS * 4);
    });

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });

  it("keeps the post-login handoff surface immediate", () => {
    transitionPending = true;

    render(
      <ProtectedRoute>
        <div>app</div>
      </ProtectedRoute>,
    );

    expect(screen.getByRole("heading", { name: "Signing you in" })).toBeInTheDocument();
  });
});
