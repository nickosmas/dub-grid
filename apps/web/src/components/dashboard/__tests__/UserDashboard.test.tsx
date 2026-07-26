// Pin to UTC (production runtime) so split-shift/time-of-day rendering is
// deterministic regardless of the dev machine's timezone.
process.env.TZ = "UTC";

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildPerms } from "@dubgrid/authz";
import UserDashboard from "@/components/dashboard/UserDashboard";
import type { DashboardContentProps } from "@/components/dashboard/DashboardContentProps";
import {
  getDashboardOvertimeThreshold,
  getDashboardPeriodLabel,
  getDashboardRoleVariant,
  hasDashboardAdminCapability,
} from "@/components/dashboard/DashboardView";
import {
  getDatesInRange,
  getWeekStart,
  type EmployeeHours,
  type OpenShift,
} from "@/lib/dashboard-stats";
import { formatDateKey } from "@/lib/utils";
import type {
  AssignmentDefinition,
  Employee,
  FocusArea,
  Organization,
  ShiftCategory,
  ShiftMap,
  ShiftRequest,
} from "@/types";

const focusArea: FocusArea = {
  id: 1,
  orgId: "org-1",
  departmentId: null,
  name: "Memory Care",
  sortOrder: 1,
};

const shiftCategory: ShiftCategory = {
  id: 10,
  orgId: "org-1",
  name: "Day shift",
  abbr: "D",
  color: "#dbeafe",
  focusAreaId: 1,
  sortOrder: 1,
  startTime: "00:00",
  endTime: "23:59",
};

const assignment: AssignmentDefinition = {
  id: 101,
  orgId: "org-1",
  label: "Care",
  name: "Day shift Care",
  color: "#dbeafe",
  border: "#93c5fd",
  text: "#1e3a8a",
  categoryId: 10,
  shiftId: 10,
  jobId: 7,
  focusAreaId: 1,
  sortOrder: 1,
  defaultStartTime: "00:00",
  defaultEndTime: "23:59",
  requiredCertificationIds: [],
};

const employee: Employee = {
  id: "emp-1",
  employeeNumber: 1001,
  userId: "user-1",
  firstName: "Avery",
  lastName: "Stone",
  employmentType: "full_time",
  email: "avery@example.com",
  phone: "",
  status: "active",
  statusChangedAt: null,
  statusNote: "",
  focusAreaIds: [1],
  certificationId: null,
  roleIds: [],
  departmentIds: [],
  deptAdminIds: [],
  seniority: 1,
  contactNotes: "",
  version: 1,
  createdAt: null,
};

const coworker: Employee = {
  ...employee,
  id: "emp-2",
  userId: "user-2",
  firstName: "Jordan",
  lastName: "Lee",
  email: "jordan@example.com",
};

const teammate: Employee = {
  ...employee,
  id: "emp-4",
  userId: "user-4",
  firstName: '"Mina',
  lastName: "Rao",
  email: "mina@example.com",
};

const org: Organization = {
  id: "org-1",
  name: "Arden Wood",
  slug: "arden-wood",
  address: "",
  addressLine1: "",
  addressLine2: "",
  addressCity: "",
  addressState: "",
  addressPostalCode: "",
  addressCountry: "US",
  phone: "",
  employeeCount: null,
  focusAreaLabel: "focus area",
  certificationLabel: "certification",
  roleLabel: "role",
  departmentLabel: "department",
  shiftDisplayMode: "code",
  // Default to UTC so "today"/"now" line up with the UTC-pinned browser clock
  // and the browser-keyed fixtures, keeping time-of-day-agnostic tests
  // deterministic. Tests that need a real timezone offset set it explicitly.
  timezone: "UTC",
  payPeriodStartDate: null,
  enforceConflictPrevention: true,
  defaultShiftEnabled: true,
  openShiftVisibility: { coverageGap: "matched", calloff: "matched" },
  coverageRuleConfig: { mentoredCoverageCreditPercent: 50 },
  dataRetentionDays: 365,
  featureOverrides: {},
  workspaceKind: "real",
  sandboxOwnerUserId: null,
  sandboxSourceOrgId: null,
};

function makeShiftMap(todayKey: string): ShiftMap {
  return {
    [`emp-1_${todayKey}`]: {
      assignmentIds: [101],
      customEndTime: null,
      customStartTime: null,
      draftKind: null,
      isDraft: false,
      label: "Care",
      publishedAssignmentDefinitionIds: [101],
      publishedLabel: "Care",
      segments: [
        {
          assignmentId: 101,
          focusAreaId: 1,
          isMentored: true,
          jobId: 7,
          jobName: "Care",
          label: "Care",
          position: 0,
          shiftId: 10,
          shiftName: "Day shift",
          startTime: "00:00",
          endTime: "23:59",
        },
      ],
    },
    [`emp-2_${todayKey}`]: {
      assignmentIds: [101],
      customEndTime: null,
      customStartTime: null,
      draftKind: null,
      isDraft: false,
      label: "Care",
      publishedAssignmentDefinitionIds: [101],
      publishedLabel: "Care",
      segments: [
        {
          assignmentId: 101,
          focusAreaId: 1,
          jobId: 7,
          jobName: "Care",
          label: "Care",
          position: 0,
          shiftId: 10,
          shiftName: "Day shift",
          startTime: "00:00",
          endTime: "23:59",
        },
      ],
    },
  };
}

