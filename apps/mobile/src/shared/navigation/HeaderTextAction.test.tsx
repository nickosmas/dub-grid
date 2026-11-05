import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("expo-router", async () => {
  const React = await import("react");
  return {
    Stack: {
      Screen: () => null,
      Toolbar: Object.assign(
        ({ children }: { children?: React.ReactNode }) =>
          React.createElement("div", { "data-testid": "bar-items" }, children),
        {
          Button: (props: {
            children?: React.ReactNode;
            accessibilityLabel?: string;
            onPress?: () => void;
          }) =>
            React.createElement(
              "button",
              { "aria-label": props.accessibilityLabel, onClick: props.onPress, type: "button" },
              props.children,
            ),
        },
      ),
    },
  };
});

let createHeaderTextAction: (typeof import("./HeaderTextAction"))["createHeaderTextAction"];
let HeaderTextBarAction: (typeof import("./HeaderTextAction"))["HeaderTextBarAction"];

beforeAll(async () => {
  ({ createHeaderTextAction, HeaderTextBarAction } = await import("./HeaderTextAction"));
});

describe("HeaderTextBarAction", () => {
  // A system bar item, so iOS can morph it into the next screen's items.
  it("puts the action in the bar as a native item that presses through", () => {
    const onPress = vi.fn();
    render(<HeaderTextBarAction action={{ label: "Edit", onPress }} />);

    const item = screen.getByRole("button", { name: "Edit" });
    expect(screen.getByTestId("bar-items")).toContainElement(item);
    fireEvent.click(item);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("leaves the bar empty without an action", () => {
    render(<HeaderTextBarAction action={null} />);

    expect(screen.queryByTestId("bar-items")).toBeNull();
  });
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
