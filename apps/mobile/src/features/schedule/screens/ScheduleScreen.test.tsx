import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createQueryStateCardModule,
  createReactNativeModule,
  createScreenModule,
} from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useQueryClient = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const routerPush = vi.fn();

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation,
  useQuery,
  useQueryClient,
}));

vi.mock("expo-router", () => ({
  router: {
    push: routerPush,
  },
}));

vi.mock("../../../shared/components/Screen", async () =>
  createScreenModule(await import("react")),
);

vi.mock("../../../shared/components/QueryStateCard", async () =>
  createQueryStateCardModule(await import("react")),
);

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

let MeScheduleScreen: (typeof import("./ScheduleScreen"))["MeScheduleScreen"];
let TeamScheduleScreen: (typeof import("./ScheduleScreen"))["TeamScheduleScreen"];

type QueryResult = {
  data: unknown;
  error: Error | null;
  isFetching: boolean;
  isLoading: boolean;
  refetch: ReturnType<typeof vi.fn>;
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
  MeScheduleScreen = module.MeScheduleScreen;
  TeamScheduleScreen = module.TeamScheduleScreen;
});

describe("ScheduleScreen", () => {
  let mutationSpy: ReturnType<typeof vi.fn>;
  let invalidateQueriesSpy: ReturnType<typeof vi.fn>;
  let meScheduleEntries: ReturnType<typeof createScheduleEntry>[];
  let teamScheduleEntries: ReturnType<typeof createScheduleEntry>[];
  let shiftRequests: ReturnType<typeof createShiftRequest>[];
  let openShifts: ReturnType<typeof createOpenShift>[];

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

  it("renders the redesigned Me page with current shift, upcoming shifts, open shifts, cover requests, and hours", () => {
    render(<MeScheduleScreen />);

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

    expect(screen.getByText("Your Week")).toBeInTheDocument();
    expect(screen.getByText("24h this week")).toBeInTheDocument();
    expect(screen.getByText("FRI")).toBeInTheDocument();
    expect(screen.getAllByText("17").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evening Shift").length).toBeGreaterThan(0);
    expect(screen.getByText("Telemetry")).toBeInTheDocument();
    expect(screen.getByText("Paid Time Off")).toBeInTheDocument();
    expect(screen.getByText("Absence")).toBeInTheDocument();
    expect(screen.queryByText("This Week's Hours")).not.toBeInTheDocument();
  });

  it("shows the next shift state when nothing is currently active", () => {
    vi.setSystemTime(new Date("2026-04-16T05:00:00.000Z"));

    render(<MeScheduleScreen />);

    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    expect(screen.getByLabelText("Thu, Apr 16")).toBeInTheDocument();
    expect(screen.getAllByText("Day Shift").length).toBeGreaterThan(0);
    expect(screen.queryByText("On Duty")).not.toBeInTheDocument();
  });

  it("does not repeat a general shift name as a job pill on the top card", () => {
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
    teamScheduleEntries = [];

    render(<MeScheduleScreen />);

    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Job Admin")).toHaveLength(1);
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
        entries:
          queryKey[4] === "2026-04-19" ? nextWeekEntries : meScheduleEntries,
        range: {
          startDate:
            queryKey[4] === "2026-04-19" ? "2026-04-19" : "2026-04-12",
          endDate:
            queryKey[4] === "2026-04-19" ? "2026-04-25" : "2026-04-18",
        },
      });
    });

    render(<MeScheduleScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));

    expect(screen.getByLabelText("Mon, Apr 20")).toBeInTheDocument();
    expect(screen.getAllByText("Monday First Shift").length).toBeGreaterThan(
      1,
    );
  });

  it("updates the active shift remaining time as the clock advances", () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00.000Z"));

    render(<MeScheduleScreen />);

    expect(screen.getByText("3h left")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText("2h 59m left")).toBeInTheDocument();
  });

  it("refreshes schedule content on the realtime interval", () => {
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

    render(<MeScheduleScreen />);

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(bootstrapRefetch).toHaveBeenCalledTimes(1);
    expect(scheduleRefetch).toHaveBeenCalledTimes(2);
    expect(requestsRefetch).toHaveBeenCalledTimes(1);
  });

  it("routes to the requests tab and claims an open shift from Me", () => {
    render(<MeScheduleScreen />);

    fireEvent.click(screen.getByText("See all"));
    expect(routerPush).toHaveBeenCalledWith("/(tabs)/requests");

    fireEvent.click(screen.getByText("Claim Shift"));
    expect(mutationSpy).toHaveBeenCalledWith({
      requestId: "request-open-1",
      body: {
        action: "claim",
        claimerEmpId: "emp-1",
      },
    });
  });

  it("volunteers for a coverage-gap open shift from Me", () => {
    shiftRequests = [];
    render(<MeScheduleScreen />);

    fireEvent.click(screen.getByText("Volunteer"));

    expect(mutationSpy).toHaveBeenCalledWith({
      requestId: "coverage-gap-1",
      body: {
        action: "volunteer_open_shift",
        empId: "emp-1",
        shiftDate: "2026-04-19",
        focusAreaId: 2,
        state: openShifts[0].state,
      },
    });
  });

  it("does not render the open shifts section when there are no open items", () => {
    shiftRequests = shiftRequests.filter(
      (request) => request.type !== "pickup",
    );
    openShifts = [];

    render(<MeScheduleScreen />);

    expect(screen.queryByText("Open Shifts")).not.toBeInTheDocument();
    expect(screen.queryByText("Claim Shift")).not.toBeInTheDocument();
    expect(screen.queryByText("Volunteer")).not.toBeInTheDocument();
  });

  it("accepts and declines shift cover requests from Me", () => {
    render(<MeScheduleScreen />);

    fireEvent.click(screen.getByText("Accept"));
    expect(mutationSpy).toHaveBeenCalledWith({
      requestId: "request-cover-1",
      body: {
        action: "respond",
        empId: "emp-1",
        accept: true,
      },
    });

    fireEvent.click(screen.getByText("Decline"));
    expect(mutationSpy).toHaveBeenCalledWith({
      requestId: "request-cover-1",
      body: {
        action: "respond",
        empId: "emp-1",
        accept: false,
      },
    });
  });

  it("shows job-focused team rows and opens shift detail from the Schedule tab", () => {
    render(<TeamScheduleScreen />);

    expect(screen.getByText("Alex Kim")).toBeInTheDocument();
    expect(screen.getByText("Bri Shaw")).toBeInTheDocument();
    expect(screen.getByText("Mentor")).toBeInTheDocument();
    expect(screen.getByText("Supervisor")).toBeInTheDocument();
    expect(screen.getAllByText("Day Shift")).toHaveLength(1);
    expect(screen.queryByText("Day Shift Supervisor")).not.toBeInTheDocument();
    expect(screen.getByText("7:00 AM - 3:00 PM")).toBeInTheDocument();
    expect(screen.getByText("8:00 AM - 4:00 PM")).toBeInTheDocument();
    expect(screen.getByText("6:15 AM - 3:00 PM")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Alex Kim"));

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

  it("keeps the Schedule tab filter flow working with focus-area filtering", () => {
    render(<TeamScheduleScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Filter focus areas" }));
    fireEvent.click(screen.getByRole("button", { name: "Emergency" }));

    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
    expect(screen.getByText("Nurse")).toBeInTheDocument();
    expect(screen.queryByText("Alex Kim")).not.toBeInTheDocument();
  });
});
