import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SuperAdminDashboard from "@/components/dashboard/SuperAdminDashboard";
import type { DashboardContentProps } from "@/components/dashboard/DashboardContentProps";

function makeProps(
  overrides: Partial<DashboardContentProps> = {},
): DashboardContentProps {
  const props = {
    absenceTypeById: new Map(),
    assignmentById: new Map(),
    activeEmployees: [],
    activityItems: [],
    coverageRequirements: [{ id: 1 }],
    currentEmpId: "emp-1",
    currentHours: [],
    currentPeriodShifts: {},
    periodDates: [new Date("2026-05-11T00:00:00")],
    focusAreas: [{ id: 1, name: "Front Desk" }],
    isMobile: false,
    onExpandPanel: vi.fn(),
    openShifts: [],
    org: { id: "org-1", focusAreaLabel: "Wing" },
    overtimeThreshold: 80,
    periodLabel: "this week",
    publishedWindowState: "published",
    sectionCoverage: [],
  } as unknown as DashboardContentProps;

  return { ...props, ...overrides };
}

describe("SuperAdminDashboard", () => {
  it("renders the my-schedule row alongside the org-wide cards", () => {
    render(<SuperAdminDashboard {...makeProps()} />);

    expect(screen.getByTestId("my-schedule-row")).toBeInTheDocument();
    expect(screen.getByText("Coverage by wing")).toBeInTheDocument();
    expect(screen.getByText("Open shifts")).toBeInTheDocument();
  });

  it("omits the my-schedule row when the admin has no linked employee", () => {
    render(<SuperAdminDashboard {...makeProps({ currentEmpId: null })} />);

    expect(screen.queryByTestId("my-schedule-row")).not.toBeInTheDocument();
  });
});
