import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createReactNativeModule,
  emitKeyboardEvent,
  subscribedKeyboardEvents,
} from "../../test/native";
import { useKeyboardInset } from "./useKeyboardInset";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

describe("useKeyboardInset", () => {
  it("follows the keyboard up and back to zero", () => {
    const view = renderHook(() => useKeyboardInset());

    expect(view.result.current).toBe(0);

    act(() => emitKeyboardEvent("keyboardWillShow", { endCoordinates: { height: 336 } }));
    expect(view.result.current).toBe(336);

    // The whole point of the hook: a hide is zero, whatever the event says its
    // coordinates are. `KeyboardAvoidingView` derives a residual inset from
    // them instead, which is what left the sheet floating above the bottom of
    // the screen with the undimmed app showing through underneath.
    act(() =>
      emitKeyboardEvent("keyboardWillHide", { endCoordinates: { height: 0, screenY: 812 } }),
    );
    expect(view.result.current).toBe(0);
  });

  it("takes the leading events on iOS, so the sheet travels with the keyboard", () => {
    renderHook(() => useKeyboardInset());

    expect(subscribedKeyboardEvents()).toEqual(["keyboardWillShow", "keyboardWillHide"]);
  });

  it("unsubscribes on unmount", () => {
    const view = renderHook(() => useKeyboardInset());
    view.unmount();

    expect(subscribedKeyboardEvents()).toEqual([]);
  });
});

describe("useKeyboardInset on Android", () => {
  it("takes the settled events, which are the only ones Android emits", async () => {
    vi.resetModules();
    vi.doMock("react-native", async () =>
      createReactNativeModule(await import("react"), { platformOS: "android" }),
    );
    const android = await import("./useKeyboardInset");

    const view = renderHook(() => android.useKeyboardInset());

    expect(subscribedKeyboardEvents()).toEqual(["keyboardDidShow", "keyboardDidHide"]);

    act(() => emitKeyboardEvent("keyboardDidShow", { endCoordinates: { height: 280 } }));
    expect(view.result.current).toBe(280);

    // Android's hide event reports `screenY` as the height of the visible
    // display frame rather than its bottom edge, which is where the phantom
    // navigation-bar inset came from.
    act(() =>
      emitKeyboardEvent("keyboardDidHide", { endCoordinates: { height: 0, screenY: 750 } }),
    );
    expect(view.result.current).toBe(0);

    view.unmount();
    vi.doUnmock("react-native");
    vi.resetModules();
  });
});
