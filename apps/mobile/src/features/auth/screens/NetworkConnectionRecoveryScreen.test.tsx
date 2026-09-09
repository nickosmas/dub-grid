import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

import { NetworkConnectionRecoveryScreen } from "./NetworkConnectionRecoveryScreen";

describe("NetworkConnectionRecoveryScreen", () => {
  const onRetry = vi.fn();

  beforeEach(() => {
    onRetry.mockReset();
  });

  it("explains the connection failure and gives the signed-in user a retry action", () => {
    render(<NetworkConnectionRecoveryScreen onRetry={onRetry} />);

    expect(screen.getByText("Network connection issue")).toBeInTheDocument();
    expect(screen.getByText("Check your internet connection and try again.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Try again"));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("leaves automatic retry ownership to the bounded bootstrap query", async () => {
    vi.useFakeTimers();
    try {
      render(<NetworkConnectionRecoveryScreen onRetry={onRetry} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(onRetry).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
