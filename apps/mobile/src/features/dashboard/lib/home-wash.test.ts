import { describe, expect, it } from "vitest";
import { buildHomeWash } from "./home-wash";

describe("buildHomeWash", () => {
  it("is the light brand aurora, fading to clear", () => {
    expect(buildHomeWash(false)).toEqual([
      "rgba(37, 99, 235, 0.22)",
      "rgba(37, 99, 235, 0.08)",
      "rgba(37, 99, 235, 0)",
    ]);
  });

  it("is the dark brand aurora, a step stronger on the dark page", () => {
    expect(buildHomeWash(true)).toEqual([
      "rgba(32, 117, 255, 0.34)",
      "rgba(32, 117, 255, 0.13)",
      "rgba(32, 117, 255, 0)",
    ]);
  });
});
