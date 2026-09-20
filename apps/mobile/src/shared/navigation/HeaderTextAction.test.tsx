import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let createHeaderTextAction: (typeof import("./HeaderTextAction"))["createHeaderTextAction"];

beforeAll(async () => {
  ({ createHeaderTextAction } = await import("./HeaderTextAction"));
});

describe("createHeaderTextAction", () => {
  // Text only, no icon: the label is the whole affordance, and the platform
  // draws the capsule (or none) around it.
  it("renders a text button in the header's trailing slot that presses through", () => {
    const onPress = vi.fn();
    const options = createHeaderTextAction({
      label: "Edit",
      accessibilityHint: "Opens the editor",
      onPress,
    });

    expect(options).not.toHaveProperty("unstable_headerRightItems");
    render(<>{options.headerRight?.({ tintColor: "#000", canGoBack: true })}</>);

    const button = screen.getByRole("button", { name: "Edit" });
    expect(button).toHaveAttribute("aria-description", "Opens the editor");
    expect(button.querySelector("svg, img")).toBeNull();

    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("clears the slot explicitly when there is no action", () => {
    const options = createHeaderTextAction(null);

    expect(options).toEqual({ headerRight: undefined });
    expect(Object.keys(options)).toEqual(["headerRight"]);
  });
});
