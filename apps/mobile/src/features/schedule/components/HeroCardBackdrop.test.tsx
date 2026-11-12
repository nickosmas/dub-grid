import { act, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({
  handler: null as ((event: unknown) => void) | null,
}));

vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  return {
    ...actual,
    View: ({
      children,
      onLayout,
    }: {
      children?: ReactNode;
      onLayout?: (event: unknown) => void;
    }) => {
      layout.handler = onLayout ?? null;
      return createElement("div", null, children);
    },
  };
});

vi.mock("react-native-svg", () => {
  const passthrough = ({ children }: { children?: ReactNode }) =>
    createElement("g", null, children);
  const Svg = ({
    children,
    height,
    width,
  }: {
    children?: ReactNode;
    height?: number;
    width?: number;
  }) =>
    createElement(
      "svg",
      { "data-height": height, "data-testid": "svg", "data-width": width },
      children,
    );
  return {
    default: Svg,
    Circle: passthrough,
    Defs: passthrough,
    Pattern: passthrough,
    RadialGradient: passthrough,
    Rect: passthrough,
    Stop: passthrough,
  };
});

const { HeroCardBackdrop } = await import("./HeroCardBackdrop");

function layOut(width: number, height: number) {
  act(() => {
    layout.handler?.({ nativeEvent: { layout: { height, width, x: 0, y: 0 } } });
  });
}

describe("HeroCardBackdrop", () => {
  it("draws nothing until the card has a size", () => {
    render(createElement(HeroCardBackdrop, { isDark: false }));
    expect(screen.queryByTestId("svg")).toBeNull();
  });

  it("redraws at the new size when the card grows", () => {
    render(createElement(HeroCardBackdrop, { isDark: false }));
    layOut(358, 300);
    expect(screen.getByTestId("svg")).toHaveAttribute("data-height", "300");

    // The Working with block arrives after the first layout and the card grows.
    layOut(358, 412);
    const svg = screen.getByTestId("svg");
    expect(svg).toHaveAttribute("data-height", "412");
    expect(svg).toHaveAttribute("data-width", "358");
  });
});
