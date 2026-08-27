import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OrganizationBootstrapRecovery from "./OrganizationBootstrapRecovery";

describe("OrganizationBootstrapRecovery", () => {
  it("shows explicit recovery progress and exposes safe actions after a prolonged outage", async () => {
    let resolveRetry: (() => void) | undefined;
    const onRetry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );

    vi.useFakeTimers();
    try {
      render(<OrganizationBootstrapRecovery automaticallyRetry={false} onRetry={onRetry} />);

      expect(
        screen.getByRole("heading", { name: "Preparing your Organization" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("We’re loading the information you need to get started."),
      ).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(onRetry).toHaveBeenCalledTimes(1);

      await act(async () => resolveRetry?.());
      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries in the background after the query retry budget is exhausted", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(Math, "random").mockReturnValue(1);
      const onRetry = vi.fn().mockResolvedValue(undefined);
      render(<OrganizationBootstrapRecovery onRetry={onRetry} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});
