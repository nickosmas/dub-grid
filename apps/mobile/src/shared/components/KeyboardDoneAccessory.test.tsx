import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, keyboardDismissMock } from "../../test/native";
import type { TextInputProps } from "react-native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let useKeyboardDoneAccessory: (typeof import("./KeyboardDoneAccessory"))["useKeyboardDoneAccessory"];

beforeAll(async () => {
  useKeyboardDoneAccessory = (await import("./KeyboardDoneAccessory")).useKeyboardDoneAccessory;
});

beforeEach(() => {
  keyboardDismissMock.mockClear();
});

function Field(props: Pick<TextInputProps, "keyboardType" | "multiline"> & { always?: boolean }) {
  const { inputAccessoryViewID, keyboardDoneAccessory } = useKeyboardDoneAccessory(props);
  return (
    <div>
      <input data-testid="field" data-accessory-id={inputAccessoryViewID ?? ""} readOnly />
      {keyboardDoneAccessory}
    </div>
  );
}

describe("useKeyboardDoneAccessory", () => {
  it("gives numeric keypads a Done button that dismisses the keyboard", () => {
    render(<Field keyboardType="number-pad" />);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(keyboardDismissMock).toHaveBeenCalledTimes(1);
  });

  it("links the accessory to the field it belongs to", () => {
    render(<Field keyboardType="phone-pad" />);

    const accessoryId = screen.getByTestId("field").getAttribute("data-accessory-id");
    expect(accessoryId).toBeTruthy();
    // A native view identifier can't carry the colons `useId()` emits.
    expect(accessoryId).not.toContain(":");
    expect(screen.getByRole("button", { name: "Done" }).closest("[data-native-id]")).toHaveProperty(
      "dataset.nativeId",
      accessoryId,
    );
  });

  it("covers multiline fields, where return inserts a newline instead of dismissing", () => {
    render(<Field multiline />);

    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
  });

  it("stays out of the way when the keyboard already has a return key", () => {
    render(<Field keyboardType="email-address" />);

    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.getByTestId("field").getAttribute("data-accessory-id")).toBe("");
  });

  // Login opts in this way: its keyboard covers the stage's submit button, so
  // every field advertises a way out even when its return key would also work.
  it("attaches to a return-key keyboard when the caller asks for it", () => {
    render(<Field always keyboardType="email-address" />);

    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    expect(screen.getByTestId("field").getAttribute("data-accessory-id")).toBeTruthy();
  });
});

describe("useKeyboardDoneAccessory on Android", () => {
  it("renders nothing, since the system back button dismisses the keyboard", async () => {
    vi.resetModules();
    vi.doMock("react-native", async () =>
      createReactNativeModule(await import("react"), { platformOS: "android" }),
    );
    const android = await import("./KeyboardDoneAccessory");

    function AndroidField() {
      const { inputAccessoryViewID, keyboardDoneAccessory } = android.useKeyboardDoneAccessory({
        keyboardType: "number-pad",
      });
      return (
        <div>
          <input data-testid="field" data-accessory-id={inputAccessoryViewID ?? ""} readOnly />
          {keyboardDoneAccessory}
        </div>
      );
    }

    render(<AndroidField />);

    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.getByTestId("field").getAttribute("data-accessory-id")).toBe("");
    vi.doUnmock("react-native");
    vi.resetModules();
  });
});
