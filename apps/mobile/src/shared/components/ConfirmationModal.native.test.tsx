import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertButton } from "react-native";
import { createReactNativeModule } from "../../test/native";

const alert = vi.hoisted(() => vi.fn());

vi.mock("react-native", async () => ({
  ...(await createReactNativeModule(await import("react"))),
  Alert: { alert },
}));
vi.mock("../lib/haptics", () => ({ hapticImpact: vi.fn() }));

import { ConfirmationModal } from "./ConfirmationModal.native";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";

type AlertCall = [string, string | undefined, AlertButton[], { onDismiss?: () => void }?];
const lastAlert = () => alert.mock.calls.at(-1) as AlertCall;
const press = (text: string) => lastAlert()[2].find((button) => button.text === text)!.onPress!();
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const props = {
  visible: true,
  title: "Discard unsaved changes?",
  body: "Your edits won't be saved.",
  confirmLabel: "Discard",
  cancelLabel: "Keep editing",
  confirmTone: "danger" as const,
};

beforeEach(() => alert.mockClear());

describe("ConfirmationModal (native alert)", () => {
  it("asks once in the system alert and cancels from its cancel button", () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmationModal {...props} onCancel={onCancel} onConfirm={vi.fn()} />,
    );
    rerender(<ConfirmationModal {...props} onCancel={onCancel} onConfirm={vi.fn()} />);

    expect(alert).toHaveBeenCalledTimes(1);
    expect(lastAlert()[0]).toBe("Discard unsaved changes?");
    expect(lastAlert()[1]).toBe("Your edits won't be saved.");
    expect(lastAlert()[2].map((button) => [button.text, button.style])).toEqual([
      ["Keep editing", "cancel"],
      ["Discard", "destructive"],
    ]);
    press("Keep editing");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("confirms from the destructive button", async () => {
    const onConfirm = vi.fn();
    render(<ConfirmationModal {...props} onCancel={vi.fn()} onConfirm={onConfirm} />);

    press("Discard");
    await flush();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("runs a second action from its own button", () => {
    const onPress = vi.fn();
    render(
      <ConfirmationModal
        {...props}
        secondaryAction={{ label: "Keep shifts", onPress }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    press("Keep shifts");
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("treats dismissing the alert as cancel", () => {
    const onCancel = vi.fn();
    render(<ConfirmationModal {...props} onCancel={onCancel} onConfirm={vi.fn()} />);

    lastAlert()[3]?.onDismiss?.();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("reports a failure in a second alert that offers Try again", async () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConfirmationModal {...props} onCancel={vi.fn()} onConfirm={onConfirm} />,
    );
    rerender(
      <ConfirmationModal
        {...props}
        error="Couldn't discard."
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(lastAlert()[1]).toBe("Couldn't discard.");
    expect(lastAlert()[2].map((button) => button.text)).toEqual(["Keep editing", "Try again"]);
    press("Try again");
    await flush();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows again each time it is opened", () => {
    const { rerender } = render(
      <ConfirmationModal {...props} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    rerender(
      <ConfirmationModal {...props} visible={false} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    rerender(<ConfirmationModal {...props} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it("asks an unsaved-changes question with Save, Discard and Keep editing", async () => {
    const onSave = vi.fn(async () => true);
    const onDiscard = vi.fn();
    function Guarded() {
      const guard = useUnsavedChangesGuard({ isDirty: true, onDiscard, onSave });
      return (
        <>
          <button onClick={guard.requestClose} type="button">
            Close
          </button>
          <ConfirmationModal {...guard.confirmationProps} />
        </>
      );
    }
    const view = render(<Guarded />);

    act(() => view.getByText("Close").click());

    expect(lastAlert()[0]).toBe("Save your changes?");
    expect(lastAlert()[2].map((button) => [button.text, button.style])).toEqual([
      ["Keep editing", "cancel"],
      ["Discard", "default"],
      ["Save", "default"],
    ]);
    await act(async () => {
      press("Save");
      await flush();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
