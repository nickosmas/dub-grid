import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

const useQuery = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery };
});

vi.mock("../../../shared/lib/api", () => ({
  getMySchedule: vi.fn(),
}));

let MyScheduleCard: (typeof import("./MyScheduleCard"))["MyScheduleCard"];

beforeAll(async () => {
  MyScheduleCard = (await import("./MyScheduleCard")).MyScheduleCard;
});

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    employeeId: "emp-1",
    employeeName: "Alex Rivera",
    employeeSeniority: 1,
    employeeFocusAreaIds: [12],
    date: "2026-05-11",
    state: { kind: "worked", segments: [], absenceTypeId: null, customStartTime: null, customEndTime: null, seriesId: null, fromRecurring: false },
    presentation: {
      label: "D",
      shiftName: "Day Shift",
      focusAreaId: 12,
      focusAreaName: "ICU",
      startTime: "07:00:00",
      endTime: "15:00:00",
      segments: [],
    },
    publishedAt: "2026-05-10T00:00:00.000Z",
    publishedByName: "Jordan Lee",
    ...overrides,
  };
}

describe("MyScheduleCard", () => {
  it("renders one day-card per date in the range, spelling out the shift name", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: {
        range: { startDate: "2026-05-11", endDate: "2026-05-12" },
        entries: [makeEntry({ date: "2026-05-11" })],
      },
    });

    render(<MyScheduleCard accessToken="token" />);

    // Spelled-out name, not the abbreviated "D" code.
    expect(screen.getByText("Day Shift")).toBeInTheDocument();
    expect(screen.queryByText("D")).not.toBeInTheDocument();
    // The second day in range has no entry -> empty placeholder, not dropped.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an 'Off' placeholder for an absence day instead of dropping it", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: {
        range: { startDate: "2026-05-11", endDate: "2026-05-11" },
        entries: [
          makeEntry({
            date: "2026-05-11",
            state: { kind: "absence", segments: [], absenceTypeId: 1, customStartTime: null, customEndTime: null, seriesId: null, fromRecurring: false },
          }),
        ],
      },
    });

    render(<MyScheduleCard accessToken="token" />);

    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("shows the empty state when the query has no range at all", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: { range: undefined, entries: [] },
    });

    render(<MyScheduleCard accessToken="token" />);

    expect(screen.getByText("You're not scheduled this week")).toBeInTheDocument();
  });

  it("renders nothing while loading", () => {
    useQuery.mockReturnValue({ isLoading: true, data: undefined });

    const { container } = render(<MyScheduleCard accessToken="token" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows an expand button when onExpand is provided, and calls it on press", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: { range: { startDate: "2026-05-11", endDate: "2026-05-11" }, entries: [] },
    });
    const onExpand = vi.fn();

    render(<MyScheduleCard accessToken="token" onExpand={onExpand} />);

    fireEvent.click(screen.getByLabelText("Expand your schedule"));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("omits the expand button when onExpand isn't provided", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: { range: { startDate: "2026-05-11", endDate: "2026-05-11" }, entries: [] },
    });

    render(<MyScheduleCard accessToken="token" />);

    expect(screen.queryByLabelText("Expand your schedule")).not.toBeInTheDocument();
  });

  it("shows the job name under the shift name", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: {
        range: { startDate: "2026-05-11", endDate: "2026-05-11" },
        entries: [
          makeEntry({
            presentation: {
              label: "D",
              shiftName: "Day Shift",
              focusAreaId: 12,
              focusAreaName: "ICU",
              startTime: "07:00:00",
              endTime: "15:00:00",
              segments: [{ jobName: "Registered Nurse" }],
            },
          }),
        ],
      },
    });

    render(<MyScheduleCard accessToken="token" />);

    expect(screen.getByText("Day Shift")).toBeInTheDocument();
    expect(screen.getByText("Registered Nurse")).toBeInTheDocument();
  });

  it("does not repeat the job name below when a shiftless job's name is already the shift line", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: {
        range: { startDate: "2026-05-11", endDate: "2026-05-11" },
        entries: [
          makeEntry({
            presentation: {
              label: "RN",
              shiftName: "Registered Nurse",
              focusAreaId: 12,
              focusAreaName: "ICU",
              startTime: null,
              endTime: null,
              segments: [{ jobName: "Registered Nurse" }],
            },
          }),
        ],
      },
    });

    render(<MyScheduleCard accessToken="token" />);

    expect(screen.getAllByText("Registered Nurse")).toHaveLength(1);
  });

  it("shows a double shift as two side-by-side pills, each with its own job and time", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: {
        range: { startDate: "2026-05-11", endDate: "2026-05-11" },
        entries: [
          makeEntry({
            presentation: {
              label: "D+E",
              shiftName: "Day Shift",
              focusAreaId: 12,
              focusAreaName: "ICU",
              startTime: "07:00:00",
              endTime: "23:00:00",
              segments: [
                {
                  shiftName: "Day Shift",
                  jobName: "Registered Nurse",
                  jobColor: "#dbeafe",
                  jobBorderColor: "#93c5fd",
                  jobTextColor: "#1e3a8a",
                  startTime: "07:00:00",
                  endTime: "15:00:00",
                },
                {
                  shiftName: "Evening Shift",
                  jobName: "Supervisor",
                  jobColor: "#fde68a",
                  jobBorderColor: "#f59e0b",
                  jobTextColor: "#92400e",
                  startTime: "15:00:00",
                  endTime: "23:00:00",
                },
              ],
            },
          }),
        ],
      },
    });

    render(<MyScheduleCard accessToken="token" />);

    expect(screen.getByText("Day Shift")).toBeInTheDocument();
    expect(screen.getByText("Evening Shift")).toBeInTheDocument();
    expect(screen.getByText("Registered Nurse")).toBeInTheDocument();
    expect(screen.getByText("Supervisor")).toBeInTheDocument();
    expect(screen.getByText("7:00 AM–3:00 PM")).toBeInTheDocument();
    expect(screen.getByText("3:00 PM–11:00 PM")).toBeInTheDocument();
  });
});
