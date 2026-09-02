import { describe, expect, it } from "vitest";

import { computeShiftDistribution } from "./staff-detail-stats";
import type { AssignmentDefinition, ShiftMap } from "@/types";

describe("computeShiftDistribution", () => {
  it("ignores schedule entries outside the supplied Overview window", () => {
    const entry = {
      assignmentIds: [1],
      isDelete: false,
    } as ShiftMap[string];
    const shifts = {
      "employee-1_2026-06-20": entry,
      "employee-1_2026-06-21": entry,
      "employee-1_2026-09-12": entry,
      "employee-1_2026-09-13": entry,
    } as ShiftMap;
    const assignments = new Map([
      [
        1,
        {
          id: 1,
          label: "Day RN",
          name: "Day registered nurse",
          color: "#123456",
        } as AssignmentDefinition,
      ],
    ]);

    expect(
      computeShiftDistribution("employee-1", shifts, assignments, "2026-06-21", "2026-09-12"),
    ).toEqual([expect.objectContaining({ assignmentId: 1, count: 2, percentage: 100 })]);
  });
});
