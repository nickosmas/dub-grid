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

  // 11pt is the smallest size either platform's guidelines set for legible
  // text (Apple's Caption 2); the tab labels and count dots sit on it.
  it("never drops below 11pt", () => {
    for (const [name, style] of Object.entries(mobileTypographyTokens.text)) {
      expect(style.fontSize, name).toBeGreaterThanOrEqual(11);
    }
  });

  it("keeps reading text at the 15pt body size, with headings stepping above it", () => {
    const { body, bodyStrong, rowTitle, cardTitle, sectionTitle, title, meta, caption } =
      mobileTypographyTokens.text;

    expect(body.fontSize).toBe(15);
    expect(bodyStrong.fontSize).toBe(body.fontSize);
    expect(rowTitle.fontSize).toBeGreaterThan(body.fontSize);
    expect(cardTitle.fontSize).toBeGreaterThan(rowTitle.fontSize);
    expect(sectionTitle.fontSize).toBe(cardTitle.fontSize);
    expect(title.fontSize).toBeGreaterThan(cardTitle.fontSize);
    expect(meta.fontSize).toBeLessThan(body.fontSize);
    expect(caption.fontSize).toBeLessThan(meta.fontSize);
  });

  it("gives every step at least 1.2x its size in line height, so accents never clip", () => {
    for (const [name, style] of Object.entries(mobileTypographyTokens.text)) {
      expect(style.lineHeight / style.fontSize, name).toBeGreaterThanOrEqual(1.2);
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
