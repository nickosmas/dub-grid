import { describe, expect, it } from "vitest";
import { orderFocusAreasByDepartment } from "./focus-area-order";

const departments = [
  { id: 1, type: "scheduled" as const, sortOrder: 2 },
  { id: 2, type: "scheduled" as const, sortOrder: 0 },
  { id: 3, type: "management" as const, sortOrder: 1 },
];

describe("orderFocusAreasByDepartment", () => {
  it("groups by department order, then by each focus area's own order", () => {
    const focusAreas = [
      { id: 10, departmentId: 1, sortOrder: 0 },
      { id: 11, departmentId: 2, sortOrder: 5 },
      { id: 12, departmentId: 1, sortOrder: 1 },
      { id: 13, departmentId: 2, sortOrder: 3 },
    ];
    expect(orderFocusAreasByDepartment(focusAreas, departments).map((fa) => fa.id)).toEqual([
      13, 11, 10, 12,
    ]);
  });

  it("puts focus areas without a known scheduled department last", () => {
    const focusAreas = [
      { id: 20, departmentId: null, sortOrder: 0 },
      { id: 21, departmentId: 99, sortOrder: 0 },
      { id: 22, departmentId: 1, sortOrder: 9 },
    ];
    expect(orderFocusAreasByDepartment(focusAreas, departments).map((fa) => fa.id)).toEqual([
      22, 20, 21,
    ]);
  });

  it("does not reorder its input", () => {
    const focusAreas = [
      { id: 1, departmentId: 1, sortOrder: 1 },
      { id: 2, departmentId: 1, sortOrder: 0 },
    ];
    orderFocusAreasByDepartment(focusAreas, departments);
    expect(focusAreas.map((fa) => fa.id)).toEqual([1, 2]);
  });
});
