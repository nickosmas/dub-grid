import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { makeAssignmentDefinition, makeShiftCategory } from "@/__tests__/factories";
import { RecurringScheduleCard } from "./RecurringScheduleCard";
import type { AbsenceType, JobDefinition, RecurringShift } from "@/types";

function makeRecurringShift(overrides: Partial<RecurringShift> = {}): RecurringShift {
  return {
    id: "recurring-1",
    empId: "emp-1",
    orgId: "org1",
    dayOfWeek: 1,
    input: {
      kind: "worked",
      segments: [{ shiftId: 5, jobId: 9, position: 0 }],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: true,
    },
    presentation: {
      label: "D · S",
      startTime: null,
      endTime: null,
      // Recurring rows are mapped without segment compatibility, so the server
      // resolves no names — only the code label and the shift/job ids.
      segments: [
        {
          shiftId: 5,
          jobId: 9,
          label: "D · S",
          shiftName: null,
          jobName: null,
          startTime: null,
          endTime: null,
        },
      ],
    },
    absenceTypeId: null,
    shiftLabel: "D · S",
    effectiveFrom: "2026-01-01",
    effectiveUntil: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const supervisorJob: JobDefinition = {
  id: 9,
  orgId: "org1",
  name: "Supervisor",
  abbr: "S",
  showOnGrid: true,
  eligibleRoleIds: [],
  requiredCertificationIds: [],
  color: "#BBF7D0",
  border: "#86EFAC",
  text: "#14532D",
  sortOrder: 1,
  systemKey: null,
};

const absenceType: AbsenceType = {
  id: 3,
  orgId: "org1",
  label: "X",
  name: "Off",
  color: "#E5E7EB",
  border: "#D1D5DB",
  text: "#111827",
  sortOrder: 1,
};

describe("RecurringScheduleCard", () => {
  it("stacks the job under the shift name in the assignment's color", () => {
    render(
      <RecurringScheduleCard
        recurringShifts={[makeRecurringShift()]}
        assignments={[
          makeAssignmentDefinition({
            id: 7,
            name: "Day Shift Supervisor",
            shiftId: 5,
            jobId: 9,
            color: "#BBF7D0",
            text: "#14532D",
          }),
        ]}
        shiftCategories={[makeShiftCategory({ id: 5, name: "Day Shift" })]}
        jobs={[supervisorJob]}
      />,
    );

    const shiftName = screen.getByText("Day Shift");
    expect(screen.getByText("Supervisor")).toBeInTheDocument();
    expect(shiftName.parentElement).toHaveStyle({ background: "#BBF7D0" });
    expect(screen.queryByText("D · S")).not.toBeInTheDocument();
    expect(screen.queryByText("Day Shift · Supervisor")).not.toBeInTheDocument();
  });

  it("names the absence type rather than its code", () => {
    render(
      <RecurringScheduleCard
        recurringShifts={[
          makeRecurringShift({
            absenceTypeId: 3,
            shiftLabel: "X",
            presentation: { label: "X", startTime: null, endTime: null, segments: [] },
          }),
        ]}
        absenceTypes={[absenceType]}
      />,
    );

    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.queryByText("X")).not.toBeInTheDocument();
  });
});
