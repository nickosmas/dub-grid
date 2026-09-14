import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Employee } from "@dubgrid/domain";
import type { OpenShiftStaffingCandidate } from "@/app/(app)/schedule/_lib/open-shift-staffing";
import { OpenShiftStaffingModal } from "./OpenShiftStaffingModal";

function employee(
  id: string,
  firstName: string,
  employmentType: "full_time" | "part_time" = "full_time",
): Employee {
  return {
    id,
    firstName,
    lastName: "Nurse",
    employmentType,
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: 4,
    roleIds: [3],
    seniority: 1,
    focusAreaIds: [7],
    phone: "",
    email: `${firstName.toLowerCase()}@example.com`,
    contactNotes: "",
    userId: null,
    departmentIds: [1],
    deptAdminIds: [],
    version: 1,
  };
}

const dayOption = {
  assignmentIds: [100],
  alignedTimeRanges: [{ start: "07:00", end: "15:00" }],
  timeRanges: [{ start: "07:00", end: "15:00" }],
};
const eveningOption = {
  assignmentIds: [101],
  alignedTimeRanges: [{ start: "15:00", end: "23:00" }],
  timeRanges: [{ start: "15:00", end: "23:00" }],
};

function candidates(): OpenShiftStaffingCandidate[] {
  return [
    { employee: employee("ada", "Ada"), options: [dayOption, eveningOption], existingState: null },
    {
      employee: employee("grace", "Grace", "part_time"),
      options: [dayOption],
      existingState: {
        kind: "worked",
        segments: [{ shiftId: 2, jobId: 11, position: 0, isMentored: false }],
        assignmentIds: [101],
        absenceTypeId: null,
        customStartTime: null,
        customEndTime: null,
      },
    },
  ];
}

function renderModal(overrides: Partial<React.ComponentProps<typeof OpenShiftStaffingModal>> = {}) {
  const onAssign = vi.fn();
  const onClose = vi.fn();
  render(
    <OpenShiftStaffingModal
      assignmentLabel="Day shift · Nurse"
      assignmentLabelById={
        new Map([
          [100, "Day shift · Nurse"],
          [101, "Evening · Support"],
        ])
      }
      candidates={candidates()}
      dateLabel="Monday, September 14"
      needed={2}
      onAssign={onAssign}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onAssign, onClose };
}

describe("OpenShiftStaffingModal", () => {
  it("shows the opening and eligible staff with compact availability context", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Assign open shift" });
    expect(within(dialog).getAllByText("Day shift · Nurse").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("2 people needed")).toBeInTheDocument();
    expect(within(dialog).getByText("Ada Nurse")).toBeInTheDocument();
    expect(within(dialog).getByText("Part-time · Already working that day")).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Ada Nurse/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("searches candidates and reports a no-match state", () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("Search eligible staff"), {
      target: { value: "Grace" },
    });
    expect(screen.queryByText("Ada Nurse")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Nurse")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Search eligible staff"), {
      target: { value: "Nobody" },
    });
    expect(screen.getByText("No matching staff")).toBeInTheDocument();
  });

  it("selects a person and submits their available assignment", () => {
    const { onAssign } = renderModal();
    fireEvent.click(screen.getByRole("radio", { name: /Grace Nurse/ }));
    fireEvent.click(screen.getByRole("button", { name: "Assign to schedule" }));
    expect(onAssign).toHaveBeenCalledWith(
      expect.objectContaining({ employee: expect.objectContaining({ id: "grace" }) }),
      dayOption,
    );
  });

  it("shows a useful empty state and disables assignment", () => {
    renderModal({ candidates: [] });
    expect(screen.getByText("No eligible staff")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign to schedule" })).toBeDisabled();
    expect(screen.queryByPlaceholderText("Search eligible staff")).not.toBeInTheDocument();
  });

  it("keeps both adjacent actions equal-sized and disables them while submitting", () => {
    renderModal({ isSubmitting: true });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const assign = screen.getByRole("button", { name: "Assign to schedule" });
    expect(cancel).toBeDisabled();
    expect(assign).toBeDisabled();
    expect(cancel.parentElement).toHaveClass("dg-open-shift-staffing-actions");
  });
});
