import { describe, expect, it } from "vitest";
import { summarizePermissionChanges } from "./permission-labels";

describe("summarizePermissionChanges", () => {
  it("returns null when nothing changed", () => {
    expect(summarizePermissionChanges({ canViewStaff: true }, { canViewStaff: true })).toBeNull();
  });

  it("names both directions in one sentence fragment", () => {
    expect(
      summarizePermissionChanges(
        { canEditShifts: true, canViewStaff: false },
        { canEditShifts: false, canViewStaff: true },
      ),
    ).toBe("gave you access to view staff, and removed your access to edit shifts");
  });

  it("caps long lists so an inbox row stays readable", () => {
    const before = {
      canViewStaff: true,
      canViewSchedule: true,
      canViewOrgLabels: true,
      canViewFocusAreas: true,
      canViewIndicatorTypes: true,
    };
    const after = Object.fromEntries(Object.keys(before).map((key) => [key, false]));

    expect(summarizePermissionChanges(before, after)).toBe(
      "removed your access to view staff, view schedule, view organization labels, and 2 more",
    );
  });
});
