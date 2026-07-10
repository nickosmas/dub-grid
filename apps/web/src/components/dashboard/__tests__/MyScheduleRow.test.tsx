import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MyScheduleRow from "@/components/dashboard/MyScheduleRow";
import type { AbsenceType, AssignmentDefinition, ShiftMap } from "@/types";

const assignment: AssignmentDefinition = {
  id: 101,
  orgId: "org-1",
  label: "D",
  name: "Day shift",
  color: "#dbeafe",
  border: "#93c5fd",
  text: "#1e3a8a",
  categoryId: 10,
  shiftId: 10,
  jobId: 7,
  focusAreaId: 1,
  sortOrder: 1,
  defaultStartTime: "09:00",
  defaultEndTime: "17:00",
  requiredCertificationIds: [],
};

const absenceType: AbsenceType = {
  id: 5,
  orgId: "org-1",
  label: "V",
  name: "Vacation",
  color: "#fde68a",
  border: "#f59e0b",
  text: "#92400e",
  sortOrder: 1,
};

const staleAssignment: AssignmentDefinition = {
  id: 202,
  orgId: "org-1",
  label: "N",
  name: "Night shift",
  color: "#111827",
  border: "#374151",
  text: "#f9fafb",
  categoryId: 11,
  shiftId: 11,
  jobId: 8,
  focusAreaId: 1,
  sortOrder: 2,
  defaultStartTime: "22:00",
  defaultEndTime: "06:00",
  requiredCertificationIds: [],
};

const assignmentById = new Map([
  [assignment.id, assignment],
  [staleAssignment.id, staleAssignment],
]);
const absenceTypeById = new Map([[absenceType.id, absenceType]]);

const weekDates = [
  new Date("2026-05-11T00:00:00"),
  new Date("2026-05-12T00:00:00"),
  new Date("2026-05-13T00:00:00"),
  new Date("2026-05-14T00:00:00"),
  new Date("2026-05-15T00:00:00"),
  new Date("2026-05-16T00:00:00"),
  new Date("2026-05-17T00:00:00"),
];

describe("MyScheduleRow", () => {
  it("renders nothing when there is no linked employee", () => {
    const { container } = render(
      <MyScheduleRow
        currentEmpId={null}
        currentPeriodShifts={{}}
        assignmentById={assignmentById}
        absenceTypeById={absenceTypeById}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a management-only viewer, even with real shift data", () => {
    const currentPeriodShifts: ShiftMap = {
      "emp-1_2026-05-11": {
        label: "D",
        assignmentIds: [101],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [101],
        publishedLabel: "D",
      },
    };

    const { container } = render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={currentPeriodShifts}
        assignmentById={assignmentById}
        absenceTypeById={absenceTypeById}
        periodDates={weekDates}
        periodLabel="this week"
        isManagementOnly
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the empty state when the employee has nothing scheduled all period", () => {
    render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={{}}
        assignmentById={assignmentById}
        absenceTypeById={absenceTypeById}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    expect(screen.getByText("You're not scheduled this week")).toBeInTheDocument();
  });

  it("fills the full period with a chip per day, placeholders for unscheduled days", () => {
    const currentPeriodShifts: ShiftMap = {
      "emp-1_2026-05-11": {
        label: "D",
        assignmentIds: [101],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [101],
        publishedLabel: "D",
      },
      "emp-1_2026-05-12": {
        label: "V",
        assignmentIds: [],
        absenceTypeId: 5,
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [],
        publishedLabel: "V",
      },
    };

    render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={currentPeriodShifts}
        assignmentById={assignmentById}
        absenceTypeById={absenceTypeById}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    const row = screen.getByTestId("my-schedule-row");
    expect(screen.getByText("Day shift")).toBeInTheDocument();
    expect(screen.getByText("9:00 AM - 5:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Vacation")).toBeInTheDocument();
    // One chip per day in the period, including unscheduled placeholders.
    expect(row.querySelectorAll('a[href="/schedule"]')).toHaveLength(weekDates.length);
    expect(screen.getAllByText("—")).toHaveLength(weekDates.length - 2);
  });

  it("shows every segment of a double (split) shift, each with its own color and time", () => {
    const currentPeriodShifts: ShiftMap = {
      "emp-1_2026-05-11": {
        label: "D+N",
        assignmentIds: [101, 202],
        segments: [
          { shiftId: 10, jobId: 7, position: 0, assignmentId: 101, label: "D" },
          { shiftId: 11, jobId: 8, position: 1, assignmentId: 202, label: "N" },
        ],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [101, 202],
        publishedLabel: "D+N",
      },
    };

    render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={currentPeriodShifts}
        assignmentById={assignmentById}
        absenceTypeById={absenceTypeById}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    expect(screen.getByText("Day shift")).toBeInTheDocument();
    expect(screen.getByText("9:00 AM - 5:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Night shift")).toBeInTheDocument();
    expect(screen.getByText("10:00 PM - 6:00 AM")).toBeInTheDocument();
  });

  it("colors a chip from the segment's assignment, not a stale assignmentIds entry", () => {
    const currentPeriodShifts: ShiftMap = {
      "emp-1_2026-05-11": {
        label: "D",
        // assignmentIds is stale/out of sync with the actual segment — the
        // segment's own assignmentId (per-segment UI metadata) must win.
        assignmentIds: [202],
        segments: [{ shiftId: 10, jobId: 7, position: 0, assignmentId: 101, label: "D" }],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [101],
        publishedLabel: "D",
      },
    };

    render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={currentPeriodShifts}
        assignmentById={assignmentById}
        absenceTypeById={absenceTypeById}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    expect(screen.getByText("Day shift")).toBeInTheDocument();
    expect(screen.queryByText("Night shift")).not.toBeInTheDocument();
  });

  it("shows a scroll chevron only when the strip overflows its container", () => {
    const currentPeriodShifts: ShiftMap = {
      "emp-1_2026-05-11": {
        label: "D",
        assignmentIds: [101],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [101],
        publishedLabel: "D",
      },
    };

    render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={currentPeriodShifts}
        assignmentById={assignmentById}
        absenceTypeById={absenceTypeById}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    expect(screen.queryByRole("button", { name: "Scroll later days" })).not.toBeInTheDocument();

    const scrollContainer = screen
      .getByTestId("my-schedule-row")
      .querySelector(".dg-no-scrollbar") as HTMLDivElement;
    Object.defineProperty(scrollContainer, "scrollWidth", { value: 2000, configurable: true });
    Object.defineProperty(scrollContainer, "clientWidth", { value: 500, configurable: true });
    const scrollBySpy = vi.fn();
    scrollContainer.scrollBy = scrollBySpy;
    fireEvent.scroll(scrollContainer);

    const rightChevron = screen.getByRole("button", { name: "Scroll later days" });
    expect(rightChevron).toBeInTheDocument();

    fireEvent.click(rightChevron);
    expect(scrollBySpy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 450, behavior: "smooth" }),
    );
  });
});
