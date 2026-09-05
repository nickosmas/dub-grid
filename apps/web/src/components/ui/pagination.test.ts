import { describe, expect, it } from "vitest";

import { getPaginationItems } from "./pagination";

describe("getPaginationItems", () => {
  it("lists every page while the run still fits", () => {
    expect(getPaginationItems(1, 1)).toEqual([1]);
    expect(getPaginationItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("collapses only the trailing run near the start", () => {
    expect(getPaginationItems(1, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
    expect(getPaginationItems(3, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
  });

  it("collapses only the leading run near the end", () => {
    expect(getPaginationItems(20, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
    expect(getPaginationItems(18, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
  });

  it("keeps one sibling either side in the middle", () => {
    expect(getPaginationItems(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
  });

  it("holds the slot count steady so the control does not reflow", () => {
    const widths = new Set(
      Array.from({ length: 20 }, (_, i) => getPaginationItems(i + 1, 20).length),
    );
    expect([...widths]).toEqual([7]);
  });
});
