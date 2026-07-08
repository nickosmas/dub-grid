import { describe, expect, it } from "vitest";
import { resolveGridAuditLabel } from "@/app/schedule/_lib/grid-audit-label";
import type { ShiftMap } from "@/types";

function makeShiftMap(overrides: Partial<ShiftMap[string]>, key = "emp-1_2024-01-15"): ShiftMap {
  return {
    [key]: {
      label: "D",
      assignmentIds: [1],
      isDraft: true,
      draftKind: "modified",
      publishedAssignmentDefinitionIds: [1],
      publishedLabel: "D",
      ...overrides,
    },
  };
}

describe("resolveGridAuditLabel", () => {
  it("returns Me when the current user last touched the cell", () => {
    expect(
      resolveGridAuditLabel({
        cellKey: "emp-1_2024-01-15",
        shifts: makeShiftMap({
          createdBy: "user-2",
          updatedBy: "user-1",
        }),
        auditNames: new Map([["user-1", "Alex Admin"]]),
        currentUserId: "user-1",
      }),
    ).toBe("Me");
  });

  it("prefers updatedBy over createdBy for compact author labels", () => {
    expect(
      resolveGridAuditLabel({
        cellKey: "emp-1_2024-01-15",
        shifts: makeShiftMap({
          createdBy: "user-1",
          updatedBy: "user-2",
        }),
        auditNames: new Map([
          ["user-1", "Alex Admin"],
          ["user-2", "Riley RN"],
        ]),
        currentUserId: "user-1",
      }),
    ).toBe("R. RN");
  });

  it("falls back to publish history when the shift row is gone after publish", () => {
    expect(
      resolveGridAuditLabel({
        cellKey: "emp-1_2024-01-15",
        shifts: {},
        publishChangesMap: new Map([["emp-1_2024-01-15", { updatedBy: "user-2" }]]),
        auditNames: new Map([["user-2", "Jordan Example"]]),
        currentUserId: "user-1",
      }),
    ).toBe("J. Example");
  });

  it("falls back to the publisher when publish history has no updatedBy", () => {
    expect(
      resolveGridAuditLabel({
        cellKey: "emp-1_2024-01-15",
        shifts: {},
        publishChangesMap: new Map([
          ["emp-1_2024-01-15", { updatedBy: null, publishedBy: "user-3" }],
        ]),
        auditNames: new Map([["user-3", "Morgan Example"]]),
        currentUserId: "user-1",
      }),
    ).toBe("M. Example");
  });
});
