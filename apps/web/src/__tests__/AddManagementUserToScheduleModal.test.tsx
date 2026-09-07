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

  it("patches only scheduling attributes and preserves existing profile details", async () => {
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

    await user.click(screen.getByRole("button", { name: "Full-time" }));
    await user.click(screen.getByRole("option", { name: "Part-time" }));
    await user.click(screen.getByRole("button", { name: "North" }));
    await user.click(screen.getByRole("button", { name: "Supervisor" }));

    const addButton = screen.getByRole("button", { name: /add to schedule/i });
    expect(addButton).toBeEnabled();
    await user.click(addButton);

    await waitFor(() => {
      // updateEmployee receives the merged Employee — only the schedule
      // assignments change; profile and management details are preserved.
      expect(updateEmployeeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "emp-99",
          employeeNumber: 1042,
          userId: "user-1",
          firstName: "Jordan",
          lastName: "Lee",
          email: "jordan@example.com",
          phone: "(415) 425-3334",
          employmentType: "part_time",
          certificationId: null,
          focusAreaIds: [1],
          roleIds: [7],
          contactNotes: "",
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

  it("keeps profile fields out of the schedule-only dialog", () => {
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
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/last name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/internal notes/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Full-time" })).toBeInTheDocument();
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
