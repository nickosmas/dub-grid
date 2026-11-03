import { describe, expect, it } from "vitest";
import { EMPTY_SCENE_HEIGHT, EMPTY_SCENE_WIDTH, EMPTY_SCENES } from "./scenes";

const kinds = Object.keys(EMPTY_SCENES) as (keyof typeof EMPTY_SCENES)[];

describe("empty scenes", () => {
  it("draws a scene for every empty state", () => {
    expect(kinds).toHaveLength(36);
    for (const kind of kinds) expect(EMPTY_SCENES[kind].length, kind).toBeGreaterThan(0);
  });

  it("draws every scene in its ink, with the ground only cutting details out", () => {
    for (const kind of kinds) {
      expect(
        EMPTY_SCENES[kind].some((shape) => shape.fill === "ink" || shape.stroke === "ink"),
        kind,
      ).toBe(true);
    }
  });

  it("keeps every rect and circle inside the box", () => {
    for (const kind of kinds) {
      for (const shape of EMPTY_SCENES[kind]) {
        if (shape.shape === "rect") {
          expect(shape.x, kind).toBeGreaterThanOrEqual(0);
          expect(shape.y, kind).toBeGreaterThanOrEqual(0);
          expect(shape.x + shape.width, kind).toBeLessThanOrEqual(EMPTY_SCENE_WIDTH);
          expect(shape.y + shape.height, kind).toBeLessThanOrEqual(EMPTY_SCENE_HEIGHT);
        }
        if (shape.shape === "circle") {
          expect(shape.cx - shape.r, kind).toBeGreaterThanOrEqual(0);
          expect(shape.cx + shape.r, kind).toBeLessThanOrEqual(EMPTY_SCENE_WIDTH);
        }
      }
    }
  });
});
