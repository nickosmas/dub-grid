import { describe, expect, it } from "vitest";
import { daySceneShapes, emptySceneDayFromIso } from "./day-scene";

describe("emptySceneDayFromIso", () => {
  it("names the weekday and date of the ISO day", () => {
    expect(emptySceneDayFromIso("2026-11-03")).toEqual({ weekday: "TUE", date: 3 });
    expect(emptySceneDayFromIso("2026-11-30")).toEqual({ weekday: "MON", date: 30 });
    expect(emptySceneDayFromIso("2027-01-01")).toEqual({ weekday: "FRI", date: 1 });
  });
});

describe("daySceneShapes", () => {
  it("puts the given day on the tile and no other date", () => {
    const texts = daySceneShapes({ weekday: "TUE", date: 3 })
      .filter((s) => s.shape === "text")
      .map((s) => s.shape === "text" && s.text);
    expect(texts).toEqual(["TUE", "3"]);
  });
});
