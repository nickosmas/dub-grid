import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";
import { MAX_FONT_SCALE, MAX_FONT_SCALE_FIXED, MAX_TEXT_SIZE, mobileText } from "../theme/tokens";

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

beforeAll(async () => {
  ({ Text, resolveTextMultiplier } = await import("./Text"));
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
    render(<Text maxFontSizeMultiplier={MAX_FONT_SCALE_FIXED}>9+</Text>);
    expect(nativeText.multipliers).toEqual([MAX_FONT_SCALE_FIXED]);
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
    expect(resolveTextMultiplier(10, MAX_FONT_SCALE_FIXED)).toBe(MAX_FONT_SCALE_FIXED);
  });

  describe("fit", () => {
    it("keeps compact text on one line, truncating, under the fixed ceiling", () => {
      render(
        <Text fit="compact" style={mobileText.badge}>
          Supervisor
        </Text>,
      );
      const text = screen.getByText("Supervisor");
      expect(text).toHaveAttribute("data-number-of-lines", "1");
      expect(text).toHaveAttribute("data-ellipsize-mode", "tail");
      expect(text).not.toHaveAttribute("data-adjusts-font-size-to-fit");
      expect(nativeText.multipliers).toEqual([MAX_FONT_SCALE_FIXED]);
    });

    it("shrinks bounded text to fit instead of truncating it", () => {
      render(<Text fit="shrink">Fri, Oct 9</Text>);
      const text = screen.getByText("Fri, Oct 9");
      expect(text).toHaveAttribute("data-number-of-lines", "1");
      expect(text).toHaveAttribute("data-adjusts-font-size-to-fit", "true");
      expect(nativeText.multipliers).toEqual([MAX_FONT_SCALE_FIXED]);
    });

    it("caps a looser requested multiplier but honours a tighter one", () => {
      expect(resolveTextMultiplier(12, MAX_FONT_SCALE, "compact")).toBe(MAX_FONT_SCALE_FIXED);
      expect(resolveTextMultiplier(12, 1.1, "compact")).toBe(1.1);
      // The size ceiling still applies on top of the fixed multiplier.
      expect(resolveTextMultiplier(mobileText.display.fontSize, undefined, "shrink")).toBe(
        MAX_TEXT_SIZE / mobileText.display.fontSize,
      );
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
