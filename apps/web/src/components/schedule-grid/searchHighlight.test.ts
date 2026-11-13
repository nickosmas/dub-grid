import { describe, expect, it } from "vitest";
import { sameSearchHighlight } from "./searchHighlight";

describe("sameSearchHighlight", () => {
  const section = ["a", "b"];

  it("treats no search and an empty match the same", () => {
    expect(sameSearchHighlight(undefined, new Set(), section)).toBe(true);
  });

  it("ignores matches outside the section", () => {
    expect(sameSearchHighlight(new Set(["a", "x"]), new Set(["a", "y"]), section)).toBe(true);
  });

  it("changes when one of the section's people starts or stops matching", () => {
    expect(sameSearchHighlight(new Set(["a"]), new Set(["a", "b"]), section)).toBe(false);
    expect(sameSearchHighlight(new Set(["a", "b"]), new Set(["b"]), section)).toBe(false);
  });

  it("changes when a search starts or clears, since unmatched rows dim", () => {
    expect(sameSearchHighlight(undefined, new Set(["x"]), section)).toBe(false);
    expect(sameSearchHighlight(new Set(["x"]), undefined, section)).toBe(false);
  });
});
