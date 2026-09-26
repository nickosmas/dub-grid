import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { PersonInvitationActions } from "@/components/gridmaster/person/PersonInvitationActions";
import { PersonStaffActions } from "@/components/gridmaster/person/PersonStaffActions";
import type { GridmasterStaffRecord } from "@/features/gridmaster/person-record";
import type { Invitation } from "@/types";

const activateEmployee = vi.fn();
const deactivateEmployee = vi.fn();
const removeEmployee = vi.fn();
const updateEmployee = vi.fn();
const resendOrganizationInvitationGuarded = vi.fn();
const revokeOrganizationInvitationGuarded = vi.fn();

const {
  EmployeeProfileConflictError,
  EmployeeStatusConflictError,
  EmployeeContactConflictError,
  InvitationAccessConflictError,
} = vi.hoisted(() => ({
  EmployeeProfileConflictError: class extends Error {},
  EmployeeStatusConflictError: class extends Error {},
  EmployeeContactConflictError: class extends Error {},
  InvitationAccessConflictError: class extends Error {},
}));

vi.mock("@/features/employees/client", () => ({
  EmployeeProfileConflictError,
  EmployeeStatusConflictError,
  EmployeeContactConflictError,
  activateEmployee: (...args: unknown[]) => activateEmployee(...args),
  deactivateEmployee: (...args: unknown[]) => deactivateEmployee(...args),
  removeEmployee: (...args: unknown[]) => removeEmployee(...args),
  updateEmployee: (...args: unknown[]) => updateEmployee(...args),
}));
vi.mock("@/features/organization/client", () => ({
  InvitationAccessConflictError,
  resendOrganizationInvitationGuarded: (...args: unknown[]) =>
    resendOrganizationInvitationGuarded(...args),
  revokeOrganizationInvitationGuarded: (...args: unknown[]) =>
    revokeOrganizationInvitationGuarded(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAFF = "44444444-4444-4444-8444-444444444444";

function staff(overrides: Partial<GridmasterStaffRecord> = {}): GridmasterStaffRecord {
  return {
    id: STAFF,
    orgId: ORG,
    employeeNumber: 7,
    firstName: "Ada",
    lastName: "Lovelace",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [],
    phone: "555-0100",
    email: "ada@example.com",
    contactNotes: "",
    archivedAt: null,
    userId: "11111111-1111-4111-8111-111111111111",
    departmentIds: [],
    deptAdminIds: [],
    version: 4,
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: null,
    updatedBy: null,
    updatedAt: null,
    ...overrides,
  };
}

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: "inv-1",
    orgId: ORG,
    invitedBy: null,
    email: "grace@example.com",
    roleToAssign: "user",
    expiresAt: "2025-06-04T00:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    createdAt: "2025-06-01T00:00:00.000Z",
    updatedAt: "2025-06-01T00:00:00.000Z",
    employeeId: STAFF,
    ...overrides,
  };
}

function confirm(dialogName: string, buttonName: string) {
  fireEvent.click(
    within(screen.getByRole("dialog", { name: dialogName })).getByRole("button", {
      name: buttonName,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const mock of [activateEmployee, deactivateEmployee, removeEmployee, updateEmployee]) {
    mock.mockResolvedValue({});
  }
  resendOrganizationInvitationGuarded.mockResolvedValue({});
  revokeOrganizationInvitationGuarded.mockResolvedValue({});
});

describe("PersonStaffActions", () => {
  it("deactivates with a note and the record's version", async () => {
    const onChanged = vi.fn();
    render(<PersonStaffActions employee={staff()} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    fireEvent.change(screen.getByLabelText("Status note"), { target: { value: " Leave " } });
    confirm("Deactivate staff record", "Deactivate");

    await waitFor(() => expect(deactivateEmployee).toHaveBeenCalledWith(STAFF, "Leave", ORG, 4));
    expect(onChanged).toHaveBeenCalled();
  });

  it("activates an inactive record", async () => {
    render(<PersonStaffActions employee={staff({ status: "inactive" })} onChanged={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    confirm("Activate staff record", "Activate");

    await waitFor(() => expect(activateEmployee).toHaveBeenCalledWith(STAFF, ORG, 4));
  });

  it("reloads and says so when the record changed elsewhere", async () => {
    removeEmployee.mockRejectedValueOnce(new EmployeeStatusConflictError());
    const onChanged = vi.fn();
    render(<PersonStaffActions employee={staff()} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    confirm("Remove staff record", "Remove");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Their staff record changed elsewhere. Review the latest values and try again.",
      ),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("keeps a linked record's sign-in email when saving its details", async () => {
    render(<PersonStaffActions employee={staff()} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit staff record" }));
    expect(screen.queryByLabelText("Staff email")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Staff phone"), { target: { value: "555-0199" } });
    confirm("Edit staff record", "Save staff record");

    await waitFor(() => expect(updateEmployee).toHaveBeenCalled());
    const [saved, orgId, version] = updateEmployee.mock.calls[0];
    expect(saved).toMatchObject({ phone: "555-0199", email: "ada@example.com" });
    expect(saved).not.toHaveProperty("orgId");
    expect(saved).not.toHaveProperty("createdBy");
    expect([orgId, version]).toEqual([ORG, 4]);
  });

  it("edits an unlinked record's email and shows a contact conflict", async () => {
    updateEmployee.mockRejectedValueOnce(
      new EmployeeContactConflictError("That email is already used by another person."),
    );
    render(<PersonStaffActions employee={staff({ userId: null })} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit staff record" }));
    fireEvent.change(screen.getByLabelText("Staff email"), {
      target: { value: "grace@example.com" },
    });
    confirm("Edit staff record", "Save staff record");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That email is already used by another person."),
    );
    expect(updateEmployee.mock.calls[0][0]).toMatchObject({ email: "grace@example.com" });
    expect(screen.getByRole("dialog", { name: "Edit staff record" })).toBeInTheDocument();
  });
});

describe("PersonInvitationActions", () => {
  it("resends an expired invitation by its id", async () => {
    const onChanged = vi.fn();
    render(<PersonInvitationActions invitation={invitation()} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: "Resend" }));
    confirm("Resend invitation", "Resend");

    await waitFor(() =>
      expect(resendOrganizationInvitationGuarded).toHaveBeenCalledWith({
        orgId: ORG,
        invitationId: "inv-1",
        expectedUpdatedAt: "2025-06-01T00:00:00.000Z",
      }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("revokes an open invitation", async () => {
    render(<PersonInvitationActions invitation={invitation()} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    confirm("Revoke invitation", "Revoke");

    await waitFor(() => expect(revokeOrganizationInvitationGuarded).toHaveBeenCalled());
  });

  it("offers nothing for an accepted or revoked invitation", () => {
    render(
      <>
        <PersonInvitationActions
          invitation={invitation({ acceptedAt: "2025-06-02T00:00:00.000Z" })}
          onChanged={vi.fn()}
        />
        <PersonInvitationActions
          invitation={invitation({ id: "inv-2", revokedAt: "2025-06-02T00:00:00.000Z" })}
          onChanged={vi.fn()}
        />
      </>,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
