import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createQueryStateCardModule,
  createReactNativeModule,
  createSafeAreaContextModule,
  createScreenModule,
} from "../../../test/native";
import { capturedPanGestures } from "../../../test/gesture-handler-stub";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useQueryClient = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const routerPush = vi.fn();
const pushToast = vi.fn();

function confirmDialog(label: string) {
  fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: label }));
}

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  onlineManager: {
    isOnline: () => true,
  },
  useMutation,
  useQuery,
  useQueryClient,
}));

vi.mock("expo-router", () => ({
  router: {
    push: routerPush,
  },
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

vi.mock("../../../shared/components/QueryStateCard", async () =>
  createQueryStateCardModule(await import("react")),
);

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

let HomeScheduleScreen: any;
let TeamScheduleScreen: any;

type QueryResult = {
  data: unknown;
  error: Error | null;
  isFetching: boolean;
  isLoading: boolean;
  refetch: any;
};

function createQueryResult(data: unknown): QueryResult {
  return {
    data,
    error: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  };
}

function createScheduleEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    employeeId: "emp-1",
    employeeName: "Alex Kim",
    date: "2026-04-16",
    shiftIds: [1],
    jobIds: [10],
    shiftLabel: "D",
    assignmentLabel: "D",
    shiftName: "Day Shift",
    absenceTypeId: null,
    focusAreaId: 2,
    focusAreaName: "Skilled Nursing",
    displayFocusAreaName: "Skilled Nursing",
    startTime: "07:00:00",
    endTime: "15:00:00",
    customStartTime: null,
    customEndTime: null,
    segments: [
      {
        shiftId: 1,
        jobId: 10,
        shiftName: "Day Shift",
        jobName: "Mentor",
        jobColor: "#FFFBEB",
        jobBorderColor: "#FDE68A",
        jobTextColor: "#B45309",
        shiftStartTime: "07:00:00",
        shiftEndTime: "15:00:00",
        startTime: "07:00:00",
        endTime: "15:00:00",
        displayFocusAreaName: "Skilled Nursing",
      },
    ],
    indicators: [],
    publishedAt: "2026-04-15T18:30:00.000Z",
    publishedByName: "Mina Diaz",
    ...overrides,
  };
}

function createShiftRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "request-1",
    orgId: "org-1",
    type: "pickup",
    status: "open",
    requesterEmpId: "emp-2",
    requesterName: "Sarah Jenkins",
    requesterShiftDate: "2026-04-17",
    requesterShiftIds: [2],
    requesterJobIds: [20],
    requesterSegments: [
      {
        shiftId: 2,
        jobId: 20,
        shiftName: "Evening Shift",
        jobName: "Nurse",
        startTime: "15:00:00",
        endTime: "23:30:00",
        displayFocusAreaName: "Skilled Nursing",
      },
    ],
    requesterShiftLabel: "Evening Shift",
    requesterFocusAreaId: 2,
    requesterCustomStartTime: null,
    requesterCustomEndTime: null,
    targetEmpId: null,
    targetName: null,
    targetShiftDate: null,
    targetShiftIds: null,
    targetJobIds: null,
    targetSegments: null,
    targetShiftLabel: null,
    targetFocusAreaId: null,
    targetCustomStartTime: null,
    targetCustomEndTime: null,
    absenceTypeId: null,
    parentRequestId: null,
    adminUserId: null,
    adminNote: null,
    expiresAt: "2026-04-18T00:00:00.000Z",
    resolvedAt: null,
    createdAt: "2026-04-15T12:00:00.000Z",
    updatedAt: "2026-04-15T12:00:00.000Z",
    ...overrides,
  };
}

function createOpenShift(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "coverage-gap-1",
    date: "2026-04-19",
    focusAreaId: 2,
    focusAreaName: "Skilled Nursing",
    needed: 1,
    state: {
      kind: "worked",
      segments: [{ shiftId: 1, jobId: 20, position: 0 }],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
    presentation: {
      label: "Day Shift",
      focusAreaId: 2,
      focusAreaName: "Skilled Nursing",
      displayFocusAreaName: "Skilled Nursing",
      startTime: "07:00:00",
      endTime: "15:00:00",
      segments: [
        {
          shiftId: 1,
          jobId: 20,
          shiftName: "Day Shift",
          jobName: "Nurse",
          startTime: "07:00:00",
          endTime: "15:00:00",
          displayFocusAreaName: "Skilled Nursing",
        },
      ],
    },
    ...overrides,
  };
}

beforeAll(async () => {
  const module = await import("./ScheduleScreen");
  HomeScheduleScreen = module.HomeScheduleScreen;
  TeamScheduleScreen = module.TeamScheduleScreen;
});

