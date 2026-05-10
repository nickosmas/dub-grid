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
  it("confirms benching with a trimmed note", async () => {
    const user = userEvent.setup();
    const onBench = vi.fn();

    render(
      <EmployeeStatusActions
        employee={makeEmployee()}
        canEdit
        onBench={onBench}
        onActivate={vi.fn()}
        onTerminate={vi.fn()}
        variant="panel"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Bench" }));
    await user.type(
      screen.getByPlaceholderText(/Reason \(optional\)/),
      "  On leave until June  ",
    );
    await user.click(screen.getByRole("button", { name: "Bench" }));

    expect(onBench).toHaveBeenCalledWith("emp-1", "On leave until June");
  });

  it("confirms termination and optionally revokes app access", async () => {
    const user = userEvent.setup();
    const onTerminate = vi.fn();
    const onRevokeAccess = vi.fn();

    render(
      <EmployeeStatusActions
        employee={makeEmployee({ userId: "user-1" })}
        canEdit
        onBench={vi.fn()}
        onActivate={vi.fn()}
        onTerminate={onTerminate}
        onRevokeAccess={onRevokeAccess}
        variant="panel"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Terminate" }));
    await user.click(screen.getByRole("checkbox", { name: /also revoke app access/i }));
    await user.click(screen.getByRole("button", { name: "Terminate" }));

    expect(onTerminate).toHaveBeenCalledWith("emp-1");
    expect(onRevokeAccess).toHaveBeenCalledWith("user-1");
  });

  it("activates benched employees from the shared action area", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();

    render(
      <EmployeeStatusActions
        employee={makeEmployee({ status: "benched" })}
        canEdit
        onBench={vi.fn()}
        onActivate={onActivate}
        onTerminate={vi.fn()}
        variant="page"
      />,
    );

    expect(screen.getByRole("button", { name: "Activate" })).toHaveClass("dg-btn-sm");

    await user.click(screen.getByRole("button", { name: "Activate" }));
    const dialog = screen.getByRole("dialog", { name: "Activate Staff Member?" });
    await user.click(within(dialog).getByRole("button", { name: "Activate" }));
    expect(onActivate).toHaveBeenCalledWith("emp-1");
  });

  it("uses the shared filled warning and danger button treatments for status actions", () => {
    render(
      <EmployeeStatusActions
        employee={makeEmployee()}
        canEdit
        onBench={vi.fn()}
        onActivate={vi.fn()}
        onTerminate={vi.fn()}
        variant="page"
      />,
    );

    expect(screen.getByRole("button", { name: "Bench" })).toHaveClass(
      "dg-btn",
      "dg-btn-warning-filled",
    );
    expect(screen.getByRole("button", { name: "Terminate" })).toHaveClass(
      "dg-btn",
      "dg-btn-danger-filled",
    );
    expect(screen.getByRole("button", { name: "Bench" })).toHaveStyle({
      minWidth: "132px",
    });
  });
});
