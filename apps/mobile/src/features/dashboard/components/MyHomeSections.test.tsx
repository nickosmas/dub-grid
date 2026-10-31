import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";
import type { MyHomeSectionsData } from "../hooks/useMyHomeSections";

const routerPush = vi.fn();
const setQueryData = vi.fn();
const runRequestAction = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));
vi.mock("expo-router", () => ({ router: { push: routerPush } }));
vi.mock("../../../shared/lib/query-client", () => ({ queryClient: { setQueryData } }));
vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({ pushToast: vi.fn() }),
}));

let MyHomeSections: (typeof import("./MyHomeSections"))["MyHomeSections"];

beforeAll(async () => {
  ({ MyHomeSections } = await import("./MyHomeSections"));
});

const WEEK = { startDate: "2026-04-12", endDate: "2026-04-18" };

function shift(date: string, overrides: Record<string, unknown> = {}) {
  return {
    employeeId: "emp-1",
    employeeName: "Alex Kim",
    date,
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
        jobName: "Charge Nurse",
        shiftStartTime: "07:00:00",
        shiftEndTime: "15:00:00",
        startTime: "07:00:00",
        endTime: "15:00:00",
        displayFocusAreaName: "Skilled Nursing",
      },
    ],
    indicators: [],
    publishedAt: "2026-04-10T18:30:00.000Z",
    publishedByName: "Mina Diaz",
    ...overrides,
  };
}

function swapAskedOfMe() {
  return {
    id: "request-cover-1",
    orgId: "org-1",
    type: "swap",
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
        endTime: "23:00:00",
        displayFocusAreaName: "Skilled Nursing",
      },
    ],
    requesterShiftLabel: "Evening Shift",
    requesterFocusAreaId: 2,
    requesterCustomStartTime: null,
    requesterCustomEndTime: null,
    targetEmpId: "emp-1",
    targetName: "Alex Kim",
    targetShiftDate: "2026-04-18",
    targetShiftIds: [1],
    targetJobIds: [10],
    targetSegments: [
      {
        shiftId: 1,
        jobId: 10,
        shiftName: "Day Shift",
        jobName: "Charge Nurse",
        startTime: "07:00:00",
        endTime: "15:00:00",
        displayFocusAreaName: "Skilled Nursing",
      },
    ],
    targetShiftLabel: "Day Shift",
    targetFocusAreaId: 2,
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
  };
}

function makeData(overrides: Partial<Record<keyof MyHomeSectionsData, unknown>> = {}) {
  return {
    accessToken: "token-1",
    isOn: true,
    isResolved: true,
    isLoading: false,
    isPlaceholderData: false,
    linkedEmployeeId: "emp-1",
    timeZone: null,
    entries: [],
    scheduleError: null,
    teamEntries: [],
    requests: [],
    openShifts: [],
    requestsError: null,
    scheduleResponse: undefined,
    refetch: vi.fn(),
    pendingAction: null,
    runRequestAction,
    confirmationModal: null,
    ...overrides,
  } as unknown as MyHomeSectionsData;
}

describe("MyHomeSections", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Thursday, Apr 16, early afternoon UTC.
    vi.setSystemTime(new Date("2026-04-16T13:00:00.000Z"));
    routerPush.mockReset();
    setQueryData.mockReset();
    runRequestAction.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("on a day off, leads with the next shift and lists every day of the week", () => {
    render(
      <MyHomeSections
        data={makeData({ entries: [shift("2026-04-13"), shift("2026-04-18")] })}
        range={WEEK}
        selectedDate="2026-04-16"
      />,
    );

    expect(screen.getByText("Your week")).toBeInTheDocument();
    expect(screen.getByText("16h this week")).toBeInTheDocument();
    // Seven days: two with a shift, five Unscheduled.
    expect(screen.getAllByText("Unscheduled")).toHaveLength(5);
    expect(screen.queryByText("Needs your response")).not.toBeInTheDocument();
  });

  it("shows a swap asked of them, and answers it through the request flow", () => {
    render(
      <MyHomeSections
        data={makeData({ entries: [shift("2026-04-18")], requests: [swapAskedOfMe()] })}
        range={WEEK}
        selectedDate="2026-04-16"
      />,
    );

    expect(screen.getByText("Needs your response")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Accept"));
    expect(runRequestAction).toHaveBeenCalledWith("request-cover-1", {
      action: "respond",
      empId: "emp-1",
      accept: true,
    });
  });

  it("opens a tapped shift's detail with this period's schedule already cached", () => {
    const scheduleResponse = { range: WEEK, entries: [shift("2026-04-18")] };
    render(
      <MyHomeSections
        data={makeData({ entries: scheduleResponse.entries, scheduleResponse })}
        range={WEEK}
        selectedDate="2026-04-16"
      />,
    );

    fireEvent.click(screen.getAllByText("Day Shift")[0]!);

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/shift/[employeeId]/[date]",
      params: {
        employeeId: "emp-1",
        date: "2026-04-18",
        rangeStart: WEEK.startDate,
        rangeEnd: WEEK.endDate,
        source: "mine",
      },
    });
    expect(setQueryData).toHaveBeenCalledWith(
      expect.arrayContaining(["mobile", "schedule", "mine", WEEK.startDate, WEEK.endDate]),
      scheduleResponse,
    );
  });
});

describe("MyHomeSections open shifts", () => {
  function gap(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      date: "2026-04-19",
      focusAreaId: 2,
      focusAreaName: "Skilled Nursing",
      needed: 1,
      urgency: null,
      state: { kind: "worked", segments: [{ shiftId: 1, jobId: 20, position: 0 }] },
      presentation: {
        shiftName: "Day Shift",
        startTime: "07:00:00",
        endTime: "15:00:00",
        segments: [],
      },
      canVolunteer: true,
      volunteerBlockReason: null,
      ...overrides,
    } as never;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-04-16T13:00:00.000Z"));
    runRequestAction.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows every gap, with Claim only on the one they can work", () => {
    const theirs = gap("gap-mine");
    render(
      <MyHomeSections
        data={makeData({
          openShifts: [
            theirs,
            gap("gap-blocked", {
              date: "2026-04-20",
              canVolunteer: false,
              volunteerBlockReason: "You already have a shift during that time.",
            }),
          ],
        })}
        range={WEEK}
        selectedDate="2026-04-16"
      />,
    );

    expect(screen.getByText("Open shifts")).toBeInTheDocument();
    expect(screen.getAllByText("1 teammate needed")).toHaveLength(2);
    expect(
      screen.queryByText("You already have a shift during that time."),
    ).not.toBeInTheDocument();

    const claims = screen.getAllByRole("button", { name: "Claim" });
    expect(claims).toHaveLength(1);
    fireEvent.click(claims[0]!);

    expect(runRequestAction).toHaveBeenCalledWith("gap-mine", {
      action: "volunteer_open_shift",
      empId: "emp-1",
      shiftDate: "2026-04-19",
      focusAreaId: 2,
      state: (theirs as { state: unknown }).state,
    });
  });

  it("leaves Open shifts out when nothing is open", () => {
    render(<MyHomeSections data={makeData()} range={WEEK} selectedDate="2026-04-16" />);

    expect(screen.queryByText("Open shifts")).not.toBeInTheDocument();
  });
});
