import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

const env = vi.hoisted(() => ({ sideColumn: false }));
const DRAWN_CHECKMARK = { uri: "drawn-checkmark" };

vi.mock("react-native", async () => ({
  ...(await createReactNativeModule(await import("react"))),
  Platform: { OS: "ios" },
}));

vi.mock("./useHasSideColumn", () => ({ useHasSideColumn: () => env.sideColumn }));

vi.mock("./useToolbarIcon", () => ({
  useToolbarIcon: (sf: string) => sf,
  useIosToolbarImage: () => DRAWN_CHECKMARK,
}));

vi.mock("../providers/ThemeModeProvider", () => ({
  useMobileColors: () => ({ brand: "#2563EB", onBrandText: "#FFFFFF" }),
}));

vi.mock("expo-router", async () => {
  const React = await import("react");
  const Button = (props: {
    children?: React.ReactNode;
    accessibilityLabel?: string;
    icon?: unknown;
    iconRenderingMode?: string;
  }) =>
    React.createElement(
      "button",
      {
        "aria-label": props.accessibilityLabel,
        "data-icon": typeof props.icon === "string" ? props.icon : "image",
        "data-rendering": props.iconRenderingMode,
        type: "button",
      },
      props.children,
    );
  return {
    useNavigation: () => ({ setOptions: () => undefined }),
    Stack: {
      Screen: () => null,
      Toolbar: Object.assign(
        ({ children }: { children?: React.ReactNode }) =>
          React.createElement("div", null, children),
        { Button, Menu: () => null, MenuAction: () => null },
      ),
    },
  };
});

let EditBarActions: (typeof import("./EditBarActions"))["EditBarActions"];

beforeAll(async () => {
  ({ EditBarActions } = await import("./EditBarActions"));
});

beforeEach(() => {
  env.sideColumn = false;
});

const save = { label: "Save", onPress: () => undefined };

describe("EditBarActions", () => {
  it("draws the white checkmark on the brand capsule in a phone's bar", () => {
    render(<EditBarActions save={save} />);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("data-icon", "image");
    expect(button).toHaveAttribute("data-rendering", "original");
  });

  it("uses the system symbol in an iPhone Duo's side column, which takes only symbols", () => {
    env.sideColumn = true;
    render(<EditBarActions save={save} />);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("data-icon", "checkmark");
    expect(button).not.toHaveAttribute("data-rendering");
  });
});
