import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useMutation = vi.fn();
const useInfiniteQuery = vi.fn();
const useQuery = vi.fn();
// `useOptimisticMutation` reaches for the client to patch and roll back the
// cache. One shared stub so tests can assert what the lifecycle wrote.
const queryClientStub = {
  cancelQueries: vi.fn(),
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
  removeQueries: vi.fn(),
  invalidateQueries: vi.fn(),
};
const useQueryClient = vi.fn(() => queryClientStub);
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const useLocalSearchParams = vi.fn();
const pushToast = vi.fn();
const { getShiftRequestHistory, getShiftRequests } = vi.hoisted(() => ({
  getShiftRequestHistory: vi.fn(),
  getShiftRequests: vi.fn(),
}));

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  onlineManager: {
    isOnline: () => true,
  },
  keepPreviousData: (previousData: unknown) => previousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

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

vi.mock("../../../shared/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../shared/lib/api")>();
  return { ...actual, getShiftRequestHistory, getShiftRequests };
});

let RequestsScreen: (typeof import("./RequestsScreen"))["default"];

function buildHistoryRequest(id: string, requesterName: string, requesterShiftDate: string) {
  return {
    id,
    requesterName,
    requesterShiftDate,
    status: "approved",
    type: "calloff",
    requesterShiftLabel: "Day",
    requesterEmpId: "emp-1",
    targetEmpId: null,
    requesterPresentation: {
      label: "Day Shift",
      segments: [],
    },
    requesterState: {
      customStartTime: "07:00:00",
      customEndTime: "15:00:00",
    },
  };
}

beforeAll(async () => {
  RequestsScreen = (await import("./RequestsScreen")).default;
});

