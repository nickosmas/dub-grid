import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuthTransitionScreen, { AUTH_TRANSITION_REVEAL_AFTER_MS } from "./AuthTransitionScreen";
import { consumeAuthTransition, markAuthTransition } from "@/lib/auth-transition";

vi.mock("@/hooks/useLogout", () => ({
  useLogout: () => ({ signOut: vi.fn() }),
}));

function revealDelayMs(): number {
  const animation = screen.getByRole("heading").parentElement?.style.animation ?? "";
  const delays = [...animation.matchAll(/(\d+)ms/g)].map((match) => Number(match[1]));
  return delays[1] ?? 0;
}

describe("AuthTransitionScreen", () => {
  it("stays a blank background through a fast handoff, counted from its start", () => {
    vi.useFakeTimers();
    try {
      markAuthTransition();
      const view = render(<AuthTransitionScreen phase="signing-in" />);
      expect(screen.getByRole("heading", { name: "Signing you in" })).toBeInTheDocument();
      expect(revealDelayMs()).toBe(AUTH_TRANSITION_REVEAL_AFTER_MS);

      // The next phase mounts its own screen; it waits only for what is left.
      vi.advanceTimersByTime(1_500);
      view.unmount();
      const next = render(<AuthTransitionScreen phase="workspace" />);
      expect(revealDelayMs()).toBe(AUTH_TRANSITION_REVEAL_AFTER_MS - 1_500);

      vi.advanceTimersByTime(1_000);
      next.unmount();
      render(<AuthTransitionScreen phase="workspace" />);
      expect(revealDelayMs()).toBe(0);
    } finally {
      consumeAuthTransition();
      vi.useRealTimers();
    }
  });

  it("shows a failure screen at once", () => {
    markAuthTransition();
    try {
      render(<AuthTransitionScreen onRetry={vi.fn()} phase="workspace" showActionsImmediately />);
      expect(revealDelayMs()).toBe(0);
      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    } finally {
      consumeAuthTransition();
    }
  });

  it("labels the wait, explains a slow transition, and exposes recovery after 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      markAuthTransition();
      const view = render(<AuthTransitionScreen onRetry={vi.fn()} phase="workspace" />);

      expect(screen.getByRole("heading", { name: "Getting things ready" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      view.unmount();
      render(<AuthTransitionScreen onRetry={vi.fn()} phase="onboarding" />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(
        screen.getByText("This is taking a little longer than usual. It’s still loading."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    } finally {
      consumeAuthTransition();
      vi.useRealTimers();
    }
  });
});
