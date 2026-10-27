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

function renderActions(employee: Employee, variant: "panel" | "page" = "panel") {
  const handlers = { onDeactivate: vi.fn(), onActivate: vi.fn(), onRemove: vi.fn() };
  render(<EmployeeStatusActions employee={employee} canEdit variant={variant} {...handlers} />);
  return handlers;
}

describe("EmployeeStatusActions", () => {
  it("marks someone away with a trimmed reason", async () => {
    const user = userEvent.setup();
    const { onDeactivate, onRemove } = renderActions(makeEmployee());

    await user.click(screen.getByRole("button", { name: "Mark away" }));
    const dialog = screen.getByRole("dialog", { name: "Mark Alice Smith away?" });
    expect(within(dialog).getByText(/can still sign in and keep their role/i)).toBeInTheDocument();

    await user.type(within(dialog).getByPlaceholderText(/Reason \(optional\)/), "  Family leave  ");
    await user.click(within(dialog).getByRole("button", { name: "Mark away" }));

    expect(onDeactivate).toHaveBeenCalledWith("emp-1", "Family leave");
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("archives someone with a trimmed reason", async () => {
    const user = userEvent.setup();
    const { onDeactivate, onRemove } = renderActions(makeEmployee({ userId: "user-1" }));

    await user.click(screen.getByRole("button", { name: "Archive" }));
    const dialog = screen.getByRole("dialog", { name: "Archive Alice Smith?" });
    const summary = within(within(dialog).getByRole("region", { name: "Keep in mind" }));
    expect(summary.getByText("They can no longer sign in.")).toBeInTheDocument();

    await user.type(
      within(dialog).getByPlaceholderText(/Reason \(optional\)/),
      "  Left the company  ",
    );
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));

    expect(onRemove).toHaveBeenCalledWith("emp-1", "Left the company");
    expect(onDeactivate).not.toHaveBeenCalled();
  });

  it("offers only Archive for a management-only person", () => {
    renderActions(makeEmployee({ focusAreaIds: [] }));

    expect(screen.queryByRole("button", { name: "Mark away" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
  });

  it("brings an Away person back with Mark active", async () => {
    const user = userEvent.setup();
    const { onActivate } = renderActions(makeEmployee({ status: "inactive" }), "page");

    // Page variant shares its row with Send Invitation / Add to Management,
    // so it wears the default button size, not a smaller one.
    const markActive = screen.getByRole("button", { name: "Mark active" });
    expect(markActive).toHaveClass("dg-btn-success");
    expect(markActive).not.toHaveClass("dg-btn-sm");
    expect(screen.queryByRole("button", { name: "Mark away" })).not.toBeInTheDocument();

    await user.click(markActive);
    const dialog = screen.getByRole("dialog", { name: "Mark Alice Smith active?" });
    await user.click(within(dialog).getByRole("button", { name: "Mark active" }));
    expect(onActivate).toHaveBeenCalledWith("emp-1");
  });

  it("brings an Archived person back with Restore", async () => {
    const user = userEvent.setup();
    const { onActivate } = renderActions(makeEmployee({ status: "removed" }), "page");

    expect(screen.queryByRole("button", { name: "Mark active" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    const dialog = screen.getByRole("dialog", { name: "Restore Alice Smith?" });
    await user.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(onActivate).toHaveBeenCalledWith("emp-1");
  });

  it("keeps the filled warning treatment on Mark away and a neutral Archive", () => {
    renderActions(makeEmployee(), "page");

    expect(screen.getByRole("button", { name: "Mark away" })).toHaveClass(
      "dg-btn",
      "dg-btn-warning-filled",
    );
    expect(screen.getByRole("button", { name: "Archive" })).toHaveClass("dg-btn-secondary");
  });

  it("shows nothing for your own record or without permission", () => {
    const { container } = render(
      <EmployeeStatusActions
        employee={makeEmployee()}
        canEdit
        isSelf
        onDeactivate={vi.fn()}
        onActivate={vi.fn()}
        onRemove={vi.fn()}
        variant="page"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
