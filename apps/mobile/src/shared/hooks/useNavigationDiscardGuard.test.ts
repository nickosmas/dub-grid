import { act, renderHook } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import {
  navigatedActions,
  pressBack,
  resetNavigationShim,
} from "../../test/shims/react-navigation-native";
import { useNavigationDiscardGuard } from "./useNavigationDiscardGuard";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

function renderGuardedScreen(options: { isDirty?: boolean; disabled?: boolean } = {}) {
  const onDiscard = vi.fn();
  const onClose = vi.fn();
  let props = { isDirty: options.isDirty ?? true, disabled: options.disabled ?? false };
  const view = renderHook(
    (next: { isDirty: boolean; disabled: boolean }) => {
      const guard = useUnsavedChangesGuard({
        isDirty: next.isDirty,
        disabled: next.disabled,
        onDiscard,
        onClose,
      });
      useNavigationDiscardGuard(guard);

      return guard;
    },
    { initialProps: props },
  );

  function back() {
    let prevented = false;
    act(() => {
      prevented = pressBack();
    });

    return prevented;
  }

  return { back, onClose, onDiscard, view };
}

beforeEach(() => resetNavigationShim());

describe("useNavigationDiscardGuard", () => {
  it("lets a clean screen go back", () => {
    const { back, view } = renderGuardedScreen({ isDirty: false });

    expect(back()).toBe(false);
    expect(navigatedActions).toEqual([{ type: "GO_BACK" }]);
    expect(view.result.current.confirmationProps.visible).toBe(false);
  });

  it("asks before a back press throws away edits", () => {
    const { back, onClose, view } = renderGuardedScreen();

    expect(back()).toBe(true);
    expect(navigatedActions).toHaveLength(0);
    expect(view.result.current.confirmationProps.visible).toBe(true);
    // The pop replaces the panel's own close, so `onClose` stays untouched —
    // running both would flash the read-only view on the way out.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("navigates once the discard is confirmed", () => {
    // The regression test for the trap in this hook: `usePreventRemove`'s
    // listener closes over the render-time `preventRemove`, so dispatching from
    // the confirm handler instead of from the effect is vetoed by our own guard
    // and the back button silently stops working. The shim routes `dispatch`
    // through the same registry, so that bug fails here.
    const { back, onDiscard, view } = renderGuardedScreen();

    back();
    act(() => view.result.current.confirmationProps.onConfirm());

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(navigatedActions).toEqual([{ type: "GO_BACK" }]);
  });

  it("stays put, with the edit intact, when the discard is declined", () => {
    const { back, onDiscard, view } = renderGuardedScreen();

    back();
    act(() => view.result.current.confirmationProps.onCancel());

    expect(navigatedActions).toHaveLength(0);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(view.result.current.confirmationProps.visible).toBe(false);
  });

  it("gets out of the way while a save is in flight", () => {
    // Deliberately unlike the sheet case, which swallows the exit: preventing
    // removal here would trap the user behind a modal they cannot answer.
    const { back, view } = renderGuardedScreen({ disabled: true });

    expect(back()).toBe(false);
    expect(navigatedActions).toEqual([{ type: "GO_BACK" }]);
    expect(view.result.current.confirmationProps.visible).toBe(false);
  });

  it("stops guarding once the screen is unmounted", () => {
    const { view } = renderGuardedScreen();

    view.unmount();

    expect(pressBack()).toBe(false);
  });
});
