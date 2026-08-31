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

  it("keeps retrying automatically while the connection can recover", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(Math, "random").mockReturnValue(1);
      onRetry.mockResolvedValue(undefined);
      render(<NetworkConnectionRecoveryScreen onRetry={onRetry} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(onRetry).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});
