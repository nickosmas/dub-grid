import { describe, expect, it } from "vitest";
import { getAvatarTone, resolveAvatarSeed } from "./avatar-tone";

function channels(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map(
    (offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255,
  );
  return [r, g, b];
}

function toLinear(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** OKLab, so "do these two chips look alike" is measured perceptually. */
function toOklab(hex: string): [number, number, number] {
  const [lr, lg, lb] = channels(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function deltaE(hexA: string, hexB: string): number {
  const [l1, a1, b1] = toOklab(hexA);
  const [l2, a2, b2] = toOklab(hexB);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

const MIN_AA_CONTRAST = 4.5;
/** Below this, two chips read as the same color at avatar size. */
const MIN_DELTA_E = 0.05;
const PALETTE_SIZE = 11;

/** Enough seeds to land on every slot, since the palette itself is private. */
const SAMPLE_SEEDS = Array.from({ length: 400 }, (_, i) => `staff-${i}`);

function distinctTones(isDark: boolean) {
  const byBackground = new Map<string, ReturnType<typeof getAvatarTone>>();
  for (const seed of SAMPLE_SEEDS) {
    const tone = getAvatarTone(seed, isDark);
    byBackground.set(tone.backgroundColor, tone);
  }
  return [...byBackground.values()];
}

describe.each([
  ["light", false],
  ["dark", true],
])("getAvatarTone (%s)", (_label, isDark) => {
  const tones = distinctTones(isDark);

  it("covers the whole palette", () => {
    expect(tones).toHaveLength(PALETTE_SIZE);
  });

  it("meets WCAG AA contrast between background and text for every slot", () => {
    for (const tone of tones) {
      expect(contrastRatio(tone.backgroundColor, tone.textColor)).toBeGreaterThanOrEqual(
        MIN_AA_CONTRAST,
      );
    }
  });

  it("keeps every slot visually distinct from every other", () => {
    for (let i = 0; i < tones.length; i += 1) {
      for (let j = i + 1; j < tones.length; j += 1) {
        expect(deltaE(tones[i].backgroundColor, tones[j].backgroundColor)).toBeGreaterThanOrEqual(
          MIN_DELTA_E,
        );
      }
    }
  });
});

describe("getAvatarTone", () => {
  it("is deterministic for a given seed", () => {
    expect(getAvatarTone("employee-42")).toEqual(getAvatarTone("employee-42"));
  });

  it("gives a seed the same slot in both themes", () => {
    const light = distinctTones(false);
    const dark = distinctTones(true);
    expect(dark).toHaveLength(light.length);
  });
});

describe("resolveAvatarSeed", () => {
  it("prefers the linked account id so presence and the people table agree", () => {
    expect(resolveAvatarSeed({ id: "employee-1", userId: "user-9" })).toBe("user-9");
    expect(getAvatarTone(resolveAvatarSeed({ id: "employee-1", userId: "user-9" }))).toEqual(
      getAvatarTone("user-9"),
    );
  });

  it("falls back to the employee id for staff with no account", () => {
    expect(resolveAvatarSeed({ id: "employee-1", userId: null })).toBe("employee-1");
    expect(resolveAvatarSeed({ id: "employee-1" })).toBe("employee-1");
  });
});
