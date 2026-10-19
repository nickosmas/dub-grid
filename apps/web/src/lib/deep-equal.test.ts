import { describe, expect, it } from "vitest";
import { isDeepEqual } from "./deep-equal";

describe("isDeepEqual", () => {
  it("compares primitives by value", () => {
    expect(isDeepEqual(1, 1)).toBe(true);
    expect(isDeepEqual("a", "a")).toBe(true);
    expect(isDeepEqual(null, null)).toBe(true);
    expect(isDeepEqual(undefined, undefined)).toBe(true);
    expect(isDeepEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(isDeepEqual(1, "1")).toBe(false);
    expect(isDeepEqual(null, undefined)).toBe(false);
    expect(isDeepEqual(0, null)).toBe(false);
  });

  it("compares arrays and plain objects by contents", () => {
    expect(isDeepEqual([1, { a: [2, 3] }], [1, { a: [2, 3] }])).toBe(true);
    expect(isDeepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(isDeepEqual([1, 2], [2, 1])).toBe(false);
    expect(isDeepEqual({ a: 1, b: null }, { b: null, a: 1 })).toBe(true);
    expect(isDeepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(isDeepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    expect(isDeepEqual([], {})).toBe(false);
    expect(isDeepEqual({}, [])).toBe(false);
  });

  it("compares Dates, Sets and Maps by contents", () => {
    expect(isDeepEqual(new Date(5), new Date(5))).toBe(true);
    expect(isDeepEqual(new Date(5), new Date(6))).toBe(false);
    expect(isDeepEqual(new Date(5), 5)).toBe(false);
    expect(isDeepEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(isDeepEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false);
    expect(isDeepEqual(new Map([[1, { a: 1 }]]), new Map([[1, { a: 1 }]]))).toBe(true);
    expect(isDeepEqual(new Map([[1, { a: 1 }]]), new Map([[1, { a: 2 }]]))).toBe(false);
    expect(isDeepEqual(new Map([[1, 1]]), new Map([[2, 1]]))).toBe(false);
    expect(isDeepEqual(new Set([1]), [1])).toBe(false);
  });

  it("compares functions and class instances by identity", () => {
    const fn = () => 1;
    expect(isDeepEqual(fn, fn)).toBe(true);
    expect(isDeepEqual(fn, () => 1)).toBe(false);
    class Point {
      constructor(readonly x: number) {}
    }
    const point = new Point(1);
    expect(isDeepEqual(point, point)).toBe(true);
    expect(isDeepEqual(new Point(1), new Point(1))).toBe(false);
    expect(isDeepEqual(new Point(1), { x: 1 })).toBe(false);
  });
});
