import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AddManagementUserToScheduleModal } from "@/components/staff/AddManagementUserToScheduleModal";
import type { DirectoryPerson, Employee, FocusArea, NamedItem } from "@/types";
import { EmployeeProfileConflictError, updateEmployee } from "@/features/employees/client";

vi.mock("@/features/employees/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/employees/client")>()),
  updateEmployee: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const updateEmployeeMock = vi.mocked(updateEmployee);

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
    source: "employee",
    employeeId: "emp-99",
    employeeNumber: 1042,
    userId: "user-1",
    firstName: "Jordan",
    lastName: "Lee",
    email: "jordan@example.com",
    phone: "(415) 425-3334",
    employeeStatus: "active",
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

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "emp-99",
    employeeNumber: 1042,
    firstName: "Jordan",
    lastName: "Lee",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [],
    phone: "(415) 425-3334",
    email: "jordan@example.com",
    contactNotes: "",
    userId: "user-1",
    departmentIds: [10],
    deptAdminIds: [],
    version: 0,
    createdAt: null,
    ...overrides,
  };
}

describe("AddManagementUserToScheduleModal", () => {
  beforeEach(() => {
    updateEmployeeMock.mockImplementation(async (employee) => ({
      ...employee,
      version: employee.version + 1,
    }));
  });

  it("requires at least one focus area before patching the existing employee row", async () => {
    render(
      <AddManagementUserToScheduleModal
        orgId="org-1"
        person={makePerson()}
        employee={makeEmployee()}
        focusAreas={focusAreas}
        certifications={certifications}
        roles={roles}
        onClose={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /add to schedule/i })).toBeDisabled();
    expect(updateEmployeeMock).not.toHaveBeenCalled();
  });

  it("patches the existing employee row with the new scheduling attributes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onAdded = vi.fn();
    const employee = makeEmployee();

    render(
      <AddManagementUserToScheduleModal
        orgId="org-1"
        person={makePerson()}
        employee={employee}
        focusAreas={focusAreas}
        certifications={certifications}
        roles={roles}
        onClose={onClose}
        onAdded={onAdded}
      />,
    );

    const firstNameInput = screen.getByDisplayValue("Jordan");
    const lastNameInput = screen.getByDisplayValue("Lee");
    const phoneInput = screen.getByDisplayValue("(415) 425-3334");

    await user.clear(firstNameInput);
    await user.type(firstNameInput, "  Jordyn  ");
    await user.clear(lastNameInput);
    await user.type(lastNameInput, "  Lane  ");
    await user.clear(phoneInput);
    await user.type(phoneInput, "415-555-0199");

    await user.click(screen.getByRole("button", { name: "North" }));
    await user.click(screen.getByRole("button", { name: "Supervisor" }));
    const textboxes = screen.getAllByRole("textbox");
    const notesInput = textboxes[textboxes.length - 1];
    await user.type(notesInput, "Internal note");

    const addButton = screen.getByRole("button", { name: /add to schedule/i });
    expect(addButton).toBeEnabled();
    await user.click(addButton);

    await waitFor(() => {
      // updateEmployee receives the merged Employee — preserves id /
      // employeeNumber / userId / status / departmentIds (management) and
      // overlays the new scheduling fields.
      expect(updateEmployeeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "emp-99",
          employeeNumber: 1042,
          userId: "user-1",
          firstName: "Jordyn",
          lastName: "Lane",
          email: "jordan@example.com",
          phone: "(415) 555-0199",
          certificationId: null,
          focusAreaIds: [1],
          roleIds: [7],
          contactNotes: "Internal note",
        }),
        "org-1",
        0,
      );
      expect(onAdded).toHaveBeenCalledWith(
        expect.objectContaining({ id: "emp-99", focusAreaIds: [1] }),
      );
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("keeps email editing in Profile details", () => {
    render(
      <AddManagementUserToScheduleModal
        orgId="org-1"
        person={makePerson()}
        employee={makeEmployee()}
        focusAreas={focusAreas}
        certifications={certifications}
        roles={roles}
        onClose={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    expect(screen.queryByDisplayValue("jordan@example.com")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  });

  it("blocks the patch when the phone number is invalid", async () => {
    const user = userEvent.setup();

    render(
      <AddManagementUserToScheduleModal
        orgId="org-1"
        person={makePerson()}
        employee={makeEmployee()}
        focusAreas={focusAreas}
        certifications={certifications}
        roles={roles}
        onClose={vi.fn()}
        onAdded={vi.fn()}
      />,
    );

    const phoneInput = screen.getByDisplayValue("(415) 425-3334");
    await user.clear(phoneInput);
    await user.type(phoneInput, "123");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "North" }));

    expect(screen.getByText("Enter a 10-digit US phone number")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add to schedule/i })).toBeDisabled();
  });

  it("replaces stale parent state with the authoritative employee on conflict", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    const latestEmployee = { ...makeEmployee(), firstName: "Server", version: 2 };
    updateEmployeeMock.mockRejectedValueOnce(new EmployeeProfileConflictError(latestEmployee));

    render(
      <AddManagementUserToScheduleModal
        orgId="org-1"
        person={makePerson()}
        employee={makeEmployee()}
        focusAreas={focusAreas}
        certifications={certifications}
        roles={roles}
        onClose={vi.fn()}
        onAdded={onAdded}
      />,
    );

    await user.click(screen.getByRole("button", { name: "North" }));
    await user.click(screen.getByRole("button", { name: /add to schedule/i }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledWith(latestEmployee));
  });
});
