import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MobileDayView from "@/components/MobileDayView";
import type { ScheduleNoteMark } from "@/components/schedule-grid/noteDots";
import type { AssignmentDefinition, Employee, FocusArea, IndicatorType } from "@/types";
import { formatDateKey } from "@/lib/utils";

const focusAreas: FocusArea[] = [
  { id: 1, orgId: "org-1", departmentId: 1, name: "North", sortOrder: 1 },
];

const assignments: AssignmentDefinition[] = [
  {
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
  },
];

const indicatorTypes: IndicatorType[] = [
  { id: 7, orgId: "org-1", name: "Float", color: "#ff0000", sortOrder: 1 },
  { id: 8, orgId: "org-1", name: "Training", color: "#0000ff", sortOrder: 2 },
];

const employee: Employee = {
  id: "emp-1",
  firstName: "Alex",
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

const dates = Array.from({ length: 7 }, (_, index) => new Date(2026, 8, 20 + index));
const shiftDay = formatDateKey(dates[1]);

function renderView(
  noteMarksForKey: (empId: string, date: Date, focusAreaId?: number) => ScheduleNoteMark[],
) {
  return render(
    <MobileDayView
      filteredEmployees={[employee]}
      allEmployees={[employee]}
      dates={dates}
      shiftForKey={(_, date) => (formatDateKey(date) === shiftDay ? "D" : null)}
      assignmentIdsForKey={(_, date) => (formatDateKey(date) === shiftDay ? [1] : [])}
      getShiftStyle={() => assignments[0]}
      handleCellClick={vi.fn()}
      todayKey="2026-01-01"
      focusAreas={focusAreas}
      assignments={assignments}
      shiftCategories={[]}
      indicatorTypes={indicatorTypes}
      isCellInteractive
      noteMarksForKey={noteMarksForKey}
    />,
  );
}

describe("MobileDayView indicators", () => {
  it("shows each shift's indicators by name, looked up with the section's focus area", () => {
    const lookup = vi.fn((_: string, date: Date, focusAreaId?: number): ScheduleNoteMark[] =>
      formatDateKey(date) === shiftDay && focusAreaId === 1
        ? [
            { indicatorTypeId: 7, state: "published" },
            { indicatorTypeId: 8, state: "published" },
          ]
        : [],
    );
    renderView(lookup);

    expect(screen.getByLabelText("Float")).toBeInTheDocument();
    expect(screen.getByLabelText("Training")).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith("emp-1", dates[1], 1);
  });

  it("shows a draft addition as unpublished only when the marks carry it", () => {
    renderView((_, date) =>
      formatDateKey(date) === shiftDay ? [{ indicatorTypeId: 7, state: "draft_added" }] : [],
    );

    expect(screen.getByLabelText("Float · Added, not published")).toBeInTheDocument();
  });

  it("shows no dot where a shift has no indicators", () => {
    const { container } = renderView(() => []);

    expect(container.querySelector("[data-note-dot]")).toBeNull();
  });
});
