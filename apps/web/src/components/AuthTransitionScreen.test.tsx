import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { STARTUP_STATUS_DELAY_MS, STARTUP_TIMEOUT_MS } from "@dubgrid/design-tokens";
import AuthTransitionScreen from "./AuthTransitionScreen";
import { consumeAuthTransition, markAuthTransition } from "@/lib/auth-transition";

vi.mock("@/hooks/useLogout", () => ({
  useLogout: () => ({ signOut: vi.fn() }),
}));

describe("AuthTransitionScreen", () => {
  it("shows the static mark and an announced progress indicator from the first frame", () => {
    render(<AuthTransitionScreen phase="workspace" />);

    // The mark never animates here; the bar beside it is what reads as working.
    expect(screen.getByRole("progressbar", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getByText("dubgrid")).toBeInTheDocument();
  });

  it("stays quiet, then explains itself, then offers a way out", async () => {
    vi.useFakeTimers();
    try {
      markAuthTransition();
      render(<AuthTransitionScreen onRetry={vi.fn()} phase="workspace" />);

      expect(screen.getByRole("heading", { name: "Loading your workspace" })).toBeInTheDocument();
      expect(
        screen.getByText("Just a moment while we prepare everything you need."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(STARTUP_STATUS_DELAY_MS);
      });
      expect(
        screen.getByText(
          "This is taking a little longer than usual. We’re still getting things ready.",
        ),
      ).toBeInTheDocument();
      // Still no escape: a slow start is not yet a stuck one.
      expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUT_MS - STARTUP_STATUS_DELAY_MS);
      });
      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    } finally {
      consumeAuthTransition();
      vi.useRealTimers();
    }
  });

  it("says so plainly when the device is offline", () => {
    render(<AuthTransitionScreen offline phase="workspace" />);

    expect(
      screen.getByText("You’re offline. We’ll continue when you’re connected again."),
    ).toBeInTheDocument();
  });
});
