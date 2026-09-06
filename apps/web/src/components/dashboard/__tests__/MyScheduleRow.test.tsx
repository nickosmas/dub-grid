import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MyScheduleRow from "@/components/dashboard/MyScheduleRow";
import type {
  AbsenceType,
  AssignmentDefinition,
  JobDefinition,
  ShiftCategory,
  ShiftMap,
} from "@/types";

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

const job: JobDefinition = {
  id: 7,
  orgId: "org-1",
  name: "Registered Nurse",
  abbr: "RN",
  showOnGrid: true,
  eligibleRoleIds: [],
  requiredCertificationIds: [],
  color: "#dbeafe",
  border: "#93c5fd",
  text: "#1e3a8a",
  sortOrder: 1,
};

const weekDates = [
  new Date("2026-05-11T00:00:00"),
  new Date("2026-05-12T00:00:00"),
  new Date("2026-05-13T00:00:00"),
  new Date("2026-05-14T00:00:00"),
  new Date("2026-05-15T00:00:00"),
  new Date("2026-05-16T00:00:00"),
  new Date("2026-05-17T00:00:00"),
];
const dayDates = weekDates.slice(0, 1);
const twoWeekDates = Array.from({ length: 14 }, (_, index) => new Date(2026, 4, 11 + index));

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

  it("shows the grid's draft indication on every affected schedule pill", () => {
    const currentPeriodShifts: ShiftMap = {
      "emp-1_2026-05-11": {
        label: "D",
        assignmentIds: [101],
        isDraft: true,
        draftKind: "new",
        publishedAssignmentDefinitionIds: [],
        publishedLabel: "",
      },
      "emp-1_2026-05-12": {
        label: "D",
        assignmentIds: [101],
        isDraft: true,
        draftKind: "modified",
        publishedAssignmentDefinitionIds: [101],
        publishedLabel: "D",
      },
      "emp-1_2026-05-13": {
        label: "OFF",
        assignmentIds: [],
        isDelete: true,
        isDraft: true,
        draftKind: "deleted",
        publishedAssignmentDefinitionIds: [202],
        publishedLabel: "N",
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

    expect(screen.queryByLabelText("New shift")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Edited shift")).toHaveAttribute("data-draft-badge", "modified");
    expect(screen.getByLabelText("Deleted shift")).toHaveAttribute("data-draft-badge", "deleted");
    expect(screen.getByText("Night shift")).toBeInTheDocument();
  });

  it("shows a published edit with the same compact pill as the grid", () => {
    render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={{
          "emp-1_2026-05-11": {
            label: "D",
            assignmentIds: [101],
            isDraft: false,
            draftKind: null,
            publishedAssignmentDefinitionIds: [101],
            publishedLabel: "D",
          },
        }}
        recentPublishedChanges={
          new Map([
            [
              "emp-1_2026-05-11",
              {
                empId: "emp-1",
                date: "2026-05-11",
                kind: "modified" as const,
              },
            ],
          ])
        }
        assignmentById={assignmentById}
        absenceTypeById={absenceTypeById}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    expect(screen.getByLabelText("Edited shift")).toHaveAttribute("data-draft-badge", "modified");
  });

  it.each([
    ["Week", weekDates, 7],
    ["2 Weeks", twoWeekDates, 14],
  ])("renders every day supplied by the dashboard %s view", (_label, dates, expectedCount) => {
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
        periodDates={dates}
        periodLabel="selected period"
      />,
    );

    expect(
      screen.getByTestId("my-schedule-row").querySelectorAll("[data-schedule-day]"),
    ).toHaveLength(expectedCount);
  });

  it("keeps a full populated week in Your schedule when the dashboard is on Today", () => {
    const allShifts: ShiftMap = {
      "emp-1_2026-05-11": {
        label: "D",
        assignmentIds: [101],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [101],
        publishedLabel: "D",
      },
      "emp-1_2026-05-16": {
        label: "N",
        assignmentIds: [202],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [202],
        publishedLabel: "N",
      },
    };

    render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={{ "emp-1_2026-05-11": allShifts["emp-1_2026-05-11"] }}
        allShifts={allShifts}
        viewMode="day"
        assignmentById={assignmentById}
        absenceTypeById={absenceTypeById}
        periodDates={dayDates}
        periodLabel="today"
      />,
    );

    expect(screen.getByText("this week")).toBeInTheDocument();
    expect(
      screen.getByTestId("my-schedule-row").querySelectorAll("[data-schedule-day]"),
    ).toHaveLength(7);
    expect(screen.getByText("Night shift")).toBeInTheDocument();
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
        periodDates={twoWeekDates}
        periodLabel="these 2 weeks"
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
        periodDates={twoWeekDates}
        periodLabel="this week"
      />,
    );

    expect(screen.getByText("Day shift")).toBeInTheDocument();
    expect(screen.queryByText("Night shift")).not.toBeInTheDocument();
  });

  it("shows matching inset arrow cues only in directions with more days", () => {
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
        periodDates={twoWeekDates}
        periodLabel="these 2 weeks"
      />,
    );

    expect(screen.queryByRole("button", { name: "Scroll later days" })).not.toBeInTheDocument();

    const scrollShell = screen.getByTestId("schedule-scroll-shell");
    const scrollContainer = screen.getByTestId("schedule-day-strip");
    expect(scrollShell.parentElement).toHaveStyle({ padding: "16px 0" });
    expect(scrollShell).toHaveStyle({ position: "relative" });
    expect(screen.getByTestId("schedule-scroll-slot-left")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-scroll-slot-right")).toBeInTheDocument();
    expect(screen.getByTestId("schedule-scroll-slot-left")).toHaveStyle({
      position: "absolute",
      left: "12px",
      top: "calc(50% + 13px)",
    });
    expect(screen.getByTestId("schedule-scroll-slot-right")).toHaveStyle({
      position: "absolute",
      right: "12px",
      top: "calc(50% + 13px)",
    });

    Object.defineProperty(scrollContainer, "scrollWidth", { value: 2000, configurable: true });
    Object.defineProperty(scrollContainer, "clientWidth", { value: 500, configurable: true });
    Object.defineProperty(scrollContainer, "scrollLeft", {
      value: 0,
      writable: true,
      configurable: true,
    });
    const scrollBySpy = vi.fn();
    scrollContainer.scrollBy = scrollBySpy;
    fireEvent.scroll(scrollContainer);

    const rightChevron = screen.getByRole("button", { name: "Scroll later days" });
    expect(rightChevron).toBeInTheDocument();
    expect(rightChevron.querySelector(".lucide-arrow-right")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scroll earlier days" })).not.toBeInTheDocument();

    fireEvent.click(rightChevron);
    expect(scrollBySpy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 510, behavior: "smooth" }),
    );

    scrollContainer.scrollLeft = 340;
    fireEvent.scroll(scrollContainer);
    expect(screen.getByRole("button", { name: "Scroll earlier days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scroll later days" })).toBeInTheDocument();
    const leftCue = screen.getByRole("button", { name: "Scroll earlier days" });
    const rightCue = screen.getByRole("button", { name: "Scroll later days" });
    expect(leftCue.querySelector(".lucide-arrow-left")).toBeInTheDocument();
    expect(leftCue).toHaveStyle({
      width: "28px",
      height: "28px",
      borderRadius: "50%",
    });
    expect(rightCue).toHaveStyle({
      width: "28px",
      height: "28px",
      borderRadius: "50%",
    });

    scrollContainer.scrollLeft = 1500;
    fireEvent.scroll(scrollContainer);
    expect(screen.getByRole("button", { name: "Scroll earlier days" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scroll later days" })).not.toBeInTheDocument();
  });

  it("uses readable cells and wraps every visible shift field instead of truncating it", () => {
    const longAssignment: AssignmentDefinition = {
      ...assignment,
      id: 303,
      name: "Very long overnight medication support shift",
      label: "VL",
      categoryId: null,
      shiftId: null,
      defaultStartTime: "00:00",
      defaultEndTime: "08:00",
    };
    const currentPeriodShifts: ShiftMap = {
      "emp-1_2026-05-11": {
        label: "VL",
        assignmentIds: [303],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [303],
        publishedLabel: "VL",
      },
    };

    render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={currentPeriodShifts}
        assignmentById={new Map([[longAssignment.id, longAssignment]])}
        absenceTypeById={absenceTypeById}
        jobs={[job]}
        periodDates={twoWeekDates}
        periodLabel="these 2 weeks"
      />,
    );

    const day = screen.getByText(longAssignment.name).closest("[data-schedule-day]");
    const pill = screen.getByText(longAssignment.name).parentElement as HTMLElement;
    expect(day?.firstElementChild).toHaveStyle({
      width: "160px",
      padding: "0 10px",
      flex: "1",
    });
    expect(pill).toHaveStyle({ minHeight: "62px", overflowWrap: "anywhere" });
    for (const value of [longAssignment.name, job.name, "12:00 AM - 8:00 AM"]) {
      const field = screen.getByText(value);
      expect(field.style.textOverflow).toBe("");
      expect(field.style.whiteSpace).toBe("");
      expect(field).toHaveStyle({ overflowWrap: "anywhere" });
    }
  });

  it("fills the available width with all seven week cells and disables horizontal scrolling", () => {
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

    const strip = screen.getByTestId("schedule-day-strip");
    expect(strip).toHaveStyle({ overflowX: "hidden", alignItems: "stretch" });
    expect(screen.queryByRole("button", { name: /Scroll/ })).not.toBeInTheDocument();
    for (const day of strip.querySelectorAll<HTMLElement>("[data-schedule-day]")) {
      expect(day).toHaveStyle({ flexGrow: "1", flexBasis: "0", minWidth: "0" });
      expect(day.firstElementChild).toHaveStyle({ width: "100%", flex: "1" });
    }
  });

  it("keeps seven readable fixed-width cells horizontally scrollable on mobile", () => {
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
        isMobile
      />,
    );

    const strip = screen.getByTestId("schedule-day-strip");
    expect(strip).toHaveStyle({ overflowX: "auto" });
    for (const day of strip.querySelectorAll<HTMLElement>("[data-schedule-day]")) {
      expect(day).toHaveStyle({ flexGrow: "0", flexBasis: "auto" });
      expect(day.firstElementChild).toHaveStyle({ width: "160px" });
    }
  });

  it("never opens shift popup cards on hover or keyboard focus", () => {
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
        jobs={[job]}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    const day = document.querySelector('[data-schedule-day="2026-05-11"]') as HTMLElement;
    fireEvent.pointerEnter(day);
    fireEvent.focus(day);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.queryByTestId(/schedule-day-details-/)).not.toBeInTheDocument();
  });

  it("shows the job name under the shift name, and reserves the same space for shifts/absences without one", () => {
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
        jobs={[job]}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    expect(screen.getByText("Registered Nurse")).toBeInTheDocument();

    // The absence pill (no job) still renders a job-name line — hidden, not
    // removed — so every pill reserves the same three-line height.
    const vacationPill = screen.getByText("Vacation").parentElement as HTMLElement;
    const reservedJobLine = vacationPill.querySelector('[aria-hidden="true"]');
    expect(reservedJobLine).toBeInTheDocument();
    expect(reservedJobLine).toHaveStyle({ visibility: "hidden" });
  });

  it("shows the shift's own name on top, not the assignment's combined code name", () => {
    // Some orgs name the assignment/code itself as a combined "shift + job"
    // string for clarity elsewhere in the app (e.g. "Evening Shift
    // Supervisor"). Now that the job gets its own line below, the top line
    // must stay shift-only — it should prefer the segment's pure shiftName
    // over the assignment's own name/label.
    const supervisorAssignment: AssignmentDefinition = {
      ...assignment,
      id: 303,
      name: "Evening Shift Supervisor",
      label: "ESS",
    };
    const currentPeriodShifts: ShiftMap = {
      "emp-1_2026-05-11": {
        label: "ESS",
        assignmentIds: [303],
        segments: [
          {
            shiftId: 10,
            jobId: 7,
            position: 0,
            assignmentId: 303,
            label: "ESS",
            shiftName: "Evening Shift",
          },
        ],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [303],
        publishedLabel: "ESS",
      },
    };

    render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={currentPeriodShifts}
        assignmentById={new Map([[supervisorAssignment.id, supervisorAssignment]])}
        absenceTypeById={absenceTypeById}
        jobs={[job]}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    expect(screen.getByText("Evening Shift")).toBeInTheDocument();
    expect(screen.queryByText("Evening Shift Supervisor")).not.toBeInTheDocument();
    expect(screen.getByText("Registered Nurse")).toBeInTheDocument();
  });

  it("resolves the shift's own name via the assignment's shift id when there are no explicit segments", () => {
    // The common case: entries only carry `assignmentIds`, no explicit
    // `segments` with their own `shiftName`. The top line must still
    // resolve to the pure shift name (looked up via shiftCategories), not
    // fall through to the assignment's combined code name.
    const supervisorAssignment: AssignmentDefinition = {
      ...assignment,
      id: 303,
      name: "Evening Shift Supervisor",
      label: "ESS",
      shiftId: 20,
      jobId: 7,
    };
    const eveningShift: ShiftCategory = {
      id: 20,
      orgId: "org-1",
      name: "Evening Shift",
      sortOrder: 2,
    };
    const currentPeriodShifts: ShiftMap = {
      "emp-1_2026-05-11": {
        label: "ESS",
        assignmentIds: [303],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [303],
        publishedLabel: "ESS",
      },
    };

    render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={currentPeriodShifts}
        assignmentById={new Map([[supervisorAssignment.id, supervisorAssignment]])}
        absenceTypeById={absenceTypeById}
        jobs={[job]}
        shiftCategories={[eveningShift]}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    expect(screen.getByText("Evening Shift")).toBeInTheDocument();
    expect(screen.queryByText("Evening Shift Supervisor")).not.toBeInTheDocument();
    expect(screen.getByText("Registered Nurse")).toBeInTheDocument();
  });

  it("does not repeat the job name below when a shiftless job's name is already the shift line", () => {
    // A shiftless assignment (no shift attached) resolves its "shift" label
    // to the job's own name — showing the job line too would just repeat
    // the same text twice.
    const shiftlessAssignment: AssignmentDefinition = {
      ...assignment,
      id: 404,
      name: "Registered Nurse",
      label: "RN",
      shiftId: null,
      categoryId: null,
      jobId: 7,
    };
    const currentPeriodShifts: ShiftMap = {
      "emp-1_2026-05-11": {
        label: "RN",
        assignmentIds: [404],
        isDraft: false,
        draftKind: null,
        publishedAssignmentDefinitionIds: [404],
        publishedLabel: "RN",
      },
    };

    render(
      <MyScheduleRow
        currentEmpId="emp-1"
        currentPeriodShifts={currentPeriodShifts}
        assignmentById={new Map([[shiftlessAssignment.id, shiftlessAssignment]])}
        absenceTypeById={absenceTypeById}
        jobs={[job]}
        periodDates={weekDates}
        periodLabel="this week"
      />,
    );

    expect(screen.getAllByText("Registered Nurse")).toHaveLength(1);
  });
});
