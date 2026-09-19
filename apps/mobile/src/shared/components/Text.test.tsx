import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";
import { MAX_FONT_SCALE, MAX_FONT_SCALE_COMPACT, MAX_TEXT_SIZE, mobileText } from "../theme/tokens";

const nativeText = vi.hoisted(() => ({ multipliers: [] as Array<number | undefined> }));
vi.mock("react-native", async () => {
  const React = await import("react");
  const native = createReactNativeModule(React);
  return {
    ...native,
    Text: (props: Record<string, unknown>) => {
      nativeText.multipliers.push(props.maxFontSizeMultiplier as number | undefined);
      return React.createElement(native.Text, props);
    },
  };
});

let Text: (typeof import("./Text"))["Text"];
let resolveTextMultiplier: (typeof import("./Text"))["resolveTextMultiplier"];
let androidLineHeight: (typeof import("./Text"))["androidLineHeight"];

beforeAll(async () => {
  ({ Text, resolveTextMultiplier, androidLineHeight } = await import("./Text"));
});

beforeEach(() => {
  nativeText.multipliers = [];
});

describe("Text", () => {
  it("applies the app's text-size ceiling by default", () => {
    render(<Text>Day Shift</Text>);
    expect(nativeText.multipliers).toEqual([MAX_FONT_SCALE]);
  });

  it("lets a call site choose a tighter ceiling", () => {
    render(<Text maxFontSizeMultiplier={MAX_FONT_SCALE_COMPACT}>9+</Text>);
    expect(nativeText.multipliers).toEqual([MAX_FONT_SCALE_COMPACT]);
  });

  it("keeps body copy at the full multiplier under the size ceiling", () => {
    render(<Text style={mobileText.body}>Sheltered Care</Text>);
    expect(nativeText.multipliers).toEqual([MAX_FONT_SCALE]);
  });

  it("holds a headline at the size ceiling instead of the multiplier", () => {
    render(<Text style={mobileText.display}>Welcome back!</Text>);
    expect(nativeText.multipliers).toEqual([MAX_TEXT_SIZE / mobileText.display.fontSize]);
    expect(MAX_TEXT_SIZE / mobileText.display.fontSize).toBeLessThan(MAX_FONT_SCALE);
  });

  it("never asks for a multiplier below one, which would mean no scaling", () => {
    expect(resolveTextMultiplier(40, undefined)).toBe(1);
    expect(resolveTextMultiplier(undefined, undefined)).toBe(MAX_FONT_SCALE);
    expect(resolveTextMultiplier(10, MAX_FONT_SCALE_COMPACT)).toBe(MAX_FONT_SCALE_COMPACT);
  });

  describe("androidLineHeight", () => {
    // Android multiplies lineHeight by the uncapped OS setting, so the value
    // handed over is pre-divided to land on the capped size.
    it("pre-divides the line height once the setting passes the cap", () => {
      expect(androidLineHeight(14, MAX_FONT_SCALE_COMPACT, 2)).toBeCloseTo((14 * 1.2) / 2);
      expect(androidLineHeight(21, MAX_FONT_SCALE, 2)).toBeCloseTo((21 * 1.5) / 2);
    });

    it("leaves the style alone while the setting is within the cap, or has no line height", () => {
      expect(androidLineHeight(14, MAX_FONT_SCALE_COMPACT, 1.1)).toBeUndefined();
      expect(androidLineHeight(14, MAX_FONT_SCALE, 1)).toBeUndefined();
      expect(androidLineHeight(undefined, MAX_FONT_SCALE, 2)).toBeUndefined();
    });
  });

  describe("fit", () => {
    it("keeps compact text on one line, truncating, under the compact ceiling", () => {
      render(
        <Text fit="compact" style={mobileText.badge}>
          Supervisor
        </Text>,
      );
      const text = screen.getByText("Supervisor");
      expect(text).toHaveAttribute("data-number-of-lines", "1");
      expect(text).toHaveAttribute("data-ellipsize-mode", "tail");
      expect(text).not.toHaveAttribute("data-allow-font-scaling");
      expect(text).not.toHaveAttribute("data-adjusts-font-size-to-fit");
      expect(nativeText.multipliers).toEqual([MAX_FONT_SCALE_COMPACT]);
    });

    it("holds fixed text at its designed size on one line", () => {
      render(<Text fit="fixed">Fri, Oct 9</Text>);
      const text = screen.getByText("Fri, Oct 9");
      expect(text).toHaveAttribute("data-number-of-lines", "1");
      expect(text).toHaveAttribute("data-allow-font-scaling", "false");
      expect(text).not.toHaveAttribute("data-adjusts-font-size-to-fit");
    });

    it("caps a looser requested multiplier but honours a tighter one", () => {
      expect(resolveTextMultiplier(12, MAX_FONT_SCALE, "compact")).toBe(MAX_FONT_SCALE_COMPACT);
      expect(resolveTextMultiplier(12, 1.1, "compact")).toBe(1.1);
      expect(MAX_FONT_SCALE_COMPACT).toBeLessThan(MAX_FONT_SCALE);
    });

    it("lets a call site choose where the ellipsis goes", () => {
      render(
        <Text ellipsizeMode="middle" fit="compact">
          Skilled Nursing
        </Text>,
      );
      expect(screen.getByText("Skilled Nursing")).toHaveAttribute("data-ellipsize-mode", "middle");
    });
  });
});
