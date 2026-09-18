import { describe, expect, it } from "vitest";
import type { ShiftDiffDescriptorResult } from "@/lib/shift-diff-badges";
import { publishCellLevelBadge } from "./gridHelpers";

const newBadge = { kind: "new" as const, text: "New", detail: "Added N." };
const changedBadge = { kind: "modified" as const, text: "Changed", detail: "Was D." };
const pill = (kind: "new" | null) => ({ borderKind: kind, badge: kind ? newBadge : null });

describe("publishCellLevelBadge", () => {
  it("admits a plain New on a single pill", () => {
    const summary: ShiftDiffDescriptorResult = { pillDiffs: [pill("new")], cellBadge: newBadge };
    expect(publishCellLevelBadge(summary, 1)).toBe(newBadge);
  });

  it("admits a plain New on an absence, which has no pills", () => {
    const summary: ShiftDiffDescriptorResult = { pillDiffs: [], cellBadge: newBadge };
    expect(publishCellLevelBadge(summary, 1)).toBe(newBadge);
  });

  it("leaves a two-pill New to the pills themselves", () => {
    const summary: ShiftDiffDescriptorResult = {
      pillDiffs: [pill(null), pill("new")],
      cellBadge: newBadge,
    };
    expect(publishCellLevelBadge(summary, 2)).toBeNull();
  });

  it("keeps Changed at cell level whatever the pill count", () => {
    const summary: ShiftDiffDescriptorResult = { pillDiffs: [pill(null)], cellBadge: changedBadge };
    expect(publishCellLevelBadge(summary, 1)).toBe(changedBadge);
    expect(publishCellLevelBadge(summary, 2)).toBe(changedBadge);
  });

  it("returns null without a summary", () => {
    expect(publishCellLevelBadge(null, 1)).toBeNull();
    expect(publishCellLevelBadge({ pillDiffs: [pill(null)], cellBadge: null }, 1)).toBeNull();
  });
});
