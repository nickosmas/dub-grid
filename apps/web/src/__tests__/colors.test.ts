import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREDEFINED_COLOR,
  PREDEFINED_COLOR_GROUPS,
  PREDEFINED_COLORS,
  getPresetByBg,
  getReadableTextColor,
  normalizePresetBg,
} from "@/lib/colors";

function luminance(hex: string): number {
  const normalized = hex.toUpperCase();
  const channels = [1, 3, 5].map((start) => Number.parseInt(normalized.slice(start, start + 2), 16) / 255);
  const transform = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = channels.map(transform);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(left: string, right: string): number {
  const leftLum = luminance(left);
  const rightLum = luminance(right);
  const lighter = Math.max(leftLum, rightLum);
  const darker = Math.min(leftLum, rightLum);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("colors", () => {
  it("keeps slate as the default preset for backward compatibility", () => {
    expect(DEFAULT_PREDEFINED_COLOR.id).toBe("slate");
    expect(DEFAULT_PREDEFINED_COLOR.bg).toBe("#E2E8F0");
  });

  it("returns lighter readable text for dark colors", () => {
    const bg = "#0B0F19";
    const text = getReadableTextColor(bg);

    expect(luminance(text)).toBeGreaterThan(luminance(bg));
    expect(contrastRatio(bg, text)).toBeGreaterThanOrEqual(4.5);
  });

  it("returns darker readable text for light colors", () => {
    const bg = "#BFDBFE";
    const text = getReadableTextColor(bg);

    expect(luminance(text)).toBeLessThan(luminance(bg));
    expect(contrastRatio(bg, text)).toBeGreaterThanOrEqual(4.5);
  });

  it("builds palette presets with the computed readable text color", () => {
    const darkPreset = getPresetByBg("#334155");
    const lightPreset = getPresetByBg("#A7F3D0");

    expect(contrastRatio(darkPreset.bg, darkPreset.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lightPreset.bg, lightPreset.text)).toBeGreaterThanOrEqual(4.5);
  });

  it("preserves valid custom colors outside the preset palette", () => {
    const custom = getPresetByBg("#B4533C");

    expect(custom.id).toBe("custom-b4533c");
    expect(custom.name).toBe("Custom");
    expect(custom.bg).toBe("#B4533C");
    expect(contrastRatio(custom.bg, custom.text)).toBeGreaterThanOrEqual(4.5);
    expect(normalizePresetBg("#2f7d6d")).toBe("#2F7D6D");
  });

  it("provides at least 20 colors in each preset group", () => {
    expect(
      PREDEFINED_COLOR_GROUPS.every((group) => group.colors.length >= 20),
    ).toBe(true);
  });

  it("uses standard and soft palette groups without deep presets", () => {
    expect(PREDEFINED_COLOR_GROUPS.map((group) => group.id)).toEqual([
      "standard",
      "soft",
    ]);
    expect(PREDEFINED_COLORS.some((color) => color.id === "ink")).toBe(false);
    expect(PREDEFINED_COLORS[0]?.id).toBe("slate");
  });

  it("keeps every predefined preset readable", () => {
    expect(
      PREDEFINED_COLORS.every((color) => contrastRatio(color.bg, color.text) >= 4.5),
    ).toBe(true);
  });
});
