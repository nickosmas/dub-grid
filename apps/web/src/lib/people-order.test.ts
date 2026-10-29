import { afterEach, describe, expect, it, vi } from "vitest";
import { findNeighbors, parsePeopleOrder, readPeopleOrder, savePeopleOrder } from "./people-order";

const IDS = ["a", "b", "c", "d"];

describe("findNeighbors", () => {
  it("places the first, middle and last person", () => {
    expect(findNeighbors(IDS, "a")).toEqual({
      position: 1,
      total: 4,
      previousId: null,
      nextId: "b",
    });
    expect(findNeighbors(IDS, "c")).toEqual({
      position: 3,
      total: 4,
      previousId: "b",
      nextId: "d",
    });
    expect(findNeighbors(IDS, "d")).toEqual({
      position: 4,
      total: 4,
      previousId: "c",
      nextId: null,
    });
  });

  it("steps over a skipped id and leaves it out of the count", () => {
    expect(findNeighbors(IDS, "c", new Set(["b"]))).toEqual({
      position: 2,
      total: 3,
      previousId: "a",
      nextId: "d",
    });
  });

  it("is null for someone not in the list", () => {
    expect(findNeighbors(IDS, "z")).toBeNull();
    expect(findNeighbors(IDS, "b", new Set(["b"]))).toBeNull();
  });
});

describe("parsePeopleOrder", () => {
  it("reads this organization's list and nothing else", () => {
    const raw = JSON.stringify({ orgId: "org-1", ids: IDS });
    expect(parsePeopleOrder(raw, "org-1")).toEqual(IDS);
    expect(parsePeopleOrder(raw, "org-2")).toBeNull();
  });

  it("rejects anything malformed", () => {
    for (const raw of [null, "", "{", "[]", '{"orgId":"org-1"}', '{"orgId":"org-1","ids":[1]}']) {
      expect(parsePeopleOrder(raw, "org-1")).toBeNull();
    }
  });
});

describe("saved order", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("reads back what the list saved", () => {
    savePeopleOrder("org-1", IDS);
    expect(readPeopleOrder("org-1")).toEqual(IDS);
  });

  it("gives nothing when storage is blocked", () => {
    savePeopleOrder("org-1", IDS);
    // A blocked browser throws as soon as the page reads sessionStorage.
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => savePeopleOrder("org-1", IDS)).not.toThrow();
    expect(readPeopleOrder("org-1")).toBeNull();
  });
});
