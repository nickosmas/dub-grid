import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPerms } from "@dubgrid/authz";
import AdminDashboard from "@/components/dashboard/AdminDashboard";
import type { DashboardContentProps } from "@/components/dashboard/DashboardContentProps";

function makeProps(overrides: Partial<DashboardContentProps> = {}): DashboardContentProps {
  const permissions = {
    ...buildPerms("admin", "org-1", false),
    canApproveShiftRequests: true,
    canEditShifts: true,
    canViewDashboardAnalytics: true,
    canViewSchedule: true,
  };
  const props = {
    activeEmployees: [
      {
        id: "emp-1",
        firstName: "Alex",
        lastName: "Rivera",
        focusAreaIds: [1],
      },
    ],
    activityItems: [],
    absenceTypeById: new Map(),
    assignmentById: new Map(),
    coverageRequirements: [{ id: 1 }],
    currentEmpId: "emp-1",
    currentPeriodShifts: {},
    periodDates: [new Date("2026-05-11T00:00:00")],
    currentHours: [
      {
        dailyHours: {},
        empId: "emp-1",
        isOvertime: true,
        overtimeHours: 5,
        totalHours: 85,
      },
    ],
    draftDeletedCount: 0,
    draftModifiedCount: 0,
    draftNewCount: 1,
    focusAreas: [{ id: 1, name: "Front Desk" }],
    isMobile: false,
    onExpandPanel: vi.fn(),
    openShifts: [
      {
        id: "gap-1",
        assignmentLabel: "Day shift",
        date: new Date("2026-05-11T12:00:00.000Z"),
        dayOfMonth: 11,
        dayOfWeek: "MON",
        eligibleAssignmentDefinitionIds: [101],
        focusAreaId: 2,
        focusAreaName: "Memory Care",
        needed: 2,
        preferredOpenAssignmentDefinitionId: 101,
        requirementAssignmentDefinitionId: 101,
        ruleLabel: "Day shift",
        timeRange: "7am-3pm",
        urgency: "high",
      },
    ],
    org: {
      id: "org-1",
      focusAreaLabel: "Wing",
    },
    overtimeThreshold: 80,
    periodLabel: "these 2 weeks",
    permissions,
    publishedWindowState: "published",
    sectionCoverage: [
      {
        daily: [],
        filledTotal: 4,
        focusAreaId: 1,
        focusAreaName: "Front Desk",
        pct: 100,
        requiredTotal: 4,
      },
      {
        daily: [],
        filledTotal: 2,
        focusAreaId: 2,
        focusAreaName: "Memory Care",
        pct: 50,
        requiredTotal: 4,
      },
    ],
    shiftRequests: {
      pendingApproval: [
        {
          id: "request-1",
          requesterPresentation: {
            endTime: "15:00:00",
            label: "D",
            segments: [
              {
                endTime: "15:00:00",
                jobId: 101,
                jobName: "Nurse",
                label: "D",
                shiftId: 10,
                shiftName: "Day shift",
                startTime: "07:00:00",
              },
            ],
            shiftName: "Day shift",
            startTime: "07:00:00",
          },
          requesterName: "Casey Lee",
          requesterShiftDate: "2026-05-11",
          requesterShiftLabel: "D",
          type: "pickup",
        },
      ],
      resolve: vi.fn().mockResolvedValue(true),
    },
  } as unknown as DashboardContentProps;

  return { ...props, ...overrides };
}

