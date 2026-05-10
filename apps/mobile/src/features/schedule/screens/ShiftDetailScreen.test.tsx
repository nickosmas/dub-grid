import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

let ShiftDetailScreen: (typeof import("./ShiftDetailScreen"))["default"];

beforeAll(async () => {
  ShiftDetailScreen = (await import("./ShiftDetailScreen")).default;
});

describe("ShiftDetailScreen", () => {
  function confirmDialog(label: string) {
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", { name: label }),
    );
  }

  function selectFridaySwapDate() {
    fireEvent.click(
      screen.getByLabelText(
        "Show eligible teammates for Friday, April 17, 2026",
      ),
    );
  }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-04-15T19:00:00.000Z"));
    useMutation.mockReset();
    useQuery.mockReset();
    useQueryClient.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    useLocalSearchParams.mockReset();
    pushToast.mockReset();
    routerReplace.mockReset();

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
          focusAreaIds: [1, 2],
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
          canViewSchedule: true,
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

      if (queryKey[1] === "people") {
        return {
          data: {
            people: [
              {
                id: "emp-1",
                firstName: "Alex",
                lastName: "Kim",
                employmentType: "full_time",
                status: "active",
                statusChangedAt: null,
                statusNote: "",
                certificationId: null,
                roleIds: [],
                seniority: 2,
                focusAreaIds: [1, 2],
                phone: "",
                email: "alex@example.com",
                contactNotes: "",
                userId: null,
                departmentIds: [],
                deptAdminIds: [],
                version: 0,
                pendingInvitation: null,
              },
              {
                id: "emp-6",
                firstName: "Jordan",
                lastName: "Lee",
                employmentType: "full_time",
                status: "active",
                statusChangedAt: null,
                statusNote: "",
                certificationId: null,
                roleIds: [],
                seniority: 3,
                focusAreaIds: [2],
                phone: "",
                email: "jordan@example.com",
                contactNotes: "",
                userId: null,
                departmentIds: [],
                deptAdminIds: [],
                version: 0,
                pendingInvitation: null,
              },
              {
                id: "emp-8",
                firstName: "Zoe",
                lastName: "Adams",
                employmentType: "full_time",
                status: "active",
                statusChangedAt: null,
                statusNote: "",
                certificationId: null,
                roleIds: [],
                seniority: 1,
                focusAreaIds: [2],
                phone: "",
                email: "zoe@example.com",
                contactNotes: "",
                userId: null,
                departmentIds: [],
                deptAdminIds: [],
                version: 0,
                pendingInvitation: null,
              },
            ],
          },
          error: null,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      if (queryKey[2] === "team" || queryKey[1] === "shift-swap-options") {
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
                employeeFocusAreaIds: [1, 2],
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
                employeeFocusAreaIds: [1, 2],
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
                employeeFocusAreaIds: [1, 2],
                displayFocusAreaName: "Emergency",
                startTime: "15:00:00",
                endTime: "23:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-6",
                employeeName: "Jordan Lee",
                date: "2026-04-16",
                assignmentIds: [1],
                shiftLabel: "D",
                assignmentLabel: "D",
                shiftName: "Day Shift",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                employeeFocusAreaIds: [2],
                displayFocusAreaName: "ICU",
                startTime: "07:00:00",
                endTime: "15:00:00",
                customStartTime: null,
                customEndTime: null,
                segments: [
                  {
                    shiftName: "Day Shift",
                    jobName: "Nurse",
                    jobColor: "#ECFEFF",
                    jobBorderColor: "#A5F3FC",
                    jobTextColor: "#0E7490",
                    startTime: "07:00:00",
                    endTime: "15:00:00",
                    displayFocusAreaName: "ICU",
                  },
                ],
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-4",
                employeeName: "Sam Rivera",
                date: "2026-04-30",
                assignmentIds: [2],
                shiftLabel: "E",
                assignmentLabel: "E",
                shiftName: "Evening Shift",
                absenceTypeId: null,
                focusAreaId: 1,
                focusAreaName: "Emergency",
                employeeFocusAreaIds: [1, 2],
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
              employeeFocusAreaIds: [1, 2],
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
                  isMentored: true,
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows concise metadata and flat shiftmates for the selected shift", () => {
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    expect(screen.getByLabelText("Thu, Apr 16")).toBeInTheDocument();
    expect(
      screen.queryByText("Thursday, April 16, 2026"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Published Apr 15, 2026, 11:30 AM by Mina Diaz"),
    ).toBeInTheDocument();
    expect(screen.getByText("Mentor")).toBeInTheDocument();
    expect(screen.getByText("(Mentored)")).toBeInTheDocument();
    const mentoredJobPill = screen.getByLabelText(
      "Job Mentor mentored assignment",
    );
    expect(mentoredJobPill).toHaveTextContent("Mentor");
    expect(mentoredJobPill).toHaveTextContent("(Mentored)");
    expect(mentoredJobPill).not.toHaveTextContent("(MENTORED)");
    expect(screen.getByText("ICU")).toBeInTheDocument();
    expect(screen.getByLabelText("Focus area ICU")).toBeInTheDocument();
    expect(screen.getByText("Working with")).toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
    expect(screen.getByText("Nurse")).toBeInTheDocument();
    expect(screen.queryByText("Bri Shaw")).not.toBeInTheDocument();
    expect(screen.queryByText("Emergency")).not.toBeInTheDocument();
    expect(screen.getByText("Jordan Lee").closest("article")).toBeNull();
    const detailCardText = screen.getByTestId("shift-detail-card").textContent;
    expect(detailCardText).toBeDefined();
    expect(detailCardText!.indexOf("Day Shift")).toBeLessThan(
      detailCardText!.indexOf("Mentor"),
    );
    expect(detailCardText!.indexOf("Mentor")).toBeLessThan(
      detailCardText!.indexOf("ICU"),
    );
    expect(detailCardText!.indexOf("ICU")).toBeLessThan(
      detailCardText!.indexOf("7:00 AM - 3:00 PM"),
    );
    expect(screen.queryByText("Published by")).not.toBeInTheDocument();
    expect(screen.queryByText("Focus Areas")).not.toBeInTheDocument();
    expect(screen.queryByText("Employee")).not.toBeInTheDocument();
    expect(screen.queryByText("Alex Kim")).not.toBeInTheDocument();
  });

  it("does not show Working with for general shifts", () => {
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

      if (queryKey[2] === "team" || queryKey[1] === "shift-swap-options") {
        return {
          data: {
            entries: [
              {
                employeeId: "emp-2",
                employeeName: "Bri Shaw",
                date: "2026-04-16",
                assignmentIds: [30],
                shiftLabel: "ADM",
                assignmentLabel: "ADM",
                shiftName: "Admin",
                absenceTypeId: null,
                focusAreaId: null,
                focusAreaName: null,
                displayFocusAreaName: null,
                startTime: "09:00:00",
                endTime: "17:00:00",
                customStartTime: null,
                customEndTime: null,
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
              assignmentIds: [30],
              shiftLabel: "ADM",
              assignmentLabel: "ADM",
              shiftName: "Admin",
              absenceTypeId: null,
              focusAreaId: null,
              focusAreaName: null,
              displayFocusAreaName: null,
              startTime: "09:00:00",
              endTime: "17:00:00",
              customStartTime: null,
              customEndTime: null,
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

    expect(screen.queryByText("Working with")).not.toBeInTheDocument();
    expect(screen.queryByText("Bri Shaw")).not.toBeInTheDocument();
    expect(screen.getByText("General shift")).toBeInTheDocument();
    expect(screen.getByLabelText("General shift Admin")).toBeInTheDocument();
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

    expect(screen.getByText("Day Shift")).toBeInTheDocument();
    expect(screen.getByText("Bri Shaw")).toBeInTheDocument();
    expect(screen.getByLabelText("Focus area Emergency")).toBeInTheDocument();
    expect(screen.getAllByText("7:00 AM - 3:00 PM").length).toBeGreaterThan(0);
    const detailCardText = screen.getByTestId("shift-detail-card").textContent;
    expect(detailCardText).toBeDefined();
    expect(detailCardText!.indexOf("Day Shift")).toBeLessThan(
      detailCardText!.indexOf("Supervisor"),
    );
    expect(detailCardText!.indexOf("Supervisor")).toBeLessThan(
      detailCardText!.indexOf("Bri Shaw"),
    );
    expect(detailCardText!.indexOf("Bri Shaw")).toBeLessThan(
      detailCardText!.indexOf("Emergency"),
    );
    expect(detailCardText!.indexOf("Emergency")).toBeLessThan(
      detailCardText!.indexOf("7:00 AM - 3:00 PM"),
    );
    expect(detailCardText!.indexOf("Bri Shaw")).toBeGreaterThan(
      detailCardText!.indexOf("Day Shift"),
    );
    expect(screen.queryByText("Time")).not.toBeInTheDocument();
  });

  it("shows me as a shiftmate on another employee's shift detail", () => {
    const viewedEntry = {
      employeeId: "emp-2",
      employeeName: "Bri Shaw",
      date: "2026-04-16",
      assignmentIds: [2],
      shiftIds: [2],
      shiftLabel: "E",
      assignmentLabel: "E",
      shiftName: "Evening Shift",
      absenceTypeId: null,
      focusAreaId: 1,
      focusAreaName: "Emergency",
      employeeFocusAreaIds: [1, 2],
      displayFocusAreaName: "Emergency",
      startTime: "15:00:00",
      endTime: "23:00:00",
      customStartTime: null,
      customEndTime: null,
      segments: [
        {
          shiftId: 2,
          shiftName: "Evening Shift",
          jobName: "Supervisor",
          startTime: "15:00:00",
          endTime: "23:00:00",
          displayFocusAreaName: "Emergency",
        },
      ],
      publishedAt: "2026-04-15T18:30:00.000Z",
      publishedByName: "Mina Diaz",
    };
    const myEarlierEntry = {
      employeeId: "emp-1",
      employeeName: "Alex Kim",
      date: "2026-04-16",
      assignmentIds: [1],
      shiftIds: [1],
      shiftLabel: "D",
      assignmentLabel: "D",
      shiftName: "Day Shift",
      absenceTypeId: null,
      focusAreaId: 1,
      focusAreaName: "Emergency",
      employeeFocusAreaIds: [1, 2],
      displayFocusAreaName: "Emergency",
      startTime: "07:00:00",
      endTime: "15:00:00",
      customStartTime: null,
      customEndTime: null,
      segments: [
        {
          shiftId: 1,
          shiftName: "Day Shift",
          jobName: "Nurse",
          startTime: "07:00:00",
          endTime: "15:00:00",
          displayFocusAreaName: "ICU",
        },
      ],
      publishedAt: "2026-04-15T18:30:00.000Z",
      publishedByName: "Mina Diaz",
    };
    const myEntry = {
      employeeId: "emp-1",
      employeeName: "Alex Kim",
      date: "2026-04-16",
      assignmentIds: [2],
      shiftIds: [2],
      shiftLabel: "E",
      assignmentLabel: "E",
      shiftName: "Evening Shift",
      absenceTypeId: null,
      focusAreaId: 1,
      focusAreaName: "Emergency",
      employeeFocusAreaIds: [1, 2],
      displayFocusAreaName: "Emergency",
      startTime: "15:00:00",
      endTime: "23:00:00",
      customStartTime: null,
      customEndTime: null,
      segments: [
        {
          shiftId: 2,
          shiftName: "Evening Shift",
          jobName: "Mentor",
          startTime: "15:00:00",
          endTime: "23:00:00",
          displayFocusAreaName: "Emergency",
        },
      ],
      publishedAt: "2026-04-15T18:30:00.000Z",
      publishedByName: "Mina Diaz",
    };

    useLocalSearchParams.mockReturnValue({
      employeeId: "emp-2",
      date: "2026-04-16",
      rangeStart: "2026-04-16",
      rangeEnd: "2026-04-22",
      source: "team",
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

      if (queryKey[2] === "team" || queryKey[1] === "shift-swap-options") {
        return {
          data: {
            entries: [viewedEntry],
          },
          error: null,
          isFetching: false,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: {
          entries: [myEarlierEntry, myEntry],
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

    expect(screen.getByText("Bri Shaw")).toBeInTheDocument();
    expect(screen.getByText("Working with")).toBeInTheDocument();
    expect(screen.getByText("Me")).toBeInTheDocument();
    expect(screen.queryByText("Alex Kim")).not.toBeInTheDocument();
    expect(screen.getByText("Mentor")).toBeInTheDocument();
  });

  it("shows multi-shift detail segments inside the same card", () => {
    const selectedEntry = {
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
          shiftId: 1,
          shiftName: "Day Shift",
          jobName: "Nurse",
          startTime: "07:30:00",
          endTime: "15:30:00",
          displayFocusAreaName: "ICU",
        },
        {
          shiftId: 2,
          shiftName: "Evening Shift",
          startTime: "15:30:00",
          endTime: "23:30:00",
          displayFocusAreaName: null,
          isMentored: true,
        },
      ],
      publishedAt: "2026-04-15T18:30:00.000Z",
      publishedByName: "Mina Diaz",
    };
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

      if (queryKey[2] === "team" || queryKey[1] === "shift-swap-options") {
        return {
          data: {
            entries: [
              selectedEntry,
              {
                employeeId: "emp-2",
                employeeName: "Bri Shaw",
                date: "2026-04-16",
                shiftName: "Day Shift",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                displayFocusAreaName: "ICU",
                employeeFocusAreaIds: [2],
                startTime: "07:30:00",
                endTime: "15:30:00",
                segments: [
                  {
                    shiftId: 1,
                    shiftName: "Day Shift",
                    jobName: "Nurse",
                    startTime: "07:30:00",
                    endTime: "15:30:00",
                    displayFocusAreaName: "ICU",
                  },
                ],
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-3",
                employeeName: "Chris Hall",
                date: "2026-04-16",
                shiftName: "Evening Shift",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                displayFocusAreaName: "ICU",
                employeeFocusAreaIds: [2],
                startTime: "15:30:00",
                endTime: "23:30:00",
                segments: [
                  {
                    shiftId: 2,
                    shiftName: "Evening Shift",
                    jobName: "Lead",
                    startTime: "15:30:00",
                    endTime: "23:30:00",
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
      }

      return {
        data: {
          entries: [selectedEntry],
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

    expect(screen.getByText("Multiple Shifts")).toBeInTheDocument();
    expect(screen.getByLabelText("Multiple Shifts, 2 shifts")).toBeInTheDocument();
    expect(screen.getByText("Working with")).toBeInTheDocument();
    expect(screen.queryByText("Shiftmates")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Shift 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Shift 2")).toBeInTheDocument();
    expect(
      screen.getByText("Drop and swap actions apply to the shift you choose."),
    ).toBeInTheDocument();
    const detailCard = screen.getByTestId("shift-detail-card");

    expect(detailCard).toHaveTextContent("Day Shift");
    expect(detailCard).toHaveTextContent("Evening Shift");
    expect(detailCard).not.toHaveTextContent("Shift 1");
    expect(detailCard).not.toHaveTextContent("Shift 2");
    expect(screen.getAllByText("7:30 AM - 3:30 PM").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3:30 PM - 11:30 PM").length).toBeGreaterThan(0);
    expect(screen.getByText("Bri Shaw")).toBeInTheDocument();
    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
    expect(screen.getByLabelText("Mentored assignment")).toHaveTextContent(
      "Mentored",
    );
    expect(screen.queryByText("(Mentored)")).not.toBeInTheDocument();
    expect(screen.getAllByText("ICU").length).toBeGreaterThan(0);
  });

  it("does not show drop and swap split-shift guidance for another employee", () => {
    const selectedEntry = {
      employeeId: "emp-2",
      employeeName: "Bri Shaw",
      date: "2026-04-16",
      assignmentIds: [1, 2],
      shiftLabel: "D/E",
      assignmentLabel: "D/E",
      shiftName: "Day Shift / Evening Shift",
      absenceTypeId: null,
      focusAreaId: 2,
      focusAreaName: "ICU",
      displayFocusAreaName: "ICU",
      employeeFocusAreaIds: [2],
      startTime: "07:30:00",
      endTime: "23:30:00",
      segments: [
        {
          shiftId: 1,
          shiftName: "Day Shift",
          jobName: "Nurse",
          startTime: "07:30:00",
          endTime: "15:30:00",
          displayFocusAreaName: "ICU",
        },
        {
          shiftId: 2,
          shiftName: "Evening Shift",
          jobName: "Lead",
          startTime: "15:30:00",
          endTime: "23:30:00",
          displayFocusAreaName: "ICU",
        },
      ],
      publishedAt: "2026-04-15T18:30:00.000Z",
      publishedByName: "Mina Diaz",
    };

    useLocalSearchParams.mockReturnValue({
      employeeId: "emp-2",
      date: "2026-04-16",
      rangeStart: "2026-04-16",
      rangeEnd: "2026-04-22",
      source: "team",
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

      if (queryKey[2] === "team" || queryKey[1] === "shift-swap-options") {
        return {
          data: {
            entries: [selectedEntry],
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

    expect(screen.getByText("Multiple Shifts")).toBeInTheDocument();
    expect(screen.getByText("Bri Shaw")).toBeInTheDocument();
    expect(
      screen.queryByText("Drop and swap actions apply to the shift you choose."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Drop shift")).not.toBeInTheDocument();
    expect(screen.queryByText("Swap")).not.toBeInTheDocument();
  });

  it("keeps absence names as the detail card heading with an under-title type pill", () => {
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
    expect(screen.queryByText("Working with")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Shift actions unavailable"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Custom times unavailable"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Absence")).toBeInTheDocument();
    expect(screen.getByText("Off Day")).toBeInTheDocument();
    expect(screen.getByLabelText("Absence Off Day")).toBeInTheDocument();
    expect(screen.getByLabelText("Absence Off Day")).toHaveTextContent(
      "Absence",
    );
    expect(screen.getByLabelText("Absence Off Day")).not.toHaveTextContent(
      "Off Day",
    );
  });

  it("keeps general shift names as the detail card heading with an under-title type pill", () => {
    useQuery.mockImplementation(() => ({
      data: {
        entries: [
          {
            employeeId: "emp-1",
            employeeName: "Alex Kim",
            date: "2026-04-16",
            assignmentIds: [30],
            shiftLabel: "ADM",
            assignmentLabel: "ADM",
            shiftName: "Admin",
            absenceTypeId: null,
            focusAreaId: null,
            focusAreaName: null,
            startTime: "09:00:00",
            endTime: "17:00:00",
            customStartTime: null,
            customEndTime: null,
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

    expect(screen.getByText("General shift")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByLabelText("General shift Admin")).toBeInTheDocument();
    expect(screen.getByLabelText("General shift Admin")).toHaveTextContent(
      "General shift",
    );
    expect(screen.getByLabelText("General shift Admin")).not.toHaveTextContent(
      "Admin",
    );
  });

  it("filters swap options behind a horizontal date selector", () => {
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
    expect(screen.getByLabelText("Eligible swap dates")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Show eligible teammates for Sunday, April 12, 2026",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Show eligible teammates for Friday, April 17, 2026",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Show eligible teammates for Saturday, April 18, 2026",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Show eligible teammates for Friday, April 17, 2026",
      ),
    ).toHaveAttribute("aria-selected", "true");

    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
    expect(screen.getByText("Evening Shift")).toBeInTheDocument();
    expect(screen.queryByText("Shift")).not.toBeInTheDocument();
    expect(screen.queryByText("E")).not.toBeInTheDocument();
    expect(screen.getByText("3:00 PM - 11:00 PM")).toBeInTheDocument();
    expect(screen.getAllByText("Emergency").length).toBeGreaterThan(0);
    expect(screen.queryByText("Submit")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Choose a teammate shift"),
    ).not.toBeInTheDocument();
  });

  it("keeps the swap teammate query within the mobile schedule range limit", () => {
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Swap"));

    const swapOptionsQueryKeys = useQuery.mock.calls
      .map(([options]) => (options as { queryKey?: unknown[] }).queryKey)
      .filter((queryKey) => queryKey?.[1] === "shift-swap-options");

    expect(swapOptionsQueryKeys.at(-1)).toEqual([
      "mobile",
      "shift-swap-options",
      "token-123",
      "emp-1",
      "2026-04-16",
      "2026-04-16",
      "2026-05-16",
    ]);
  });

  it("only navigates swap weeks that contain eligible teammates", () => {
    useLocalSearchParams.mockReturnValue({
      employeeId: "emp-1",
      date: "2026-04-16",
      rangeStart: "2026-04-12",
      rangeEnd: "2026-04-18",
      source: "mine",
    });
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Swap"));

    expect(
      screen.getByLabelText(
        "Show eligible teammates for Sunday, April 12, 2026",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Apr 12 - Apr 18")).toBeInTheDocument();
    const nextWeekButton = screen.getByRole("button", {
      name: "Go to next week",
    });
    expect(nextWeekButton).not.toBeDisabled();
    expect(
      screen.queryByLabelText(
        "Show eligible teammates for Thursday, April 23, 2026",
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(nextWeekButton);

    const selectedDate = screen.getByLabelText(
      "Show eligible teammates for Thursday, April 30, 2026",
    );
    expect(selectedDate).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Apr 26 - May 2")).toBeInTheDocument();
    expect(screen.getByText("Sam Rivera")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to next week" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Go to previous week" }),
    ).not.toBeDisabled();
  });

  it("shows shift actions when published-shift metadata is missing", () => {
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

    expect(screen.getByText("Drop shift")).toBeInTheDocument();
    expect(screen.getByText("Swap")).toBeInTheDocument();
  });

  it("hides shift actions for an ongoing shift", () => {
    useLocalSearchParams.mockReturnValue({
      employeeId: "emp-1",
      date: "2026-04-15",
      rangeStart: "2026-04-15",
      rangeEnd: "2026-04-22",
      source: "mine",
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

      if (queryKey[2] === "team" || queryKey[1] === "shift-swap-options") {
        return {
          data: {
            entries: [
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
                employeeFocusAreaIds: [1, 2],
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
              date: "2026-04-15",
              assignmentIds: [1],
              shiftLabel: "D",
              assignmentLabel: "D",
              shiftName: "Day Shift",
              absenceTypeId: null,
              focusAreaId: 2,
              focusAreaName: "ICU",
              employeeFocusAreaIds: [1, 2],
              displayFocusAreaName: "ICU",
              startTime: "07:00:00",
              endTime: "15:00:00",
              customStartTime: null,
              customEndTime: null,
              publishedAt: "2026-04-14T18:30:00.000Z",
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

      if (queryKey[2] === "team" || queryKey[1] === "shift-swap-options") {
        return {
          data: {
            entries: [
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
                employeeFocusAreaIds: [1, 2],
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

  it("filters swap options to meaningful teammate worked shifts only", () => {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[2] === "team" || queryKey[1] === "shift-swap-options") {
        return {
          data: {
            entries: [
              {
                employeeId: "emp-2",
                employeeName: "Bri Shaw",
                date: "2026-04-16",
                assignmentIds: [1],
                shiftLabel: "E",
                assignmentLabel: "E",
                shiftName: "Evening Shift",
                absenceTypeId: null,
                focusAreaId: 1,
                focusAreaName: "Emergency",
                employeeFocusAreaIds: [1, 2],
                displayFocusAreaName: "Emergency",
                startTime: "15:00:00",
                endTime: "23:00:00",
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
                employeeFocusAreaIds: [1, 2],
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
                employeeFocusAreaIds: [1, 2],
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
              employeeFocusAreaIds: [1, 2],
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

    expect(
      screen.getByLabelText(
        "Show eligible teammates for Thursday, April 16, 2026",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Bri Shaw")).toBeInTheDocument();
    expect(screen.queryByText("Chris Hall")).not.toBeInTheDocument();
    expect(screen.queryByText("Dana Moss")).not.toBeInTheDocument();
    expect(screen.queryByText("Evan Cole")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByLabelText(
        "Show eligible teammates for Friday, April 17, 2026",
      ),
    );

    expect(screen.queryByText("Bri Shaw")).not.toBeInTheDocument();
    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
    expect(screen.getByText("Dana Moss")).toBeInTheDocument();
    expect(screen.queryByText("Evan Cole")).not.toBeInTheDocument();
  });

  it("omits teammate shifts that are already in progress from swap options", () => {
    useLocalSearchParams.mockReturnValue({
      employeeId: "emp-1",
      date: "2026-04-16",
      rangeStart: "2026-04-15",
      rangeEnd: "2026-04-22",
      source: "mine",
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

      if (queryKey[2] === "team" || queryKey[1] === "shift-swap-options") {
        return {
          data: {
            entries: [
              {
                employeeId: "emp-2",
                employeeName: "Bri Shaw",
                date: "2026-04-15",
                assignmentIds: [1],
                shiftLabel: "D",
                assignmentLabel: "D",
                shiftName: "Day Shift",
                absenceTypeId: null,
                focusAreaId: 1,
                focusAreaName: "Emergency",
                employeeFocusAreaIds: [1, 2],
                displayFocusAreaName: "Emergency",
                startTime: "07:00:00",
                endTime: "15:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-14T18:30:00.000Z",
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
                employeeFocusAreaIds: [1, 2],
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
              employeeFocusAreaIds: [1, 2],
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

    expect(screen.queryByText("Bri Shaw")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Eligible swap dates")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Show eligible teammates for Wednesday, April 15, 2026",
      ),
    ).toBeInTheDocument();

    selectFridaySwapDate();

    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
  });

  it("shows the selected swap as a give and get trade", () => {
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate: vi.fn(),
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Swap"));
    selectFridaySwapDate();
    fireEvent.click(screen.getByText("Chris Hall"));

    expect(screen.getByText("You give")).toBeInTheDocument();
    expect(screen.getByText("You get")).toBeInTheDocument();
    expect(screen.getByText("From Chris Hall")).toBeInTheDocument();
    expect(screen.getByText("7:00 AM - 3:00 PM · ICU")).toBeInTheDocument();
    expect(
      screen.getByText("3:00 PM - 11:00 PM · Emergency"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Eligible swap dates"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Back to eligible teammates"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Back")).toHaveLength(1);
    expect(screen.getByText("Submit")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Review the trade below, then submit your swap request.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Back"));

    expect(screen.getByLabelText("Eligible swap dates")).toBeInTheDocument();
    expect(screen.queryByText("You get")).not.toBeInTheDocument();
    expect(screen.getByText("Chris Hall")).toBeInTheDocument();
  });

  it("does not seek into unloaded future swap weeks", () => {
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

      if (queryKey[2] === "team" || queryKey[1] === "shift-swap-options") {
        return {
          data: {
            entries: [
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
                employeeFocusAreaIds: [1, 2],
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

      if (queryKey[4] === "2026-04-29") {
        return {
          data: {
            entries: [],
          },
          error: null,
          isFetching: true,
          isLoading: true,
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
              employeeFocusAreaIds: [1, 2],
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
    const nextWeekButton = screen.getByRole("button", {
      name: "Go to next week",
    });

    expect(nextWeekButton).toBeDisabled();
    fireEvent.click(nextWeekButton);

    expect(
      screen.queryByText("Refreshing shift details."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Your shift")).toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Offer to everyone"));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Offer shift for pickup?")).toBeInTheDocument();
    expect(screen.getByText(/Offer your/)).toBeInTheDocument();

    confirmDialog("Offer for pickup");

    expect(mutate).toHaveBeenCalledWith({
      type: "pickup",
      requesterEmpId: "emp-1",
      requesterShiftDate: "2026-04-16",
      targetEmpId: undefined,
      targetShiftDate: undefined,
      absenceTypeId: undefined,
    });
  });

  it("creates a pickup request for an upcoming segment when an earlier segment is in progress", () => {
    const mutate = vi.fn();
    useLocalSearchParams.mockReturnValue({
      employeeId: "emp-1",
      date: "2026-04-15",
      rangeStart: "2026-04-15",
      rangeEnd: "2026-04-21",
      source: "mine",
    });
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate,
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

      const entries = [
        {
          employeeId: "emp-1",
          employeeName: "Alex Kim",
          date: "2026-04-15",
          assignmentIds: [1, 2],
          shiftLabel: "D/E",
          assignmentLabel: "D/E",
          shiftName: "Day Shift / Evening Shift",
          absenceTypeId: null,
          focusAreaId: 2,
          focusAreaName: "ICU",
          employeeFocusAreaIds: [1, 2],
          displayFocusAreaName: "ICU",
          startTime: "07:00:00",
          endTime: "23:00:00",
          customStartTime: null,
          customEndTime: null,
          segments: [
            {
              shiftName: "Day Shift",
              jobName: "Mentor",
              startTime: "07:00:00",
              endTime: "15:00:00",
              displayFocusAreaName: "ICU",
            },
            {
              shiftName: "Evening Shift",
              jobName: "Mentor",
              startTime: "15:00:00",
              endTime: "23:00:00",
              displayFocusAreaName: "ICU",
            },
          ],
          publishedAt: "2026-04-14T18:30:00.000Z",
          publishedByName: "Mina Diaz",
        },
      ];

      return {
        data: { entries },
        error: null,
        isFetching: false,
        isLoading: false,
        refetch: vi.fn(),
      };
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Drop shift"));
    expect(
      screen.getByRole("button", {
        name: /Shift 1: Day Shift \(7:00 AM - 3:00 PM\) · In progress/i,
      }),
    ).toBeDisabled();
    fireEvent.click(screen.getByText("Offer for pickup"));
    fireEvent.click(screen.getByText("Offer to everyone"));
    confirmDialog("Offer for pickup");

    expect(mutate).toHaveBeenCalledWith({
      type: "pickup",
      requesterEmpId: "emp-1",
      requesterShiftDate: "2026-04-15",
      requesterSegmentIndex: 1,
      targetEmpId: undefined,
      targetShiftDate: undefined,
      absenceTypeId: undefined,
    });
  });

  it("creates a targeted pickup request for an absent teammate", () => {
    const mutate = vi.fn();
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

      if (queryKey[2] === "team" || queryKey[1] === "shift-swap-options") {
        return {
          data: {
            entries: [
              {
                employeeId: "emp-6",
                employeeName: "Jordan Lee",
                employeeSeniority: null,
                date: "2026-04-16",
                assignmentIds: [],
                shiftLabel: "PTO",
                assignmentLabel: null,
                shiftName: "PTO",
                absenceTypeId: 1,
                focusAreaId: null,
                focusAreaName: null,
                employeeFocusAreaIds: [2],
                displayFocusAreaName: null,
                startTime: null,
                endTime: null,
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-8",
                employeeName: "Zoe Adams",
                employeeSeniority: null,
                date: "2026-04-16",
                assignmentIds: [],
                shiftLabel: "PTO",
                assignmentLabel: null,
                shiftName: "PTO",
                absenceTypeId: 1,
                focusAreaId: null,
                focusAreaName: null,
                employeeFocusAreaIds: [2],
                displayFocusAreaName: null,
                startTime: null,
                endTime: null,
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-6",
                employeeName: "Jordan Lee",
                employeeSeniority: 3,
                date: "2026-04-18",
                assignmentIds: [2],
                shiftLabel: "E",
                assignmentLabel: "E",
                shiftName: "Evening Shift",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                employeeFocusAreaIds: [2],
                displayFocusAreaName: "ICU",
                startTime: "15:00:00",
                endTime: "23:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-8",
                employeeName: "Zoe Adams",
                employeeSeniority: 1,
                date: "2026-04-18",
                assignmentIds: [1],
                shiftLabel: "D",
                assignmentLabel: "D",
                shiftName: "Day Shift",
                absenceTypeId: null,
                focusAreaId: 2,
                focusAreaName: "ICU",
                employeeFocusAreaIds: [2],
                displayFocusAreaName: "ICU",
                startTime: "07:00:00",
                endTime: "15:00:00",
                customStartTime: null,
                customEndTime: null,
                publishedAt: "2026-04-15T18:30:00.000Z",
                publishedByName: "Mina Diaz",
              },
              {
                employeeId: "emp-7",
                employeeName: "Sam Worker",
                date: "2026-04-16",
                assignmentIds: [2],
                shiftLabel: "E",
                assignmentLabel: "E",
                shiftName: "Evening Shift",
                absenceTypeId: null,
                focusAreaId: 1,
                focusAreaName: "Emergency",
                employeeFocusAreaIds: [1, 2],
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
              employeeFocusAreaIds: [1, 2],
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
      mutate,
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Drop shift"));
    fireEvent.click(screen.getByText("Offer for pickup"));

    expect(screen.getByText("Request specific person")).toBeInTheDocument();
    expect(screen.queryByText("Previous week")).not.toBeInTheDocument();
    expect(screen.queryByText("Next week")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Eligible pickup dates")).not.toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();
    expect(screen.getByText("Zoe Adams")).toBeInTheDocument();
    expect(screen.getAllByText("Sick").length).toBeGreaterThan(0);
    expect(screen.queryByText("PTO")).not.toBeInTheDocument();
    expect(screen.queryByText("Sam Worker")).not.toBeInTheDocument();
    const zoeRow = screen.getByText("Zoe Adams");
    const jordanRow = screen.getByText("Jordan Lee");
    expect(
      zoeRow.compareDocumentPosition(jordanRow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByText("Jordan Lee"));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Request pickup?")).toBeInTheDocument();
    expect(
      screen.getByText(/Ask Jordan Lee to pick up your/),
    ).toBeInTheDocument();

    confirmDialog("Request pickup");

    expect(mutate).toHaveBeenCalledWith({
      type: "pickup",
      requesterEmpId: "emp-1",
      requesterShiftDate: "2026-04-16",
      targetEmpId: "emp-6",
      targetShiftDate: "2026-04-16",
      absenceTypeId: 1,
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
    expect(screen.getByText("Submit call off request?")).toBeInTheDocument();
    expect(
      screen.getByText(/Submit a Sick absence request/),
    ).toBeInTheDocument();

    confirmDialog("Submit call off");

    expect(mutate).toHaveBeenCalledWith({
      type: "calloff",
      requesterEmpId: "emp-1",
      requesterShiftDate: "2026-04-16",
      targetEmpId: undefined,
      targetShiftDate: undefined,
      absenceTypeId: 1,
    });
  });

  it("spells out absence reasons when the absence type has a full name", () => {
    const mutate = vi.fn();
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
          canViewSchedule: true,
          canApproveShiftRequests: true,
          canManageEmployees: true,
        },
        absenceTypes: [
          {
            id: 1,
            label: "PTO",
            name: "Paid time off",
          },
        ],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    useMutation.mockReturnValue({
      error: null,
      isPending: false,
      mutate,
    });

    render(<ShiftDetailScreen />);

    fireEvent.click(screen.getByText("Drop shift"));
    fireEvent.click(screen.getByText("Call off"));
    fireEvent.click(screen.getByText("Paid time off"));

    expect(screen.getByText("Submit call off request?")).toBeInTheDocument();
    expect(
      screen.getByText(/Submit a Paid time off absence request/),
    ).toBeInTheDocument();
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
    selectFridaySwapDate();
    fireEvent.click(screen.getByText("Chris Hall"));
    fireEvent.click(screen.getByText("Submit"));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Submit swap request?")).toBeInTheDocument();
    expect(screen.getByText(/Swap your/)).toBeInTheDocument();

    confirmDialog("Submit swap");

    expect(mutate).toHaveBeenCalledWith({
      type: "swap",
      requesterEmpId: "emp-1",
      requesterShiftDate: "2026-04-16",
      targetEmpId: "emp-3",
      targetShiftDate: "2026-04-17",
    });
  });
});
