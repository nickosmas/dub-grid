import { describe, expect, it } from "vitest";
import { alignSegmentsToBefore, unclaimedBeforeIndices } from "./segment-alignment";

const id = (value: string | null) => value;

describe("alignSegmentsToBefore", () => {
  it("pairs an unchanged cell positionally", () => {
    expect(alignSegmentsToBefore(["A", "B"], ["A", "B"], id)).toEqual([0, 1]);
  });

  it("prefers the same position over an equal key elsewhere", () => {
    expect(alignSegmentsToBefore(["A", "A"], ["A", "A"], id)).toEqual([0, 1]);
  });

  it("follows a reordered pair by key", () => {
    expect(alignSegmentsToBefore(["A", "B"], ["B", "A"], id)).toEqual([1, 0]);
  });

  it("reads a straight replacement as one edit", () => {
    expect(alignSegmentsToBefore(["A"], ["B"], id)).toEqual([0]);
  });

  it("marks a second shift added beside a kept one as new", () => {
    expect(alignSegmentsToBefore(["A"], ["A", "B"], id)).toEqual([0, null]);
  });

  it("marks a new shift inserted ahead of a kept one as new", () => {
    expect(alignSegmentsToBefore(["A"], ["B", "A"], id)).toEqual([null, 0]);
  });

  it("keeps the survivor paired when its sibling is removed", () => {
    const alignment = alignSegmentsToBefore(["A", "B"], ["B"], id);
    expect(alignment).toEqual([1]);
    expect(unclaimedBeforeIndices(alignment, 2)).toEqual([0]);
  });

  it("claims a duplicated key once", () => {
    expect(alignSegmentsToBefore(["A", "A"], ["A"], id)).toEqual([0]);
    expect(alignSegmentsToBefore(["A"], ["A", "A"], id)).toEqual([0, null]);
  });

  it("pairs null keys positionally only", () => {
    expect(alignSegmentsToBefore([null], ["A"], id)).toEqual([0]);
    expect(alignSegmentsToBefore(["A", null], [null, "B"], id)).toEqual([0, 1]);
    expect(alignSegmentsToBefore([null, "A"], ["A", "B"], id)).toEqual([1, 0]);
  });

  it("reports every before-segment as removed when nothing survives", () => {
    const alignment = alignSegmentsToBefore(["A", "B"], [], id);
    expect(alignment).toEqual([]);
    expect(unclaimedBeforeIndices(alignment, 2)).toEqual([0, 1]);
  });
});
