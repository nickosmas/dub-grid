import { describe, expect, it } from "vitest";
import type { AssignmentDefinition } from "@/types";
import { findShiftByDisplayLabel } from "@/components/dashboard/UserDashboard";
import { migrateLegacyDraftValue } from "@/components/staff/RecurringScheduleSection";

const assignment = (id: number, focusAreaId: number, shiftId: number): AssignmentDefinition => ({
  id,
  orgId: "org",
  label: "D",
  name: "Day Shift",
  color: "#fff",
  border: "#000",
  text: "#000",
  shiftId,
  categoryId: shiftId,
  jobId: 70,
  focusAreaId,
  sortOrder: id,
});
const EAST = assignment(1, 10, 100);
const WEST = assignment(2, 20, 200);

describe("migrateLegacyDraftValue with a label two focus areas share", () => {
  it("takes the person's own area", () => {
    const value = migrateLegacyDraftValue("D", [EAST, WEST], [], [20]);
    expect(value?.segments[0]?.shiftId).toBe(200);
  });

  it("drops a value it can't tell apart", () => {
    expect(migrateLegacyDraftValue("D", [EAST, WEST], [], [30])).toBeNull();
  });

  it("keeps a label only one area has", () => {
    expect(migrateLegacyDraftValue("D", [EAST], [], [30])?.segments[0]?.shiftId).toBe(100);
  });
});

describe("findShiftByDisplayLabel with a name two focus areas share", () => {
  const shiftById = new Map([
    [100, { abbr: "D", name: "Day Shift", focusAreaId: 10 }],
    [200, { abbr: "D", name: "Day Shift", focusAreaId: 20 }],
  ]);

  it("takes the segment's own area", () => {
    expect(
      findShiftByDisplayLabel({
        rawLabel: "Day Shift",
        shiftAbbr: null,
        focusAreaId: 20,
        shiftById,
      }),
    ).toBe(shiftById.get(200));
    expect(
      findShiftByDisplayLabel({ rawLabel: null, shiftAbbr: "D", focusAreaId: 20, shiftById }),
    ).toBe(shiftById.get(200));
  });
});
