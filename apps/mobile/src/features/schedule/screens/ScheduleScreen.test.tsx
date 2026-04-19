import { fireEvent, render, screen } from "@testing-library/react";
import {
  afterAll,
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
  screenScrollToMock,
} from "../../../test/native";

const useQuery = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const routerPush = vi.fn();

vi.useFakeTimers();

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery,
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

beforeAll(async () => {
  const module = await import("./ScheduleScreen");
  MeScheduleScreen = module.MeScheduleScreen;
  TeamScheduleScreen = module.TeamScheduleScreen;
});

afterAll(() => {
  vi.useRealTimers();
});

describe("schedule tabs", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-04-16T12:00:00.000Z"));

    useQuery.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    routerPush.mockReset();
    screenScrollToMock.mockReset();

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
            name: "ICU",
          },
          {
            id: 3,
            name: "Telemetry",
          },
        ],
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

    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[2] === "team") {
        return {
          data: {
            entries: [
              {
                employeeId: "emp-1",
                employeeName: "Alex Kim",
                date: "2026-04-16",
                shiftCodeIds: [1],
                shiftLabel: "D",
                shiftCodeLabel: "D",
                shiftName: "Day Shift",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                displayFocusAreaName: "ICU",
                startTime: "07:00:00",
                endTime: "15:00:00",
                customStartTime: "08:00:00",
                customEndTime: "16:00:00",
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-2",
                employeeName: "Bri Shaw",
                date: "2026-04-16",
                shiftCodeIds: [3],
                shiftLabel: "G",
                shiftCodeLabel: "G",
                shiftName: "General Support",
                absenceTypeId: null,
                focusAreaId: null,
                focusAreaName: null,
                displayFocusAreaName: null,
                startTime: "09:00:00",
                endTime: "17:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-3",
                employeeName: "Chris Hall",
                date: "2026-04-16",
                shiftCodeIds: [2],
                shiftLabel: "E",
                shiftCodeLabel: "E",
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
                employeeName: "Dana Lee",
                date: "2026-04-17",
                shiftCodeIds: [],
                shiftLabel: "Off",
                shiftCodeLabel: null,
                shiftName: "Off Day",
                absenceTypeId: 1,
                focusAreaId: null,
                focusAreaName: null,
                displayFocusAreaName: null,
                startTime: null,
                endTime: null,
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
            ],
            range: {
              startDate: "2026-04-16",
              endDate: "2026-04-22",
            },
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
              shiftCodeIds: [1],
              shiftLabel: "D",
              shiftCodeLabel: "D",
              shiftName: "Day Shift",
              absenceTypeId: null,
              focusAreaId: 2,
              focusAreaName: "ICU",
              displayFocusAreaName: "ICU",
              startTime: "07:00:00",
              endTime: "15:00:00",
              customStartTime: "08:00:00",
              customEndTime: "16:00:00",
              publishedAt: "2026-04-15T18:30:00.000Z",
              publishedByName: "Mina Diaz",
            },
            {
              employeeId: "emp-1",
              employeeName: "Alex Kim",
              date: "2026-04-17",
              shiftCodeIds: [],
              shiftLabel: "Off",
              shiftCodeLabel: null,
              shiftName: "Off Day",
              absenceTypeId: 1,
              focusAreaId: null,
              focusAreaName: null,
              displayFocusAreaName: null,
              startTime: null,
              endTime: null,
              customStartTime: null,
              customEndTime: null,
              publishedAt: "2026-04-15T18:30:00.000Z",
              publishedByName: "Mina Diaz",
            },
            {
              employeeId: "emp-1",
              employeeName: "Alex Kim",
              date: "2026-04-18",
              shiftCodeIds: [2],
              shiftLabel: "E",
              shiftCodeLabel: "E",
              shiftName: "Evening Shift",
              absenceTypeId: null,
              focusAreaId: 3,
              focusAreaName: "Telemetry",
              displayFocusAreaName: "Telemetry",
              startTime: "15:00:00",
              endTime: "23:00:00",
              customStartTime: null,
              customEndTime: null,
              publishedAt: "2026-04-15T18:30:00.000Z",
              publishedByName: "Mina Diaz",
            },
          ],
          range: {
            startDate: "2026-04-16",
            endDate: "2026-04-22",
          },
        },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });
  });

  it("shows the redesigned Me overview with a hero, teammates, and up next timeline", () => {
    render(<MeScheduleScreen />);

    expect(screen.getByText("Thursday, Apr 16")).toBeInTheDocument();
    expect(screen.getByText("Good afternoon, Alex")).toBeInTheDocument();
    expect(screen.getByText("On Duty")).toBeInTheDocument();
    expect(screen.getByText("Working with you")).toBeInTheDocument();
    expect(screen.getByText("Bri Shaw")).toBeInTheDocument();
    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
    expect(screen.getByText("Up Next")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow, Apr 17")).toBeInTheDocument();
    expect(screen.getByText("Sat, Apr 18")).toBeInTheDocument();
    expect(screen.getAllByText("Evening Shift").length).toBeGreaterThan(0);
    expect(screen.getByText(/Off Day/)).toBeInTheDocument();
    expect(screen.queryByText("1 shift")).not.toBeInTheDocument();
    expect(screen.queryByText("2 shifts")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous week" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next week" })).toBeInTheDocument();
  });

  it("auto-scrolls the Me tab to the selected day on load and when the week changes", async () => {
    render(<MeScheduleScreen />);

    await vi.runAllTimersAsync();
    expect(screenScrollToMock).toHaveBeenCalledWith({
      y: expect.any(Number),
      animated: true,
    });

    screenScrollToMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));

    await vi.runAllTimersAsync();
    expect(screenScrollToMock).toHaveBeenCalledWith({
      y: expect.any(Number),
      animated: true,
    });
  });

  it("shows multi-shift entries as separate sections inside the same Me card", () => {
    useQuery.mockImplementation(() => ({
      data: {
        entries: [
          {
            employeeId: "emp-1",
            employeeName: "Alex Kim",
            date: "2026-04-16",
            shiftCodeIds: [1, 2],
            shiftLabel: "D/E",
            shiftCodeLabel: "D/E",
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
        range: {
          startDate: "2026-04-16",
          endDate: "2026-04-22",
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    }));

    render(<MeScheduleScreen />);

    const dayShift = screen.getByText("Day Shift");
    const eveningShift = screen.getByText("Evening Shift");

    expect(dayShift.closest("button")).toBe(eveningShift.closest("button"));
    expect(screen.getByText("7:30 AM - 3:30 PM")).toBeInTheDocument();
    expect(screen.getByText("3:30 PM - 11:30 PM")).toBeInTheDocument();
    expect(screen.getByText("ICU")).toBeInTheDocument();
  });

  it("opens shift detail from the Me tab with the mine source", () => {
    render(<MeScheduleScreen />);

    fireEvent.click(screen.getByText(/Day Shift/));

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/shift/[employeeId]/[date]",
      params: {
        employeeId: "emp-1",
        date: "2026-04-16",
        rangeStart: "2026-04-12",
        rangeEnd: "2026-04-18",
        source: "mine",
      },
    });
  });

  it("opens shift detail from the Schedule tab when tapping a person row", () => {
    render(<TeamScheduleScreen />);

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

  it("shows group shift times and custom-time overrides in the Schedule tab", () => {
    render(<TeamScheduleScreen />);

    expect(
      screen.getByText("Day Shift • 7:00 AM - 3:00 PM"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Day Shift • 8:00 AM - 4:00 PM"),
    ).toBeInTheDocument();
    expect(screen.getByText("AK")).toBeInTheDocument();
  });

  it("defaults the team schedule to the linked employee home focus area", () => {
    render(<TeamScheduleScreen />);

    expect(screen.queryByText("Today, Apr 16")).not.toBeInTheDocument();
    expect(screen.getAllByText("ICU")).toHaveLength(1);
    expect(screen.getByText("Alex Kim")).toBeInTheDocument();
    expect(screen.queryByText("Chris Hall")).not.toBeInTheDocument();
  });

  it("shows the active focus area on the left with three trailing buttons", () => {
    render(<TeamScheduleScreen />);

    const activeFocusArea = screen.getAllByText("ICU")[0]!;
    const filterButton = screen.getByRole("button", {
      name: "Filter focus areas",
    });
    const calendarButton = screen.getByRole("button", {
      name: "Open month calendar",
    });
    const alertsButton = screen.getByRole("button", { name: "Open alerts" });

    expect(
      activeFocusArea.compareDocumentPosition(filterButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(
      filterButton.compareDocumentPosition(calendarButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      calendarButton.compareDocumentPosition(alertsButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("uses first and last initials when a name contains a quoted nickname", () => {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[2] === "team") {
        return {
          data: {
            entries: [
              {
                employeeId: "emp-5",
                employeeName: 'Nathan "Nate" Callahan',
                date: "2026-04-16",
                shiftCodeIds: [1],
                shiftLabel: "D",
                shiftCodeLabel: "D",
                shiftName: "Day Shift",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                startTime: "07:00:00",
                endTime: "15:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
            ],
            range: {
              startDate: "2026-04-16",
              endDate: "2026-04-22",
            },
          },
          error: null,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: {
          entries: [],
          range: {
            startDate: "2026-04-16",
            endDate: "2026-04-22",
          },
        },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });

    render(<TeamScheduleScreen />);

    expect(screen.getByText("NC")).toBeInTheDocument();
  });

  it("filters the Schedule tab to only users in the selected focus area", () => {
    render(<TeamScheduleScreen />);

    fireEvent.click(
      screen.getByRole("button", { name: "Filter focus areas" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Emergency" }));

    expect(
      screen.getByText("Evening Shift • 3:00 PM - 11:00 PM"),
    ).toBeInTheDocument();
    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
    expect(screen.queryByText("Bri Shaw")).not.toBeInTheDocument();
    expect(screen.queryByText("Alex Kim")).not.toBeInTheDocument();
    expect(screen.queryByText("Day Shift")).not.toBeInTheDocument();
    expect(screen.queryByText("7:00 AM - 3:00 PM")).not.toBeInTheDocument();
  });

  it("shows all org focus areas in the filter, even without assignments on the selected day", () => {
    render(<TeamScheduleScreen />);

    expect(
      screen.queryByText("Browse by focus areas"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Filter focus areas" }),
    );

    expect(screen.getByText("Browse by focus areas")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Emergency" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ICU" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Telemetry" })).toBeInTheDocument();
  });

  it("falls back to the first org focus area when the user has no home focus area", () => {
    useBootstrap.mockReturnValue({
      data: {
        linkedEmployee: {
          id: "emp-1",
          firstName: "Alex",
          lastName: "Kim",
          status: "active",
          focusAreaIds: [],
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
            name: "ICU",
          },
          {
            id: 3,
            name: "Telemetry",
          },
        ],
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

    render(<TeamScheduleScreen />);

    expect(screen.getAllByText("Emergency").length).toBeGreaterThan(0);
    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
    expect(screen.queryByText("Alex Kim")).not.toBeInTheDocument();
  });

  it("keeps the filter button visible when the selected day only has one matching focus area", () => {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[2] === "team") {
        return {
          data: {
            entries: [
              {
                employeeId: "emp-2",
                employeeName: "Bri Shaw",
                date: "2026-04-16",
                shiftCodeIds: [3],
                shiftLabel: "G",
                shiftCodeLabel: "G",
                shiftName: "General Support",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                startTime: "09:00:00",
                endTime: "17:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-3",
                employeeName: "Chris Hall",
                date: "2026-04-17",
                shiftCodeIds: [2],
                shiftLabel: "E",
                shiftCodeLabel: "E",
                shiftName: "Evening Shift",
                absenceTypeId: null,
                focusAreaId: 1,
                focusAreaName: "Emergency",
                startTime: "15:00:00",
                endTime: "23:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
            ],
            range: {
              startDate: "2026-04-16",
              endDate: "2026-04-22",
            },
          },
          error: null,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: {
          entries: [],
          range: {
            startDate: "2026-04-16",
            endDate: "2026-04-22",
          },
        },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });

    render(<TeamScheduleScreen />);

    const filterButton = screen.getByRole("button", {
      name: "Filter focus areas",
    });
    expect(filterButton).toBeInTheDocument();

    fireEvent.click(filterButton);

    expect(screen.getByRole("button", { name: "Emergency" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ICU" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Telemetry" })).toBeInTheDocument();
  });

  it("keeps the selected focus area visible when changing to a day with no matching assignments", () => {
    render(<TeamScheduleScreen />);

    fireEvent.click(screen.getByText("17"));

    expect(screen.getAllByText("ICU").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Filter focus areas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No assignments are published for ICU on tomorrow, apr 17.",
      ),
    ).toBeInTheDocument();
  });

  it("jumps to the first matching day when selecting a focus area with no shifts on the current day", () => {
    render(<TeamScheduleScreen />);

    fireEvent.click(screen.getByText("17"));
    fireEvent.click(
      screen.getByRole("button", { name: "Filter focus areas" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Emergency" }));

    expect(
      screen.queryByText(
        "No assignments are published for ICU on tomorrow, apr 17.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
    expect(screen.getAllByText("Emergency").length).toBeGreaterThan(0);
  });

  it("shows the active focus area and filter button when bootstrap focus areas are missing", () => {
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
            focusArea: "Wings",
          },
        },
        focusAreas: [],
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

    render(<TeamScheduleScreen />);

    expect(screen.getAllByText("ICU").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Filter focus areas" })).toBeInTheDocument();
    expect(screen.queryByText("Wings")).not.toBeInTheDocument();
  });

  it("shows schedule shifts grouped by category in ascending time order", () => {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[2] === "team") {
        return {
          data: {
            entries: [
              {
                employeeId: "emp-1",
                employeeName: "Alex Kim",
                date: "2026-04-16",
                shiftCodeIds: [1],
                shiftLabel: "D",
                shiftCodeLabel: "D",
                shiftName: "Day Shift",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                startTime: "07:00:00",
                endTime: "15:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-2",
                employeeName: "Bri Shaw",
                date: "2026-04-16",
                shiftCodeIds: [3],
                shiftLabel: "G",
                shiftCodeLabel: "G",
                shiftName: "General Support",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                startTime: "09:00:00",
                endTime: "17:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-3",
                employeeName: "Chris Hall",
                date: "2026-04-16",
                shiftCodeIds: [2],
                shiftLabel: "E",
                shiftCodeLabel: "E",
                shiftName: "Evening Shift",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                startTime: "15:00:00",
                endTime: "23:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
            ],
            range: {
              startDate: "2026-04-16",
              endDate: "2026-04-22",
            },
          },
          error: null,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: {
          entries: [],
          range: {
            startDate: "2026-04-16",
            endDate: "2026-04-22",
          },
        },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });

    render(<TeamScheduleScreen />);

    const dayGroup = screen.getByText("Day Shift • 7:00 AM - 3:00 PM");
    const supportGroup = screen.getByText(
      "General Support • 9:00 AM - 5:00 PM",
    );
    const eveningGroup = screen.getByText(
      "Evening Shift • 3:00 PM - 11:00 PM",
    );

    expect(
      dayGroup.compareDocumentPosition(supportGroup) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      supportGroup.compareDocumentPosition(eveningGroup) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens alerts from the schedule header bell", () => {
    render(<TeamScheduleScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Open alerts" }));

    expect(routerPush).toHaveBeenCalledWith("/alerts");
  });

  it("opens the month calendar and jumps to a selected date", () => {
    render(<TeamScheduleScreen />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open month calendar" }),
    );

    expect(screen.getByText("April 2026")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dismiss month calendar" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Sun").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Mon").length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("button", { name: "Next month" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Select date 2026-05-05" }),
    );

    expect(
      screen.getByText("No assignments are published for ICU on tue, may 5."),
    ).toBeInTheDocument();
    expect(screen.queryByText("May 2026")).not.toBeInTheDocument();
  });

  it("shows a restricted state if the Schedule tab is opened without permission", () => {
    useBootstrap.mockReturnValue({
      data: {
        linkedEmployee: {
          id: "emp-1",
          focusAreaIds: [],
        },
        currentOrg: {
          timezone: null,
          shiftDisplayMode: "code",
          labels: {
            focusArea: "Focus Areas",
          },
        },
        focusAreas: [],
        effectiveRole: "user",
        permissions: {
          canApproveShiftRequests: false,
          canManageEmployees: false,
        },
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<TeamScheduleScreen />);

    expect(screen.getByText("Team schedule unavailable")).toBeInTheDocument();
  });
});
