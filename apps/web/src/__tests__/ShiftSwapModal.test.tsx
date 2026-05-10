import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ShiftSwapModal from "@/components/ShiftSwapModal";
import type { Employee } from "@/types";

const employees: Employee[] = [
  {
    id: "emp-1",
    firstName: "Alice",
    lastName: "Smith",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [],
    phone: "",
    email: "alice@example.com",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
  },
  {
    id: "emp-2",
    firstName: "Bob",
    lastName: "Jones",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 2,
    focusAreaIds: [],
    phone: "",
    email: "bob@example.com",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
  },
];

describe("ShiftSwapModal", () => {
  it("confirms before closing dirty swap changes from the footer Close action", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <ShiftSwapModal
        requesterEmpId="emp-1"
        requesterName="Alice Smith"
        shiftDate="2026-05-04"
        shiftLabel="Day"
        employees={employees}
        shiftForKey={(empId) => (empId === "emp-2" ? "Night" : "Day")}
        isRequestableShift={(empId) => empId === "emp-2"}
        isShiftStarted={() => false}
        getShiftTimeRanges={() => []}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Go to next day" }));
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^close$/i }));

    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
