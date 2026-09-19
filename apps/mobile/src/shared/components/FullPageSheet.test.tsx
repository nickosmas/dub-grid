import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";
import { getVisibleSheetCount, resetSheetPresentationTracking } from "../lib/modal-presentation";

const nativeModal = vi.hoisted(() => ({
  allowSwipeDismissal: undefined as boolean | undefined,
  mounts: 0,
  requestClose: undefined as undefined | (() => void),
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const native = createReactNativeModule(React);
  return {
    ...native,
    Modal: (props: Record<string, unknown>) => {
      nativeModal.allowSwipeDismissal = props.allowSwipeDismissal as boolean | undefined;
      nativeModal.requestClose = props.onRequestClose as () => void;
      React.useEffect(() => {
        nativeModal.mounts += 1;
      }, []);
      return React.createElement(native.Modal, props);
    },
  };
});
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
  nativeModal.allowSwipeDismissal = undefined;
  nativeModal.mounts = 0;
  nativeModal.requestClose = undefined;
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
    expect(nativeModal.allowSwipeDismissal).toBe(false);
    act(() => nativeModal.requestClose?.());
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("lets a clean sheet be swiped away and closes it through the funnel", () => {
    const onDismiss = vi.fn();

    render(
      <FullPageSheet title="Swap" visible onDismiss={onDismiss}>
        <span>Body</span>
      </FullPageSheet>,
    );

    expect(nativeModal.allowSwipeDismissal).toBe(true);
    act(() => nativeModal.requestClose?.());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("refuses the swipe over unsaved changes but still reports the attempt", () => {
    const onDismiss = vi.fn();

    render(
      <FullPageSheet hasUnsavedChanges title="Swap" visible onDismiss={onDismiss}>
        <span>Body</span>
      </FullPageSheet>,
    );

    expect(nativeModal.allowSwipeDismissal).toBe(false);
    act(() => nativeModal.requestClose?.());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("keeps the same card mounted when a refused swipe leaves it visible", () => {
    render(
      <FullPageSheet hasUnsavedChanges title="Swap" visible onDismiss={vi.fn()}>
        <span>Body</span>
      </FullPageSheet>,
    );

    expect(nativeModal.mounts).toBe(1);
    act(() => nativeModal.requestClose?.());

    expect(nativeModal.mounts).toBe(1);
    expect(screen.getByText("Body")).toBeInTheDocument();
  });
});
