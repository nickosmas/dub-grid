import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShiftsTab } from "./ShiftsTab";
import type { ShiftRecordLookups } from "@/lib/shift-records";
import type { AssignmentDefinition, Employee, ShiftCategory, ShiftMap } from "@/types";

const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/export-csv", () => ({ downloadCsvFile: download }));

const lookups: ShiftRecordLookups = {
  assignmentById: new Map([
    [1, { id: 1, name: "Day", shiftId: 10, categoryId: 10, jobId: 100 } as AssignmentDefinition],
  ]),
  shiftById: new Map([
    [10, { id: 10, name: "Day Shift", startTime: "07:00", endTime: "15:00" } as ShiftCategory],
  ]),
  jobById: new Map([[100, { name: "Day Shift Supervisor" }]]),
  focusAreaById: new Map(),
  absenceById: new Map(),
};
const cell = (overrides = {}) =>
  ({
    assignmentIds: [1],
    publishedAssignmentDefinitionIds: [1],
    isDraft: false,
    draftKind: null,
    ...overrides,
  }) as ShiftMap[string];

function renderTab(
  shifts: ShiftMap | undefined = {
    "emp_2026-10-02": cell(),
    "emp_2026-10-09": cell({ isDraft: true, draftKind: "new" }),
  },
) {
  render(
    <ShiftsTab
      employee={{ id: "emp", firstName: "Ann", lastName: "Hart" } as Employee}
      shifts={shifts}
      loading={!shifts}
      range={{ startDate: "2026-10-01", endDate: "2026-10-31" }}
      periodPhrase="this month"
      lookups={lookups}
      corrections={new Map([["2026-10-02", "Left early"]])}
    />,
  );
}

describe("ShiftsTab", () => {
  it("lists each shift spelled out with its state and the period's total", () => {
    renderTab();

    expect(screen.getByText("2 shifts, 16 hours this month.")).toBeInTheDocument();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1]).getByText("Fri, Oct 9")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Draft: new")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Day Shift")).toBeInTheDocument();
    expect(within(rows[2]).getByText(/Day Shift Supervisor/)).toBeInTheDocument();
    expect(within(rows[2]).getByText("Corrected")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Left early")).toBeInTheDocument();
  });

  it("exports the shown rows as a CSV file named for them and the period", () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const [csv, filename] = download.mock.calls[0];
    expect(filename).toBe("ann-hart-shifts-2026-10-01-to-2026-10-31.csv");
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("says so when the period has no shifts", () => {
    renderTab({});
    expect(screen.getByText("No shifts this month.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });
});
