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

function renderPanel(personOverrides: Partial<DirectoryPerson> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);

  render(
    <ManagementStaffPanel
      person={makePerson(personOverrides)}
      departments={[]}
      departmentLabel="Departments"
      canManageScheduleEmployees
      canManageManagementAccess
      onClose={vi.fn()}
      onSave={onSave}
    />,
  );

  return { onSave };
}

describe("ManagementStaffPanel", () => {
  it("shows Save Changes immediately but disables it until the draft changes, then disables it again after save", async () => {
    const user = userEvent.setup();
    const { onSave } = renderPanel();

    const saveButton = await screen.findByRole("button", { name: /save changes/i });
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
        managementDepartmentIds: [],
      });
      expect(saveButton).toBeDisabled();
    });
  });

  it("requires a first name before enabling save", async () => {
    const user = userEvent.setup();
    renderPanel();

    const saveButton = await screen.findByRole("button", { name: /save changes/i });
    const firstNameInput = screen.getByDisplayValue("Jordan");

    await user.clear(firstNameInput);
    await user.tab();

    expect(screen.getByText("First name is required")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
  });

  it("requires a last name before enabling save", async () => {
    const user = userEvent.setup();
    renderPanel();

    const saveButton = await screen.findByRole("button", { name: /save changes/i });
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
    const saveButton = await screen.findByRole("button", { name: /save changes/i });

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
        managementDepartmentIds: [],
      });
    });
  });
});
