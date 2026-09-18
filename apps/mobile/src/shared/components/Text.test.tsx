import { render } from "@testing-library/react";
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
});
