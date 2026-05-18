import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  createReactNativeModule,
  createSafeAreaContextModule,
} from "../../test/native";

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

let ConfirmationModal: (typeof import("./ConfirmationModal"))["ConfirmationModal"];

beforeAll(async () => {
  ConfirmationModal = (await import("./ConfirmationModal")).ConfirmationModal;
});

describe("ConfirmationModal", () => {
  it("requires an explicit cancel or confirm action", () => {
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

    expect(screen.queryByLabelText("Dismiss confirmation")).toBeNull();

    const dialog = within(screen.getByRole("alert"));
    fireEvent.click(dialog.getByRole("button", { name: "Send Invitation" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
