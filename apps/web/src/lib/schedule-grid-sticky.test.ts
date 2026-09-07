import { describe, expect, it } from "vitest";

import { computeStickyReleaseInset } from "./schedule-grid-sticky";

describe("computeStickyReleaseInset", () => {
  it("reserves the distance from the release row down to the card bottom", () => {
    expect(computeStickyReleaseInset({ cardBottom: 1400, releaseRowTop: 1100 })).toBe(300);
  });

  it("is independent of scroll position", () => {
    const atTop = computeStickyReleaseInset({ cardBottom: 1400, releaseRowTop: 1100 });
    const scrolled = computeStickyReleaseInset({ cardBottom: 400, releaseRowTop: 100 });
    expect(scrolled).toBe(atTop);
  });

  it("reserves nothing when the section has no release row", () => {
    expect(computeStickyReleaseInset({ cardBottom: 1400, releaseRowTop: null })).toBe(0);
  });

  it("never goes negative", () => {
    expect(computeStickyReleaseInset({ cardBottom: 100, releaseRowTop: 400 })).toBe(0);
  });

  it("ignores unmeasurable geometry", () => {
    expect(computeStickyReleaseInset({ cardBottom: Number.NaN, releaseRowTop: 100 })).toBe(0);
  });
});
