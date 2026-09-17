import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";
import { getVisibleSheetCount, resetSheetPresentationTracking } from "../lib/modal-presentation";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

let FullPageSheet: (typeof import("./FullPageSheet"))["FullPageSheet"];

beforeAll(async () => {
  FullPageSheet = (await import("./FullPageSheet")).FullPageSheet;
});

beforeEach(() => {
  resetSheetPresentationTracking();
});

describe("FullPageSheet", () => {
  it("shows its title, body and footer, and closes through one funnel", () => {
    const onDismiss = vi.fn();

    render(
      <FullPageSheet footer={<span>Footer</span>} title="Swap" visible onDismiss={onDismiss}>
        <span>Body</span>
      </FullPageSheet>,
    );

    expect(screen.getByText("Swap")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Footer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("counts as the one task sheet while it is open", () => {
    const view = render(
      <FullPageSheet title="Swap" visible onDismiss={vi.fn()}>
        <span>Body</span>
      </FullPageSheet>,
    );

    expect(getVisibleSheetCount()).toBe(1);

    view.unmount();

    expect(getVisibleSheetCount()).toBe(0);
  });

  it("keeps Close on screen but inert while a request is in flight", () => {
    const onDismiss = vi.fn();

    render(
      <FullPageSheet dismissDisabled title="Swap" visible onDismiss={onDismiss}>
        <span>Body</span>
      </FullPageSheet>,
    );

    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(close);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
