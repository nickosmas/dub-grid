import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AddManagementUserToScheduleModal } from "@/components/staff/AddManagementUserToScheduleModal";
import type { DirectoryPerson, FocusArea, NamedItem } from "@/types";
import {
  createEmployeeFromOrgUser,
  reconcileEmployeeFromOrgUser,
} from "@/features/employees/client";
import { NameMismatchError } from "@/lib/account-linking";

vi.mock("@/features/employees/client", () => ({
  createEmployeeFromOrgUser: vi.fn(),
  reconcileEmployeeFromOrgUser: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createEmployeeFromOrgUserMock = vi.mocked(createEmployeeFromOrgUser);
const reconcileEmployeeFromOrgUserMock = vi.mocked(reconcileEmployeeFromOrgUser);

const focusAreas: FocusArea[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "North",
    sortOrder: 0,
    departmentId: null,
  },
  {
    id: 2,
    orgId: "org-1",
    name: "South",
    sortOrder: 1,
    departmentId: null,
  },
];

const certifications: NamedItem[] = [
  { id: 1, orgId: "org-1", name: "CSN III", abbr: "CSN III", sortOrder: 0 },
];

const roles: NamedItem[] = [
  { id: 7, orgId: "org-1", name: "Supervisor", abbr: "SUPV", sortOrder: 0 },
];

function makePerson(overrides: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return {
    personId: "u:user-1",
    source: "user_only",
    employeeId: null,
    userId: "user-1",
    firstName: "Jordan",
    lastName: "Lee",
    email: "jordan@example.com",
    phone: "555-0100",
    employeeStatus: null,
    orgRole: "user",
    hasAppAccess: true,
    focusAreaIds: [],
    certificationId: null,
    roleIds: [],
    seniority: null,
    lastSignInAt: null,
    invitationStatus: null,
    scheduledDepartmentIds: [],
    scheduledDeptAdminIds: [],
    managementDepartmentIds: [10],
    managementDeptAdminIds: [],
    departmentIds: [10],
    deptAdminIds: [],
    isManagementUser: true,
    ...overrides,
  };
}

describe("AddManagementUserToScheduleModal", () => {
  beforeEach(() => {
    createEmployeeFromOrgUserMock.mockResolvedValue({
      id: "emp-99",
      firstName: "Jordan",
      lastName: "Lee",
      status: "active",
      statusChangedAt: null,
      statusNote: "",
      certificationId: null,
      roleIds: [],
      seniority: 1,
      focusAreaIds: [1],
      phone: "555-0100",
      email: "jordan@example.com",
      contactNotes: "",
      userId: "user-1",
      departmentIds: [],
      deptAdminIds: [],
      version: 0,
    });
    reconcileEmployeeFromOrgUserMock.mockResolvedValue({
      id: "emp-100",
      firstName: "Jordan",
      lastName: "Lee",
      status: "active",
      statusChangedAt: null,
      statusNote: "",
      certificationId: null,
      roleIds: [],
      seniority: 1,
      focusAreaIds: [1],
      phone: "555-0100",
      email: "jordan@example.com",
      contactNotes: "",
      userId: "user-1",
      departmentIds: [],
      deptAdminIds: [],
      version: 0,
    });
  });

  it("requires at least one focus area before adding the management user to the schedule", async () => {
    render(
      <AddManagementUserToScheduleModal
        orgId="org-1"
        person={makePerson()}
        focusAreas={focusAreas}
        certifications={certifications}
        roles={roles}
        onClose={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /add to schedule/i })).toBeDisabled();
    expect(createEmployeeFromOrgUserMock).not.toHaveBeenCalled();
  });

  it("creates a linked schedule employee from the selected management user", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onAdded = vi.fn();

    render(
      <AddManagementUserToScheduleModal
        orgId="org-1"
        person={makePerson()}
        focusAreas={focusAreas}
        certifications={certifications}
        roles={roles}
        onClose={onClose}
        onAdded={onAdded}
      />,
    );

    const firstNameInput = screen.getByDisplayValue("Jordan");
    const lastNameInput = screen.getByDisplayValue("Lee");
    const emailInput = screen.getByDisplayValue("jordan@example.com");
    const phoneInput = screen.getByDisplayValue("555-0100");

    await user.clear(firstNameInput);
    await user.type(firstNameInput, "  Jordyn  ");
    await user.clear(lastNameInput);
    await user.type(lastNameInput, "  Lane  ");
    await user.clear(emailInput);
    await user.type(emailInput, "  jordyn@example.com  ");
    await user.clear(phoneInput);
    await user.type(phoneInput, " 555-0199 ");

    await user.click(screen.getByRole("button", { name: "North" }));
    await user.click(screen.getByRole("button", { name: "SUPV" }));
    const textboxes = screen.getAllByRole("textbox");
    const notesInput = textboxes[textboxes.length - 1];
    await user.type(notesInput, "Internal note");

    const addButton = screen.getByRole("button", { name: /add to schedule/i });
    expect(addButton).toBeEnabled();
    await user.click(addButton);

    await waitFor(() => {
      expect(createEmployeeFromOrgUserMock).toHaveBeenCalledWith({
        orgId: "org-1",
        userId: "user-1",
        firstName: "Jordyn",
        lastName: "Lane",
        email: "jordyn@example.com",
        phone: "555-0199",
        certificationId: null,
        focusAreaIds: [1],
        roleIds: [7],
        contactNotes: "Internal note",
      });
      expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ id: "emp-99" }));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("shows a reconcile step when the entered name does not match the user account and confirms with account name", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onAdded = vi.fn();

    createEmployeeFromOrgUserMock.mockRejectedValue(
      new NameMismatchError({
        employeeId: null,
        userId: "user-1",
        employeeFirstName: "Jordyn",
        employeeLastName: "Lane",
        accountFirstName: "Jordan",
        accountLastName: "Lee",
      }),
    );

    render(
      <AddManagementUserToScheduleModal
        orgId="org-1"
        person={makePerson()}
        focusAreas={focusAreas}
        certifications={certifications}
        roles={roles}
        onClose={onClose}
        onAdded={onAdded}
      />,
    );

    const firstNameInput = screen.getByDisplayValue("Jordan");
    const lastNameInput = screen.getByDisplayValue("Lee");

    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Jordyn");
    await user.clear(lastNameInput);
    await user.type(lastNameInput, "Lane");
    await user.click(screen.getByRole("button", { name: "North" }));
    await user.click(screen.getByRole("button", { name: /add to schedule/i }));

    expect(await screen.findByText("Name mismatch found")).toBeInTheDocument();
    expect(screen.getByText("Jordyn Lane")).toBeInTheDocument();
    expect(screen.getByText("Jordan Lee")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use Account Name and Add to Schedule" }));

    await waitFor(() => {
      expect(reconcileEmployeeFromOrgUserMock).toHaveBeenCalledWith(expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        firstName: "Jordyn",
        lastName: "Lane",
      }));
      expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ id: "emp-100" }));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
