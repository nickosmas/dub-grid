import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExpandedChangesGrouped } from "@/components/PublishHistoryPanel";

describe("ExpandedChangesGrouped", () => {
  it("uses the supplied directory name for a removed employee's historical change", () => {
    render(
      <ExpandedChangesGrouped
        changes={[{ empId: "removed-employee", date: "2026-08-24", kind: "deleted" }]}
        assignmentIdByPair={new Map()}
        assignmentLabelMap={new Map()}
        empNameMap={new Map([["removed-employee", "Riley Stone"]])}
        absenceTypeMap={new Map()}
      />,
    );

    expect(screen.getByText("Riley Stone")).toBeInTheDocument();
    expect(screen.queryByText("Unknown employee")).not.toBeInTheDocument();
  });

  // change_count has always included notes, so a note-only publish used to
  // announce "1 change" over an empty list.
  it("lists a published note under its employee", () => {
    render(
      <ExpandedChangesGrouped
        changes={[]}
        noteChanges={[
          {
            empId: "emp-1",
            date: "2026-08-24",
            kind: "new",
            indicatorTypeId: 7,
            focusAreaId: 3,
            indicatorName: "Float",
            indicatorColor: "#ff0000",
          },
          {
            empId: "emp-1",
            date: "2026-08-25",
            kind: "deleted",
            indicatorTypeId: 8,
            focusAreaId: 3,
            indicatorName: "Training",
            indicatorColor: "#00ff00",
          },
        ]}
        assignmentIdByPair={new Map()}
        assignmentLabelMap={new Map()}
        empNameMap={new Map([["emp-1", "Riley Stone"]])}
        absenceTypeMap={new Map()}
      />,
    );

    expect(screen.getByText("Riley Stone")).toBeInTheDocument();
    expect(screen.getByText("(2 changes)")).toBeInTheDocument();
    expect(screen.getByText(/Added note: Float/)).toBeInTheDocument();
    expect(screen.getByText(/Removed note: Training/)).toBeInTheDocument();
  });
});
