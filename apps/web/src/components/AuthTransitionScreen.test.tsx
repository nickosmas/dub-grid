import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuthTransitionScreen from "./AuthTransitionScreen";
import { consumeAuthTransition, markAuthTransition } from "@/lib/auth-transition";

vi.mock("@/hooks/useLogout", () => ({
  useLogout: () => ({ signOut: vi.fn() }),
}));

describe("AuthTransitionScreen", () => {
  it("labels the wait, explains a slow transition, and exposes recovery after 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      markAuthTransition();
      const view = render(<AuthTransitionScreen onRetry={vi.fn()} phase="organization" />);

      expect(
        screen.getByRole("heading", { name: "Getting your organization ready" }),
      ).toBeInTheDocument();
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
        screen.getByText(
          "This is taking a little longer than usual. We’re still getting things ready.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    } finally {
      consumeAuthTransition();
      vi.useRealTimers();
    }
  });
});
