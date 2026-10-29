import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TimeOffTab } from "./TimeOffTab";
import type { AbsenceType, ShiftMap } from "@/types";

const absenceTypes = [
  { id: 1, name: "Vacation", label: "V" },
  { id: 9, name: "Off", label: "X" },
] as AbsenceType[];
const off = (absenceTypeId: number) =>
  ({ assignmentIds: [], absenceTypeId, isDelete: false }) as unknown as ShiftMap[string];

function renderTab() {
  render(
    <TimeOffTab
      person={{ id: "emp", status: "active", statusChangedAt: null }}
      shifts={{
        "emp_2026-12-22": off(1),
        "emp_2026-12-23": off(1),
        "emp_2026-10-04": off(9),
      }}
      loading={false}
      range={{ startDate: "2026-10-01", endDate: "2026-12-31" }}
      today="2026-10-29"
      periodPhrase="this year"
      absenceTypes={absenceTypes}
      dayOffAbsenceTypeId={9}
    />,
  );
}

describe("TimeOffTab", () => {
  it("lists runs of absence with dates, days and state, without the day off", () => {
    renderTab();

    expect(screen.getByText("1 entry this year.")).toBeInTheDocument();
    const [, row] = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(row).getByText("Vacation")).toBeInTheDocument();
    expect(within(row).getByText("Dec 22 - Dec 23")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
    expect(within(row).getByText("Planned")).toBeInTheDocument();
  });

  it("shows the day off absence on request", () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Show Off" }));
    expect(screen.getByText("2 entries this year.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide Off" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
