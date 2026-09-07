import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";
import { resetSheetPresentationTracking } from "../lib/modal-presentation";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

let BottomSheetModal: (typeof import("./BottomSheetModal"))["BottomSheetModal"];

beforeAll(async () => {
  BottomSheetModal = (await import("./BottomSheetModal")).BottomSheetModal;
});

beforeEach(() => {
  resetSheetPresentationTracking();
});

describe("BottomSheetModal close button", () => {
  it("offers a Close control that leaves through the same funnel as the drag", () => {
    const onDismiss = vi.fn();

    render(
      <BottomSheetModal visible onDismiss={onDismiss}>
        <span>Body</span>
      </BottomSheetModal>,
    );

    // The drag, the outside tap and Android back all leave, but every one of
    // them is a gesture. A sheet holding unsaved input answers its own footer
    // button with Discard, which resets rather than leaves, so this is the only
    // control on screen that closes it.
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("withholds it from a sheet that refuses dismissal", () => {
    const onDismiss = vi.fn();

    render(
      <BottomSheetModal dismissDisabled visible onDismiss={onDismiss}>
        <span>Body</span>
      </BottomSheetModal>,
    );

    // A consent or app-lock gate must not offer a way out it will then refuse:
    // the button would be inert, which reads as the sheet being broken.
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });
});
