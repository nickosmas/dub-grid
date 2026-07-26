import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmployeeStatusActions } from "@/components/staff-detail/EmployeeStatusActions";
import type { Employee } from "@/types";

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
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
    focusAreaIds: [1],
    phone: "",
    email: "alice@example.com",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
    ...overrides,
  };
}

describe("EmployeeStatusActions", () => {
  it("defaults Deactivate to inactive + calls onDeactivate with a trimmed note", async () => {
    const user = userEvent.setup();
    const onDeactivate = vi.fn();

    render(
      <EmployeeStatusActions
        employee={makeEmployee()}
        canEdit
        onDeactivate={onDeactivate}
        onActivate={vi.fn()}
        onRemove={vi.fn()}
        variant="panel"
      />,
    );

    // Single combined entry point: "Deactivate"
    await user.click(screen.getByRole("button", { name: "Deactivate" }));

    // Modal opens with "Mark inactive" selected by default → primary button
    // reads "Mark Inactive" (not "Remove").
    const dialog = screen.getByRole("dialog", { name: /Deactivate Alice Smith/i });
    expect(within(dialog).getByRole("radio", { name: /Mark inactive/i })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Remove from staff/i })).not.toBeChecked();

    await user.type(
      within(dialog).getByPlaceholderText(/Reason \(optional\)/),
      "  On leave until June  ",
    );
    await user.click(within(dialog).getByRole("button", { name: "Mark Inactive" }));

    expect(onDeactivate).toHaveBeenCalledWith("emp-1", "On leave until June");
  });

  it("switches the modal to Remove, keeps the note field, and calls onRemove with the trimmed note", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <EmployeeStatusActions
        employee={makeEmployee({ userId: "user-1" })}
        canEdit
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={onRemove}
        variant="panel"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    const dialog = screen.getByRole("dialog", { name: /Deactivate Alice Smith/i });

    await user.click(within(dialog).getByRole("radio", { name: /Remove from staff/i }));

    // Primary button verb flips with the radio.
    expect(within(dialog).getByRole("button", { name: "Remove" })).toBeInTheDocument();
    // Note field is shown for Remove too.
    const noteInput = within(dialog).getByPlaceholderText(/Reason \(optional\)/);
    await user.type(noteInput, "  Left the company  ");

    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(onRemove).toHaveBeenCalledWith("emp-1", "Left the company");
  });

  it("activates inactive employees from the shared action area", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();

    render(
      <EmployeeStatusActions
        employee={makeEmployee({ status: "inactive" })}
        canEdit
        onDeactivate={vi.fn()}
        onActivate={onActivate}
        onRemove={vi.fn()}
        variant="page"
      />,
    );

    expect(screen.getByRole("button", { name: "Activate" })).toHaveClass("dg-btn-sm");

    await user.click(screen.getByRole("button", { name: "Activate" }));
    const dialog = screen.getByRole("dialog", { name: "Activate Staff Member?" });
    await user.click(within(dialog).getByRole("button", { name: "Activate" }));
    expect(onActivate).toHaveBeenCalledWith("emp-1");
  });

  it("only mentions the schedule when the employee has a focus area (management-only employees don't)", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <EmployeeStatusActions
        employee={makeEmployee({ focusAreaIds: [] })}
        canEdit
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={vi.fn()}
        variant="panel"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(screen.getByText(/lose management access/i)).toBeInTheDocument();
    expect(screen.queryByText(/off the schedule/i)).not.toBeInTheDocument();

    rerender(
      <EmployeeStatusActions
        employee={makeEmployee({ focusAreaIds: [1] })}
        canEdit
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={vi.fn()}
        variant="panel"
      />,
    );

    expect(screen.getByText(/temporarily off the schedule/i)).toBeInTheDocument();
  });

  it("uses the shared filled warning treatment for the Deactivate entry point", () => {
    render(
      <EmployeeStatusActions
        employee={makeEmployee()}
        canEdit
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={vi.fn()}
        variant="page"
      />,
    );

    expect(screen.getByRole("button", { name: "Deactivate" })).toHaveClass(
      "dg-btn",
      "dg-btn-warning-filled",
    );
    expect(screen.getByRole("button", { name: "Deactivate" })).toHaveStyle({
      minWidth: "160px",
    });
  });
});
