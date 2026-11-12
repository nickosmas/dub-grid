import { describe, expect, it } from "vitest";
import { matchesAnyChoice, toggleFilterChoice } from "./filter-choices";

describe("toggleFilterChoice", () => {
  const order = ["super_admin", "admin", "user"] as const;

  it("ticks a choice", () => {
    expect(toggleFilterChoice([], "admin", order)).toEqual(["admin"]);
  });

  it("keeps ticked choices in the list's order", () => {
    expect(toggleFilterChoice(["user"], "super_admin", order)).toEqual(["super_admin", "user"]);
  });

  it("unticks a ticked choice", () => {
    expect(toggleFilterChoice(["super_admin", "user"], "user", order)).toEqual(["super_admin"]);
  });

  it("drops a ticked choice the list no longer offers", () => {
    expect(toggleFilterChoice([7, 9], 3, [3, 9])).toEqual([3, 9]);
  });
});

describe("matchesAnyChoice", () => {
  it("matches everyone while nothing is ticked", () => {
    expect(matchesAnyChoice([], [])).toBe(true);
    expect(matchesAnyChoice([], [4])).toBe(true);
  });

  it("matches when any value is ticked", () => {
    expect(matchesAnyChoice([2, 5], [5, 8])).toBe(true);
  });

  it("doesn't match when no value is ticked", () => {
    expect(matchesAnyChoice([2, 5], [8])).toBe(false);
    expect(matchesAnyChoice([2], [])).toBe(false);
  });
});