describe("RequestsScreen", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-04-16T12:00:00.000Z"));

    useMutation.mockReset();
    useInfiniteQuery.mockReset();
    useQuery.mockReset();
    for (const stub of Object.values(queryClientStub)) {
      stub.mockReset();
    }
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    useLocalSearchParams.mockReset();
    pushToast.mockReset();
    getShiftRequestHistory.mockReset();
    getShiftRequests.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useLocalSearchParams.mockReturnValue({});
    useBootstrap.mockReturnValue({
      data: {
        linkedEmployee: {
          id: "emp-1",
          focusAreaIds: [2],
        },
        currentOrg: {
          timezone: null,
        },
        effectiveRole: "admin",
        permissions: {
          canEditShifts: false,
          canApproveShiftRequests: true,
          canManageEmployees: false,
        },
        absenceTypes: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });
    useInfiniteQuery.mockReturnValue({
      data: { pages: [{ requests: [], nextCursor: null }] },
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the loading state before requests are available", async () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: true,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    // Held back briefly so a fast response never flashes a skeleton.
    expect(screen.queryByTestId("skeleton")).not.toBeInTheDocument();

    // Skeletons carry the loading state on their own; a headline over them
    // repeats what their shape already says.
    expect(await screen.findByTestId("skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Loading shift requests")).not.toBeInTheDocument();
    expect(screen.queryByText(/Bringing your active requests/)).not.toBeInTheDocument();

    // Every tab counts something, and the counts are 0 until the queries land.
    // Painting the real strip here made each badge pop in afterwards and shove
    // the pills along the moment the screen finished loading.
    expect(screen.queryByRole("tab", { name: "Available" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Mine" })).not.toBeInTheDocument();
  });

  it("keeps request tokens in cancellable request closures, not query keys", () => {
    useQuery.mockReturnValue({
      data: { requests: [], openShifts: [], range: null, entries: [] },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<RequestsScreen />);
    const signal = new AbortController().signal;
    const requestOptions = useQuery.mock.calls
      .map(([options]) => options)
      .find((options) => options.queryKey?.[1] === "requests" && options.queryKey?.length === 5);
    const historyOptions = useInfiniteQuery.mock.calls[0]?.[0];

    requestOptions.queryFn({ signal });
    historyOptions.queryFn({ pageParam: null, signal });

    expect(JSON.stringify(requestOptions.queryKey)).not.toContain("token-123");
    expect(JSON.stringify(historyOptions.queryKey)).not.toContain("token-123");
    expect(getShiftRequests).toHaveBeenCalledWith(
      "token-123",
      { startDate: "2026-04-16", endDate: "2026-04-29" },
      signal,
    );
    expect(getShiftRequestHistory).toHaveBeenCalledWith(
      "token-123",
      { limit: 25, cursorCreatedAt: undefined, cursorId: undefined },
      signal,
    );
  });

  it("shows a retryable query error state", () => {
    const refetch = vi.fn();
    useQuery.mockReturnValue({
      data: undefined,
      error: new Error("Request failed"),
      isFetching: false,
      isLoading: false,
      refetch,
    });

    render(<RequestsScreen />);

    expect(screen.getByText("Could not load requests")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try again"));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows a success toast after a request action completes", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    useQuery.mockReturnValue({
      data: {
        openShifts: [],
        requests: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch,
    });

    render(<RequestsScreen />);

    const mutationConfig = useMutation.mock.calls[0][0] as {
      onSuccess: (
        result: unknown,
        variables: {
          requestId: string;
          body: { action: string; approved?: boolean };
        },
      ) => Promise<void>;
    };

    await act(async () => {
      await mutationConfig.onSuccess(undefined, {
        requestId: "request-1",
        body: { action: "resolve", approved: true },
      });
    });

    expect(pushToast).toHaveBeenCalledWith({
      tone: "success",
      title: "Request approved",
      message: "The staffing change was finalized.",
    });
  });

  it("marks a resolved request approved in the cache before the request returns", async () => {
    useQuery.mockReturnValue({
      data: { openShifts: [], requests: [] },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    const mutationConfig = useMutation.mock.calls[0][0] as {
      onMutate: (variables: {
        requestId: string;
        body: { action: string; approved?: boolean };
      }) => Promise<unknown>;
    };

    queryClientStub.getQueryData.mockReturnValue({
      openShifts: [],
      requests: [{ id: "request-1", status: "pending_approval" }],
    });

    await act(async () => {
      await mutationConfig.onMutate({
        requestId: "request-1",
        body: { action: "resolve", approved: true },
      });
    });

    // Cancel first, or an in-flight refetch lands on top of the patch.
    expect(queryClientStub.cancelQueries).toHaveBeenCalled();
    const [, updater] = queryClientStub.setQueryData.mock.calls[0];
    expect(
      (updater as (previous: unknown) => { requests: { status: string }[] })({
        openShifts: [],
        requests: [{ id: "request-1", status: "pending_approval" }],
      }).requests[0].status,
    ).toBe("approved");
  });

  it("leaves a claim to the server rather than guessing the resulting status", async () => {
    useQuery.mockReturnValue({
      data: { openShifts: [], requests: [] },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    const mutationConfig = useMutation.mock.calls[0][0] as {
      onMutate: (variables: { requestId: string; body: { action: string } }) => Promise<unknown>;
    };

    await act(async () => {
      await mutationConfig.onMutate({
        requestId: "request-1",
        body: { action: "claim", claimerEmpId: "emp-1" } as never,
      });
    });

    // Claiming cascades into schedule cells the client cannot predict.
    expect(queryClientStub.setQueryData).not.toHaveBeenCalled();
  });

  it("shows the empty state when no requests exist", () => {
    useQuery.mockReturnValue({
      data: {
        requests: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByText("No requests yet")).toBeInTheDocument();
  });

  it("shows coverage-gap open shifts and volunteers from the requests tab", () => {
    const mutate = vi.fn();
    const openShift = {
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
            isMentored: true,
          },
        ],
      },
    };
    useQuery.mockReturnValue({
      data: {
        openShifts: [openShift],
        requests: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate,
    });

    render(<RequestsScreen />);

    expect(screen.getByLabelText("Sun, Apr 19")).toBeInTheDocument();
    expect(screen.getByText("Day Shift")).toBeInTheDocument();
    const mentoredJobPill = screen.getByLabelText("Job Nurse mentored assignment");
    expect(mentoredJobPill).toHaveTextContent("Nurse");
    expect(mentoredJobPill).toHaveTextContent("(Mentored)");
    expect(mentoredJobPill).not.toHaveTextContent("(MENTORED)");
    expect(screen.queryByLabelText("Mentored assignment")).not.toBeInTheDocument();
    expect(screen.getByText("Skilled Nursing")).toBeInTheDocument();
    expect(screen.getByText("7:00 AM - 3:00 PM")).toBeInTheDocument();
    expect(screen.getAllByText("7:00 AM - 3:00 PM")).toHaveLength(1);
    const pageText = document.body.textContent ?? "";
    expect(pageText.indexOf("Day Shift")).toBeLessThan(pageText.indexOf("7:00 AM - 3:00 PM"));
    expect(pageText.indexOf("Skilled Nursing")).toBeLessThan(pageText.indexOf("Nurse"));
    fireEvent.click(screen.getByText("Volunteer"));
    expect(screen.getByText("Volunteer for open shift?")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: "Volunteer",
      }),
    );

    expect(mutate).toHaveBeenCalledWith(
      {
        requestId: "coverage-gap-1",
        body: {
          action: "volunteer_open_shift",
          empId: "emp-1",
          shiftDate: "2026-04-19",
          focusAreaId: 2,
          state: openShift.state,
        },
      },
      expect.objectContaining({ onSettled: expect.any(Function) }),
    );
  });

  it("shows why a manager-visible open shift cannot be volunteered for", () => {
    const mutate = vi.fn();
    useQuery.mockReturnValue({
      data: {
        openShifts: [
          {
            id: "coverage-gap-blocked",
            date: "2026-04-19",
            focusAreaId: 2,
            focusAreaName: "Skilled Nursing",
            needed: 1,
            canVolunteer: false,
            volunteerBlockReason: "You are not assigned to the focus area required for this shift.",
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
              segments: [],
            },
          },
        ],
        requests: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate,
    });

    render(<RequestsScreen />);

    expect(
      screen.getByText("You are not assigned to the focus area required for this shift."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Volunteer"));

    expect(mutate).not.toHaveBeenCalled();
  });

  it("groups available open shifts and pickup requests under each date", () => {
    useQuery.mockReturnValue({
      data: {
        openShifts: [
          {
            id: "open-late",
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
              label: "Later Open Shift",
              focusAreaId: 2,
              focusAreaName: "Skilled Nursing",
              displayFocusAreaName: "Skilled Nursing",
              startTime: "15:00:00",
              endTime: "23:00:00",
              segments: [],
            },
          },
        ],
        requests: [
          {
            id: "request-early",
            requesterName: "Mina Diaz",
            requesterShiftDate: "2026-04-18",
            status: "open",
            type: "pickup",
            requesterShiftLabel: "Early Pickup",
            requesterEmpId: "emp-2",
            targetEmpId: null,
            requesterPresentation: {
              label: "Early Pickup",
              segments: [],
            },
            requesterState: {
              customStartTime: "07:00:00",
              customEndTime: "15:00:00",
            },
          },
          {
            id: "request-late",
            requesterName: "Ivy Stone",
            requesterShiftDate: "2026-04-18",
            status: "open",
            type: "pickup",
            requesterShiftLabel: "Later Pickup",
            requesterEmpId: "emp-3",
            targetEmpId: null,
            requesterPresentation: {
              label: "Later Pickup",
              segments: [],
            },
            requesterState: {
              customStartTime: "15:00:00",
              customEndTime: "23:00:00",
            },
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    fireEvent.click(screen.getByText("Available"));

    // Each day fronts its cards from a date tile on the rail; the full day
    // label is the tile's accessible name.
    const saturday = screen.getByLabelText("Sat, Apr 18");
    const sunday = screen.getByLabelText("Sun, Apr 19");
    const follows = (first: Element, second: Element) =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(saturday, screen.getByText("Mina Diaz"))).toBe(true);
    expect(follows(screen.getByText("Ivy Stone"), sunday)).toBe(true);
  });

  it("shows split-shift segments on open shifts and request cards", () => {
    useQuery.mockReturnValue({
      data: {
        openShifts: [
          {
            id: "split-open",
            date: "2026-04-19",
            focusAreaId: 2,
            focusAreaName: "Skilled Nursing",
            needed: 1,
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
          },
        ],
        requests: [
          {
            id: "split-request",
            requesterName: "Mina Diaz",
            requesterShiftDate: "2026-04-18",
            status: "open",
            type: "swap",
            requesterShiftLabel: "Morning / Desk",
            requesterEmpId: "emp-2",
            targetEmpId: "emp-1",
            targetName: "Alex Kim",
            targetShiftDate: "2026-04-19",
            requesterPresentation: {
              label: "Morning Shift / Desk Shift",
              segments: [
                {
                  shiftId: 3,
                  jobId: 22,
                  shiftName: "Morning Shift",
                  jobName: "Nurse",
                  startTime: "06:00:00",
                  endTime: "10:00:00",
                  displayFocusAreaName: "Skilled Nursing",
                },
                {
                  shiftId: 4,
                  jobId: 23,
                  shiftName: "Desk Shift",
                  jobName: "Coordinator",
                  startTime: "10:00:00",
                  endTime: "14:00:00",
                  displayFocusAreaName: "Skilled Nursing",
                },
              ],
            },
            requesterState: {
              kind: "worked",
              customStartTime: null,
              customEndTime: null,
            },
            targetPresentation: {
              label: "Target Day / Target Evening",
              segments: [
                {
                  shiftId: 5,
                  jobId: 24,
                  shiftName: "Target Day",
                  jobName: "Nurse",
                  startTime: "07:00:00",
                  endTime: "15:00:00",
                  displayFocusAreaName: "Skilled Nursing",
                },
                {
                  shiftId: 6,
                  jobId: 25,
                  shiftName: "Target Evening",
                  jobName: "Lead",
                  startTime: "15:00:00",
                  endTime: "23:00:00",
                  displayFocusAreaName: "Skilled Nursing",
                },
              ],
            },
            targetState: {
              kind: "worked",
              customStartTime: null,
              customEndTime: null,
            },
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    fireEvent.click(screen.getByText("Available"));
    expect(screen.getAllByLabelText("Multiple Shifts, 2 shifts").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Day Shift").length).toBeGreaterThan(0);
    expect(screen.getByText("Evening Shift")).toBeInTheDocument();

    fireEvent.click(screen.getByText("All"));
    expect(screen.getByText(/Mina Diaz/)).toBeInTheDocument();
    expect(screen.getByText("Morning Shift")).toBeInTheDocument();
    expect(screen.getByText("Desk Shift")).toBeInTheDocument();
    expect(screen.getByText("Target shift")).toBeInTheDocument();
    expect(screen.getByText("Target Day")).toBeInTheDocument();
    expect(screen.getByText("Target Evening")).toBeInTheDocument();
    expect(screen.getAllByText("Shift 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Shift 2").length).toBeGreaterThan(0);
    // The type reads as the same badge Home's approval queue uses. The page
    // also has a Swap tab, so the badge is one of several "Swap" texts.
    expect(screen.getAllByText("Swap").length).toBeGreaterThan(0);
    expect(screen.queryByText("Swap request")).not.toBeInTheDocument();
  });

  it("uses the org timezone for available day labels", () => {
    useBootstrap.mockReturnValue({
      data: {
        linkedEmployee: {
          id: "emp-1",
          focusAreaIds: [2],
        },
        currentOrg: {
          timezone: "America/Los_Angeles",
        },
        effectiveRole: "admin",
        permissions: {
          canApproveShiftRequests: true,
        },
        absenceTypes: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    vi.setSystemTime(new Date("2026-04-16T06:30:00.000Z"));
    useQuery.mockReturnValue({
      data: {
        openShifts: [
          {
            id: "coverage-gap-1",
            date: "2026-04-16",
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
              segments: [],
            },
          },
        ],
        requests: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByLabelText("Tomorrow, Apr 16")).toBeInTheDocument();
  });

  it("does not render an inline error card when mutation state carries an error", () => {
    useQuery.mockReturnValue({
      data: {
        requests: [
          {
            id: "req-1",
            requesterName: "Mina Diaz",
            requesterShiftDate: "2026-04-17",
            status: "open",
            type: "pickup",
            requesterShiftLabel: "Day",
            requesterEmpId: "emp-2",
            targetEmpId: null,
            requesterPresentation: {
              label: "Day Shift",
              segments: [
                {
                  isMentored: true,
                },
              ],
            },
            requesterState: {
              customStartTime: "07:00:00",
              customEndTime: "15:00:00",
            },
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    useMutation.mockReturnValue({
      error: new Error("Already resolved"),
      isPending: false,
      mutate: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.queryByText("Could not update request")).not.toBeInTheDocument();
    expect(screen.getByText(/Mina Diaz/)).toBeInTheDocument();
    expect(screen.getByLabelText("Mentored assignment")).toHaveTextContent("Mentored");
    expect(screen.queryByText("(Mentored)")).not.toBeInTheDocument();
    expect(screen.getByText("7:00 AM - 3:00 PM")).toBeInTheDocument();
  });

  it("defaults managers into the approval tab when a request is waiting for review", () => {
    useQuery.mockReturnValue({
      data: {
        requests: [
          {
            id: "req-2",
            requesterName: "Mina Diaz",
            requesterShiftDate: "2026-04-17",
            status: "pending_approval",
            type: "pickup",
            requesterShiftLabel: "Day",
            requesterEmpId: "emp-2",
            targetEmpId: null,
            requesterPresentation: {
              label: "Day Shift",
            },
          },
        ],
        openShifts: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to approve")).not.toBeInTheDocument();
  });

  it("shows the all-requests tab for schedule editors without a linked employee", () => {
    useBootstrap.mockReturnValue({
      data: {
        linkedEmployee: null,
        currentOrg: {
          timezone: null,
        },
        effectiveRole: "user",
        permissions: {
          canEditShifts: true,
          canApproveShiftRequests: false,
          canManageEmployees: false,
        },
        absenceTypes: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: {
        requests: [
          {
            id: "req-2",
            requesterName: "Mina Diaz",
            requesterShiftDate: "2026-04-17",
            status: "open",
            type: "swap",
            requesterShiftLabel: "Day",
            requesterEmpId: "emp-2",
            targetEmpId: "emp-3",
            requesterPresentation: {
              label: "Day Shift",
              segments: [],
            },
            targetPresentation: {
              label: "Night Shift",
              segments: [],
            },
            requesterState: {
              customStartTime: "07:00:00",
              customEndTime: "15:00:00",
            },
            targetState: {
              customStartTime: "15:00:00",
              customEndTime: "23:00:00",
            },
          },
        ],
        openShifts: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText(/Mina Diaz/)).toBeInTheDocument();
    expect(screen.queryByText("Nothing to approve")).not.toBeInTheDocument();
  });

  it("shows terminal requests whose shift dates are older than the active window", () => {
    useLocalSearchParams.mockReturnValue({ tab: "history" });
    useQuery.mockReturnValue({
      data: { requests: [], openShifts: [] },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    useInfiniteQuery.mockReturnValue({
      data: {
        pages: [
          {
            requests: [buildHistoryRequest("history-old", "Older Request", "2025-12-01")],
            nextCursor: null,
          },
        ],
      },
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByText("Older Request")).toBeInTheDocument();
    expect(screen.getByText(/2025-12-01/)).toBeInTheDocument();
  });

  it("shows a history-specific empty state", () => {
    useLocalSearchParams.mockReturnValue({ tab: "history" });
    useQuery.mockReturnValue({
      data: { requests: [], openShifts: [] },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByText("No history yet")).toBeInTheDocument();
    expect(
      screen.getByText("Resolved, canceled, and expired requests appear here."),
    ).toBeInTheDocument();
  });

  it("retries history after its first page fails", () => {
    const historyRefetch = vi.fn();
    useLocalSearchParams.mockReturnValue({ tab: "history" });
    useQuery.mockReturnValue({
      data: { requests: [], openShifts: [] },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    useInfiniteQuery.mockReturnValue({
      data: undefined,
      error: new Error("History failed"),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: historyRefetch,
    });

    render(<RequestsScreen />);

    expect(screen.getByText("Could not load history")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try again"));
    expect(historyRefetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "loading", error: null, isLoading: true },
    { label: "failed", error: new Error("History failed"), isLoading: false },
  ])("keeps active request actions available while history is $label", ({ error, isLoading }) => {
    useQuery.mockReturnValue({
      data: {
        requests: [
          {
            id: "active-approval",
            requesterName: "Active Request",
            requesterShiftDate: "2026-04-17",
            status: "pending_approval",
            type: "calloff",
            requesterShiftLabel: "Day",
            requesterEmpId: "emp-2",
            targetEmpId: null,
            requesterPresentation: { label: "Day Shift", segments: [] },
            requesterState: {
              customStartTime: "07:00:00",
              customEndTime: "15:00:00",
            },
          },
        ],
        openShifts: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    useInfiniteQuery.mockReturnValue({
      data: undefined,
      error,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByText("Active Request")).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.queryByText("Could not load history")).not.toBeInTheDocument();
  });

  it("loads another history page and deduplicates repeated boundary rows", () => {
    const fetchNextPage = vi.fn();
    const repeated = buildHistoryRequest("history-1", "Repeated Request", "2025-12-01");
    useLocalSearchParams.mockReturnValue({ tab: "history" });
    useQuery.mockReturnValue({
      data: { requests: [], openShifts: [] },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    useInfiniteQuery.mockReturnValue({
      data: {
        pages: [
          {
            requests: [repeated],
            nextCursor: {
              createdAt: "2026-04-01T10:00:00.000Z",
              id: "00000000-0000-4000-8000-000000000001",
            },
          },
          {
            requests: [repeated, buildHistoryRequest("history-2", "Next Request", "2025-11-01")],
            nextCursor: null,
          },
        ],
      },
      error: null,
      fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getAllByText("Repeated Request")).toHaveLength(1);
    expect(screen.getByText("Next Request")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Load more"));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("keeps loaded history available across tab transitions", () => {
    useLocalSearchParams.mockReturnValue({ tab: "history" });
    useQuery.mockReturnValue({
      data: { requests: [], openShifts: [] },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });
    useInfiniteQuery.mockReturnValue({
      data: {
        pages: [
          {
            requests: [buildHistoryRequest("history-1", "Saved History", "2025-12-01")],
            nextCursor: null,
          },
        ],
      },
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByText("Saved History")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Available"));
    expect(screen.getByText("No requests yet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("History"));
    expect(screen.getByText("Saved History")).toBeInTheDocument();
  });
});
