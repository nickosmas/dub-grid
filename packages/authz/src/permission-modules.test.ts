import { describe, expect, it } from "vitest";
import {
  PERMISSION_CATEGORY_LABELS,
  PERMISSION_CATEGORY_ORDER,
  PERMISSION_MODULES,
} from "./permission-modules";

describe("permission list order", () => {
  it("lists the areas in the order work happens, grouped as the editors show them", () => {
    const grouped = PERMISSION_CATEGORY_ORDER.map((category) => ({
      group: PERMISSION_CATEGORY_LABELS[category],
      areas: PERMISSION_MODULES.filter((m) => m.category === category).map((m) => m.title),
    }));

    expect(grouped).toEqual([
      {
        group: "Scheduling and staff",
        areas: ["Schedule", "Recurring shifts", "Publish schedule", "Shift requests", "Staff"],
      },
      { group: "Dashboard and reports", areas: ["Dashboard", "Reports"] },
      {
        group: "Settings",
        areas: ["Departments & labels", "Shifts, jobs & schedule notes", "Coverage"],
      },
    ]);
  });

  it("keeps each group's rows together, so the flat list reads the same as the grouped one", () => {
    const flat = PERMISSION_MODULES.map((m) => m.category);
    const firstSeen = PERMISSION_CATEGORY_ORDER.map((c) => flat.indexOf(c));
    expect(firstSeen).toEqual([...firstSeen].sort((a, b) => a - b));
    for (const category of PERMISSION_CATEGORY_ORDER) {
      const first = flat.indexOf(category);
      const last = flat.lastIndexOf(category);
      expect(flat.slice(first, last + 1).every((c) => c === category)).toBe(true);
    }
  });
});
