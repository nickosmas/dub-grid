import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));

let PermissionsSheet: (typeof import("./PermissionsSheet"))["PermissionsSheet"];

beforeAll(async () => {
  PermissionsSheet = (await import("./PermissionsSheet")).PermissionsSheet;
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const LABELS = {
  focusAreaLabel: "Focus Areas",
  certificationLabel: "Certifications",
  roleLabel: "Roles",
};

function renderSheet(onSave: () => boolean | Promise<boolean>) {
  const onDismiss = vi.fn();
  const save = vi.fn(onSave);
  render(
    <PermissionsSheet
      isPending={false}
      labels={LABELS}
      onDismiss={onDismiss}
      onSave={save}
      personName="Mina Diaz"
      stored={null}
      visible
    />,
  );
  return { onDismiss, save };
}

function toggleFirstSwitch() {
  fireEvent.click(screen.getAllByRole("switch")[0]!);
}

describe("PermissionsSheet", () => {
  it("closes untouched without asking", () => {
    const { onDismiss } = renderSheet(() => true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Save your changes?")).not.toBeInTheDocument();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("asks before a changed switch is dropped, and saves from the question", async () => {
    const { onDismiss, save } = renderSheet(async () => true);
    toggleFirstSwitch();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Save your changes?")).toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Save" }));
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stays open when the save from the question fails", async () => {
    const { onDismiss } = renderSheet(async () => false);
    toggleFirstSwitch();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Save" }));
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(screen.queryByText("Save your changes?")).not.toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
