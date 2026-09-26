import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MonthView from "@/components/MonthView";
import type { ScheduleNoteMark } from "@/components/schedule-grid/noteDots";
import type { AssignmentDefinition, Employee, FocusArea, IndicatorType } from "@/types";
import { formatDateKey } from "@/lib/utils";

const focusAreas: FocusArea[] = [
  { id: 1, orgId: "org-1", departmentId: 1, name: "North", sortOrder: 1 },
];

const northDay: AssignmentDefinition = {
  id: 1,
  orgId: "org-1",
  label: "D",
  name: "Day Shift",
  color: "#E5F3E8",
  border: "#2E9930",
  text: "#1A3D1B",
  categoryId: 1,
  focusAreaId: 1,
  sortOrder: 1,
};
const general: AssignmentDefinition = { ...northDay, id: 2, label: "G", focusAreaId: null };
const northEarly: AssignmentDefinition = { ...northDay, id: 3, label: "E", categoryId: 2 };

const indicatorTypes: IndicatorType[] = [
  { id: 7, orgId: "org-1", name: "Float", color: "#ff0000", sortOrder: 1 },
  { id: 8, orgId: "org-1", name: "Training", color: "#0000ff", sortOrder: 2 },
];

function makeEmployee(id: string, firstName: string): Employee {
  return {
    id,
    firstName,
    lastName: "Taylor",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    deptAdminIds: [],
    userId: null,
    departmentIds: [],
    version: 0,
  };
}

const alex = makeEmployee("emp-1", "Alex");
const blair = makeEmployee("emp-2", "Blair");
const monthStart = new Date(2026, 8, 1);
const day = new Date(2026, 8, 15);
const dayKey = formatDateKey(day);

const codes: Record<string, AssignmentDefinition[]> = {
  "emp-1": [northDay],
  "emp-2": [general],
};

function renderMonth(
  noteMarksForKey: (empId: string, date: Date, focusAreaId?: number) => ScheduleNoteMark[],
) {
  return render(
    <MonthView
      monthStart={monthStart}
      filteredEmployees={[alex, blair]}
      shiftForKey={(empId, date) =>
        formatDateKey(date) === dayKey ? codes[empId].map((c) => c.label).join("/") : null
      }
      assignmentIdsForKey={(empId, date) =>
        formatDateKey(date) === dayKey ? codes[empId].map((c) => c.id) : []
      }
      getShiftStyle={() => northDay}
      todayKey="2026-01-01"
      focusAreas={focusAreas}
      assignments={[northDay, general, northEarly]}
      shiftCategories={[
        { id: 1, orgId: "org-1", name: "Day", sortOrder: 1 },
        { id: 2, orgId: "org-1", name: "Early", sortOrder: 0 },
      ]}
      noteMarksForKey={noteMarksForKey}
      indicatorTypes={indicatorTypes}
    />,
  );
}

function openDay() {
  const cell = document.querySelector<HTMLElement>(`[data-date-key="${dayKey}"]`);
  fireEvent.click(cell ?? screen.getAllByText("15")[0]);
}

describe("MonthView indicators", () => {
  it("shows each person's indicators by name in the day popover", () => {
    const lookup = vi.fn((empId: string, date: Date, focusAreaId?: number): ScheduleNoteMark[] => {
      if (formatDateKey(date) !== dayKey || focusAreaId !== 1) return [];
      return empId === "emp-1"
        ? [{ indicatorTypeId: 7, state: "published" }]
        : [{ indicatorTypeId: 8, state: "draft_added" }];
    });
    renderMonth(lookup);
    openDay();

    const popover = screen.getByRole("dialog");
    expect(within(popover).getByLabelText("Float")).toBeInTheDocument();
    // A general code sits under the person's primary focus area, and is keyed by it.
    expect(within(popover).getByLabelText("Training · Added, not published")).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith("emp-2", day, 1);
  });

  it("shows a person's indicators once, however many codes they have there", () => {
    // The second code sorts first, so the row built first ends up second.
    codes["emp-1"] = [northDay, northEarly];
    renderMonth((empId, date) =>
      formatDateKey(date) === dayKey && empId === "emp-1"
        ? [{ indicatorTypeId: 7, state: "published" }]
        : [],
    );
    openDay();

    const popover = screen.getByRole("dialog");
    expect(within(popover).getAllByLabelText("Float")).toHaveLength(1);
    // On the person's first row as the popover orders them, not the first built.
    const firstRow = within(popover).getAllByText("Alex T.")[0].parentElement!;
    expect(within(firstRow).getByLabelText("Float")).toBeInTheDocument();
    codes["emp-1"] = [northDay];
  });
});
