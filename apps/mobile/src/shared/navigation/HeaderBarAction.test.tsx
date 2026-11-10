import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

const platform = vi.hoisted(() => ({ OS: "ios" as "ios" | "android", icon: undefined as unknown }));

vi.mock("react-native", async () => ({
  ...(await createReactNativeModule(await import("react"))),
  Platform: {
    get OS() {
      return platform.OS;
    },
  },
}));

vi.mock("./useToolbarIcon", () => ({ useToolbarIcon: () => platform.icon }));

vi.mock("expo-router", async () => {
  const React = await import("react");
  return {
    Stack: {
      Toolbar: Object.assign(
        ({ children, placement }: { children?: React.ReactNode; placement: string }) =>
          React.createElement("div", { "data-testid": `bar-${placement}` }, children),
        {
          Button: (props: {
            children?: React.ReactNode;
            accessibilityLabel?: string;
            disabled?: boolean;
            icon?: unknown;
            onPress?: () => void;
          }) =>
            React.createElement(
              "button",
              {
                "aria-label": props.accessibilityLabel,
                "data-icon": props.icon === undefined ? undefined : String(props.icon),
                disabled: props.disabled,
                onClick: props.onPress,
                type: "button",
              },
              props.children,
            ),
        },
      ),
    },
  };
});

let HeaderBarAction: (typeof import("./HeaderBarAction"))["HeaderBarAction"];

beforeAll(async () => {
  ({ HeaderBarAction } = await import("./HeaderBarAction"));
});

beforeEach(() => {
  platform.OS = "ios";
  platform.icon = undefined;
});

const props = {
  label: "Mark all read",
  sfSymbol: "checkmark.circle",
  materialIcon: "done-all",
  placement: "right",
} as const;

describe("HeaderBarAction", () => {
  it("shows its words on iOS and presses through", () => {
    platform.icon = "checkmark.circle";
    const onPress = vi.fn();
    render(<HeaderBarAction {...props} onPress={onPress} />);

    const button = screen.getByRole("button", { name: "Mark all read" });
    expect(button).toHaveTextContent("Mark all read");
    expect(button).not.toHaveAttribute("data-icon");
    expect(screen.getByTestId("bar-right")).toContainElement(button);
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows the SF Symbol on iOS when icon-only", () => {
    platform.icon = "person.badge.plus";
    render(
      <HeaderBarAction {...props} iconOnly label="Add person" placement="left" onPress={vi.fn()} />,
    );

    const button = screen.getByRole("button", { name: "Add person" });
    expect(button).toHaveAttribute("data-icon", "person.badge.plus");
    expect(button).toHaveTextContent("");
    expect(screen.getByTestId("bar-left")).toContainElement(button);
  });

  it("waits on Android for the Material icon's image, then shows the icon", () => {
    platform.OS = "android";
    const { rerender } = render(<HeaderBarAction {...props} onPress={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();

    platform.icon = "android-image";
    rerender(<HeaderBarAction {...props} disabled onPress={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Mark all read" });
    expect(button).toHaveAttribute("data-icon", "android-image");
    expect(button).toHaveTextContent("");
    expect(button).toBeDisabled();
  });
});
