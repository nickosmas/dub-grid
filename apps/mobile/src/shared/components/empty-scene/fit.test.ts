import { describe, expect, it } from "vitest";
import { MIN_SCENE_FIT, getEmptySceneFit } from "./fit";

const base = { sceneHeight: 140, gap: 16 };

describe("getEmptySceneFit", () => {
  it("keeps the drawing whole when everything fits", () => {
    expect(getEmptySceneFit({ ...base, room: 400, rest: 100 })).toBe(1);
    expect(getEmptySceneFit({ ...base, room: 256, rest: 100 })).toBe(1);
  });

  it("shrinks the drawing to the room left", () => {
    expect(getEmptySceneFit({ ...base, room: 186, rest: 100 })).toBeCloseTo(70 / 140);
    expect(getEmptySceneFit({ ...base, room: 221, rest: 100 })).toBeCloseTo(105 / 140);
  });

  it("leaves the drawing out below half size, so the copy still shows", () => {
    expect(getEmptySceneFit({ ...base, room: 185, rest: 100 })).toBe(0);
    expect(getEmptySceneFit({ ...base, room: 60, rest: 100 })).toBe(0);
    expect(MIN_SCENE_FIT).toBe(0.5);
  });

  it("changes nothing before it is measured or when it starts below the fold", () => {
    expect(getEmptySceneFit({ ...base, room: null, rest: 100 })).toBe(1);
    expect(getEmptySceneFit({ ...base, room: 200, rest: null })).toBe(1);
    expect(getEmptySceneFit({ ...base, room: -40, rest: 100 })).toBe(1);
  });
});
