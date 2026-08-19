import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

function renderGuard(options: { isDirty?: boolean; disabled?: boolean } = {}) {
  const onDiscard = vi.fn();
  const onClose = vi.fn();
  let props = { isDirty: options.isDirty ?? true, disabled: options.disabled ?? false };
  const view = renderHook(
    (next: { isDirty: boolean; disabled: boolean }) =>
      useUnsavedChangesGuard({
        isDirty: next.isDirty,
        disabled: next.disabled,
        onDiscard,
        onClose,
      }),
    { initialProps: props },
  );

  function requestClose() {
    act(() => view.result.current.requestClose());
  }

  function confirm() {
    act(() => view.result.current.confirmationProps.onConfirm());
  }

  function cancel() {
    act(() => view.result.current.confirmationProps.onCancel());
  }

  function setProps(next: Partial<typeof props>) {
    props = { ...props, ...next };
    act(() => view.rerender(props));
  }

  return { cancel, confirm, onClose, onDiscard, requestClose, setProps, view };
}

describe("useUnsavedChangesGuard", () => {
  it("lets a clean surface close without asking", () => {
    const { onClose, onDiscard, requestClose, view } = renderGuard({ isDirty: false });

    requestClose();

    expect(onClose).toHaveBeenCalledTimes(1);
    // The reset runs on every exit, not only on a confirmed discard: a sheet
    // that closes clean and reopens must not still be holding the old draft.
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(view.result.current.confirmationProps.visible).toBe(false);
  });

  it("asks before a dirty surface closes, and closes nothing yet", () => {
    const { onClose, onDiscard, requestClose, view } = renderGuard();

    requestClose();

    expect(view.result.current.confirmationProps.visible).toBe(true);
    expect(view.result.current.isConfirming).toBe(true);
    // Leaving the surface open is the whole mechanism: a dragged sheet settles
    // back into place under the confirmation rather than parking off-screen.
    expect(onClose).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("resets and closes once the discard is confirmed", () => {
    const { confirm, onClose, onDiscard, requestClose, view } = renderGuard();

    requestClose();
    confirm();

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(view.result.current.confirmationProps.visible).toBe(false);
  });

  it("keeps the edit and the surface when the discard is declined", () => {
    const { cancel, onClose, onDiscard, requestClose, view } = renderGuard();

    requestClose();
    cancel();

    expect(onDiscard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(view.result.current.confirmationProps.visible).toBe(false);
  });

  it("offers Keep Editing rather than a second Cancel", () => {
    // The sheets this replaces label their own dismiss button "Cancel", so a
    // confirmation offering "Cancel" asks the user to cancel their cancel.
    const { view } = renderGuard();

    expect(view.result.current.confirmationProps.cancelLabel).toBe("Keep Editing");
    expect(view.result.current.confirmationProps.confirmTone).toBe("danger");
  });

  it("swallows an exit while a write is in flight", () => {
    const { onClose, onDiscard, requestClose, view } = renderGuard({ disabled: true });

    requestClose();

    expect(onClose).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(view.result.current.confirmationProps.visible).toBe(false);
  });

  it("runs the caller's own exit instead of onClose", () => {
    const { confirm, onClose, view } = renderGuard();
    const exit = vi.fn();

    act(() => view.result.current.requestExit(exit));
    expect(exit).not.toHaveBeenCalled();

    confirm();

    expect(exit).toHaveBeenCalledTimes(1);
    // The navigation guard pops the screen itself; closing the panel too would
    // flash the read-only view for a frame on the way out.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("resets in place when a panel discards without leaving", () => {
    const { onClose, onDiscard, view } = renderGuard();

    act(() => view.result.current.discard());

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(view.result.current.confirmationProps.visible).toBe(false);
  });

  it("closes without asking once the surface stops being dirty", () => {
    const { onClose, requestClose, setProps } = renderGuard();

    setProps({ isDirty: false });
    requestClose();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
