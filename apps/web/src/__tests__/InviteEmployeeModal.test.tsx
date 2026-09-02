import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InviteEmployeeModal from "@/components/InviteEmployeeModal";
import type { Department, Employee } from "@/types";
import {
  checkUserExistsByEmail,
  createOrganizationInvitation,
} from "@/features/organization/client";
import { checkEmployeePhoneConflict } from "@/features/employees/client";
import { useIsInSandbox } from "@/hooks/useIsInSandbox";

vi.mock("@/hooks/useIsInSandbox", () => ({
  useIsInSandbox: vi.fn(() => false),
  useSandboxSourceOrgId: vi.fn(() => null),
}));

vi.mock("@/features/organization/client", () => ({
  createOrganizationInvitation: vi.fn(),
  checkUserExistsByEmail: vi.fn().mockResolvedValue({
    exists: false,
    displayName: null,
    existsInThisOrg: false,
    existingEmployeeId: null,
  }),
}));

vi.mock("@/features/employees/client", () => ({
  checkEmployeePhoneConflict: vi.fn(),
}));

vi.mock("@/features/permissions/client", () => ({
  usePermissions: () => ({
    isSuperAdmin: false,
    isGridmaster: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createOrganizationInvitationMock = vi.mocked(createOrganizationInvitation);
const checkUserExistsByEmailMock = vi.mocked(checkUserExistsByEmail);
const checkEmployeePhoneConflictMock = vi.mocked(checkEmployeePhoneConflict);
const useIsInSandboxMock = vi.mocked(useIsInSandbox);

const employee: Employee = {
  id: "emp-1",
  employeeNumber: 1001,
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
  phone: "(415) 425-3334",
  email: "alice@example.com",
  contactNotes: "",
  userId: null,
  departmentIds: [],
  deptAdminIds: [],
  version: 0,
  createdAt: null,
};

const managementDepartments: Department[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "Leadership",
    abbr: "LD",
    type: "management",
    sortOrder: 0,
  },
  {
    id: 2,
    orgId: "org-1",
    name: "Operations",
    abbr: "OPS",
    type: "management",
    sortOrder: 1,
  },
];

describe("InviteEmployeeModal", () => {
  beforeEach(() => {
    useIsInSandboxMock.mockReturnValue(false);
    createOrganizationInvitationMock.mockResolvedValue({
      invitationId: "invite-1",
      token: "invite-token",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    checkEmployeePhoneConflictMock.mockResolvedValue({
      conflict: false,
      conflictingEmployeeId: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => "application/json",
        },
        json: async () => ({ success: true }),
        text: async () => "",
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the outlined secondary treatment for Close", () => {
    render(
      <InviteEmployeeModal
        employee={null}
        orgId="org-1"
        orgName="Test Org"
        onClose={vi.fn()}
        onInvited={vi.fn()}
      />,
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton.className).toContain("dg-btn-secondary");
    expect(closeButton.className).not.toContain("dg-btn-ghost");
  });

  it("requires both names for management invites before enabling send", async () => {
    const user = userEvent.setup();

    render(
      <InviteEmployeeModal
        employee={null}
        orgId="org-1"
        orgName="Test Org"
        onClose={vi.fn()}
        onInvited={vi.fn()}
      />,
    );

    const sendButton = await screen.findByRole("button", {
      name: /send invitation/i,
    });
    const firstNameInput = screen.getByPlaceholderText("Jane");
    const lastNameInput = screen.getByPlaceholderText("Smith");
    const emailInput = screen.getByPlaceholderText("employee@example.com");

    expect(sendButton).toBeDisabled();

    fireEvent.blur(firstNameInput);
    fireEvent.blur(lastNameInput);

    expect(screen.getByText("First name is required")).toBeInTheDocument();
    expect(screen.getByText("Last name is required")).toBeInTheDocument();

    await user.type(emailInput, "manager@example.com");
    expect(sendButton).toBeDisabled();

    await user.type(firstNameInput, "Jordan");
    expect(sendButton).toBeDisabled();

    await user.type(lastNameInput, "Lee");
    expect(sendButton).toBeEnabled();
  });

  it("disables sending and shows a notice in sandbox mode", async () => {
    const user = userEvent.setup();
    useIsInSandboxMock.mockReturnValue(true);

    render(
      <InviteEmployeeModal
        employee={null}
        orgId="org-1"
        orgName="Test Org"
        onClose={vi.fn()}
        onInvited={vi.fn()}
      />,
    );

    const sendButton = await screen.findByRole("button", {
      name: /send invitation/i,
    });

    expect(screen.getByText(/isn't available in sandbox mode/i)).toBeInTheDocument();

    const emailInput = screen.getByPlaceholderText("employee@example.com");
    await user.type(emailInput, "manager@example.com");
    await user.type(screen.getByPlaceholderText("Jane"), "Jordan");
    await user.type(screen.getByPlaceholderText("Smith"), "Lee");

    expect(sendButton).toBeDisabled();
  });

  it("submits trimmed names for management invites", async () => {
    const user = userEvent.setup();
    const onInvited = vi.fn();
    const onClose = vi.fn();

    render(
      <InviteEmployeeModal
        employee={null}
        orgId="org-1"
        orgName="Test Org"
        onClose={onClose}
        onInvited={onInvited}
      />,
    );

    const sendButton = await screen.findByRole("button", {
      name: /send invitation/i,
    });
    const firstNameInput = screen.getByPlaceholderText("Jane");
    const lastNameInput = screen.getByPlaceholderText("Smith");
    const emailInput = screen.getByPlaceholderText("employee@example.com");

    await user.type(firstNameInput, "  Jordan  ");
    await user.type(lastNameInput, "  Lee  ");
    await user.type(emailInput, "manager@example.com");
    await user.click(sendButton);

    await waitFor(() => {
      expect(createOrganizationInvitationMock).toHaveBeenCalledWith({
        email: "manager@example.com",
        role: "user",
        orgId: "org-1",
        employeeId: undefined,
        firstName: "Jordan",
        lastName: "Lee",
        phone: undefined,
        departmentIds: undefined,
      });
      expect(onInvited).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("requires at least one management department for management invites and submits all selected departments", async () => {
    const user = userEvent.setup();

    render(
      <InviteEmployeeModal
        employee={null}
        orgId="org-1"
        orgName="Test Org"
        departments={managementDepartments}
        onClose={vi.fn()}
        onInvited={vi.fn()}
      />,
    );

    const sendButton = await screen.findByRole("button", {
      name: /send invitation/i,
    });
    const firstNameInput = screen.getByPlaceholderText("Jane");
    const lastNameInput = screen.getByPlaceholderText("Smith");
    const emailInput = screen.getByPlaceholderText("employee@example.com");

    await user.type(firstNameInput, "Jordan");
    await user.type(lastNameInput, "Lee");
    await user.type(emailInput, "manager@example.com");

    expect(sendButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Leadership" }));
    await user.click(screen.getByRole("button", { name: "Operations" }));
    expect(sendButton).toBeEnabled();

    await user.click(sendButton);

    await waitFor(() => {
      expect(createOrganizationInvitationMock).toHaveBeenCalledWith({
        email: "manager@example.com",
        role: "user",
        orgId: "org-1",
        employeeId: undefined,
        firstName: "Jordan",
        lastName: "Lee",
        phone: undefined,
        departmentIds: [1, 2],
      });
    });
  });

  it("shows a phone validation error for management invites", async () => {
    const user = userEvent.setup();

    render(
      <InviteEmployeeModal
        employee={null}
        orgId="org-1"
        orgName="Test Org"
        onClose={vi.fn()}
        onInvited={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Jane"), "Jordan");
    await user.type(screen.getByPlaceholderText("Smith"), "Lee");
    await user.type(screen.getByPlaceholderText("employee@example.com"), "manager@example.com");
    const phoneInput = screen.getByPlaceholderText("+1 555-123-4567");
    await user.type(phoneInput, "123");
    fireEvent.blur(phoneInput);

    expect(screen.getByText("Enter a 10-digit US phone number")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send invitation/i })).toBeDisabled();
  });

  it("does not use a pending invitation as a second email-entry source", async () => {
    render(
      <InviteEmployeeModal
        employee={{ ...employee, email: "" }}
        orgId="org-1"
        orgName="Test Org"
        pendingInvitation={{
          id: "inv-1",
          orgId: "org-1",
          invitedBy: "user-2",
          email: "already.invited@example.com",
          roleToAssign: "user",
          expiresAt: "2099-01-01T00:00:00.000Z",
          acceptedAt: null,
          revokedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          employeeId: "emp-1",
        }}
        onClose={vi.fn()}
        onInvited={vi.fn()}
      />,
    );

    expect(screen.queryByPlaceholderText("employee@example.com")).not.toBeInTheDocument();
    expect(screen.getByText(/add an email address in profile details/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send invitation/i })).toBeDisabled();
  });

  it("requires Profile details to supply an employee invitation email", () => {
    render(
      <InviteEmployeeModal
        employee={{ ...employee, email: "" }}
        orgId="org-1"
        orgName="Test Org"
        onClose={vi.fn()}
        onInvited={vi.fn()}
      />,
    );

    expect(screen.queryByPlaceholderText("employee@example.com")).not.toBeInTheDocument();
    expect(screen.getByText(/add an email address in profile details/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send invitation/i })).toBeDisabled();
  });

  it("shows the Profile details target without rendering a duplicate employee email field", () => {
    render(
      <InviteEmployeeModal
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        onClose={vi.fn()}
        onInvited={vi.fn()}
      />,
    );

    expect(screen.queryByPlaceholderText("employee@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(employee.email)).not.toBeInTheDocument();
    expect(checkUserExistsByEmailMock).not.toHaveBeenCalled();
  });

  it("keeps email entry in the management-only profile-creation flow", async () => {
    const user = userEvent.setup();

    render(
      <InviteEmployeeModal
        employee={null}
        orgId="org-1"
        orgName="Test Org"
        onClose={vi.fn()}
        onInvited={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Jane"), "Jordan");
    await user.type(screen.getByPlaceholderText("Smith"), "Lee");
    await user.type(screen.getByPlaceholderText("employee@example.com"), "manager@example.com");
    await user.click(screen.getByRole("button", { name: /send invitation/i }));

    await waitFor(() => {
      expect(createOrganizationInvitationMock).toHaveBeenCalled();
    });
  });

  it("flags a phone number already used by another employee in realtime for management invites", async () => {
    const user = userEvent.setup();
    checkEmployeePhoneConflictMock.mockResolvedValue({
      conflict: true,
      conflictingEmployeeId: "other-emp",
    });

    render(
      <InviteEmployeeModal
        employee={null}
        orgId="org-1"
        orgName="Test Org"
        onClose={vi.fn()}
        onInvited={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText("Jane"), "Jordan");
    await user.type(screen.getByPlaceholderText("Smith"), "Lee");
    await user.type(screen.getByPlaceholderText("employee@example.com"), "manager@example.com");
    await user.type(screen.getByPlaceholderText("+1 555-123-4567"), "(415) 555-0100");

    await screen.findByText(/already used by another person on your team/i);
    expect(screen.getByRole("button", { name: /send invitation/i })).toBeDisabled();
    expect(createOrganizationInvitationMock).not.toHaveBeenCalled();
  });

  it("keeps employee invite mode sendable without separate name fields", async () => {
    const user = userEvent.setup();

    render(
      <InviteEmployeeModal
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        onClose={vi.fn()}
        onInvited={vi.fn()}
      />,
    );

    const sendButton = await screen.findByRole("button", {
      name: /send invitation/i,
    });

    expect(screen.queryByPlaceholderText("Jane")).not.toBeInTheDocument();
    expect(sendButton).toBeEnabled();

    await user.click(sendButton);

    await waitFor(() => {
      expect(createOrganizationInvitationMock).toHaveBeenCalledWith({
        email: "alice@example.com",
        role: "user",
        orgId: "org-1",
        employeeId: "emp-1",
        firstName: undefined,
        lastName: undefined,
        phone: undefined,
        departmentIds: undefined,
      });
    });
  });
});
