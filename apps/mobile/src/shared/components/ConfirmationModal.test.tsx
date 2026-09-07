import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../test/native";

const nativeModal = vi.hoisted(() => ({ requestClose: undefined as undefined | (() => void) }));
vi.mock("react-native", async () => {
  const React = await import("react");
  const native = createReactNativeModule(React);
  return {
    ...native,
    Modal: (props: Record<string, unknown>) => {
      nativeModal.requestClose = props.onRequestClose as () => void;
      return React.createElement(native.Modal, props);
    },
  };
});

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

let ConfirmationModal: (typeof import("./ConfirmationModal"))["ConfirmationModal"];

beforeAll(async () => {
  ConfirmationModal = (await import("./ConfirmationModal")).ConfirmationModal;
});

describe("ConfirmationModal", () => {
  it("requires an explicit confirm before executing the action", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmationModal
        body="Send an app invitation to mina@dubgrid.com?"
        confirmLabel="Send Invitation"
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="Send invitation?"
        visible
      />,
    );

    expect(onConfirm).not.toHaveBeenCalled();

    const dialog = within(screen.getByRole("alert"));
    fireEvent.click(dialog.getByRole("button", { name: "Send Invitation" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("shows why the confirm failed, inside the confirmation that failed", () => {
    // A `<Modal>` is its own native window, so a toast pushed from the caller's
    // error handler renders behind it. Without this the button just stopped
    // spinning and the user got no explanation at all.
    render(
      <ConfirmationModal
        body="The staff profile will be updated."
        confirmLabel="Save"
        error="We couldn't save those staff details right now."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Save these changes?"
        visible
      />,
    );

    expect(
      within(screen.getByRole("alert")).getByText(
        "We couldn't save those staff details right now.",
      ),
    ).toBeInTheDocument();
  });

  it("shows no error row when there is nothing to report", () => {
    render(
      <ConfirmationModal
        body="The staff profile will be updated."
        confirmLabel="Save"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Save these changes?"
        visible
      />,
    );

    expect(screen.queryByText(/couldn't/i)).toBeNull();
  });
});

describe("confirmation dismissal policy", () => {
  it("treats backdrop and Android back as cancel, never confirm", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmationModal
        visible
        title="Remove access?"
        confirmLabel="Remove"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    act(() => nativeModal.requestClose?.());
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("blocks backdrop, cancel, back, and duplicate confirm while pending", async () => {
    let settle!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const onCancel = vi.fn();
    render(
      <ConfirmationModal
        visible
        title="Remove access?"
        confirmLabel="Remove"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole("button", { name: "Remove" });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    act(() => nativeModal.requestClose?.());
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => {
      settle();
    });
    act(() => nativeModal.requestClose?.());
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
