import { describe, expect, it } from "vitest";
import { mobileColors } from "../../../shared/theme/tokens";
import { getMobileStatusPill } from "./statusPill";

describe("getMobileStatusPill", () => {
  it("names an Away person's return date in the warning tone", () => {
    const pill = getMobileStatusPill(mobileColors, { status: "inactive", awayUntil: "2027-01-04" });

    expect(pill?.label).toBe("Away until Jan 4");
    expect(pill?.containerStyle.backgroundColor).toBe(mobileColors.warningSoft);
    expect(pill?.textStyle.color).toBe(mobileColors.warningText);
  });

  it("says Away without a date and Offboarded in a neutral tone", () => {
    expect(getMobileStatusPill(mobileColors, { status: "inactive", awayUntil: null })?.label).toBe(
      "Away",
    );
    const archived = getMobileStatusPill(mobileColors, { status: "removed", awayUntil: null });
    expect(archived?.label).toBe("Offboarded");
    expect(archived?.textStyle.color).toBe(mobileColors.textSecondary);
  });

  it("says Suspended in the danger tone for someone stored active", () => {
    const pill = getMobileStatusPill(mobileColors, {
      status: "active",
      awayUntil: null,
      suspendedAt: "2026-10-27T05:00:00Z",
    });

    expect(pill?.label).toBe("Suspended");
    expect(pill?.textStyle.color).toBe(mobileColors.dangerText);
  });

  it("shows nothing for an active person", () => {
    expect(getMobileStatusPill(mobileColors, { status: "active", awayUntil: null })).toBeNull();
  });
});
