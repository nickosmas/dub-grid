import { describe, expect, it } from "vitest";
import {
  ACCESS_INSIGNIA_BEVEL,
  ACCESS_INSIGNIA_STAR_BOX,
  ACCESS_INSIGNIA_STAR_POINTS,
  ACCESS_INSIGNIA_STAR_STROKE,
} from "./access-insignia";

const points = ACCESS_INSIGNIA_STAR_POINTS.split(" ").map((pair) => pair.split(",").map(Number));
const xs = points.map(([x]) => x);
const ys = points.map(([, y]) => y);

describe("access insignia star", () => {
  it("has five points and five notches", () => {
    expect(points).toHaveLength(10);
  });

  it("points straight up from the box center", () => {
    expect(points[0]).toEqual([12, 4.4]);
  });

  it("is centered horizontally in the box", () => {
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(ACCESS_INSIGNIA_STAR_BOX, 1);
  });

  it("spans the same share of the face as the star it replaces", () => {
    const outerReach = 12 - Math.min(...ys) + ACCESS_INSIGNIA_STAR_STROKE / 2;
    expect(outerReach / (ACCESS_INSIGNIA_STAR_BOX / 2)).toBeCloseTo(8.6 / 12, 2);
  });

  it("keeps every point inside the box", () => {
    const reach = ACCESS_INSIGNIA_STAR_STROKE / 2;
    for (const [x, y] of points) {
      expect(x - reach).toBeGreaterThan(0);
      expect(x + reach).toBeLessThan(ACCESS_INSIGNIA_STAR_BOX);
      expect(y - reach).toBeGreaterThan(0);
      expect(y + reach).toBeLessThan(ACCESS_INSIGNIA_STAR_BOX);
    }
  });
});

describe("access insignia bevel", () => {
  it("is one pixel wide, lit above and shaded below", () => {
    expect(ACCESS_INSIGNIA_BEVEL).toEqual({
      width: 1,
      light: "rgba(255, 255, 255, 0.3)",
      shade: "rgba(0, 0, 0, 0.16)",
    });
  });
});
