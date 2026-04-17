import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ManagementStaffPanel } from "@/components/staff/ManagementStaffPanel";
import type { DirectoryPerson } from "@/types";

vi.mock("@/components/staff-detail/EmployeeStatusActions", () => ({
  EmployeeStatusActions: () => <div data-testid="employee-status-actions" />,
}));

function makePerson(overrides: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return {
    personId: "user-1",
    source: "user_only",
    employeeId: null,
    userId: "user-1",
    firstName: "Jordan",
    lastName: "Lee",
    email: "jordan@example.com",
    phone: "555-0100",
    employeeStatus: null,
    orgRole: "admin",
    hasAppAccess: true,
    focusAreaIds: [],
    certificationId: null,
    roleIds: [],
    seniority: null,
    lastSignInAt: "2024-01-01T00:00:00.000Z",
    invitationStatus: null,
    scheduledDepartmentIds: [],
    scheduledDeptAdminIds: [],
    managementDepartmentIds: [],
    managementDeptAdminIds: [],
    departmentIds: [],
    deptAdminIds: [],
    isManagementUser: false,
    ...overrides,
  };
}

function renderPanel(
  personOverrides: Partial<DirectoryPerson> = {},
  departments = [
    {
      id: 10,
      orgId: "org-1",
      name: "Leadership",
      abbr: "LEAD",
      sortOrder: 0,
    },
  ],
) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();

  render(
    <ManagementStaffPanel
      person={makePerson({
        managementDepartmentIds: [10],
        isManagementUser: true,
        ...personOverrides,
      })}
      departments={departments}
      departmentLabel="Departments"
      canManageScheduleEmployees
      canManageManagementAccess
      onClose={onClose}
      onSave={onSave}
    />,
  );

  return { onSave, onClose };
}

describe("ManagementStaffPanel", () => {
  it("shows Save immediately but disables it until the draft changes, then disables it again after save", async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel();

    const saveButton = await screen.findByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    const firstNameInput = screen.getByDisplayValue("Jordan");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Jordyn");
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        firstName: "Jordyn",
        lastName: "Lee",
        phone: "555-0100",
        managementDepartmentIds: [10],
      });
      expect(saveButton).toBeDisabled();
    });
  });

  it("requires a first name before enabling save", async () => {
    const user = userEvent.setup();
    renderPanel();

    const saveButton = await screen.findByRole("button", { name: /^save$/i });
    const firstNameInput = screen.getByDisplayValue("Jordan");

    await user.clear(firstNameInput);
    await user.tab();

    expect(screen.getByText("First name is required")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it("requires a last name before enabling save", async () => {
    const user = userEvent.setup();
    renderPanel();

    const saveButton = await screen.findByRole("button", { name: /^save$/i });
    const lastNameInput = screen.getByDisplayValue("Lee");

    await user.clear(lastNameInput);
    await user.tab();

    expect(screen.getByText("Last name is required")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it("trims first and last names before saving", async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel();

    const firstNameInput = screen.getByDisplayValue("Jordan");
    const lastNameInput = screen.getByDisplayValue("Lee");
    const saveButton = await screen.findByRole("button", { name: /^save$/i });

    await user.clear(firstNameInput);
    await user.type(firstNameInput, "  Jordyn  ");
    await user.clear(lastNameInput);
    await user.type(lastNameInput, "  Lane  ");
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        firstName: "Jordyn",
        lastName: "Lane",
        phone: "555-0100",
        managementDepartmentIds: [10],
      });
    });
  });

  it("lets an on-schedule person become schedule-only from the management panel", async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel(
      {
        personId: "emp-1",
        source: "employee",
        employeeId: "emp-1",
        userId: "user-1",
        employeeStatus: "active",
        hasAppAccess: true,
        managementDepartmentIds: [10],
        isManagementUser: true,
      },
      [{ id: 10, orgId: "org-1", name: "Leadership", abbr: "LEAD", sortOrder: 0 }],
    );

    await user.click(screen.getByRole("button", { name: /remove from management/i }));
    expect(screen.getByText(/keep them on the schedule/i)).toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        firstName: "Jordan",
        lastName: "Lee",
        phone: "555-0100",
        managementDepartmentIds: [],
      });
    });
  });

  it("blocks management-only people from clearing their last management department", async () => {
    const user = userEvent.setup();
    renderPanel(
      {
        managementDepartmentIds: [10],
        isManagementUser: true,
      },
      [{ id: 10, orgId: "org-1", name: "Leadership", abbr: "LEAD", sortOrder: 0 }],
    );

    await user.click(screen.getByRole("button", { name: "Leadership" }));

    expect(screen.getByText(/must stay assigned to at least one management department/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("prompts before closing the panel with unsaved changes", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    const firstNameInput = screen.getByDisplayValue("Jordan");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Jordyn");

    const footerCloseButton = screen
      .getAllByRole("button", { name: /^close$/i })
      .find((button) => button.textContent === "Close");
    if (!footerCloseButton) throw new Error("Expected footer Close button");

    await user.click(footerCloseButton);

    expect(screen.getByRole("dialog", { name: /unsaved changes/i })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /discard changes/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
