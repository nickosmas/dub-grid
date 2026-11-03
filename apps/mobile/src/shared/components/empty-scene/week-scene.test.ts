import { describe, expect, it } from "vitest";
import { weekSceneShapes } from "./week-scene";

const MONDAY_FIRST = ["M", "T", "W", "T", "F", "S", "S"];

describe("weekSceneShapes", () => {
  it("labels the days in the week's own order and dots today", () => {
    const shapes = weekSceneShapes("me-week-empty", { letters: MONDAY_FIRST, todayIndex: 1 });
    expect(
      shapes.filter((s) => s.shape === "text").map((s) => s.shape === "text" && s.text),
    ).toEqual(MONDAY_FIRST);
    const dot = shapes.find((s) => s.shape === "circle");
    expect(dot).toMatchObject({ cx: 10 + 27 + 11 });
    expect(shapes.filter((s) => s.shape === "rect").every((s) => s.stroke === "ink")).toBe(true);
  });

  it("fills and checks only the days before today in a finished week", () => {
    const shapes = weekSceneShapes("me-week-done", { letters: MONDAY_FIRST, todayIndex: 3 });
    const bars = shapes.filter((s) => s.shape === "rect");
    expect(bars.map((s) => s.fill === "ink")).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(shapes.filter((s) => s.shape === "path")).toHaveLength(3);
    expect(shapes.some((s) => s.shape === "circle")).toBe(false);
  });
});
