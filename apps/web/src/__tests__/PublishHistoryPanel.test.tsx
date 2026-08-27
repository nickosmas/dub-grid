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
});
