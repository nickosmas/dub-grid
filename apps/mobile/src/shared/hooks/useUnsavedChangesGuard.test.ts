import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Let the confirmation finish leaving. The exit behind it is deliberately
 * sequenced (`useModalHandoff`), because tearing down a confirmation and the
 * sheet under it in one commit leaves the sheet stuck on screen.
 */
function completeModalHandoff() {
  act(() => {
    vi.runAllTimers();
  });
}

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

    // The confirmation goes immediately and the reset with it; only the exit
    // waits for that modal to finish leaving.
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(view.result.current.confirmationProps.visible).toBe(false);
    expect(onClose).not.toHaveBeenCalled();

    completeModalHandoff();

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the edit and the surface when the discard is declined", () => {
    const { cancel, onClose, onDiscard, requestClose, view } = renderGuard();

    requestClose();
    cancel();

    expect(onDiscard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(view.result.current.confirmationProps.visible).toBe(false);
  });

  it("offers Keep editing rather than a second Cancel", () => {
    // The sheets this replaces label their own dismiss button "Cancel", so a
    // confirmation offering "Cancel" asks the user to cancel their cancel.
    const { view } = renderGuard();

    expect(view.result.current.confirmationProps.cancelLabel).toBe("Keep editing");
  });

  it("asks Discard or Keep editing, in neither case red, when the surface can't save", () => {
    const { view } = renderGuard();
    const props = view.result.current.confirmationProps;

    expect(props.title).toBe("Discard your changes?");
    expect(props.body).toBe("You haven't saved what you changed here.");
    expect(props.confirmLabel).toBe("Discard");
    // Throwing away unsaved edits isn't destructive under the button rules.
    expect(props.confirmTone).toBe("primary");
    expect(props.secondaryAction).toBeUndefined();
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
    completeModalHandoff();

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

function renderSavingGuard(save: () => boolean | Promise<boolean>) {
  const onDiscard = vi.fn();
  const onClose = vi.fn();
  const onSave = vi.fn(save);
  const view = renderHook(() =>
    useUnsavedChangesGuard({ isDirty: true, onDiscard, onClose, onSave }),
  );
  act(() => view.result.current.requestClose());
  return { onClose, onDiscard, onSave, view };
}

describe("useUnsavedChangesGuard with a save", () => {
  it("offers Save, Discard and Keep editing", () => {
    const { view } = renderSavingGuard(() => true);
    const props = view.result.current.confirmationProps;

    expect(props.title).toBe("Save your changes?");
    expect(props.body).toBe("You haven't saved what you changed here.");
    expect(props.confirmLabel).toBe("Save");
    expect(props.confirmTone).toBe("primary");
    expect(props.secondaryAction?.label).toBe("Discard");
    expect(props.cancelLabel).toBe("Keep editing");
  });

  it("saves, then leaves once the save worked", async () => {
    const { onClose, onDiscard, onSave, view } = renderSavingGuard(async () => true);

    await act(async () => {
      await view.result.current.confirmationProps.onConfirm();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(view.result.current.confirmationProps.visible).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    completeModalHandoff();
    expect(onClose).toHaveBeenCalledTimes(1);
    // The saved draft is the surface's to settle; resetting it to the old
    // baseline would show the old values until the refetch lands.
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("stays when the save fails, with the question closed", async () => {
    const { onClose, onDiscard, view } = renderSavingGuard(async () => false);

    await act(async () => {
      await view.result.current.confirmationProps.onConfirm();
    });
    completeModalHandoff();

    expect(view.result.current.confirmationProps.visible).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("stays when the save throws", async () => {
    const { onClose, view } = renderSavingGuard(() => Promise.reject(new Error("offline")));

    await act(async () => {
      await view.result.current.confirmationProps.onConfirm();
    });
    completeModalHandoff();

    expect(view.result.current.confirmationProps.visible).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the question up while the save runs", async () => {
    let finish: (saved: boolean) => void = () => undefined;
    const { onClose, view } = renderSavingGuard(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );

    let pending: Promise<void> | void = undefined;
    act(() => {
      pending = view.result.current.confirmationProps.onConfirm();
    });
    expect(view.result.current.confirmationProps.visible).toBe(true);

    await act(async () => {
      finish(true);
      await pending;
    });
    completeModalHandoff();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("discards and leaves from the Discard answer without saving", () => {
    const { onClose, onDiscard, onSave, view } = renderSavingGuard(() => true);

    act(() => view.result.current.confirmationProps.secondaryAction?.onPress());
    completeModalHandoff();

    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps everything from Keep editing", () => {
    const { onClose, onDiscard, onSave, view } = renderSavingGuard(() => true);

    act(() => view.result.current.confirmationProps.onCancel());
    completeModalHandoff();

    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(view.result.current.confirmationProps.visible).toBe(false);
  });
});
