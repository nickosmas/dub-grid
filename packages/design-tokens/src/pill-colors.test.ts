import { describe, expect, it } from "vitest";
import { absenceStripeCss, resolveAbsenceStripes } from "./pill-colors";

// The Settings color presets (apps/web/src/lib/colors.ts), Standard then Soft.
const PRESETS = [
  "#E2E8F0",
  "#FECACA",
  "#FED7AA",
  "#FDE68A",
  "#FDE047",
  "#D9F99D",
  "#BBF7D0",
  "#A7F3D0",
  "#99F6E4",
  "#A5F3FC",
  "#BAE6FD",
  "#BFDBFE",
  "#C7D2FE",
  "#DDD6FE",
  "#E9D5FF",
  "#F5D0FE",
  "#FBCFE8",
  "#FECDD3",
  "#FDBA74",
  "#86EFAC",
  "#F5E7C8",
  "#FEF3C7",
  "#DCFCE7",
  "#E0F2FE",
  "#DBEAFE",
  "#EDE9FE",
  "#FCE7F3",
  "#ECFEFF",
  "#FEF7E0",
  "#F5EBDD",
  "#EEE6D8",
  "#F6DFC8",
  "#E7F8D8",
  "#D9FBE8",
  "#EFF6FF",
  "#E3F0FF",
  "#E0E7FF",
  "#F2E8FF",
  "#FDE2E8",
  "#F8F4EC",
];

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(left: string, right: string): number {
  const [hi, lo] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

describe("resolveAbsenceStripes", () => {
  it("reproduces the approved Sick pair", () => {
    const stripes = resolveAbsenceStripes("#FECACA", false);
    expect(stripes.stripeA).toBe("#FECACA");
    expect(stripes.stripeB).toBe("#FEE2E2");
  });

  it("keeps a deep tone of the absence's own hue for light text", () => {
    const { text } = resolveAbsenceStripes("#FECACA", false);
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(text.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g + 60);
    expect(g).toBe(b);
  });

  it.each([false, true])(
    "gives every preset text of at least 4.5:1 on both stripes (dark %s)",
    (isDark) => {
      for (const preset of PRESETS) {
        const { stripeA, stripeB, text } = resolveAbsenceStripes(preset, isDark);
        expect(contrast(text, stripeA), `${preset} on A`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(text, stripeB), `${preset} on B`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each([false, true])("keeps every preset's stripes visibly apart (dark %s)", (isDark) => {
    for (const preset of PRESETS) {
      const { stripeA, stripeB } = resolveAbsenceStripes(preset, isDark);
      expect(contrast(stripeA, stripeB), preset).toBeGreaterThanOrEqual(1.15);
    }
  });

  it("separates a near-white color by darkening stripe A", () => {
    const { stripeA, stripeB } = resolveAbsenceStripes("#FFFFFF", false);
    expect(stripeB).toBe("#FFFFFF");
    expect(contrast(stripeA, stripeB)).toBeGreaterThanOrEqual(1.15);
  });

  it("darkens toward the page in dark mode", () => {
    const { stripeA, stripeB } = resolveAbsenceStripes("#FECACA", true);
    expect(luminance(stripeB)).toBeLessThan(luminance(stripeA));
  });

  it.each(["", "not-a-color", "#12"])("falls back safely for %j", (bad) => {
    const stripes = resolveAbsenceStripes(bad, false);
    expect(stripes.stripeA).toMatch(/^#[0-9A-F]{6}$/);
    expect(contrast(stripes.text, stripes.stripeA)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("absence stripe drawing", () => {
  it("writes the approved CSS", () => {
    expect(absenceStripeCss("#FECACA", "#FEE2E2")).toBe(
      "repeating-linear-gradient(135deg, #FECACA 0, #FECACA 6px, #FEE2E2 6px, #FEE2E2 12px)",
    );
  });
});
