import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
const useLocalSearchParams = vi.fn();
const routerReplace = vi.fn();
const alertMock = vi.fn();

vi.mock("react-native", async () => ({
  ...createReactNativeModule(await import("react")),
  Alert: {
    alert: alertMock,
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation,
  useQuery,
  useQueryClient,
}));

vi.mock("expo-router", () => ({
  router: {
    replace: routerReplace,
  },
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

let ShiftDetailScreen: (typeof import("./ShiftDetailScreen"))["default"];

beforeAll(async () => {
  ShiftDetailScreen = (await import("./ShiftDetailScreen")).default;
});

describe("ShiftDetailScreen", () => {
  function confirmLatestAlert() {
    const buttons = alertMock.mock.calls.at(-1)?.[2] as
      | { onPress?: () => void }[]
      | undefined;
    buttons?.at(-1)?.onPress?.();
  }

  beforeEach(() => {
    useMutation.mockReset();
    useQuery.mockReset();
    useQueryClient.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    useLocalSearchParams.mockReset();
    routerReplace.mockReset();
    alertMock.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useLocalSearchParams.mockReturnValue({
      employeeId: "emp-1",
      date: "2026-04-16",
      rangeStart: "2026-04-16",
      rangeEnd: "2026-04-22",
      source: "mine",
    });
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
          timezone: "America/Los_Angeles",
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
            name: "ICU",
          },
        ],
        effectiveRole: "admin",
        permissions: {
          canApproveShiftRequests: true,
          canManageEmployees: true,
        },
        absenceTypes: [
          {
            id: 1,
            label: "Sick",
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQueryClient.mockReturnValue({
      invalidateQueries: vi.fn(),
    });
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[1] === "requests") {
        return {
          data: {
            requests: [],
            openShifts: [],
          },
          error: null,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      if (queryKey[2] === "team") {
        return {
          data: {
            entries: [
              {
                employeeId: "emp-2",
                employeeName: "Bri Shaw",
                date: "2026-04-16",
                assignmentIds: [1],
                shiftLabel: "D",
                assignmentLabel: "D",
                shiftName: "Day Shift",
                absenceTypeId: null,
                focusAreaId: 1,
                focusAreaName: "Emergency",
                displayFocusAreaName: "Emergency",
                startTime: "07:00:00",
                endTime: "15:00:00",
                customStartTime: null,
                customEndTime: null,
                segments: [
                  {
                    shiftName: "Day Shift",
                    jobName: "Supervisor",
                    jobColor: "#EEF2FF",
                    jobBorderColor: "#C7D2FE",
                    jobTextColor: "#4F46E5",
                    startTime: "07:00:00",
                    endTime: "15:00:00",
                    displayFocusAreaName: "Emergency",
                  },
                ],
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-1",
                employeeName: "Alex Kim",
                date: "2026-04-16",
                assignmentIds: [1],
                shiftLabel: "D",
                assignmentLabel: "D",
                shiftName: "Day Shift",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                displayFocusAreaName: "ICU",
                startTime: "07:00:00",
                endTime: "15:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-3",
                employeeName: "Chris Hall",
                date: "2026-04-17",
                assignmentIds: [2],
                shiftLabel: "E",
                assignmentLabel: "E",
                shiftName: "Evening Shift",
                absenceTypeId: null,
                focusAreaId: 1,
                focusAreaName: "Emergency",
                displayFocusAreaName: "Emergency",
                startTime: "15:00:00",
                endTime: "23:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
            ],
          },
          error: null,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: {
          entries: [
            {
              employeeId: "emp-1",
              employeeName: "Alex Kim",
              date: "2026-04-16",
              assignmentIds: [1],
              shiftLabel: "D",
              assignmentLabel: "D",
              shiftName: "Day Shift",
              absenceTypeId: null,
              focusAreaId: 2,
              focusAreaName: "ICU",
              displayFocusAreaName: "ICU",
              startTime: "07:00:00",
              endTime: "15:00:00",
              customStartTime: null,
              customEndTime: null,
              segments: [
                {
                  shiftName: "Day Shift",
                  jobName: "Mentor",
                  jobColor: "#FFFBEB",
                  jobBorderColor: "#FDE68A",
                  jobTextColor: "#B45309",
                  startTime: "07:00:00",
                  endTime: "15:00:00",
                  displayFocusAreaName: "ICU",
                },
              ],
              publishedAt: "2026-04-15T18:30:00.000Z",
              publishedByName: "Mina Diaz",
            },
          ],
        },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });
  });

  it("shows concise metadata and flat shiftmates for the selected shift", () => {
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    expect(
      screen.getByText("Published Apr 15, 2026, 11:30 AM by Mina Diaz"),
    ).toBeInTheDocument();
    expect(screen.getByText("Mentor")).toBeInTheDocument();
    expect(screen.getByText("ICU")).toBeInTheDocument();
    expect(screen.getByText("Shiftmates")).toBeInTheDocument();
    expect(screen.getByText("Bri Shaw")).toBeInTheDocument();
    expect(screen.getByText("Supervisor")).toBeInTheDocument();
    expect(screen.getByText("Emergency")).toBeInTheDocument();
    expect(screen.getByText("Bri Shaw").closest("article")).toBeNull();
    expect(screen.queryByText("Published by")).not.toBeInTheDocument();
    expect(screen.queryByText("Focus Areas")).not.toBeInTheDocument();
    expect(screen.queryByText("Employee")).not.toBeInTheDocument();
    expect(screen.queryByText("Alex Kim")).not.toBeInTheDocument();
  });

  it("shows another employee with plain time in the detail summary", () => {
    useLocalSearchParams.mockReturnValue({
      employeeId: "emp-2",
      date: "2026-04-16",
      rangeStart: "2026-04-16",
      rangeEnd: "2026-04-22",
      source: "team",
    });
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    expect(screen.getByText("Bri Shaw")).toBeInTheDocument();
    expect(screen.getAllByText("7:00 AM - 3:00 PM").length).toBeGreaterThan(0);
    expect(screen.queryByText("Time")).not.toBeInTheDocument();
  });

  it("shows multi-shift detail segments inside the same card", () => {
    useQuery.mockImplementation(() => ({
      data: {
        entries: [
          {
            employeeId: "emp-1",
            employeeName: "Alex Kim",
            date: "2026-04-16",
            assignmentIds: [1, 2],
            shiftLabel: "D/E",
            assignmentLabel: "D/E",
            shiftName: "Day Shift / Evening Shift",
            absenceTypeId: null,
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "23:00:00",
            customStartTime: "07:30:00|15:30:00",
            customEndTime: "15:30:00|23:30:00",
            segments: [
              {
                shiftName: "Day Shift",
                startTime: "07:30:00",
                endTime: "15:30:00",
                displayFocusAreaName: "ICU",
              },
              {
                shiftName: "Evening Shift",
                startTime: "15:30:00",
                endTime: "23:30:00",
                displayFocusAreaName: null,
              },
            ],
            publishedAt: "2026-04-15T18:30:00.000Z",
            publishedByName: "Mina Diaz",
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    }));
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    const dayShift = screen.getByText("Day Shift");
    const eveningShift = screen.getByText("Evening Shift");

    expect(dayShift.closest("article")).toBe(eveningShift.closest("article"));
    expect(screen.getByText("7:30 AM - 3:30 PM")).toBeInTheDocument();
    expect(screen.getByText("3:30 PM - 11:30 PM")).toBeInTheDocument();
    expect(screen.getByText("ICU")).toBeInTheDocument();
  });

  it("omits the focus area row for general or off-day entries", () => {
    useQuery.mockImplementation(() => ({
      data: {
        entries: [
          {
            employeeId: "emp-1",
            employeeName: "Alex Kim",
            date: "2026-04-16",
            assignmentIds: [],
            shiftLabel: "Off",
            assignmentLabel: null,
            shiftName: "Off Day",
            absenceTypeId: 1,
            focusAreaId: null,
            focusAreaName: null,
            startTime: null,
            endTime: null,
            customStartTime: null,
            customEndTime: null,
            publishedAt: "2026-04-15T18:30:00.000Z",
            publishedByName: "Mina Diaz",
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    }));

    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    expect(screen.queryByText("Focus Areas")).not.toBeInTheDocument();
    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
    expect(screen.queryByText("Time")).not.toBeInTheDocument();
    expect(screen.queryByText("Shiftmates")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Shift actions unavailable"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Custom times unavailable"),
    ).not.toBeInTheDocument();
  });

  it("organizes swap options under eligible teammates", () => {
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Swap"));

    expect(screen.getByText("Your shift")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Choose a teammate's published shift to trade dates or shift types. Same-code swaps are allowed when the date changes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Eligible teammates")).toBeInTheDocument();
    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
    expect(screen.getByText("Evening Shift")).toBeInTheDocument();
    expect(screen.getByText("3:00 PM - 11:00 PM")).toBeInTheDocument();
    expect(screen.getAllByText("Emergency").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("Choose a teammate shift"),
    ).not.toBeInTheDocument();
  });

  it("hides shift actions for unpublished shifts", () => {
    useQuery.mockImplementation(() => ({
      data: {
        entries: [
          {
            employeeId: "emp-1",
            employeeName: "Alex Kim",
            date: "2026-04-16",
            assignmentIds: [1],
            shiftLabel: "D",
            assignmentLabel: "D",
            shiftName: "Day Shift",
            absenceTypeId: null,
            focusAreaId: 2,
            focusAreaName: "ICU",
            displayFocusAreaName: "ICU",
            startTime: "07:00:00",
            endTime: "15:00:00",
            customStartTime: null,
            customEndTime: null,
            publishedAt: null,
            publishedByName: null,
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    }));

    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    expect(screen.queryByText("Drop shift")).not.toBeInTheDocument();
    expect(screen.queryByText("Swap")).not.toBeInTheDocument();
  });

  it("hides shift actions when an active request already exists for the shift", () => {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[1] === "requests") {
        return {
          data: {
            requests: [
              {
                id: "request-1",
                requesterEmpId: "emp-1",
                requesterShiftDate: "2026-04-16",
                status: "pending_approval",
                type: "pickup",
                adminNote: "Reviewing coverage now.",
              },
            ],
            openShifts: [],
          },
          error: null,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      if (queryKey[2] === "team") {
        return {
          data: {
            entries: [],
          },
          error: null,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: {
          entries: [
            {
              employeeId: "emp-1",
              employeeName: "Alex Kim",
              date: "2026-04-16",
              assignmentIds: [1],
              shiftLabel: "D",
              assignmentLabel: "D",
              shiftName: "Day Shift",
              absenceTypeId: null,
              focusAreaId: 2,
              focusAreaName: "ICU",
              displayFocusAreaName: "ICU",
              startTime: "07:00:00",
              endTime: "15:00:00",
              customStartTime: null,
              customEndTime: null,
              publishedAt: "2026-04-15T18:30:00.000Z",
              publishedByName: "Mina Diaz",
            },
          ],
        },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    expect(screen.getByText("Request already in progress")).toBeInTheDocument();
    expect(
      screen.getByText("Manager note: Reviewing coverage now."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Drop shift")).not.toBeInTheDocument();
    expect(screen.queryByText("Swap")).not.toBeInTheDocument();
  });

  it("filters swap options to meaningful published teammate shifts only", () => {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[2] === "team") {
        return {
          data: {
            entries: [
              {
                employeeId: "emp-2",
                employeeName: "Bri Shaw",
                date: "2026-04-16",
                assignmentIds: [1],
                shiftLabel: "D",
                assignmentLabel: "D",
                shiftName: "Day Shift",
                absenceTypeId: null,
                focusAreaId: 1,
                focusAreaName: "Emergency",
                displayFocusAreaName: "Emergency",
                startTime: "07:00:00",
                endTime: "15:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-3",
                employeeName: "Chris Hall",
                date: "2026-04-17",
                assignmentIds: [2],
                shiftLabel: "E",
                assignmentLabel: "E",
                shiftName: "Evening Shift",
                absenceTypeId: null,
                focusAreaId: 1,
                focusAreaName: "Emergency",
                displayFocusAreaName: "Emergency",
                startTime: "15:00:00",
                endTime: "23:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-4",
                employeeName: "Dana Moss",
                date: "2026-04-17",
                assignmentIds: [3],
                shiftLabel: "N",
                assignmentLabel: "N",
                shiftName: "Night Shift",
                absenceTypeId: null,
                focusAreaId: 1,
                focusAreaName: "Emergency",
                displayFocusAreaName: "Emergency",
                startTime: "23:00:00",
                endTime: "07:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: null,
                publishedByName: null,
              },
              {
                employeeId: "emp-5",
                employeeName: "Evan Cole",
                date: "2026-04-17",
                assignmentIds: [],
                shiftLabel: "OFF",
                assignmentLabel: null,
                shiftName: "Sick",
                absenceTypeId: 1,
                focusAreaId: null,
                focusAreaName: null,
                startTime: null,
                endTime: null,
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
            ],
          },
          error: null,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: {
          entries: [
            {
              employeeId: "emp-1",
              employeeName: "Alex Kim",
              date: "2026-04-16",
              assignmentIds: [1],
              shiftLabel: "D",
              assignmentLabel: "D",
              shiftName: "Day Shift",
              absenceTypeId: null,
              focusAreaId: 2,
              focusAreaName: "ICU",
              displayFocusAreaName: "ICU",
              startTime: "07:00:00",
              endTime: "15:00:00",
              customStartTime: null,
              customEndTime: null,
              publishedAt: "2026-04-15T18:30:00.000Z",
              publishedByName: "Mina Diaz",
            },
          ],
        },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });

    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Swap"));

    expect(screen.getAllByText("Bri Shaw")).toHaveLength(1);
    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
    expect(screen.queryByText("Dana Moss")).not.toBeInTheDocument();
    expect(screen.queryByText("Evan Cole")).not.toBeInTheDocument();
  });

  it("shows the selected swap as a give and get trade", () => {
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Swap"));
    fireEvent.click(screen.getByText("Chris Hall"));

    expect(screen.getByText("You give")).toBeInTheDocument();
    expect(screen.getByText("You get")).toBeInTheDocument();
    expect(screen.getByText("From Chris Hall")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Review the trade below, then submit your swap request.",
      ),
    ).toBeInTheDocument();
  });

  it("creates a pickup request from the coverage flow", () => {
    const mutate = vi.fn();
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate,
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Drop shift"));
    fireEvent.click(screen.getByText("Offer for pickup"));

    expect(mutate).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith(
      "Offer shift for pickup?",
      expect.stringContaining("Offer your"),
      expect.any(Array),
      { cancelable: true },
    );

    confirmLatestAlert();

    expect(mutate).toHaveBeenCalledWith({
      type: "pickup",
      requesterEmpId: "emp-1",
      requesterShiftDate: "2026-04-16",
      targetEmpId: undefined,
      targetShiftDate: undefined,
      absenceTypeId: undefined,
    });
  });

  it("creates a calloff request from the coverage flow", () => {
    const mutate = vi.fn();
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate,
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Drop shift"));
    fireEvent.click(screen.getByText("Call off"));
    fireEvent.click(screen.getByText("Sick"));

    expect(mutate).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith(
      "Submit call off request?",
      expect.stringContaining("Submit a Sick absence request"),
      expect.any(Array),
      { cancelable: true },
    );

    confirmLatestAlert();

    expect(mutate).toHaveBeenCalledWith({
      type: "calloff",
      requesterEmpId: "emp-1",
      requesterShiftDate: "2026-04-16",
      targetEmpId: undefined,
      targetShiftDate: undefined,
      absenceTypeId: 1,
    });
  });

  it("confirms before submitting a swap request", () => {
    const mutate = vi.fn();
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate,
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Swap"));
    fireEvent.click(screen.getByText("Chris Hall"));
    fireEvent.click(screen.getByText("Submit"));

    expect(mutate).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith(
      "Submit swap request?",
      expect.stringContaining("Swap your"),
      expect.any(Array),
      { cancelable: true },
    );

    confirmLatestAlert();

    expect(mutate).toHaveBeenCalledWith({
      type: "swap",
      requesterEmpId: "emp-1",
      requesterShiftDate: "2026-04-16",
      targetEmpId: "emp-3",
      targetShiftDate: "2026-04-17",
    });
  });
});
