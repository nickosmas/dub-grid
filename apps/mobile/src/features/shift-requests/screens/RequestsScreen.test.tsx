import { fireEvent, render, screen } from "@testing-library/react";
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
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const useLocalSearchParams = vi.fn();
const pushToast = vi.fn();

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
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
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams,
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

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

let RequestsScreen: (typeof import("./RequestsScreen"))["default"];

beforeAll(async () => {
  RequestsScreen = (await import("./RequestsScreen")).default;
});

describe("RequestsScreen", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-04-16T12:00:00.000Z"));

    useMutation.mockReset();
    useQuery.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    useLocalSearchParams.mockReset();
    pushToast.mockReset();

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
          canApproveShiftRequests: true,
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the loading state before requests are available", () => {
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: true,
      refetch: vi.fn(),
    });

    render(<RequestsScreen />);

    expect(screen.getByText("Loading shift requests")).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Try Again"));
    expect(refetch).toHaveBeenCalled();
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

    expect(screen.getByText("No request activity yet")).toBeInTheDocument();
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

    expect(screen.getByText("Sun, Apr 19")).toBeInTheDocument();
    expect(screen.getByText("Day Shift")).toBeInTheDocument();
    expect(screen.getByLabelText("Job Nurse")).toBeInTheDocument();
    expect(screen.getByText("Skilled Nursing")).toBeInTheDocument();
    expect(screen.getByText("7:00 AM - 3:00 PM")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Volunteer"));

    expect(mutate).toHaveBeenCalledWith({
      requestId: "coverage-gap-1",
      body: {
        action: "volunteer_open_shift",
        empId: "emp-1",
        shiftDate: "2026-04-19",
        focusAreaId: 2,
        state: openShift.state,
      },
    });
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

    expect(screen.getByText("Sat, Apr 18")).toBeInTheDocument();
    expect(screen.getByText("Sun, Apr 19")).toBeInTheDocument();

    const content = document.body.textContent ?? "";
    expect(content.indexOf("Sat, Apr 18")).toBeLessThan(
      content.indexOf("Mina Diaz"),
    );
    expect(content.indexOf("Ivy Stone")).toBeLessThan(
      content.indexOf("Sun, Apr 19"),
    );
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

    expect(screen.getByText("Tomorrow, Apr 16")).toBeInTheDocument();
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
              segments: [],
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
    expect(screen.getByText("Mina Diaz")).toBeInTheDocument();
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
    expect(screen.queryByText("Nothing waiting for approval")).not.toBeInTheDocument();
  });
});
