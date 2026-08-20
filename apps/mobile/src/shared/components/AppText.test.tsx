import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { darkMobileColors, mobileColors } from "../theme/tokens";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let AppText: (typeof import("./AppText"))["AppText"];
let getTextToneColors: (typeof import("./AppText"))["getTextToneColors"];

beforeAll(async () => {
  const module = await import("./AppText");
  AppText = module.AppText;
  getTextToneColors = module.getTextToneColors;
});

describe("AppText", () => {
  it("renders a react-native Text so existing text queries keep working", () => {
    render(<AppText>Upcoming shift</AppText>);
    expect(screen.getByText("Upcoming shift")).toBeInTheDocument();
  });

  it("forwards text props such as accessibility labels", () => {
    render(
      <AppText accessibilityLabel="Full shift title" numberOfLines={1}>
        Truncated
      </AppText>,
    );
    expect(screen.getByLabelText("Full shift title")).toBeInTheDocument();
  });
});

// The rendered `style` prop is dropped by the test harness before it reaches the
// DOM, so the tone mapping is asserted directly. It's the part worth pinning:
// a tone wired to the wrong token looks correct in light mode and wrong in dark.
describe("getTextToneColors", () => {
  it("maps every tone to a theme token in light mode", () => {
    expect(getTextToneColors(mobileColors)).toEqual({
      primary: mobileColors.textPrimary,
      secondary: mobileColors.textSecondary,
      muted: mobileColors.textMuted,
      subtle: mobileColors.textSubtle,
      inverse: mobileColors.textInverse,
      brand: mobileColors.brand,
      danger: mobileColors.dangerText,
      warning: mobileColors.warningText,
      success: mobileColors.successText,
      onBrand: mobileColors.onBrandText,
    });
  });

  it("resolves to different values in dark mode", () => {
    const light = getTextToneColors(mobileColors);
    const dark = getTextToneColors(darkMobileColors);

    expect(dark.primary).not.toBe(light.primary);
    expect(dark.muted).not.toBe(light.muted);
    expect(dark.brand).not.toBe(light.brand);
    expect(dark.danger).not.toBe(light.danger);
  });

  it("never returns an undefined color", () => {
    for (const palette of [mobileColors, darkMobileColors]) {
      for (const [tone, color] of Object.entries(getTextToneColors(palette))) {
        expect(color, `tone "${tone}" resolved to a falsy color`).toBeTruthy();
      }
    }
  });
});
