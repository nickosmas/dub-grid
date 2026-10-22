import { describe, expect, it } from "vitest";
import { attachedPillSeams, seamBorders, gapBefore, seamRadius, timesMeet } from "./attached-pill";

describe("timesMeet", () => {
  it("joins shifts that run straight into each other", () => {
    expect(timesMeet("15:00", "15:00")).toBe(true);
    expect(timesMeet("15:00:00", "15:00")).toBe(true);
    expect(timesMeet("24:00", "00:00")).toBe(true);
  });

  it("keeps a gap or an unknown time apart", () => {
    expect(timesMeet("11:00", "15:00")).toBe(false);
    expect(timesMeet(null, "15:00")).toBe(false);
    expect(timesMeet("15:00", undefined)).toBe(false);
  });
});

describe("attachedPillSeams", () => {
  it("meets bottom-to-top when stacked and right-to-left side by side", () => {
    expect(attachedPillSeams("stacked", [true])).toEqual([["bottom"], ["top"]]);
    expect(attachedPillSeams("side-by-side", [true])).toEqual([["right"], ["left"]]);
  });

  it("gives a middle pill both seams and leaves a gap unjoined", () => {
    expect(attachedPillSeams("stacked", [true, true])).toEqual([
      ["bottom"],
      ["top", "bottom"],
      ["top"],
    ]);
    expect(attachedPillSeams("stacked", [false, true])).toEqual([[], ["bottom"], ["top"]]);
  });
});

describe("seam styling", () => {
  it("drops only the seam's border", () => {
    expect(seamBorders("1px solid red", ["bottom"])).toEqual({
      borderTop: "1px solid red",
      borderRight: "1px solid red",
      borderBottom: "none",
      borderLeft: "1px solid red",
    });
    expect(seamBorders("1px solid red", [])).toEqual({ border: "1px solid red" });
  });

  it("squares the corners on each seam", () => {
    expect(seamRadius(8, ["top"])).toBe("0 0 8px 8px");
    expect(seamRadius(8, ["right"])).toBe("8px 0 0 8px");
    expect(seamRadius(8, ["bottom"])).toBe("8px 8px 0 0");
    expect(seamRadius(8, ["left"])).toBe("0 8px 8px 0");
    expect(seamRadius(8, ["top", "bottom"])).toBe("0 0 0 0");
    expect(seamRadius(8, [])).toBe("8px");
  });

  it("spaces only pills that do not touch the one before", () => {
    expect(gapBefore(0, [], "stacked", 4)).toEqual({});
    expect(gapBefore(1, [], "stacked", 4)).toEqual({ marginTop: 4 });
    expect(gapBefore(1, [], "side-by-side", 4)).toEqual({ marginLeft: 4 });
    expect(gapBefore(1, ["top"], "stacked", 10)).toEqual({});
    expect(gapBefore(2, ["left"], "side-by-side", 4)).toEqual({});
  });
});
