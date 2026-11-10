import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

const hapticNotify = vi.hoisted(() => vi.fn());
vi.mock("../lib/haptics", () => ({ hapticNotify }));

import { ToastSurface } from "./ToastSurface";

beforeEach(() => hapticNotify.mockClear());

describe("ToastSurface", () => {
  it("shows the title over the message", () => {
    render(
      <ToastSurface
        message="Something went wrong."
        testID="toast"
        title="Couldn't save"
        tone="error"
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("Couldn't save")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
  });

  it("shows a lone message as the title line", () => {
    render(<ToastSurface message="Saved" testID="toast" tone="success" onDismiss={vi.fn()} />);

    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("plays the tone's haptic, except for info", () => {
    const { rerender } = render(
      <ToastSurface message="Saved" testID="toast" tone="success" onDismiss={vi.fn()} />,
    );
    expect(hapticNotify).toHaveBeenCalledWith("success");

    hapticNotify.mockClear();
    rerender(<ToastSurface message="Heads up" testID="toast" tone="info" onDismiss={vi.fn()} />);
    expect(hapticNotify).not.toHaveBeenCalled();
  });
});
