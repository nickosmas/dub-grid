import { describe, expect, it } from "vitest";
import { NUMERIC_BADGE_MAX, formatBadgeCount, numericBadgeSize } from "./numeric-badge";

describe("formatBadgeCount", () => {
  it.each([
    [1, "1"],
    [99, "99"],
    [100, "99+"],
    [2.7, "2"],
  ])("formats %s as %s", (count, expected) => {
    expect(formatBadgeCount(count)).toBe(expected);
  });

  it("clamps at a custom max", () => {
    expect(formatBadgeCount(9, 9)).toBe("9");
    expect(formatBadgeCount(10, 9)).toBe("9+");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.4])(
    "returns null for %s so the badge renders nothing",
    (count) => {
      expect(formatBadgeCount(count)).toBeNull();
    },
  );

  it("defaults the clamp to the shared maximum", () => {
    expect(NUMERIC_BADGE_MAX).toBe(99);
    expect(formatBadgeCount(NUMERIC_BADGE_MAX + 1)).toBe("99+");
  });
});

describe("numericBadgeSize", () => {
  it("keeps each size at least as wide as it is tall", () => {
    for (const { size, paddingX } of Object.values(numericBadgeSize)) {
      expect(size).toBeGreaterThan(0);
      expect(paddingX).toBeGreaterThanOrEqual(0);
    }
    expect(numericBadgeSize.sm.size).toBeLessThan(numericBadgeSize.md.size);
  });
});