describe("AdminDashboard", () => {
  it("surfaces admin dashboard data as period-aware action items", () => {
    const { container } = render(<AdminDashboard {...makeProps()} />);

    expect(screen.getByText("Review queue")).toBeInTheDocument();
    expect(screen.getByText("Approvals (1)")).toBeInTheDocument();
    expect(screen.getByText("Casey Lee requested pickup")).toBeInTheDocument();
    expect(screen.getByText("Day shift \u00b7 2026-05-11")).toBeInTheDocument();
    expect(screen.getByText("2 urgent coverage slots")).toBeInTheDocument();
    expect(screen.getByText("1 unpublished change")).toBeInTheDocument();
    expect(screen.getByText("these 2 weeks \u00b7 required vs scheduled")).toBeInTheDocument();
    expect(screen.getByText("2 unfilled these 2 weeks")).toBeInTheDocument();
    expect(screen.getByText("Staff over 80h these 2 weeks")).toBeInTheDocument();

    const coverageCard = screen.getByText("Coverage by wing").closest(".dg-card");
    expect(coverageCard).not.toBeNull();
    const coverageText = coverageCard?.textContent ?? "";
    expect(coverageText.indexOf("Memory Care")).toBeGreaterThanOrEqual(0);
    expect(coverageText.indexOf("Memory Care")).toBeLessThan(coverageText.indexOf("Front Desk"));
    expect(container.querySelector('a[href="/schedule"]')).not.toBeNull();
    // This admin lacks canManageEmployees, so staff names render as plain
    // text — no link into the /people/[id] profile page.
    expect(screen.getByText("A. Rivera")).toBeInTheDocument();
    expect(container.querySelector('a[href="/people/emp-1"]')).toBeNull();
  });

  it("links staff names to their profile for admins who manage employees", () => {
    const props = makeProps();
    const { container } = render(
      <AdminDashboard
        {...props}
        permissions={
          {
            ...props.permissions,
            canManageEmployees: true,
          } as DashboardContentProps["permissions"]
        }
      />,
    );

    expect(container.querySelector('a[href="/people/emp-1"]')).not.toBeNull();
  });

  it("links to coverage settings when requirements aren't configured yet", () => {
    render(
      <AdminDashboard
        {...makeProps({
          coverageRequirements: [],
          sectionCoverage: [],
          permissions: {
            ...buildPerms("admin", "org-1", false),
            canApproveShiftRequests: true,
            canEditShifts: true,
            canViewDashboardAnalytics: true,
            canViewSchedule: true,
            canManageCoverageRequirements: true,
          } as unknown as DashboardContentProps["permissions"],
        })}
      />,
    );

    expect(screen.getByText("No coverage requirements configured")).toBeInTheDocument();
    const configureLink = screen.getByRole("link", { name: "Configure coverage" });
    expect(configureLink).toHaveAttribute("href", "/settings?section=schedule-coverage");
  });

  it("hides the configure-coverage link when the admin can't manage requirements", () => {
    render(
      <AdminDashboard
        {...makeProps({
          coverageRequirements: [],
          sectionCoverage: [],
          permissions: {
            ...buildPerms("admin", "org-1", false),
            canApproveShiftRequests: true,
            canEditShifts: true,
            canViewDashboardAnalytics: true,
            canViewSchedule: true,
            canManageCoverageRequirements: false,
          } as unknown as DashboardContentProps["permissions"],
        })}
      />,
    );

    expect(screen.queryByRole("link", { name: "Configure coverage" })).not.toBeInTheDocument();
  });

  it("hides the schedule card for a management-only admin", () => {
    render(
      <AdminDashboard
        {...makeProps({
          permissions: {
            ...buildPerms("admin", "org-1", false),
            canApproveShiftRequests: true,
            canEditShifts: true,
            canViewDashboardAnalytics: true,
            canViewSchedule: true,
            isManagementUser: true,
            isOnSchedule: false,
          } as unknown as DashboardContentProps["permissions"],
        })}
      />,
    );

    expect(screen.queryByTestId("my-schedule-row")).not.toBeInTheDocument();
  });

  it("still shows the schedule card for a management admin who is also scheduled", () => {
    render(
      <AdminDashboard
        {...makeProps({
          permissions: {
            ...buildPerms("admin", "org-1", false),
            canApproveShiftRequests: true,
            canEditShifts: true,
            canViewDashboardAnalytics: true,
            canViewSchedule: true,
            isManagementUser: true,
            isOnSchedule: true,
          } as unknown as DashboardContentProps["permissions"],
        })}
      />,
    );

    expect(screen.getByTestId("my-schedule-row")).toBeInTheDocument();
  });
});
