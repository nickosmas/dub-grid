import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ActivityFeed from "@/components/dashboard/ActivityFeed";
import CoverageBySectionCard from "@/components/dashboard/CoverageBySectionCard";
import OpenShiftsCard from "@/components/dashboard/OpenShiftsCard";
import StaffHoursCard from "@/components/dashboard/StaffHoursCard";
import type { Employee, FocusArea } from "@/types";

const employees: Employee[] = [
  {
    id: "emp-1",
    firstName: "Alex",
    lastName: "Rivera",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 1,
  },
];

const focusAreas: FocusArea[] = [
  {
    id: 1,
    orgId: "org-1",
    departmentId: null,
    name: "Front Desk",
    sortOrder: 0,
  },
];

describe("dashboard empty states", () => {
  it("renders the activity empty state copy", () => {
    const { container } = render(<ActivityFeed items={[]} />);

    expect(screen.getByText("No recent activity")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Published updates, shift changes, requests, and new user sign-ups will appear here.",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders the staff hours empty state message", () => {
    render(
      <StaffHoursCard
        employeeHours={[]}
        employees={employees}
        focusAreas={focusAreas}
        canNavigateToDetailsPage
        emptyMessage="No overtime alerts this period"
      />,
    );

    expect(screen.getByText("No overtime alerts this period")).toBeInTheDocument();
  });

  it("renders the open shifts empty state message", () => {
    render(<OpenShiftsCard openShifts={[]} />);

    expect(screen.getByText("All shifts covered this week")).toBeInTheDocument();
  });

  it("renders open shift counts with the selected period label", () => {
    render(
      <OpenShiftsCard
        periodLabel="these 2 weeks"
        openShifts={[
          {
            id: "gap-1",
            assignmentLabel: "Day shift",
            date: new Date("2026-05-11T12:00:00.000Z"),
            dayOfMonth: 11,
            dayOfWeek: "MON",
            eligibleAssignmentDefinitionIds: [101],
            focusAreaId: 1,
            focusAreaName: "Front Desk",
            needed: 2,
            preferredOpenAssignmentDefinitionId: 101,
            requirementAssignmentDefinitionId: 101,
            ruleLabel: "Day shift",
            timeRange: "7am-3pm",
            urgency: "high",
          },
        ]}
      />,
    );

    expect(screen.getByText("2 unfilled these 2 weeks")).toBeInTheDocument();
  });

  it("renders the open shifts unpublished state message", () => {
    render(<OpenShiftsCard openShifts={[]} publishedWindowState="unpublished" />);

    expect(screen.getAllByText("Not published yet").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Open shifts will appear after this period is published."),
    ).toBeInTheDocument();
  });

  it("renders the coverage empty state inside the shared dashed box", () => {
    render(
      <CoverageBySectionCard
        sections={[]}
        focusAreaLabel="Wings"
        isMobile={false}
        hasRequirements={false}
      />,
    );

    expect(
      screen.getByText(
        "Set up coverage requirements in Settings to track how well each wings is staffed.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the coverage unpublished state message", () => {
    render(
      <CoverageBySectionCard
        sections={[]}
        focusAreaLabel="Wings"
        isMobile={false}
        hasRequirements
        publishedWindowState="unpublished"
      />,
    );

    expect(screen.getAllByText("Not published yet").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Coverage details will appear after this period is published."),
    ).toBeInTheDocument();
  });

  it("renders coverage heatmap cells as filled over required", () => {
    render(
      <CoverageBySectionCard
        sections={[
          {
            daily: [
              {
                dateKey: "2026-05-11",
                dayLabel: "Mon",
                filledCount: 1,
                requiredCount: 2,
                staffCount: 1,
                status: "amber",
              },
              {
                dateKey: "2026-05-12",
                dayLabel: "Tue",
                filledCount: 0,
                requiredCount: 0,
                staffCount: 0,
                status: "none",
              },
            ],
            filledTotal: 1,
            focusAreaId: 1,
            focusAreaName: "Front Desk",
            pct: 50,
            requiredTotal: 2,
          },
        ]}
        focusAreaLabel="Wings"
        isMobile={false}
        hasRequirements
      />,
    );

    expect(screen.getByLabelText("Front Desk Mon: 1 of 2 required slots filled")).toHaveTextContent(
      "1/2",
    );
    expect(screen.getByLabelText("Front Desk Tue: no coverage requirement")).toHaveTextContent(
      "\u2014",
    );
  });
});
