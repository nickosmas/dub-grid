import { describe, expect, it } from "vitest";
import {
  mobileControlTokens,
  mobileListRowTokens,
  mobileSpacingTokens,
  mobileTypographyTokens,
  spacingTokens,
} from "./index";

describe("mobile type ramp", () => {
  it("steps display above screenTitle and title between screenTitle and sectionTitle", () => {
    const { display, screenTitle, title, sectionTitle } = mobileTypographyTokens.text;

    expect(display.fontSize).toBeGreaterThan(screenTitle.fontSize);
    expect(title.fontSize).toBeLessThan(screenTitle.fontSize);
    expect(title.fontSize).toBeGreaterThan(sectionTitle.fontSize);
  });

  it("reserves at least the font size as line height on every step", () => {
    for (const [name, style] of Object.entries(mobileTypographyTokens.text)) {
      expect(style.lineHeight, name).toBeGreaterThanOrEqual(style.fontSize);
    }
  });

  it("never drops below 10pt", () => {
    for (const [name, style] of Object.entries(mobileTypographyTokens.text)) {
      expect(style.fontSize, name).toBeGreaterThanOrEqual(10);
    }
  });
});

describe("mobile control and row scale", () => {
  it("keeps the default control at the platform minimum touch target", () => {
    expect(mobileControlTokens.md).toBe(44);
    expect(mobileControlTokens.sm).toBeLessThan(mobileControlTokens.md);
    expect(mobileControlTokens.lg).toBeGreaterThan(mobileControlTokens.md);
  });

  it("makes a list row a full target on its own", () => {
    expect(mobileListRowTokens.minHeight).toBeGreaterThanOrEqual(44);
    expect(Object.values(mobileSpacingTokens)).toContain(mobileListRowTokens.paddingVertical);
    expect(Object.values(mobileSpacingTokens)).toContain(mobileListRowTokens.titleGap);
  });

  it("keeps the section gap on the spacing ramp", () => {
    expect(Object.values(mobileSpacingTokens)).toContain(spacingTokens.sectionGap);
  });
});
