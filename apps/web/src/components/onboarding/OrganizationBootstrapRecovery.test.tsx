import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OrganizationBootstrapRecovery from "./OrganizationBootstrapRecovery";

describe("OrganizationBootstrapRecovery", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("shows explicit recovery progress with immediately usable safe actions", async () => {
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

      expect(screen.getByRole("heading", { name: "Loading your workspace" })).toBeInTheDocument();
      expect(
        screen.getByText("Just a moment while we prepare everything you need."),
      ).toBeInTheDocument();

      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(onRetry).toHaveBeenCalledTimes(1);

      await act(async () => resolveRetry?.());
      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not add background retries after the query budget is exhausted", async () => {
    vi.useFakeTimers();
    try {
      const onRetry = vi.fn().mockResolvedValue(undefined);
      render(<OrganizationBootstrapRecovery onRetry={onRetry} />);

      await act(async () => vi.advanceTimersByTimeAsync(60_000));

      expect(onRetry).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses automatic work offline and starts one prompt attempt after reconnect", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    vi.useFakeTimers();
    try {
      const onRetry = vi.fn().mockResolvedValue(undefined);
      render(<OrganizationBootstrapRecovery onRetry={onRetry} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(onRetry).not.toHaveBeenCalled();

      Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases a manual retry after its deadline even when the request never settles", async () => {
    vi.useFakeTimers();
    try {
      const onRetry = vi.fn(() => new Promise<void>(() => undefined));
      render(<OrganizationBootstrapRecovery automaticallyRetry={false} onRetry={onRetry} />);

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole("button", { name: /try again/i })).toBeDisabled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });

      expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
