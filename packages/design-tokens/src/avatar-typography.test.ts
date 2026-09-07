import { describe, expect, it } from "vitest";
import { getAvatarTypography } from "./avatar-typography";

describe("avatar typography", () => {
  it("matches the approved 48px preview", () => {
    expect(getAvatarTypography(48)).toEqual({ fontSize: 20, fontWeight: 500, lineHeight: 1 });
  });

  it("keeps compact initials proportional and tiny lock markers legible", () => {
    for (const diameter of [20, 28, 32, 38, 42, 44, 56, 64, 96]) {
      const type = getAvatarTypography(diameter);
      expect(type.fontSize).toBeLessThanOrEqual(diameter / 2);
      expect(type.fontSize).toBeGreaterThanOrEqual(diameter * 0.39);
      expect(type.fontSize).toBeGreaterThanOrEqual(9);
      expect(type.fontWeight).toBe(500);
    }
  });
});
