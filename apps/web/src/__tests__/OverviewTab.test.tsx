import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewTab } from "@/components/staff-detail/tabs/OverviewTab";
import { makeEmployee, makeFocusArea } from "@/__tests__/factories";

describe("OverviewTab", () => {
  it("shows assigned focus areas in details using the organization's custom label", () => {
    render(
      <OverviewTab
        employee={makeEmployee({ focusAreaIds: [1, 2] })}
        shifts={{}}
        assignmentById={new Map()}
        categoryById={new Map()}
        focusAreas={[
          makeFocusArea({ id: 1, name: "ICU" }),
          makeFocusArea({ id: 2, name: "ED" }),
        ]}
        focusAreaLabel="Care Units"
        certifications={[]}
        orgRoles={[]}
        pendingInvite={null}
        thisWeekHours={null}
      />
    );

    expect(screen.getByText("Care Units, certification, roles, and internal notes.")).toBeInTheDocument();
    expect(screen.getByText("Care Units")).toBeInTheDocument();
    expect(screen.getByText("ICU, ED")).toBeInTheDocument();
  });
});
