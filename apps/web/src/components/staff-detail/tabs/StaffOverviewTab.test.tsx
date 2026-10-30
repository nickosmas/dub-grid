import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffOverviewTab } from "./StaffOverviewTab";
import type { PersonRequestRow } from "@/lib/person-requests";
import type { AssignmentDefinition, Employee, ShiftCategory, ShiftMap } from "@/types";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));

const day = { id: 10, name: "Day Shift", startTime: "07:00", endTime: "15:00" } as ShiftCategory;
const assignment = {
  id: 1,
  name: "Day Supervisor",
  label: "D",
  color: "#dbeafe",
  text: "#1e3a8a",
  border: "#93c5fd",
  shiftId: 10,
  categoryId: 10,
  jobId: 100,
} as AssignmentDefinition;
const worked = { assignmentIds: [1], isDelete: false } as ShiftMap[string];
const NEXT_DAYS = Array.from({ length: 7 }, (_, index) => new Date(2026, 9, 29 + index));
const WAITING: PersonRequestRow = {
  key: "shift-r1",
  type: "Swap",
  details: "Sat, Nov 7 · Day Shift",
  secondary: "with Margaret Sullivan",
  sentDate: "2026-10-28",
  state: "Awaiting approval",
  tone: "warning",
  decidedBy: null,
  waiting: true,
  reviewHref: "/schedule?requests=approval",
};

function renderTab({
  periodShifts = {} as ShiftMap,
  nextDays = { dates: NEXT_DAYS, shifts: {} as ShiftMap },
  waitingRequests,
}: {
  periodShifts?: ShiftMap | "loading";
  nextDays?: { dates: Date[]; shifts: ShiftMap } | null;
  waitingRequests?: PersonRequestRow[];
} = {}) {
  render(
    <StaffOverviewTab
      employee={{ id: "emp", firstName: "Thomas" } as Employee}
      periodShifts={periodShifts === "loading" ? undefined : periodShifts}
      range={{ startDate: "2026-10-01", endDate: "2026-10-31" }}
      periodPhrase="this month"
      assignments={[assignment]}
      shiftCategories={[day]}
      jobs={[{ id: 100, name: "Day Shift Supervisor" } as never]}
      absenceTypes={[]}
      focusAreas={[]}
      nextDays={nextDays}
      waitingRequests={waitingRequests}
      about={<p>About them</p>}
    />,
  );
}

describe("StaffOverviewTab", () => {
  it("counts the period in three numbers", () => {
    renderTab({ periodShifts: { "emp_2026-10-05": worked, "emp_2026-10-06": worked } as ShiftMap });

    const summary = within(screen.getByTestId("overview-summary"));
    expect(summary.getByText("Hours")).toBeInTheDocument();
    expect(summary.getByText("16h")).toBeInTheDocument();
    expect(summary.getByText("Shifts")).toBeInTheDocument();
    expect(summary.getByText("2")).toBeInTheDocument();
    expect(summary.getByText("Average per week")).toBeInTheDocument();
  });

  it("holds its numbers while the period loads", () => {
    renderTab({ periodShifts: "loading" });
    expect(within(screen.getByTestId("overview-summary")).getAllByText("-")).toHaveLength(3);
  });

  it("shows their next seven days as the dashboard does, spelled out", () => {
    renderTab({ nextDays: { dates: NEXT_DAYS, shifts: { "emp_2026-10-30": worked } as ShiftMap } });

    const strip = screen.getByTestId("my-schedule-row");
    expect(within(strip).getByText("Next 7 days")).toBeInTheDocument();
    expect(within(strip).getByText("Day Shift")).toBeInTheDocument();
    expect(within(strip).getByText("Day Shift Supervisor")).toBeInTheDocument();
  });

  it("says so in their name when nothing is scheduled", () => {
    renderTab();
    expect(screen.getByText("Thomas isn't scheduled in the next 7 days")).toBeInTheDocument();
  });

  it("leaves the strip out for someone not on the schedule", () => {
    renderTab({ nextDays: null });
    expect(screen.queryByTestId("my-schedule-row")).toBeNull();
  });

  it("lists what's waiting with a way to review it, only when something is", () => {
    renderTab({ waitingRequests: [WAITING] });
    const card = screen.getByRole("region", { name: "Needs attention" });
    expect(within(card).getByText("Swap")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/schedule?requests=approval",
    );
  });

  it("hides Needs attention when nothing waits", () => {
    renderTab({ waitingRequests: [] });
    expect(screen.queryByRole("region", { name: "Needs attention" })).toBeNull();
    expect(screen.getByText("About them")).toBeInTheDocument();
  });
});
