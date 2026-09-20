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
    state: {
      kind: "worked",
      segments: [],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
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

  it("hands a tapped day's shift to the caller, and an empty day with no item", () => {
    const entry = makeEntry({ date: "2026-05-11" });
    useQuery.mockReturnValue({
      isLoading: false,
      data: {
        range: { startDate: "2026-05-11", endDate: "2026-05-12" },
        entries: [entry],
      },
    });
    const onOpenDay = vi.fn();

    render(<MyScheduleCard accessToken="token" onOpenDay={onOpenDay} />);

    fireEvent.click(screen.getByRole("button", { name: "Monday, May 11" }));
    expect(onOpenDay).toHaveBeenLastCalledWith({ date: "2026-05-11", entry });

    // An empty day is a target too, but there is no shift to open.
    fireEvent.click(screen.getByRole("button", { name: "Tuesday, May 12" }));
    expect(onOpenDay).toHaveBeenLastCalledWith({ date: "2026-05-12", entry: null });
  });

  it("renders an absence as its own pill, not a blank day", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: {
        range: { startDate: "2026-05-11", endDate: "2026-05-11" },
        entries: [
          makeEntry({
            date: "2026-05-11",
            state: {
              kind: "absence",
              segments: [],
              absenceTypeId: 1,
              customStartTime: null,
              customEndTime: null,
              seriesId: null,
              fromRecurring: false,
            },
            presentation: {
              label: "PTO",
              shiftName: null,
              focusAreaId: null,
              focusAreaName: null,
              startTime: null,
              endTime: null,
              segments: [],
            },
          }),
        ],
      },
    });

    render(<MyScheduleCard accessToken="token" />);

    // An absence is a real scheduled thing, so it gets a pill carrying the
    // absence type's own name and colours. Only a day with nothing on it at all
    // falls through to the em dash.
    expect(screen.getByText("PTO")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("shows the empty state when the query has no range at all", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: { range: undefined, entries: [] },
    });

    render(<MyScheduleCard accessToken="token" />);

    expect(screen.getByText("You're not scheduled this week")).toBeInTheDocument();
  });

  it("says the fetch failed rather than claiming there are no shifts", () => {
    // The card owns its own query and the dashboard's content state deliberately
    // excludes its error, so a dropped request used to fall through to the empty
    // state and tell the user they were not scheduled. In a scheduling app that
    // is a wrong answer, not a missing one.
    const refetch = vi.fn();
    useQuery.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error("boom"),
      refetch,
    });

    render(<MyScheduleCard accessToken="token" />);

    expect(screen.queryByText("You're not scheduled this week")).not.toBeInTheDocument();
    expect(screen.getByText("Could not load your schedule")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  // The card used to return null while its query loaded, which meant it
  // appeared after the dashboard's skeleton had already cleared and pushed
  // every card below it down. The screens that render it now fold this query
  // into their own gate, so the card just draws whatever it has.
  it("renders its card frame even before the query resolves", () => {
    useQuery.mockReturnValue({ isLoading: true, data: undefined });

    const { container } = render(<MyScheduleCard accessToken="token" />);

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByText("Your schedule")).toBeInTheDocument();
  });

  it("shows a See all link when onExpand is provided, and calls it on press", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: { range: { startDate: "2026-05-11", endDate: "2026-05-11" }, entries: [] },
    });
    const onExpand = vi.fn();

    render(<MyScheduleCard accessToken="token" onExpand={onExpand} />);

    // The same header-right link every other dashboard card carries, not
    // an expand glyph of its own.
    fireEvent.click(screen.getByRole("button", { name: "See all: Your schedule" }));
    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it("omits the See all link when onExpand isn't provided", () => {
    useQuery.mockReturnValue({
      isLoading: false,
      data: { range: { startDate: "2026-05-11", endDate: "2026-05-11" }, entries: [] },
    });

    render(<MyScheduleCard accessToken="token" />);

    expect(
      screen.queryByRole("button", { name: "See all: Your schedule" }),
    ).not.toBeInTheDocument();
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