describe("ScheduleScreen", () => {
  let mutationSpy: any;
  let invalidateQueriesSpy: any;
  let meScheduleEntries: any[];
  let teamScheduleEntries: any[];
  let shiftRequests: any[];
  let openShifts: any[];

  beforeEach(() => {
    vi.setSystemTime(new Date("2026-04-16T12:00:00.000Z"));

    mutationSpy = vi.fn();
    invalidateQueriesSpy = vi.fn().mockResolvedValue(undefined);
    meScheduleEntries = [
      createScheduleEntry(),
      createScheduleEntry({
        date: "2026-04-17",
        shiftIds: [2],
        jobIds: [20],
        shiftLabel: "E",
        assignmentLabel: "E",
        shiftName: "Evening Shift",
        focusAreaId: 3,
        focusAreaName: "Telemetry",
        displayFocusAreaName: "Telemetry",
        startTime: "15:00:00",
        endTime: "23:00:00",
        segments: [
          {
            shiftId: 2,
            jobId: 20,
            shiftName: "Evening Shift",
            jobName: "Nurse",
            shiftStartTime: "15:00:00",
            shiftEndTime: "23:00:00",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Telemetry",
          },
        ],
      }),
      createScheduleEntry({
        date: "2026-04-18",
        shiftIds: [3],
        jobIds: [21],
        shiftLabel: "D",
        assignmentLabel: "D",
        shiftName: "Day Shift",
        focusAreaId: 2,
        focusAreaName: "Skilled Nursing",
        displayFocusAreaName: "Skilled Nursing",
        segments: [
          {
            shiftId: 3,
            jobId: 21,
            shiftName: "Day Shift",
            jobName: "Nurse",
            shiftStartTime: "07:00:00",
            shiftEndTime: "15:00:00",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
      createScheduleEntry({
        date: "2026-04-18",
        shiftIds: [],
        jobIds: [],
        shiftLabel: "PTO",
        assignmentLabel: null,
        shiftName: "Paid Time Off",
        absenceTypeId: 1,
        focusAreaId: null,
        focusAreaName: null,
        displayFocusAreaName: null,
        startTime: null,
        endTime: null,
        segments: [],
      }),
    ];
    teamScheduleEntries = [
      createScheduleEntry({
        customStartTime: "08:00:00",
        customEndTime: "16:00:00",
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            shiftName: "Day Shift",
            jobName: "Mentor",
            jobColor: "#FFFBEB",
            jobBorderColor: "#FDE68A",
            jobTextColor: "#B45309",
            shiftStartTime: "07:00:00",
            shiftEndTime: "15:00:00",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
            isMentored: true,
          },
        ],
      }),
      createScheduleEntry({
        employeeId: "emp-2",
        employeeName: "Bri Shaw",
        focusAreaId: 2,
        focusAreaName: "Skilled Nursing",
        displayFocusAreaName: "Skilled Nursing",
        jobIds: [11],
        segments: [
          {
            shiftId: 1,
            jobId: 11,
            shiftName: "Day Shift Supervisor",
            jobName: "Supervisor",
            shiftStartTime: "07:00:00",
            shiftEndTime: "15:00:00",
            startTime: "06:15:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
      createScheduleEntry({
        employeeId: "emp-3",
        employeeName: "Chris Hall",
        shiftIds: [4],
        jobIds: [22],
        shiftLabel: "E",
        assignmentLabel: "E",
        shiftName: "Evening Shift",
        focusAreaId: 1,
        focusAreaName: "Emergency",
        displayFocusAreaName: "Emergency",
        startTime: "15:00:00",
        endTime: "23:00:00",
        segments: [
          {
            shiftId: 4,
            jobId: 22,
            shiftName: "Evening Shift",
            jobName: "Nurse",
            shiftStartTime: "15:00:00",
            shiftEndTime: "23:00:00",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Emergency",
          },
        ],
      }),
    ];
    shiftRequests = [
      createShiftRequest({
        id: "request-open-1",
      }),
      createShiftRequest({
        id: "request-cover-1",
        type: "swap",
        targetEmpId: "emp-1",
        targetName: "Alex Kim",
        targetShiftDate: "2026-04-18",
        targetShiftIds: [3],
        targetJobIds: [21],
        targetSegments: [
          {
            shiftId: 3,
            jobId: 21,
            shiftName: "Day Shift",
            jobName: "Mentor",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
        targetShiftLabel: "Day Shift",
      }),
    ];
    openShifts = [createOpenShift()];

    useQuery.mockReset();
    useMutation.mockReset();
    useQueryClient.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    routerPush.mockReset();
    pushToast.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useBootstrap.mockReturnValue({
      data: {
        linkedEmployee: {
          id: "emp-1",
          firstName: "Alex",
          lastName: "Kim",
          status: "active",
          focusAreaIds: [2],
        },
        currentOrg: {
          timezone: null,
          shiftDisplayMode: "code",
          labels: {
            focusArea: "Focus Areas",
          },
        },
        focusAreas: [
          {
            id: 1,
            name: "Emergency",
          },
          {
            id: 2,
            name: "Skilled Nursing",
          },
          {
            id: 3,
            name: "Telemetry",
          },
        ],
        unreadNotificationCount: 2,
        effectiveRole: "admin",
        permissions: {
          canViewSchedule: true,
          canApproveShiftRequests: true,
          canManageEmployees: true,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);

    useQueryClient.mockReturnValue({
      invalidateQueries: invalidateQueriesSpy,
    });
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: mutationSpy,
    });
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[1] === "requests") {
        return createQueryResult({
          openShifts,
          requests: shiftRequests,
        });
      }

      if (queryKey[2] === "team") {
        return createQueryResult({
          entries: teamScheduleEntries,
          range: {
            startDate: "2026-04-12",
            endDate: "2026-04-18",
          },
        });
      }

      return createQueryResult({
        employee: {
          id: "emp-1",
        },
        entries: meScheduleEntries,
        range: {
          startDate: "2026-04-12",
          endDate: "2026-04-18",
        },
      });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the redesigned Home page with current shift, upcoming shifts, open shifts, cover requests, and hours", () => {
    render(<HomeScheduleScreen />);

    expect(screen.getByText("On Duty")).toBeInTheDocument();
    expect(screen.getByText("Working with")).toBeInTheDocument();
    expect(screen.getByText("BS")).toBeInTheDocument();
    expect(screen.getAllByText("Day Shift").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mentor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("7:00 AM - 3:00 PM").length).toBeGreaterThan(0);

    expect(screen.getByText("Needs Your Response")).toBeInTheDocument();
    expect(screen.getByText("Sarah Jenkins")).toBeInTheDocument();
    expect(screen.getByText("Needs shift coverage")).toBeInTheDocument();
    expect(screen.getByText("Accept")).toBeInTheDocument();
    expect(screen.getByText("Decline")).toBeInTheDocument();

    expect(screen.getByText("Open Shifts")).toBeInTheDocument();
    expect(screen.getByText("Sun, Apr 19")).toBeInTheDocument();
    expect(screen.getByText("Volunteer")).toBeInTheDocument();
    expect(screen.getByText("Claim Shift")).toBeInTheDocument();
    const openShiftCarouselText = screen.getByLabelText("Open shifts carousel").textContent ?? "";
    expect(openShiftCarouselText.indexOf("Skilled Nursing")).toBeLessThan(
      openShiftCarouselText.indexOf("Nurse"),
    );

    expect(screen.getByText("Your Week")).toBeInTheDocument();
    expect(screen.getByText("24h this week")).toBeInTheDocument();
    expect(screen.getByTestId("upcoming-today-date-dot-2026-04-16")).toBeInTheDocument();
    expect(screen.getByTestId("upcoming-today-row-2026-04-16")).toBeInTheDocument();
    expect(screen.getByText("FRI")).toBeInTheDocument();
    expect(screen.getAllByText("17").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evening Shift").length).toBeGreaterThan(0);
    expect(screen.getByText("Telemetry")).toBeInTheDocument();
    expect(screen.getAllByText("Paid Time Off")).toHaveLength(1);
    expect(screen.getAllByText("Absence").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Absence Paid Time Off").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Absence Paid Time Off")[0]).toHaveTextContent("Paid Time Off");
    expect(screen.getAllByLabelText("Absence Paid Time Off")[0]).not.toHaveTextContent("Absence");
    expect(screen.queryByText("This Week's Hours")).not.toBeInTheDocument();
  });

  it("does not surface published schedule indicators in the Me week list", () => {
    meScheduleEntries = [
      createScheduleEntry({
        indicators: [
          { id: 1, name: "Training" },
          { id: 2, name: "Float" },
        ],
      }),
      createScheduleEntry({
        date: "2026-04-17",
        indicators: [{ id: 3, name: "New hire" }],
      }),
    ];

    render(<HomeScheduleScreen />);

    expect(screen.queryByText(/Assignment:/)).not.toBeInTheDocument();
    expect(screen.queryByText("Training")).not.toBeInTheDocument();
    expect(screen.queryByText("Float")).not.toBeInTheDocument();
    expect(screen.queryByText("New hire")).not.toBeInTheDocument();
    expect(screen.queryByText(/Indicators:/)).not.toBeInTheDocument();
  });

  it("uses a single no-schedule message in the Me hero", () => {
    meScheduleEntries = [];

    render(<HomeScheduleScreen />);

    const emptyState = screen.getByTestId("me-empty-schedule-state");

    expect(within(emptyState).getByText("Nothing scheduled this week")).toBeInTheDocument();
    expect(screen.queryByTestId("me-hero-card")).not.toBeInTheDocument();
    expect(screen.queryByText("Needs Your Response")).not.toBeInTheDocument();
    expect(screen.queryByText("Open Shifts")).not.toBeInTheDocument();
    expect(within(emptyState).queryByText("No Shift")).not.toBeInTheDocument();
    expect(within(emptyState).queryByText("Nothing scheduled")).not.toBeInTheDocument();
    expect(
      within(emptyState).queryByText("No current or upcoming shift is scheduled."),
    ).not.toBeInTheDocument();
    expect(emptyState).not.toHaveTextContent("Published shifts for this week will appear here.");
    expect(emptyState).not.toHaveTextContent(
      "Published jobs for this selected week will appear here.",
    );
    expect(screen.queryByText("Your Week")).not.toBeInTheDocument();
  });

  it("shows a success toast after a schedule request action completes", async () => {
    render(<HomeScheduleScreen />);

    const mutationConfig = useMutation.mock.calls[0][0] as {
      onSuccess: (
        result: unknown,
        variables: { requestId: string; body: { action: string } },
      ) => Promise<void>;
    };

    await act(async () => {
      await mutationConfig.onSuccess(undefined, {
        requestId: "request-open-1",
        body: { action: "claim" },
      });
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["mobile", "requests", "token-123"],
    });
    expect(pushToast).toHaveBeenCalledWith({
      tone: "success",
      title: "Claim request sent",
      message: "Your shift is pending approval.",
    });
  });

  it("makes multiple shifts visible in the Me hero and Your Week rows", () => {
    meScheduleEntries = [
      createScheduleEntry({
        shiftName: "Day Shift / Evening Shift",
        startTime: "07:00:00",
        endTime: "23:00:00",
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            shiftName: "Day Shift",
            jobName: "Nurse",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
          {
            shiftId: 2,
            jobId: 11,
            shiftName: "Evening Shift",
            jobName: "Lead",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Skilled Nursing",
            isMentored: true,
          },
        ],
      }),
      createScheduleEntry({
        date: "2026-04-17",
        shiftName: "Morning Shift / Desk Shift",
        startTime: "06:00:00",
        endTime: "14:00:00",
        segments: [
          {
            shiftId: 3,
            jobId: 12,
            shiftName: "Morning Shift",
            jobName: "Nurse",
            startTime: "06:00:00",
            endTime: "10:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
          {
            shiftId: 4,
            jobId: 13,
            shiftName: "Desk Shift",
            jobName: "Coordinator",
            startTime: "10:00:00",
            endTime: "14:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
    ];
    teamScheduleEntries = [
      createScheduleEntry({
        employeeId: "emp-2",
        employeeName: "Bri Shaw",
        shiftIds: [1],
        jobIds: [10],
        shiftName: "Day Shift",
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            shiftName: "Day Shift",
            jobName: "Nurse",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
      createScheduleEntry({
        employeeId: "emp-3",
        employeeName: "Eli Park",
        shiftIds: [2],
        jobIds: [11],
        shiftName: "Evening Shift",
        startTime: "15:00:00",
        endTime: "23:00:00",
        segments: [
          {
            shiftId: 2,
            jobId: 11,
            shiftName: "Evening Shift",
            jobName: "Lead",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
    ];
    openShifts = [];
    shiftRequests = [];

    render(<HomeScheduleScreen />);

    const heroCard = screen.getByTestId("me-hero-card");

    expect(screen.getAllByLabelText("Shift 2").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Multiple Shifts, 2 shifts")).not.toBeInTheDocument();
    expect(within(heroCard).getByLabelText("Shift 2")).toBeInTheDocument();
    expect(heroCard).toHaveTextContent("Shift 1");
    expect(heroCard).toHaveTextContent("Shift 2");
    expect(heroCard).toHaveTextContent("Starting in 3h");
    expect(screen.getAllByText("Shift 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shift 2").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Shift 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Day Shift").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evening Shift").length).toBeGreaterThan(0);
    const heroText = heroCard.textContent ?? "";
    expect(heroText.indexOf("Day Shift")).toBeLessThan(heroText.indexOf("Shift 1"));
    expect(heroText.indexOf("Shift 1")).toBeLessThan(heroText.indexOf("Nurse"));
    expect(heroText.indexOf("Evening Shift")).toBeLessThan(heroText.indexOf("Shift 2"));
    expect(heroText.indexOf("Shift 2")).toBeLessThan(heroText.indexOf("Lead"));
    expect(screen.getByText("Morning Shift")).toBeInTheDocument();
    expect(screen.getByText("Desk Shift")).toBeInTheDocument();
    expect(heroCard).toHaveTextContent("Working with");
    expect(heroCard).toHaveTextContent("BS");
    expect(heroCard).not.toHaveTextContent("EP");
    expect(heroCard.textContent?.indexOf("Working with") ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
      heroCard.textContent?.indexOf("Shift 2") ?? Number.MAX_SAFE_INTEGER,
    );
    expect(screen.getAllByTestId("split-shift-dashed-divider").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("upcoming-shift-dashed-divider").length).toBeGreaterThan(0);
    expect(screen.getAllByText("FRI")).toHaveLength(1);
    expect(screen.getAllByText("17")).toHaveLength(1);
  });

  it("drops completed split-shift segments from the Me hero", () => {
    vi.setSystemTime(new Date("2026-04-16T15:30:00.000Z"));
    meScheduleEntries = [
      createScheduleEntry({
        shiftName: "Day Shift / Evening Shift",
        startTime: "07:00:00",
        endTime: "23:00:00",
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            shiftName: "Day Shift",
            jobName: "Nurse",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
          {
            shiftId: 2,
            jobId: 11,
            shiftName: "Evening Shift",
            jobName: "Lead",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
    ];
    teamScheduleEntries = [];
    openShifts = [];
    shiftRequests = [];

    render(<HomeScheduleScreen />);

    const heroCard = screen.getByTestId("me-hero-card");

    expect(within(heroCard).queryByLabelText("Shift 2")).not.toBeInTheDocument();
    expect(within(heroCard).getByText("Evening Shift")).toBeInTheDocument();
    expect(within(heroCard).getByText("Lead")).toBeInTheDocument();
    expect(within(heroCard).queryByLabelText("Shift 1")).not.toBeInTheDocument();
    expect(within(heroCard).queryByText("Day Shift")).not.toBeInTheDocument();
    expect(within(heroCard).queryByText("Nurse")).not.toBeInTheDocument();
  });

  it("places split-shift staff inside each shift card with an also cue", () => {
    teamScheduleEntries = [
      createScheduleEntry({
        employeeId: "emp-2",
        employeeName: "Bri Shaw",
        shiftName: "Day Shift / Evening Shift",
        startTime: "07:00:00",
        endTime: "23:00:00",
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            shiftName: "Day Shift",
            jobName: "Nurse",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
          {
            shiftId: 2,
            jobId: 11,
            shiftName: "Evening Shift",
            jobName: "Lead",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
    ];

    render(<TeamScheduleScreen />);

    expect(screen.getAllByText("Bri Shaw")).toHaveLength(2);
    expect(screen.getAllByText("Day Shift").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evening Shift").length).toBeGreaterThan(0);
    expect(screen.queryByText("Day Shift / Evening Shift")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Multiple Shifts, 2 shifts")).not.toBeInTheDocument();
    expect(screen.queryByText("Shift 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Shift 2")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Also Evening Shift")).toBeInTheDocument();
    expect(screen.getByLabelText("Also Day Shift")).toBeInTheDocument();
    expect(screen.getByText("Also Evening Shift")).toBeInTheDocument();
    expect(screen.getByText("Also Day Shift")).toBeInTheDocument();
    expect(screen.getAllByText("7:00 AM - 3:00 PM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3:00 PM - 11:00 PM").length).toBeGreaterThan(0);
    expect(screen.getByText("Nurse")).toBeInTheDocument();
    expect(screen.getByText("Lead")).toBeInTheDocument();
  });

  it("shows mentored assignments with a full label on Home", () => {
    meScheduleEntries = [
      createScheduleEntry({
        segments: [
          {
            shiftId: 1,
            jobId: 10,
            shiftName: "Day Shift",
            jobName: "Nurse",
            jobColor: "#ECFEFF",
            jobBorderColor: "#A5F3FC",
            jobTextColor: "#0E7490",
            shiftStartTime: "07:00:00",
            shiftEndTime: "15:00:00",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
            isMentored: true,
          },
        ],
      }),
    ];
    shiftRequests = [];
    openShifts = [];

    render(<HomeScheduleScreen />);

    expect(screen.getAllByText("(Mentored)").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Job Nurse mentored assignment").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Mentored assignment")).not.toBeInTheDocument();
  });

  it("shows the next shift state when nothing is currently active", () => {
    vi.setSystemTime(new Date("2026-04-16T05:00:00.000Z"));

    render(<HomeScheduleScreen />);

    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByText("Starting in 2h")).toBeInTheDocument();
    expect(screen.getByLabelText("Thu, Apr 16")).toBeInTheDocument();
    expect(screen.getAllByText("Day Shift").length).toBeGreaterThan(0);
    expect(screen.queryByText("On Duty")).not.toBeInTheDocument();
  });

  it("shows general shifts in the job pill section with a General shift label", () => {
    meScheduleEntries = [
      createScheduleEntry({
        shiftIds: [null],
        jobIds: [30],
        shiftLabel: "ADM",
        assignmentLabel: "ADM",
        shiftName: "Admin",
        focusAreaId: null,
        focusAreaName: null,
        displayFocusAreaName: null,
        startTime: "09:00:00",
        endTime: "17:00:00",
        segments: [
          {
            shiftId: null,
            jobId: 30,
            label: "ADM",
            shiftName: "Admin",
            jobName: "Admin",
            shiftStartTime: null,
            shiftEndTime: null,
            startTime: "09:00:00",
            endTime: "17:00:00",
            displayFocusAreaName: null,
          },
        ],
      }),
    ];
    teamScheduleEntries = [
      createScheduleEntry({
        employeeId: "emp-2",
        employeeName: "Bri Shaw",
        shiftIds: [null],
        jobIds: [30],
        shiftLabel: "ADM",
        assignmentLabel: "ADM",
        shiftName: "Admin",
        focusAreaId: null,
        focusAreaName: null,
        displayFocusAreaName: null,
        startTime: "09:00:00",
        endTime: "17:00:00",
        segments: [
          {
            shiftId: null,
            jobId: 30,
            label: "ADM",
            shiftName: "Admin",
            jobName: "Admin",
            shiftStartTime: null,
            shiftEndTime: null,
            startTime: "09:00:00",
            endTime: "17:00:00",
            displayFocusAreaName: null,
          },
        ],
      }),
    ];

    render(<HomeScheduleScreen />);

    expect(screen.getAllByText("Admin")).toHaveLength(2);
    expect(screen.getAllByText("General shift").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("General shift Admin").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("General shift Admin")[0]).toHaveTextContent("Admin");
    expect(screen.getAllByLabelText("General shift Admin")[0]).not.toHaveTextContent(
      "General shift",
    );
    expect(screen.queryByText("Working with")).not.toBeInTheDocument();
  });

  it("shows the first shift in the week on the top card after next-week navigation", () => {
    const nextWeekEntries = [
      createScheduleEntry({
        date: "2026-04-19",
        shiftIds: [],
        jobIds: [],
        shiftLabel: "PTO",
        assignmentLabel: null,
        shiftName: "Paid Time Off",
        absenceTypeId: 1,
        focusAreaId: null,
        focusAreaName: null,
        displayFocusAreaName: null,
        startTime: null,
        endTime: null,
        segments: [],
      }),
      createScheduleEntry({
        date: "2026-04-20",
        shiftName: "Monday First Shift",
        shiftLabel: "M",
        assignmentLabel: "M",
        startTime: "07:00:00",
        endTime: "15:00:00",
        segments: [
          {
            shiftId: 1,
            jobId: 20,
            shiftName: "Monday First Shift",
            jobName: "Nurse",
            shiftStartTime: "07:00:00",
            shiftEndTime: "15:00:00",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
      createScheduleEntry({
        date: "2026-04-23",
        shiftName: "Thursday Later Shift",
        shiftLabel: "T",
        assignmentLabel: "T",
        startTime: "15:00:00",
        endTime: "23:00:00",
        segments: [
          {
            shiftId: 2,
            jobId: 10,
            shiftName: "Thursday Later Shift",
            jobName: "Mentor",
            shiftStartTime: "15:00:00",
            shiftEndTime: "23:00:00",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Telemetry",
          },
        ],
      }),
    ];

    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[1] === "requests") {
        return createQueryResult({
          openShifts,
          requests: shiftRequests,
        });
      }

      return createQueryResult({
        employee: {
          id: "emp-1",
        },
        entries: queryKey[4] === "2026-04-19" ? nextWeekEntries : meScheduleEntries,
        range: {
          startDate: queryKey[4] === "2026-04-19" ? "2026-04-19" : "2026-04-12",
          endDate: queryKey[4] === "2026-04-19" ? "2026-04-25" : "2026-04-18",
        },
      });
    });

    render(<HomeScheduleScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));

    expect(screen.getByLabelText("Mon, Apr 20")).toBeInTheDocument();
    expect(screen.getAllByText("Monday First Shift").length).toBeGreaterThan(1);
  });

  it("updates the active shift remaining time as the clock advances", () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00.000Z"));

    render(<HomeScheduleScreen />);

    expect(screen.getByText("3h left")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText("2h 59m left")).toBeInTheDocument();
  });

  it("does not poll schedule content on a foreground timer", () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00.000Z"));
    const bootstrapRefetch = vi.fn().mockResolvedValue(undefined);
    const scheduleRefetch = vi.fn().mockResolvedValue(undefined);
    const requestsRefetch = vi.fn().mockResolvedValue(undefined);

    useBootstrap.mockReturnValue({
      data: {
        linkedEmployee: {
          id: "emp-1",
          firstName: "Alex",
          lastName: "Kim",
          status: "active",
          focusAreaIds: [2],
        },
        currentOrg: {
          timezone: null,
          shiftDisplayMode: "code",
          labels: {
            focusArea: "Focus Areas",
          },
        },
        focusAreas: [
          {
            id: 2,
            name: "Skilled Nursing",
          },
        ],
        unreadNotificationCount: 2,
        effectiveRole: "admin",
        permissions: {
          canViewSchedule: true,
          canApproveShiftRequests: true,
          canManageEmployees: true,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: bootstrapRefetch,
    } as never);
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[1] === "requests") {
        return {
          ...createQueryResult({
            openShifts,
            requests: shiftRequests,
          }),
          refetch: requestsRefetch,
        };
      }

      return {
        ...createQueryResult({
          employee: {
            id: "emp-1",
          },
          entries: meScheduleEntries,
          range: {
            startDate: "2026-04-12",
            endDate: "2026-04-18",
          },
        }),
        refetch: scheduleRefetch,
      };
    });

    render(<HomeScheduleScreen />);

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(bootstrapRefetch).not.toHaveBeenCalled();
    expect(scheduleRefetch).not.toHaveBeenCalled();
    expect(requestsRefetch).not.toHaveBeenCalled();
  });

  it("routes to the requests tab and claims an open shift from Home", () => {
    render(<HomeScheduleScreen />);

    fireEvent.click(screen.getByText("See all"));
    expect(routerPush).toHaveBeenCalledWith("/(tabs)/requests");

    fireEvent.click(screen.getByText("Claim Shift"));
    expect(screen.getByText("Claim this shift?")).toBeInTheDocument();
    expect(mutationSpy).not.toHaveBeenCalled();
    confirmDialog("Claim shift");
    expect(mutationSpy).toHaveBeenCalledWith(
      {
        requestId: "request-open-1",
        body: {
          action: "claim",
          claimerEmpId: "emp-1",
        },
      },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
  });

  it("shows Me open-shift opportunities in a date-grouped carousel", () => {
    openShifts = [
      createOpenShift({
        id: "open-sunday",
        date: "2026-04-19",
        needed: 3,
        presentation: {
          label: "Sunday Open",
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "15:00:00",
          endTime: "23:00:00",
          segments: [
            {
              shiftId: 1,
              jobId: 20,
              shiftName: "Sunday Open",
              jobName: "Nurse",
              startTime: "15:00:00",
              endTime: "23:00:00",
              displayFocusAreaName: "Skilled Nursing",
            },
          ],
        },
      }),
    ];
    shiftRequests = [
      createShiftRequest({
        id: "request-saturday-early",
        requesterName: "Mina Diaz",
        requesterShiftDate: "2026-04-18",
        requesterSegments: [
          {
            shiftId: 3,
            jobId: 21,
            shiftName: "Saturday Pickup Early",
            jobName: "Nurse",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
      createShiftRequest({
        id: "request-saturday-late",
        requesterName: "Ivy Stone",
        requesterShiftDate: "2026-04-18",
        requesterSegments: [
          {
            shiftId: 4,
            jobId: 22,
            shiftName: "Saturday Pickup Late",
            jobName: "Nurse",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
    ];

    render(<HomeScheduleScreen />);

    expect(screen.getByLabelText("Open shifts carousel")).toBeInTheDocument();
    expect(screen.getByLabelText("2 open shift cards")).toBeInTheDocument();
    expect(screen.getByLabelText("1 open shift card")).toBeInTheDocument();
    expect(screen.getByText("Sat, Apr 18")).toBeInTheDocument();
    expect(screen.getByText("Sun, Apr 19")).toBeInTheDocument();
    expect(screen.getByText("3 teammates needed")).toBeInTheDocument();

    const content = document.body.textContent ?? "";
    expect(content.indexOf("Sat, Apr 18")).toBeLessThan(content.indexOf("Saturday Pickup Early"));
    expect(content.indexOf("Saturday Pickup Late")).toBeLessThan(content.indexOf("Sun, Apr 19"));
  });

  it("expands a stacked Me open-shift day to show the full list", () => {
    openShifts = [];
    shiftRequests = [
      createShiftRequest({
        id: "request-saturday-1",
        requesterName: "Mina Diaz",
        requesterShiftDate: "2026-04-18",
        requesterSegments: [
          {
            shiftId: 3,
            jobId: 21,
            shiftName: "Saturday Pickup Early",
            jobName: "Nurse",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
      createShiftRequest({
        id: "request-saturday-2",
        requesterName: "Ivy Stone",
        requesterShiftDate: "2026-04-18",
        requesterSegments: [
          {
            shiftId: 4,
            jobId: 22,
            shiftName: "Saturday Pickup Mid",
            jobName: "Nurse",
            startTime: "09:00:00",
            endTime: "17:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
      createShiftRequest({
        id: "request-saturday-3",
        requesterName: "Noah Wynn",
        requesterShiftDate: "2026-04-18",
        requesterSegments: [
          {
            shiftId: 5,
            jobId: 23,
            shiftName: "Saturday Pickup Late",
            jobName: "Nurse",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
      createShiftRequest({
        id: "request-saturday-4",
        requesterName: "Tara Cole",
        requesterShiftDate: "2026-04-18",
        requesterSegments: [
          {
            shiftId: 6,
            jobId: 24,
            shiftName: "Saturday Pickup Overnight",
            jobName: "Nurse",
            startTime: "19:00:00",
            endTime: "03:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
      createShiftRequest({
        id: "request-saturday-5",
        requesterName: "Elle Ray",
        requesterShiftDate: "2026-04-18",
        requesterSegments: [
          {
            shiftId: 7,
            jobId: 25,
            shiftName: "Saturday Pickup Extra",
            jobName: "Nurse",
            startTime: "23:00:00",
            endTime: "07:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
    ];

    render(<HomeScheduleScreen />);

    expect(screen.getByLabelText("5 open shift cards")).toBeInTheDocument();
    expect(screen.queryByText("Saturday Pickup Extra")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Expand open shifts for Sat, Apr 18"));

    expect(screen.getByText("Saturday Pickup Extra")).toBeInTheDocument();
    expect(screen.getByLabelText("Collapse open shifts for Sat, Apr 18")).toBeInTheDocument();
  });

  it("does not repeat absence and general-shift names in expanded bottom stacks", () => {
    meScheduleEntries = [createScheduleEntry()];
    teamScheduleEntries = [];
    openShifts = [];
    shiftRequests = [
      createShiftRequest({
        id: "request-absence",
        requesterName: "Mina Diaz",
        requesterShiftDate: "2026-04-18",
        requesterSegments: [],
        requesterState: {
          kind: "absence",
          segments: [],
          absenceTypeId: 1,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        requesterPresentation: {
          label: "Paid Time Off",
          shiftName: "Paid Time Off",
          focusAreaId: null,
          focusAreaName: null,
          displayFocusAreaName: null,
          startTime: null,
          endTime: null,
          segments: [],
        },
        absenceTypeId: 1,
      }),
      createShiftRequest({
        id: "request-absence-normal",
        requesterName: "Ivy Stone",
        requesterShiftDate: "2026-04-18",
        requesterSegments: [
          {
            shiftId: 4,
            jobId: 22,
            shiftName: "Saturday Pickup Mid",
            jobName: "Nurse",
            startTime: "09:00:00",
            endTime: "17:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
      createShiftRequest({
        id: "request-general",
        requesterName: "Noah Wynn",
        requesterShiftDate: "2026-04-19",
        requesterSegments: [],
        requesterState: {
          kind: "worked",
          segments: [{ shiftId: null, jobId: 30, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        requesterPresentation: {
          label: "Admin",
          shiftName: "Admin",
          focusAreaId: null,
          focusAreaName: null,
          displayFocusAreaName: null,
          startTime: "09:00:00",
          endTime: "17:00:00",
          segments: [
            {
              shiftId: null,
              jobId: 30,
              shiftName: "Admin",
              jobName: "Admin",
              startTime: "09:00:00",
              endTime: "17:00:00",
              displayFocusAreaName: null,
            },
          ],
        },
      }),
      createShiftRequest({
        id: "request-general-normal",
        requesterName: "Tara Cole",
        requesterShiftDate: "2026-04-19",
        requesterSegments: [
          {
            shiftId: 5,
            jobId: 23,
            shiftName: "Sunday Pickup Late",
            jobName: "Nurse",
            startTime: "15:00:00",
            endTime: "23:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
    ];

    render(<HomeScheduleScreen />);

    fireEvent.click(screen.getByLabelText("Expand open shifts for Sat, Apr 18"));
    fireEvent.click(screen.getByLabelText("Expand open shifts for Sun, Apr 19"));

    expect(screen.getAllByText("Paid Time Off")).toHaveLength(1);
    expect(screen.getAllByText("Admin")).toHaveLength(1);
    expect(screen.getAllByText("Absence").length).toBeGreaterThan(0);
    expect(screen.getAllByText("General shift").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Collapse open shifts for Sat, Apr 18")).toBeInTheDocument();
    expect(screen.getByLabelText("Collapse open shifts for Sun, Apr 19")).toBeInTheDocument();
  });

  it("volunteers for a coverage-gap open shift from Home", () => {
    shiftRequests = [];
    render(<HomeScheduleScreen />);

    fireEvent.click(screen.getByText("Volunteer"));
    expect(screen.getByText("Volunteer for open shift?")).toBeInTheDocument();
    expect(mutationSpy).not.toHaveBeenCalled();
    confirmDialog("Volunteer");

    expect(mutationSpy).toHaveBeenCalledWith(
      {
        requestId: "coverage-gap-1",
        body: {
          action: "volunteer_open_shift",
          empId: "emp-1",
          shiftDate: "2026-04-19",
          focusAreaId: 2,
          state: openShifts[0].state,
        },
      },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
  });

  it("renders split coverage-gap open shifts with the same segment job pills", () => {
    shiftRequests = [];
    openShifts = [
      createOpenShift({
        id: "split-coverage-gap",
        state: {
          kind: "worked",
          segments: [
            { shiftId: 1, jobId: 20, position: 0 },
            { shiftId: 2, jobId: 21, position: 1 },
          ],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        presentation: {
          label: "Day Shift / Evening Shift",
          focusAreaId: 2,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "07:00:00",
          endTime: "23:00:00",
          segments: [
            {
              shiftId: 1,
              jobId: 20,
              shiftName: "Day Shift",
              jobName: "Nurse",
              startTime: "07:00:00",
              endTime: "15:00:00",
              displayFocusAreaName: "Skilled Nursing",
            },
            {
              shiftId: 2,
              jobId: 21,
              shiftName: "Evening Shift",
              jobName: "Lead",
              startTime: "15:00:00",
              endTime: "23:00:00",
              displayFocusAreaName: "Skilled Nursing",
            },
          ],
        },
      }),
    ];

    render(<HomeScheduleScreen />);

    expect(screen.getByLabelText("Multiple Shifts, 2 shifts")).toBeInTheDocument();
    expect(screen.getAllByText("Day Shift").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evening Shift").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Job Nurse").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Job Lead")).toBeInTheDocument();
  });

  it("does not render the open shifts section when there are no open items", () => {
    shiftRequests = shiftRequests.filter((request) => request.type !== "pickup");
    openShifts = [];

    render(<HomeScheduleScreen />);

    expect(screen.queryByText("Open Shifts")).not.toBeInTheDocument();
    expect(screen.queryByText("Claim Shift")).not.toBeInTheDocument();
    expect(screen.queryByText("Volunteer")).not.toBeInTheDocument();
  });

  it("accepts and declines shift cover requests from Home", () => {
    render(<HomeScheduleScreen />);

    fireEvent.click(screen.getByText("Accept"));
    expect(screen.getByText("Accept request?")).toBeInTheDocument();
    confirmDialog("Accept");
    expect(mutationSpy).toHaveBeenCalledWith(
      {
        requestId: "request-cover-1",
        body: {
          action: "respond",
          empId: "emp-1",
          accept: true,
        },
      },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
    act(() => {
      mutationSpy.mock.calls[0][1].onSettled();
    });

    fireEvent.click(screen.getByText("Decline"));
    expect(screen.getByText("Decline request?")).toBeInTheDocument();
    confirmDialog("Decline");
    expect(mutationSpy).toHaveBeenCalledWith(
      {
        requestId: "request-cover-1",
        body: {
          action: "respond",
          empId: "emp-1",
          accept: false,
        },
      },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
  });

  it("shows job-focused team rows and opens shift detail from the Schedule tab", () => {
    render(<TeamScheduleScreen />);

    expect(screen.getByText("Today, Apr 16")).toBeInTheDocument();
    expect(screen.queryByTestId("today-date-dot-2026-04-16")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Skilled Nursing" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const headerButtonLabels = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent);
    expect(headerButtonLabels.indexOf("Select date 2026-04-18")).toBeLessThan(
      headerButtonLabels.indexOf("Select Emergency"),
    );
    expect(screen.getByText("Me")).toBeInTheDocument();
    expect(screen.queryByText("Alex Kim")).not.toBeInTheDocument();
    expect(screen.getByText("Bri Shaw")).toBeInTheDocument();
    const mentoredJobPill = screen.getByLabelText("Job Mentor mentored assignment");
    expect(mentoredJobPill).toHaveTextContent("Mentor");
    expect(mentoredJobPill).toHaveTextContent("(Mentored)");
    expect(mentoredJobPill).not.toHaveTextContent("(MENTORED)");
    expect(screen.getByText("Supervisor")).toBeInTheDocument();
    expect(screen.getAllByText("Day Shift")).toHaveLength(1);
    expect(screen.queryByText("Day Shift Supervisor")).not.toBeInTheDocument();
    expect(screen.getAllByText("7:00 AM - 3:00 PM").length).toBeGreaterThan(0);
    expect(screen.getByText("8:00 AM - 4:00 PM")).toBeInTheDocument();
    expect(screen.queryByText("6:15 AM - 3:00 PM")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Me"));

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/shift/[employeeId]/[date]",
      params: {
        employeeId: "emp-1",
        date: "2026-04-16",
        rangeStart: "2026-04-12",
        rangeEnd: "2026-04-18",
        source: "team",
      },
    });
  });

  it("navigates the team week strip with horizontal swipes", async () => {
    const { Animated } = await import("react-native");
    const springSpy = vi.spyOn(Animated, "spring").mockImplementation(
      () =>
        ({
          start: vi.fn(),
          stop: vi.fn(),
        }) as never,
    );
    const nextWeekEntries = [
      createScheduleEntry({
        employeeName: "Next Week Nurse",
        date: "2026-04-23",
        focusAreaId: 2,
        focusAreaName: "Skilled Nursing",
        displayFocusAreaName: "Skilled Nursing",
        shiftName: "Next Thursday Shift",
        shiftLabel: "N",
        assignmentLabel: "N",
        segments: [
          {
            shiftId: 1,
            jobId: 20,
            shiftName: "Next Thursday Shift",
            jobName: "Nurse",
            shiftStartTime: "07:00:00",
            shiftEndTime: "15:00:00",
            startTime: "07:00:00",
            endTime: "15:00:00",
            displayFocusAreaName: "Skilled Nursing",
          },
        ],
      }),
    ];

    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[1] === "requests") {
        return createQueryResult({
          openShifts,
          requests: shiftRequests,
        });
      }

      if (queryKey[2] === "team") {
        return createQueryResult({
          entries: queryKey[4] === "2026-04-19" ? nextWeekEntries : teamScheduleEntries,
          range: {
            startDate: queryKey[4] === "2026-04-19" ? "2026-04-19" : "2026-04-12",
            endDate: queryKey[4] === "2026-04-19" ? "2026-04-25" : "2026-04-18",
          },
        });
      }

      return createQueryResult({
        employee: {
          id: "emp-1",
        },
        entries: meScheduleEntries,
        range: {
          startDate: "2026-04-12",
          endDate: "2026-04-18",
        },
      });
    });

    render(<TeamScheduleScreen />);

    function fireQuickWeekSwipe(index: number) {
      const weekStrip = screen.getByLabelText("Schedule week strip");
      const baseTimestamp = 1000 + index * 100;
      const quickStart = createEvent.touchStart(weekStrip, {
        changedTouches: [{ pageX: 280 }],
        touches: [{ pageX: 280 }],
      });
      Object.defineProperty(quickStart, "timeStamp", {
        configurable: true,
        value: baseTimestamp,
      });
      fireEvent(weekStrip, quickStart);

      const quickMove = createEvent.touchMove(weekStrip, {
        changedTouches: [{ pageX: 230 }],
        touches: [{ pageX: 230 }],
      });
      Object.defineProperty(quickMove, "timeStamp", {
        configurable: true,
        value: baseTimestamp + 40,
      });
      fireEvent(weekStrip, quickMove);

      const quickEnd = createEvent.touchEnd(weekStrip, {
        changedTouches: [{ pageX: 230 }],
      });
      Object.defineProperty(quickEnd, "timeStamp", {
        configurable: true,
        value: baseTimestamp + 80,
      });
      fireEvent(weekStrip, quickEnd);
    }

    const initialWeekStrip = screen.getByLabelText("Schedule week strip");
    fireEvent.touchStart(initialWeekStrip, {
      changedTouches: [{ pageX: 280 }],
      touches: [{ pageX: 280 }],
    });
    fireEvent.touchMove(initialWeekStrip, {
      changedTouches: [{ pageX: 250 }],
      touches: [{ pageX: 250 }],
    });
    fireEvent.touchEnd(initialWeekStrip, {
      changedTouches: [{ pageX: 250 }],
    });

    expect(screen.getByText("Me")).toBeInTheDocument();
    expect(screen.queryByText("Next Week Nurse")).not.toBeInTheDocument();

    fireQuickWeekSwipe(0);

    expect(screen.getByText("Me")).toBeInTheDocument();
    expect(screen.queryByText("Next Week Nurse")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select date 2026-04-23" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    for (let index = 1; index < 10; index += 1) {
      fireQuickWeekSwipe(index);
    }

    expect(screen.getByRole("button", { name: "Select date 2026-06-25" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["mobile", "schedule", "team", "token-123", "2026-06-21", "2026-06-27"],
      }),
    );
    springSpy.mockRestore();
  });

  it("keeps the Schedule tab pill flow working with focus-area filtering", () => {
    render(<TeamScheduleScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Select Emergency" }));

    expect(screen.queryByLabelText("Focus area filter popup")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Emergency" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
    expect(screen.getByText("Nurse")).toBeInTheDocument();
    expect(screen.queryByText("Me")).not.toBeInTheDocument();
    expect(screen.queryByText("Alex Kim")).not.toBeInTheDocument();
  });

  it("renders the month calendar drag handle collapsed by default", () => {
    render(<TeamScheduleScreen />);

    expect(screen.getByLabelText("Open month calendar")).toBeInTheDocument();
    expect(screen.queryByLabelText("Collapse month calendar")).not.toBeInTheDocument();
  });

  function dragCalendarHandle(shouldOpen: boolean) {
    const gesture = capturedPanGestures.at(-1);
    act(() => {
      gesture?.__handlers.onStart?.({});
      gesture?.__handlers.onEnd?.({ velocityY: shouldOpen ? 700 : -700 });
    });
  }

  it("expands the month calendar via the drag handle and collapses back to a populated week strip", () => {
    render(<TeamScheduleScreen />);

    expect(screen.getByRole("button", { name: "Select date 2026-04-16" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    dragCalendarHandle(true);

    expect(screen.getByLabelText("Collapse month calendar")).toBeInTheDocument();

    dragCalendarHandle(false);

    expect(screen.getByLabelText("Open month calendar")).toBeInTheDocument();
    // Regression: closing used to leave calendarMonthAnchor pointed at
    // whatever month was last browsed, which could make the collapsed
    // week strip render nothing at all.
    expect(screen.getByRole("button", { name: "Select date 2026-04-16" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("selects a date when swiping the month grid to a different month", () => {
    render(<TeamScheduleScreen />);

    dragCalendarHandle(true);

    function fireQuickMonthSwipe(direction: "next" | "previous") {
      const monthGrid = screen.getByLabelText("Schedule month grid");
      const [startX, endX] = direction === "next" ? [280, 230] : [230, 280];
      const quickStart = createEvent.touchStart(monthGrid, {
        changedTouches: [{ pageX: startX }],
        touches: [{ pageX: startX }],
      });
      Object.defineProperty(quickStart, "timeStamp", {
        configurable: true,
        value: 1000,
      });
      fireEvent(monthGrid, quickStart);

      const quickMove = createEvent.touchMove(monthGrid, {
        changedTouches: [{ pageX: endX }],
        touches: [{ pageX: endX }],
      });
      Object.defineProperty(quickMove, "timeStamp", {
        configurable: true,
        value: 1040,
      });
      fireEvent(monthGrid, quickMove);

      const quickEnd = createEvent.touchEnd(monthGrid, {
        changedTouches: [{ pageX: endX }],
      });
      Object.defineProperty(quickEnd, "timeStamp", {
        configurable: true,
        value: 1080,
      });
      fireEvent(monthGrid, quickEnd);
    }

    // Swiping into May (not the current month) selects its 1st.
    fireQuickMonthSwipe("next");
    expect(screen.getByRole("button", { name: "Select date 2026-05-01" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Swiping back into April (the current month) selects today instead
    // of the 1st. getByRole also implicitly asserts there's exactly one
    // accessible match — the off-screen adjacent-month preview cells are
    // correctly excluded from the accessibility tree.
    fireQuickMonthSwipe("previous");
    expect(screen.getByRole("button", { name: "Select date 2026-04-16" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