function makeShiftRequest(overrides: Partial<ShiftRequest> = {}): ShiftRequest {
  return {
    id: "request-1",
    orgId: "org-1",
    type: "swap",
    status: "open",
    requesterEmpId: "emp-2",
    requesterName: "Jordan Lee",
    requesterShiftDate: formatDateKey(new Date()),
    requesterState: {
      absenceTypeId: null,
      customEndTime: null,
      customStartTime: null,
      focusAreaId: 1,
      fromRecurring: false,
      kind: "worked",
      segments: [{ shiftId: 10, jobId: 7, position: 0 }],
      seriesId: null,
    },
    requesterAssignmentDefinitionIds: [101],
    requesterShiftLabel: "Day shift",
    requesterFocusAreaId: 1,
    requesterCustomStartTime: "09:00",
    requesterCustomEndTime: "17:00",
    targetEmpId: "emp-1",
    targetName: "Avery Stone",
    targetShiftDate: formatDateKey(new Date()),
    targetState: null,
    targetAssignmentDefinitionIds: null,
    targetShiftLabel: null,
    targetFocusAreaId: null,
    targetCustomStartTime: null,
    targetCustomEndTime: null,
    absenceTypeId: null,
    parentRequestId: null,
    adminUserId: null,
    adminNote: null,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeProps(overrides: Partial<DashboardContentProps> = {}): DashboardContentProps {
  const today = new Date();
  const todayKey = formatDateKey(today);
  const periodStart = today;
  const periodDates = getDatesInRange(periodStart, 7);
  const alternateOpenDate =
    periodDates.find((date) => formatDateKey(date) > todayKey) ?? periodDates[0] ?? today;
  const assignmentById = new Map([[assignment.id, assignment]]);
  const respond = vi.fn().mockResolvedValue(true);
  const claim = vi.fn().mockResolvedValue(true);
  const volunteer = vi.fn().mockResolvedValue(true);
  const coverRequest = makeShiftRequest({ id: "cover-request" });
  const pickupRequest = makeShiftRequest({
    id: "pickup-request",
    requesterShiftDate: formatDateKey(alternateOpenDate),
    requesterEmpId: "emp-3",
    requesterName: "Taylor Reed",
    targetEmpId: null,
    type: "pickup",
  });
  const openShift: OpenShift = {
    id: "gap-1",
    assignmentLabel: "Day shift",
    date: alternateOpenDate,
    dayOfMonth: alternateOpenDate.getDate(),
    dayOfWeek: "MON",
    eligibleAssignmentDefinitionIds: [101],
    focusAreaId: 1,
    focusAreaName: "Memory Care",
    needed: 1,
    preferredOpenAssignmentDefinitionId: 101,
    requirementAssignmentDefinitionId: 101,
    ruleLabel: "Day shift",
    timeRange: "9:00 AM - 5:00 PM",
    urgency: "low",
  };

  const baseProps: DashboardContentProps = {
    activeEmployees: [employee, coworker],
    activityItems: [],
    allShifts: makeShiftMap(todayKey),
    assignmentById,
    assignmentLabelMap: new Map([[assignment.id, assignment.label]]),
    assignments: [assignment],
    coverageRequirements: [],
    currentEmpId: employee.id,
    currentEmployee: employee,
    currentHours: [
      {
        dailyHours: {},
        empId: employee.id,
        isOvertime: false,
        overtimeHours: 0,
        totalHours: 40,
      } satisfies EmployeeHours,
    ],
    currentPeriodShifts: makeShiftMap(todayKey),
    draftDeletedCount: 0,
    draftModifiedCount: 0,
    draftNewCount: 0,
    employees: [employee, coworker],
    focusAreas: [focusArea],
    isMobile: false,
    isTablet: false,
    jobs: [],
    onExpandPanel: vi.fn(),
    openShifts: [openShift],
    org,
    otAlerts: [],
    periodDates,
    periodEnd: periodDates[6] ?? today,
    periodLabel: "this week",
    periodStart,
    periodStats: {
      coverage: { delta: 0, openSlots: 0, pct: 100, prevPct: 100 },
      otAlerts: { count: 0, delta: 0, prevCount: 0 },
      staffScheduled: { delta: 0, prevScheduled: 0, scheduled: 1, total: 2 },
      totalShifts: { delta: 0, prevValue: 0, value: 1 },
    },
    permissions: {
      ...buildPerms("user", "org-1", false),
      isOnSchedule: true,
      isManagementUser: false,
      mfaNagRequired: false,
    },
    prevHours: [],
    prevPeriodLabel: "last week",
    publishHistory: null,
    publishedWindowState: "published",
    overtimeThreshold: 40,
    sectionCoverage: [],
    shiftBreakdown: { byFocusArea: [], totalShifts: 0 },
    shiftCategories: [shiftCategory],
    shiftRequests: {
      badgeCount: 1,
      cancel: vi.fn().mockResolvedValue(true),
      claim,
      create: vi.fn().mockResolvedValue("created-request"),
      error: null,
      loading: false,
      myRequests: [coverRequest],
      openPickups: [pickupRequest],
      pendingApproval: [],
      refetch: vi.fn().mockResolvedValue(undefined),
      requests: [coverRequest, pickupRequest],
      resolve: vi.fn().mockResolvedValue(true),
      respond,
      volunteer,
    },
    trendData: [],
    viewMode: "week",
    absenceTypeById: new Map(),
  };

  return { ...baseProps, ...overrides };
}

describe("dashboard user mode selection", () => {
  it("forces admins and super admins into the user dashboard when user view is active", () => {
    const admin = buildPerms("admin", "org-1", false);
    const superAdmin = buildPerms("super_admin", "org-1", false);

    expect(hasDashboardAdminCapability(admin)).toBe(true);
    expect(getDashboardRoleVariant(admin)).toBe("admin");
    expect(getDashboardRoleVariant(superAdmin)).toBe("super-admin");
    expect(getDashboardRoleVariant({ ...admin, isUserViewActive: true })).toBe("user");
    expect(getDashboardRoleVariant({ ...superAdmin, isUserViewActive: true })).toBe("user");
  });

  it("labels admin dashboard periods and overtime thresholds from the selected range", () => {
    expect(getDashboardPeriodLabel("day")).toBe("today");
    expect(getDashboardPeriodLabel("week")).toBe("this week");
    expect(getDashboardPeriodLabel("2weeks")).toBe("these 2 weeks");
    expect(getDashboardOvertimeThreshold(1)).toBe(40);
    expect(getDashboardOvertimeThreshold(7)).toBe(40);
    expect(getDashboardOvertimeThreshold(14)).toBe(40);
  });
});

describe("UserDashboard", () => {
  it("renders the Me-style dashboard with a constrained hero and uses existing actions", async () => {
    const todayKey = formatDateKey(new Date());
    const shiftMap = makeShiftMap(todayKey);
    shiftMap[`emp-4_${todayKey}`] = {
      ...shiftMap[`emp-2_${todayKey}`],
    };
    const props = makeProps({
      activeEmployees: [employee, coworker, teammate],
      allShifts: shiftMap,
      currentPeriodShifts: shiftMap,
      employees: [employee, coworker, teammate],
    });

    render(<UserDashboard {...props} />);

    expect(screen.getByTestId("user-dashboard-me-layout")).toBeInTheDocument();
    expect(screen.getByTestId("user-dashboard-top-grid")).toHaveStyle({
      alignItems: "stretch",
      gridTemplateColumns: "minmax(0, 680px) minmax(320px, 1fr)",
    });
    expect(screen.getByTestId("user-dashboard-hero-shell")).toHaveStyle({
      gridRow: "1 / span 2",
      maxWidth: "680px",
    });
    expect(screen.getByTestId("user-dashboard-hero")).toHaveStyle({
      height: "100%",
    });
    expect(screen.getByText("On Duty")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("user-dashboard-hero")).queryByText("Avery Stone"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Day shift").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mentored").length).toBeGreaterThan(0);
    expect(screen.getByText("Working with")).toBeInTheDocument();
    const workingWith = screen.getByTestId("user-dashboard-working-with");
    const heroBottomStack = screen.getByTestId("user-dashboard-hero-bottom-stack");
    const shiftmateAvatars = screen.getAllByTestId("user-dashboard-shiftmate-avatar");
    const shiftmateAvatarFrames = screen.getAllByTestId("user-dashboard-shiftmate-avatar-frame");

    expect(workingWith).toHaveStyle({
      background: "#3A55CB",
      borderRadius: "16px",
      justifyContent: "space-between",
    });
    expect(heroBottomStack).toHaveStyle({ marginTop: "auto" });
    expect(shiftmateAvatarFrames[0]).toHaveStyle({
      height: "42px",
      padding: "2px",
      width: "42px",
    });
    expect(shiftmateAvatarFrames[1]).toHaveStyle({
      marginLeft: "-10px",
    });
    expect(shiftmateAvatars[0]).toHaveStyle({
      borderRadius: "19px",
      height: "38px",
      width: "38px",
    });
    expect(shiftmateAvatars.map((avatar) => avatar.textContent)).toEqual(
      expect.arrayContaining(["JL", "MR"]),
    );
    expect(screen.getByText("Cover requests")).toBeInTheDocument();
    expect(screen.getByText("Available shifts")).toBeInTheDocument();
    expect(screen.getByTestId("user-dashboard-action-rail")).toBeInTheDocument();
    expect(screen.queryByText(/carousel below/i)).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("user-dashboard-cover-requests")).queryByRole("button", {
        name: "Accept",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("user-dashboard-available-shifts")).queryByRole("button", {
        name: "Volunteer",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Your Week")).toBeInTheDocument();
    const myWeek = screen.getByTestId("user-dashboard-my-week");
    const todayDateTile = screen.getByTestId("user-dashboard-date-tile-today");
    const weekPills = within(myWeek).getAllByTestId("user-dashboard-week-pills");

    expect(todayDateTile.style.width).toBe("60px");
    expect(todayDateTile.style.height).toBe("68px");
    expect(todayDateTile.style.alignSelf).toBe("center");
    expect(todayDateTile.style.borderRadius).toBe("16px");
    expect(todayDateTile.style.background).toBe("var(--color-bg-secondary)");
    expect(screen.getByTestId("user-dashboard-date-tile-today-dot")).toBeInTheDocument();
    expect(
      Array.from(myWeek.querySelectorAll("svg")).some(
        (icon) => icon.getAttribute("width") === "20" && icon.getAttribute("height") === "20",
      ),
    ).toBe(false);
    expect(weekPills[0]).toHaveTextContent("Care");
    expect(weekPills[0]).not.toHaveTextContent("Day shift");
    expect(screen.queryByText("Quick Actions")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => {
      expect(props.shiftRequests.respond).toHaveBeenCalledWith("cover-request", "emp-1", true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Claim" }));
    await waitFor(() => {
      expect(props.shiftRequests.claim).toHaveBeenCalledWith("pickup-request", "emp-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Volunteer" }));
    await waitFor(() => {
      expect(props.shiftRequests.volunteer).toHaveBeenCalledWith(
        "emp-1",
        expect.any(String),
        expect.objectContaining({
          kind: "worked",
          segments: [
            expect.objectContaining({
              jobId: 7,
              shiftId: 10,
            }),
          ],
        }),
        1,
      );
    });
  });

  it("flows Working with and split follow-up shifts naturally instead of pinning to the hero bottom", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T10:00:00.000Z"));

    try {
      const today = new Date();
      const todayKey = formatDateKey(today);
      const eveningShiftCategory: ShiftCategory = {
        ...shiftCategory,
        abbr: "E",
        id: 11,
        name: "Evening shift",
      };
      const splitShiftMap: ShiftMap = {
        [`emp-1_${todayKey}`]: {
          assignmentIds: [],
          customEndTime: null,
          customStartTime: null,
          draftKind: null,
          isDraft: false,
          label: "D + E",
          publishedAssignmentDefinitionIds: [],
          publishedLabel: "D + E",
          segments: [
            {
              assignmentId: null,
              endTime: "12:00",
              focusAreaId: 1,
              isMentored: false,
              jobId: 7,
              label: "D",
              position: 0,
              shiftId: 10,
              shiftName: "Day shift",
              startTime: "09:00",
            },
            {
              assignmentId: null,
              endTime: "17:00",
              focusAreaId: 1,
              isMentored: false,
              jobId: 7,
              label: "E",
              position: 1,
              shiftId: 11,
              shiftName: "Evening shift",
              startTime: "13:00",
            },
          ],
        },
        [`emp-2_${todayKey}`]: {
          assignmentIds: [],
          customEndTime: null,
          customStartTime: null,
          draftKind: null,
          isDraft: false,
          label: "D",
          publishedAssignmentDefinitionIds: [],
          publishedLabel: "D",
          segments: [
            {
              assignmentId: null,
              endTime: "12:00",
              focusAreaId: 1,
              isMentored: false,
              jobId: 7,
              label: "D",
              position: 0,
              shiftId: 10,
              shiftName: "Day shift",
              startTime: "09:00",
            },
          ],
        },
      };

      render(
        <UserDashboard
          {...makeProps({
            activeEmployees: [employee, coworker],
            allShifts: splitShiftMap,
            currentPeriodShifts: splitShiftMap,
            employees: [employee, coworker],
            openShifts: [],
            periodDates: [today],
            periodEnd: today,
            periodStart: today,
            shiftCategories: [shiftCategory, eveningShiftCategory],
            shiftRequests: {
              ...makeProps().shiftRequests,
              badgeCount: 0,
              myRequests: [],
              openPickups: [],
              requests: [],
            },
          })}
        />,
      );

      const hero = screen.getByTestId("user-dashboard-hero");
      const heroBottomStack = within(hero).getByTestId("user-dashboard-hero-bottom-stack");
      const secondaryShift = within(heroBottomStack).getByTestId(
        "user-dashboard-hero-secondary-shift",
      );

      // Double shift: more content follows, so it flows naturally instead of
      // being pinned to the bottom of the (possibly much taller) hero card —
      // relying on the surrounding column's own gap rather than an extra
      // margin that would crowd the gap below "Working with" out of balance.
      expect(heroBottomStack).toHaveStyle({ marginTop: "0px" });
      expect(
        Array.from(heroBottomStack.children).map((child) => child.getAttribute("data-testid")),
      ).toEqual(["user-dashboard-working-with", "user-dashboard-hero-secondary-shift"]);
      expect(within(secondaryShift).getByText("Evening shift")).toBeInTheDocument();
      expect(within(secondaryShift).getByText("1:00 PM - 5:00 PM")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the action carousel limited to upcoming open shifts and requests", () => {
    const today = new Date();
    const todayKey = formatDateKey(today);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const yesterdayKey = formatDateKey(yesterday);
    const tomorrowKey = formatDateKey(tomorrow);
    const props = makeProps();
    const baseOpenShift = props.openShifts[0]!;
    const pastOpenShift: OpenShift = {
      ...baseOpenShift,
      assignmentLabel: "Past gap",
      date: yesterday,
      dayOfMonth: yesterday.getDate(),
      id: "past-gap",
    };
    const futureOpenShift: OpenShift = {
      ...baseOpenShift,
      assignmentLabel: "Future gap",
      date: tomorrow,
      dayOfMonth: tomorrow.getDate(),
      id: "future-gap",
    };
    const pastCoverRequest = makeShiftRequest({
      id: "past-cover",
      requesterShiftDate: yesterdayKey,
      requesterShiftLabel: "Past request",
      targetShiftDate: yesterdayKey,
    });
    const futureCoverRequest = makeShiftRequest({
      id: "future-cover",
      requesterShiftDate: tomorrowKey,
      requesterShiftLabel: "Future request",
      targetShiftDate: tomorrowKey,
    });
    const pastPickup = makeShiftRequest({
      id: "past-pickup",
      requesterShiftDate: yesterdayKey,
      requesterShiftLabel: "Past pickup",
      targetEmpId: null,
      type: "pickup",
    });
    const futurePickup = makeShiftRequest({
      id: "future-pickup",
      requesterShiftDate: tomorrowKey,
      requesterShiftLabel: "Future pickup",
      targetEmpId: null,
      type: "pickup",
    });

    render(
      <UserDashboard
        {...props}
        openShifts={[pastOpenShift, futureOpenShift]}
        periodDates={[yesterday, today, tomorrow]}
        periodEnd={tomorrow}
        periodStart={yesterday}
        shiftRequests={{
          ...props.shiftRequests,
          myRequests: [pastCoverRequest, futureCoverRequest],
          openPickups: [pastPickup, futurePickup],
          requests: [pastCoverRequest, futureCoverRequest, pastPickup, futurePickup],
        }}
      />,
    );

    const carousel = screen.getByTestId("user-dashboard-action-rail");

    expect(within(carousel).queryByText(/Past request/)).not.toBeInTheDocument();
    expect(within(carousel).queryByText(/Past pickup/)).not.toBeInTheDocument();
    expect(within(carousel).queryByText(/Past gap/)).not.toBeInTheDocument();
    expect(within(carousel).getAllByText(/Future request/).length).toBeGreaterThan(0);
    expect(within(carousel).getAllByText(/Future pickup/).length).toBeGreaterThan(0);
    expect(within(carousel).getAllByText(/Future gap/).length).toBeGreaterThan(0);
    expect(screen.getByText("3 upcoming items")).toBeInTheDocument();
  });

  it("hides available open shifts and pickups after their start time today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T18:00:00.000Z"));

    try {
      const today = new Date();
      const todayKey = formatDateKey(today);
      const shiftMap = makeShiftMap(todayKey);
      for (const entry of Object.values(shiftMap)) {
        entry.segments = entry.segments?.map((segment) => ({
          ...segment,
          endTime: "15:00",
          startTime: "07:00",
        }));
      }
      const lateAssignment: AssignmentDefinition = {
        ...assignment,
        id: 202,
        defaultStartTime: "15:00",
        defaultEndTime: "23:00",
        label: "Late",
        name: "Late shift",
      };
      const baseProps = makeProps({
        allShifts: shiftMap,
        assignmentById: new Map([
          [assignment.id, assignment],
          [lateAssignment.id, lateAssignment],
        ]),
        assignments: [assignment, lateAssignment],
        currentPeriodShifts: shiftMap,
        // 18:00 UTC is 11:00 in this zone, so the 15:00 shifts read as not-yet-
        // started while the early ones have started.
        org: { ...org, timezone: "America/Los_Angeles" },
        openShifts: [
          {
            ...makeProps().openShifts[0]!,
            assignmentLabel: "Started gap",
            date: today,
            dayOfMonth: today.getDate(),
            id: "started-gap",
            preferredOpenAssignmentDefinitionId: assignment.id,
            requirementAssignmentDefinitionId: assignment.id,
            ruleLabel: "Started gap",
          },
          {
            ...makeProps().openShifts[0]!,
            assignmentLabel: "Later gap",
            date: today,
            dayOfMonth: today.getDate(),
            id: "later-gap",
            preferredOpenAssignmentDefinitionId: lateAssignment.id,
            requirementAssignmentDefinitionId: lateAssignment.id,
            ruleLabel: "Later gap",
          },
        ],
        periodDates: [today],
        periodEnd: today,
        periodStart: today,
      });

      render(
        <UserDashboard
          {...baseProps}
          shiftRequests={{
            ...baseProps.shiftRequests,
            openPickups: [
              makeShiftRequest({
                id: "started-pickup",
                requesterCustomEndTime: "15:00",
                requesterCustomStartTime: "07:00",
                requesterShiftDate: todayKey,
                requesterShiftLabel: "Started pickup",
                targetEmpId: null,
                type: "pickup",
              }),
              makeShiftRequest({
                id: "later-pickup",
                requesterCustomEndTime: "23:00",
                requesterCustomStartTime: "15:00",
                requesterShiftDate: todayKey,
                requesterShiftLabel: "Later pickup",
                targetEmpId: null,
                type: "pickup",
              }),
            ],
          }}
        />,
      );

      const carousel = screen.getByTestId("user-dashboard-action-rail");

      expect(within(carousel).queryByText(/Started gap/)).not.toBeInTheDocument();
      expect(within(carousel).queryByText(/Started pickup/)).not.toBeInTheDocument();
      expect(within(carousel).getAllByText(/Later gap/).length).toBeGreaterThan(0);
      expect(within(carousel).getAllByText(/Later pickup/).length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the first future worked shift in the hero before future absences", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T18:00:00.000Z"));

    try {
      const absenceDate = new Date("2026-05-10T12:00:00.000Z");
      const shiftDate = new Date("2026-05-11T12:00:00.000Z");
      const absenceDateKey = formatDateKey(absenceDate);
      const shiftDateKey = formatDateKey(shiftDate);
      const shiftMap = makeShiftMap(shiftDateKey);
      shiftMap[`emp-1_${absenceDateKey}`] = {
        absenceTypeId: 5,
        assignmentIds: [],
        customEndTime: null,
        customStartTime: null,
        draftKind: null,
        isDraft: false,
        label: "PTO",
        publishedAssignmentDefinitionIds: [],
        publishedLabel: "PTO",
        segments: [],
      };

      render(
        <UserDashboard
          {...makeProps({
            absenceTypeById: new Map([
              [
                5,
                {
                  id: 5,
                  orgId: "org-1",
                  label: "PTO",
                  name: "Paid time off",
                  color: "#eef2ff",
                  border: "#c7d2fe",
                  text: "#3730a3",
                  sortOrder: 1,
                  archivedAt: null,
                },
              ],
            ]),
            allShifts: shiftMap,
            currentPeriodShifts: shiftMap,
            periodDates: [absenceDate, shiftDate],
            periodEnd: shiftDate,
            periodStart: absenceDate,
          })}
        />,
      );

      const hero = screen.getByTestId("user-dashboard-hero");

      expect(within(hero).getByText("Day shift")).toBeInTheDocument();
      expect(within(hero).queryByText("Paid time off")).not.toBeInTheDocument();
      expect(within(hero).queryByText("Away")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("features the next upcoming shift in a later week, not an earlier completed one", () => {
    vi.useFakeTimers();
    // Wednesday afternoon: this week's only shift is already finished, and the
    // next real shift is next week — outside the browsed period.
    vi.setSystemTime(new Date("2026-05-13T18:00:00.000Z"));

    try {
      const periodStart = new Date("2026-05-10T00:00:00.000Z"); // Sunday
      const periodDates = getDatesInRange(periodStart, 7);
      const periodEnd = periodDates[6] ?? periodStart;
      const makeWorked = (startTime: string, endTime: string): ShiftMap[string] => ({
        assignmentIds: [101],
        customEndTime: endTime,
        customStartTime: startTime,
        draftKind: null,
        isDraft: false,
        label: "Care",
        publishedAssignmentDefinitionIds: [101],
        publishedLabel: "Care",
        segments: [
          {
            assignmentId: 101,
            endTime,
            focusAreaId: 1,
            isMentored: false,
            jobId: 7,
            jobName: "Care",
            label: "Care",
            position: 0,
            shiftId: 10,
            shiftName: "Day shift",
            startTime,
          },
        ],
      });
      const completedThisWeek: ShiftMap = {
        "emp-1_2026-05-11": makeWorked("09:00", "15:00"),
      };
      const upcomingNextWeek: ShiftMap = {
        "emp-1_2026-05-20": makeWorked("09:00", "17:00"),
      };

      render(
        <UserDashboard
          {...makeProps({
            // allShifts spans today → look-ahead (incl. next week); the browsed
            // period only holds this week's already-finished shift.
            allShifts: { ...completedThisWeek, ...upcomingNextWeek },
            currentPeriodShifts: completedThisWeek,
            openShifts: [],
            periodDates,
            periodEnd,
            periodStart,
            shiftRequests: {
              ...makeProps().shiftRequests,
              badgeCount: 0,
              myRequests: [],
              openPickups: [],
              requests: [],
            },
          })}
        />,
      );

      const hero = screen.getByTestId("user-dashboard-hero");

      expect(within(hero).getByText("Upcoming")).toBeInTheDocument();
      expect(within(hero).getByText(/Starts in/)).toBeInTheDocument();
      // The earlier, already-finished shift must never be the featured hero.
      expect(within(hero).queryByText("Completed")).not.toBeInTheDocument();
      expect(within(hero).queryByText("Scheduled")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("evaluates the active shift in the org timezone, not the browser timezone", () => {
    vi.useFakeTimers();
    // 20:00 UTC. The org is America/Los_Angeles (UTC-7) → 1:00 PM local, so a
    // 9-5 shift is in progress. Read in the browser's UTC clock it would look
    // already finished (20:00 > 17:00); the hero must use the org timezone.
    vi.setSystemTime(new Date("2026-05-13T20:00:00.000Z"));

    try {
      const shiftMap: ShiftMap = {
        "emp-1_2026-05-13": {
          assignmentIds: [101],
          customEndTime: "17:00",
          customStartTime: "09:00",
          draftKind: null,
          isDraft: false,
          label: "Care",
          publishedAssignmentDefinitionIds: [101],
          publishedLabel: "Care",
          segments: [
            {
              assignmentId: 101,
              endTime: "17:00",
              focusAreaId: 1,
              isMentored: false,
              jobId: 7,
              jobName: "Care",
              label: "Care",
              position: 0,
              shiftId: 10,
              shiftName: "Day shift",
              startTime: "09:00",
            },
          ],
        },
      };
      const day = new Date("2026-05-13T00:00:00.000Z");

      render(
        <UserDashboard
          {...makeProps({
            allShifts: shiftMap,
            currentPeriodShifts: shiftMap,
            openShifts: [],
            org: { ...org, timezone: "America/Los_Angeles" },
            periodDates: [day],
            periodEnd: day,
            periodStart: day,
            shiftRequests: {
              ...makeProps().shiftRequests,
              badgeCount: 0,
              myRequests: [],
              openPickups: [],
              requests: [],
            },
          })}
        />,
      );

      const hero = screen.getByTestId("user-dashboard-hero");

      // Org-local 1:00 PM → mid-shift. Browser-UTC math would mark it finished.
      expect(within(hero).getByText("On Duty")).toBeInTheDocument();
      expect(within(hero).getByText(/Ends in/)).toBeInTheDocument();
      expect(within(hero).queryByText("Completed")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not repeat a general shift label or show Working with in the hero card", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T14:00:00.000Z"));

    try {
      const today = new Date();
      const todayKey = formatDateKey(today);
      const currentPeriodShifts: ShiftMap = {
        [`emp-1_${todayKey}`]: {
          assignmentIds: [],
          customEndTime: null,
          customStartTime: null,
          draftKind: null,
          isDraft: false,
          label: "General shift",
          publishedAssignmentDefinitionIds: [],
          publishedLabel: "General shift",
          segments: [
            {
              assignmentId: null,
              endTime: "17:00",
              focusAreaId: null,
              isMentored: false,
              jobId: 7,
              label: "General shift",
              position: 0,
              shiftId: null,
              startTime: "09:00",
            },
          ],
        },
        [`emp-2_${todayKey}`]: {
          assignmentIds: [],
          customEndTime: null,
          customStartTime: null,
          draftKind: null,
          isDraft: false,
          label: "General shift",
          publishedAssignmentDefinitionIds: [],
          publishedLabel: "General shift",
          segments: [
            {
              assignmentId: null,
              endTime: "17:00",
              focusAreaId: null,
              isMentored: false,
              jobId: 7,
              label: "General shift",
              position: 0,
              shiftId: null,
              startTime: "09:00",
            },
          ],
        },
      };

      render(
        <UserDashboard
          {...makeProps({
            allShifts: currentPeriodShifts,
            currentPeriodShifts,
            openShifts: [],
            periodDates: [today],
            periodEnd: today,
            periodStart: today,
            shiftRequests: {
              ...makeProps().shiftRequests,
              badgeCount: 0,
              myRequests: [],
              openPickups: [],
              requests: [],
            },
          })}
        />,
      );

      const hero = screen.getByTestId("user-dashboard-hero");

      expect(within(hero).getAllByText("General shift")).toHaveLength(1);
      expect(within(hero).queryByTestId("user-dashboard-working-with")).not.toBeInTheDocument();
      expect(within(hero).queryByText("Working with")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("spells out code-only shift labels in the hero card", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-08T14:00:00.000Z"));

    try {
      const today = new Date();
      const todayKey = formatDateKey(today);
      const currentPeriodShifts: ShiftMap = {
        [`emp-1_${todayKey}`]: {
          assignmentIds: [],
          customEndTime: null,
          customStartTime: null,
          draftKind: null,
          isDraft: false,
          label: "D",
          publishedAssignmentDefinitionIds: [],
          publishedLabel: "D",
          segments: [
            {
              assignmentId: null,
              endTime: "17:00",
              focusAreaId: 1,
              isMentored: false,
              jobId: 7,
              label: "D",
              position: 0,
              shiftAbbr: "D",
              shiftId: null,
              startTime: "09:00",
            },
          ],
        },
      };

      render(
        <UserDashboard
          {...makeProps({
            allShifts: currentPeriodShifts,
            currentPeriodShifts,
            openShifts: [],
            periodDates: [today],
            periodEnd: today,
            periodStart: today,
            shiftRequests: {
              ...makeProps().shiftRequests,
              badgeCount: 0,
              myRequests: [],
              openPickups: [],
              requests: [],
            },
          })}
        />,
      );

      const hero = screen.getByTestId("user-dashboard-hero");

      expect(within(hero).getByRole("heading", { name: "Day shift" })).toBeInTheDocument();
      expect(within(hero).queryByText(/^D$/)).not.toBeInTheDocument();
      expect(within(hero).queryByText("General shift")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("spells out shift names instead of showing short shift codes", () => {
    const today = new Date();
    const todayKey = formatDateKey(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowKey = formatDateKey(tomorrow);
    const shortCodeShiftMap = makeShiftMap(todayKey);
    shortCodeShiftMap[`emp-1_${todayKey}`] = {
      ...shortCodeShiftMap[`emp-1_${todayKey}`],
      label: "D",
      segments: [
        {
          assignmentId: 101,
          focusAreaId: 1,
          isMentored: false,
          jobId: 7,
          label: "D",
          position: 0,
          shiftAbbr: "D",
          shiftId: 10,
          shiftName: "Day shift",
          startTime: "00:00",
          endTime: "23:59",
        },
      ],
    };
    const props = makeProps({
      allShifts: shortCodeShiftMap,
      currentPeriodShifts: shortCodeShiftMap,
      openShifts: [
        {
          ...makeProps().openShifts[0]!,
          assignmentLabel: "D",
          date: tomorrow,
          dayOfMonth: tomorrow.getDate(),
          id: "short-code-gap",
          ruleLabel: "D",
        },
      ],
      periodDates: [today, tomorrow],
      periodEnd: tomorrow,
      periodStart: today,
      shiftRequests: {
        ...makeProps().shiftRequests,
        myRequests: [
          makeShiftRequest({
            id: "short-code-request",
            requesterShiftDate: tomorrowKey,
            requesterShiftLabel: "D",
            targetShiftDate: tomorrowKey,
          }),
        ],
        openPickups: [
          makeShiftRequest({
            id: "short-code-pickup",
            requesterShiftDate: tomorrowKey,
            requesterShiftLabel: "D",
            targetEmpId: null,
            type: "pickup",
          }),
        ],
      },
    });

    render(<UserDashboard {...props} />);

    expect(screen.getAllByText("Day shift").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^D$/)).not.toBeInTheDocument();
  });

  it("does not repeat general or absence labels in Your Week rows", () => {
    const periodStart = getWeekStart(new Date());
    const periodDates = getDatesInRange(periodStart, 7);
    const generalDate = formatDateKey(periodDates[0] ?? new Date());
    const absenceDate = formatDateKey(periodDates[1] ?? periodDates[0] ?? new Date());
    const currentPeriodShifts: ShiftMap = {
      [`emp-1_${generalDate}`]: {
        assignmentIds: [],
        customEndTime: null,
        customStartTime: null,
        draftKind: null,
        isDraft: false,
        label: "General shift",
        publishedAssignmentDefinitionIds: [],
        publishedLabel: "General shift",
        segments: [
          {
            assignmentId: null,
            focusAreaId: null,
            isMentored: false,
            jobId: 7,
            label: "General shift",
            position: 0,
            shiftId: null,
          },
        ],
      },
      [`emp-1_${absenceDate}`]: {
        absenceTypeId: 5,
        assignmentIds: [],
        customEndTime: null,
        customStartTime: null,
        draftKind: null,
        isDraft: false,
        label: "Off",
        publishedAssignmentDefinitionIds: [],
        publishedLabel: "Off",
        segments: [],
      },
    };

    render(
      <UserDashboard
        {...makeProps({
          absenceTypeById: new Map([
            [
              5,
              {
                id: 5,
                orgId: "org-1",
                label: "OFF",
                name: "Off",
                color: "#eef2ff",
                border: "#c7d2fe",
                text: "#3730a3",
                sortOrder: 1,
                archivedAt: null,
              },
            ],
          ]),
          allShifts: currentPeriodShifts,
          currentPeriodShifts,
          openShifts: [],
          shiftRequests: {
            ...makeProps().shiftRequests,
            badgeCount: 0,
            myRequests: [],
            openPickups: [],
            requests: [],
          },
        })}
      />,
    );

    const myWeek = screen.getByTestId("user-dashboard-my-week");

    expect(within(myWeek).getAllByText("General shift")).toHaveLength(1);
    // Absence rows show "Absence" as the row title with the specific absence
    // type (e.g. "Off") in a pill below, matching the mobile app's treatment.
    expect(within(myWeek).getByText("Absence")).toBeInTheDocument();
    expect(within(myWeek).getAllByText("Off")).toHaveLength(1);
    expect(within(myWeek).queryAllByTestId("user-dashboard-week-pills")).toHaveLength(1);
  });

  it("uses one empty-week message without repeating a blank Your Week card", () => {
    const props = makeProps();

    render(
      <UserDashboard
        {...props}
        allShifts={{}}
        currentHours={[]}
        currentPeriodShifts={{}}
        openShifts={[]}
        shiftRequests={{
          ...props.shiftRequests,
          badgeCount: 0,
          myRequests: [],
          openPickups: [],
          requests: [],
        }}
      />,
    );

    const emptyState = screen.getByTestId("user-dashboard-empty-schedule");

    expect(emptyState).toHaveTextContent("You're not scheduled this week");
    expect(emptyState.style.border).toContain("dashed");
    expect(emptyState).toHaveStyle({
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
    });
    expect(screen.queryByTestId("user-dashboard-top-grid")).not.toBeInTheDocument();
    expect(screen.queryByTestId("user-dashboard-hero")).not.toBeInTheDocument();
    expect(screen.queryByTestId("user-dashboard-hero-shell")).not.toBeInTheDocument();
    expect(screen.queryByTestId("user-dashboard-cover-requests")).not.toBeInTheDocument();
    expect(screen.queryByTestId("user-dashboard-available-shifts")).not.toBeInTheDocument();
    expect(emptyState).not.toHaveTextContent("No Shift");
    expect(emptyState).not.toHaveTextContent("No shift scheduled");
    expect(emptyState).not.toHaveTextContent("Published shifts for this week will appear here.");
    expect(screen.queryByText("Your Week")).not.toBeInTheDocument();
    expect(screen.queryByText("No shifts this week")).not.toBeInTheDocument();
    expect(screen.queryByText("Published shifts will appear here.")).not.toBeInTheDocument();
  });

  it("renders the unlinked staff state", () => {
    render(<UserDashboard {...makeProps({ currentEmpId: null, currentEmployee: undefined })} />);

    expect(screen.getByTestId("user-dashboard-unlinked")).toBeInTheDocument();
    expect(screen.getByText("No linked staff profile")).toBeInTheDocument();
  });
});
