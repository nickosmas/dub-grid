import { describe, expect, it } from "vitest";
import { awayRunChips, describeAwayRunChanges } from "./awayRunChanges";

const day = (dateKey: string, kind: "new" | "modified" | "deleted") => ({
  dateKey,
  kind,
  view: null,
});

describe("awayRunChips", () => {
  it("counts each kind once, in the draft banner's order", () => {
    expect(
      awayRunChips([
        day("2026-11-23", "deleted"),
        day("2026-11-24", "deleted"),
        day("2026-11-25", "new"),
        day("2026-11-26", "deleted"),
      ]),
    ).toEqual([
      { kind: "new", text: "New" },
      { kind: "deleted", text: "Removed ×3" },
    ]);
  });

  it("draws nothing for a bar with no changes", () => {
    expect(awayRunChips([])).toEqual([]);
  });
});

describe("describeAwayRunChanges", () => {
  it("says what isn't published yet and what was", () => {
    expect(
      describeAwayRunChanges({
        draft: [day("2026-11-23", "deleted"), day("2026-11-24", "deleted")],
        published: [day("2026-11-25", "modified")],
      }),
    ).toBe("2 days removed, not published yet; 1 day changed, published");
  });

  it("is silent without changes", () => {
    expect(describeAwayRunChanges({ draft: [], published: [] })).toBeNull();
  });
});
