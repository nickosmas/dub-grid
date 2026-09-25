import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OverviewTab } from "@/components/staff-detail/tabs/OverviewTab";
import { makeEmployee, makeFocusArea } from "@/__tests__/factories";

describe("OverviewTab", () => {
  it("places schedule overview cards directly after the summary", () => {
    render(
      <OverviewTab
        employee={makeEmployee()}
        shifts={{}}
        assignmentById={new Map()}
        categoryById={new Map()}
        focusAreas={[]}
        certifications={[]}
        orgRoles={[]}
        pendingInvite={null}
        thisWeekHours={null}
        scheduleOverview={<div>Recurring schedule card</div>}
      />,
    );

    const summary = screen.getByTestId("overview-summary");
    expect(summary.nextElementSibling).toHaveTextContent("Recurring schedule card");
  });

  it("shows assigned focus areas in details using the organization's custom label", () => {
    render(
      <OverviewTab
        employee={makeEmployee({ focusAreaIds: [1, 2] })}
        shifts={{}}
        assignmentById={new Map()}
        categoryById={new Map()}
        focusAreas={[makeFocusArea({ id: 1, name: "ICU" }), makeFocusArea({ id: 2, name: "ED" })]}
        focusAreaLabel="Care Units"
        certifications={[]}
        orgRoles={[]}
        pendingInvite={null}
        thisWeekHours={null}
      />,
    );

    expect(
      screen.getByText("Employment, care units, certification, roles, and internal notes."),
    ).toBeInTheDocument();
    expect(screen.getByText("Full-time")).toBeInTheDocument();
    expect(screen.getByText("Care Units")).toBeInTheDocument();
    expect(screen.getByText("ICU, ED")).toBeInTheDocument();
  });

  it("shows when the staff record was added, and nothing when that is unknown", () => {
    const props = {
      shifts: {},
      assignmentById: new Map(),
      categoryById: new Map(),
      focusAreas: [],
      certifications: [],
      orgRoles: [],
      pendingInvite: null,
      thisWeekHours: null,
    };
    // Noon UTC, so the local calendar day is the same in every test zone.
    const added = "2026-01-09T12:00:00.000Z";
    const { unmount } = render(
      <OverviewTab {...props} employee={makeEmployee({ createdAt: added })} />,
    );

    expect(screen.getByText("Date added")).toBeInTheDocument();
    expect(
      screen.getByText(
        new Date(added).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
      ),
    ).toBeInTheDocument();

    unmount();
    render(<OverviewTab {...props} employee={makeEmployee({ createdAt: null })} />);
    expect(screen.queryByText("Date added")).not.toBeInTheDocument();
  });
});
