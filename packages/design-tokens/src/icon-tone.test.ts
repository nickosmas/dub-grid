import { describe, expect, it } from "vitest";
import { getMobileIconToneColor, mobileIconToneTokens, type MobileIconToneName } from "./icon-tone";

/** HSL saturation of a hex colour, 0-1. */
function saturation(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map(
    (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);

  if (max === min) {
    return 0;
  }

  const lightness = (max + min) / 2;
  return (max - min) / (1 - Math.abs(2 * lightness - 1));
}

/** The one hue that is meant to be muted: rows with nothing worth colouring. */
const NEUTRAL_TONES: MobileIconToneName[] = ["slate"];

const TONE_NAMES = Object.keys(mobileIconToneTokens) as MobileIconToneName[];

describe("mobile icon tones", () => {
  /**
   * The whole point of this palette existing separately from the avatar one is
   * that these read as vivid. The avatar hues are tuned for AA *text* contrast
   * on a pale chip, which drags them deep enough that amber reads as brown —
   * so if these ever drift back down, the reason for the split is gone.
   */
  it("keeps every non-neutral hue vibrant", () => {
    for (const name of TONE_NAMES) {
      if (NEUTRAL_TONES.includes(name)) {
        continue;
      }

      expect
        .soft(saturation(mobileIconToneTokens[name].light), `${name} light`)
        .toBeGreaterThan(0.5);
      expect.soft(saturation(mobileIconToneTokens[name].dark), `${name} dark`).toBeGreaterThan(0.5);
    }
  });

  it("keeps the neutral tone actually neutral", () => {
    for (const name of NEUTRAL_TONES) {
      expect(saturation(mobileIconToneTokens[name].light)).toBeLessThan(0.3);
    }
  });

  it("gives every hue a distinct light and dark value", () => {
    for (const name of TONE_NAMES) {
      const { light, dark } = mobileIconToneTokens[name];

      expect(light).toMatch(/^#[0-9A-F]{6}$/i);
      expect(dark).toMatch(/^#[0-9A-F]{6}$/i);
      // A hue rendering identically in both themes would be washed out in one.
      expect(light).not.toBe(dark);
    }
  });

  it("runs the dark variant brighter than the light one", () => {
    for (const name of TONE_NAMES) {
      const { light, dark } = mobileIconToneTokens[name];
      const brightness = (hex: string) =>
        [1, 3, 5].reduce((sum, offset) => sum + parseInt(hex.slice(offset, offset + 2), 16), 0);

      // The same colour that pops on white goes muddy on a near-black surface.
      expect.soft(brightness(dark), name).toBeGreaterThan(brightness(light));
    }
  });

  it("selects by theme", () => {
    expect(getMobileIconToneColor("green", false)).toBe(mobileIconToneTokens.green.light);
    expect(getMobileIconToneColor("green", true)).toBe(mobileIconToneTokens.green.dark);
  });

  it("keeps the hues distinguishable from one another", () => {
    const lightHues = TONE_NAMES.map((name) => mobileIconToneTokens[name].light);

    expect(new Set(lightHues).size).toBe(lightHues.length);
  });
});
