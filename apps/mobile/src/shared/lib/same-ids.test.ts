import { describe, expect, it } from "vitest";
import { sameIds } from "./same-ids";

describe("sameIds", () => {
  it("ignores the order the ids were picked in", () => {
    expect(sameIds([3, 1, 2], [1, 2, 3])).toBe(true);
  });

  it("tells a swapped id from an unchanged list of the same length", () => {
    expect(sameIds([1, 2], [1, 3])).toBe(false);
  });

  it("tells a longer or shorter list apart", () => {
    expect(sameIds([1, 2], [1, 2, 3])).toBe(false);
    expect(sameIds([], [4])).toBe(false);
  });

  it("counts a repeated id", () => {
    expect(sameIds([1, 1, 2], [1, 2, 2])).toBe(false);
  });

  it("compares numbers by value, not as text", () => {
    expect(sameIds([10, 9], [9, 10])).toBe(true);
    expect(sameIds([10], [1])).toBe(false);
  });

  it("works for string ids", () => {
    expect(sameIds(["b", "a"], ["a", "b"])).toBe(true);
  });
});
