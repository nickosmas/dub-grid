import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StaffOverviewTab } from "./StaffOverviewTab";
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
const WEEK = [
  "2026-10-25",
  "2026-10-26",
  "2026-10-27",
  "2026-10-28",
  "2026-10-29",
  "2026-10-30",
  "2026-10-31",
];

function renderTab(periodShifts: ShiftMap | undefined) {
  render(
    <StaffOverviewTab
      employee={{ id: "emp" } as Employee}
      periodShifts={periodShifts}
      currentWeekShifts={{ "emp_2026-10-26": worked } as ShiftMap}
      currentWeekDates={WEEK}
      range={{ startDate: "2026-10-01", endDate: "2026-10-31" }}
      periodPhrase="this month"
      assignments={[assignment]}
      shiftCategories={[day]}
      jobs={[{ id: 100, name: "Day Shift Supervisor" } as never]}
      absenceTypes={[]}
    />,
  );
}

describe("StaffOverviewTab", () => {
  it("counts the period and names it under each number", () => {
    renderTab({ "emp_2026-10-05": worked, "emp_2026-10-06": worked } as ShiftMap);

    const summary = within(screen.getByTestId("overview-summary"));
    expect(summary.getByText("Hours")).toBeInTheDocument();
    expect(summary.getByText("16h")).toBeInTheDocument();
    expect(summary.getAllByText("This month")).toHaveLength(2);
    expect(summary.getByText("Over 5 weeks")).toBeInTheDocument();
    expect(summary.getByText("Weeks over 40 hours")).toBeInTheDocument();
  });

  it("spells out this week's shift and job, with a dash on free days", () => {
    renderTab({});

    const week = screen.getByText("This week").closest("section")!;
    expect(within(week).getByText("Day Shift")).toBeInTheDocument();
    expect(within(week).getByText("Day Shift Supervisor")).toBeInTheDocument();
    expect(within(week).getAllByText("-")).toHaveLength(6);
  });

  it("holds its numbers while the period loads", () => {
    renderTab(undefined);
    expect(within(screen.getByTestId("overview-summary")).getAllByText("-")).toHaveLength(4);
  });
});
