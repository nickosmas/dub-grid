import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InviteEmployeeModal from "@/components/InviteEmployeeModal";
import type { Department, Employee } from "@/types";
import { fetchOrganizationUsers, linkEmployeeToUser, reconcileEmployeeNameAndLinkUser, sendInvitation } from "@/lib/db";
import { NameMismatchError } from "@/lib/account-linking";

vi.mock("@/lib/db", () => ({
  fetchOrganizationUsers: vi.fn(),
  linkEmployeeToUser: vi.fn(),
  reconcileEmployeeNameAndLinkUser: vi.fn(),
  sendInvitation: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const fetchOrganizationUsersMock = vi.mocked(fetchOrganizationUsers);
const linkEmployeeToUserMock = vi.mocked(linkEmployeeToUser);
const reconcileEmployeeNameAndLinkUserMock = vi.mocked(reconcileEmployeeNameAndLinkUser);
const sendInvitationMock = vi.mocked(sendInvitation);

const employee: Employee = {
  id: "emp-1",
  firstName: "Alice",
  lastName: "Smith",
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
    sendInvitationMock.mockResolvedValue({
      invitationId: "invite-1",
      token: "invite-token",
      expiresAt: "2026-12-31T00:00:00.000Z",
    });
    linkEmployeeToUserMock.mockResolvedValue({ status: "linked" });
    reconcileEmployeeNameAndLinkUserMock.mockResolvedValue({ status: "linked" });
    fetchOrganizationUsersMock.mockResolvedValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
        text: async () => "",
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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

    const sendButton = await screen.findByRole("button", { name: /send invitation/i });
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

    const sendButton = await screen.findByRole("button", { name: /send invitation/i });
    const firstNameInput = screen.getByPlaceholderText("Jane");
    const lastNameInput = screen.getByPlaceholderText("Smith");
    const emailInput = screen.getByPlaceholderText("employee@example.com");

    await user.type(firstNameInput, "  Jordan  ");
    await user.type(lastNameInput, "  Lee  ");
    await user.type(emailInput, "manager@example.com");
    await user.click(sendButton);

    await waitFor(() => {
      expect(sendInvitationMock).toHaveBeenCalledWith(
        "manager@example.com",
        "user",
        "org-1",
        undefined,
        {
          firstName: "Jordan",
          lastName: "Lee",
          phone: undefined,
          departmentIds: undefined,
        },
      );
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

    const sendButton = await screen.findByRole("button", { name: /send invitation/i });
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
      expect(sendInvitationMock).toHaveBeenCalledWith(
        "manager@example.com",
        "user",
        "org-1",
        undefined,
        {
          firstName: "Jordan",
          lastName: "Lee",
          phone: undefined,
          departmentIds: [1, 2],
        },
      );
    });
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

    const sendButton = await screen.findByRole("button", { name: /send invitation/i });

    expect(screen.queryByPlaceholderText("Jane")).not.toBeInTheDocument();
    expect(sendButton).toBeEnabled();

    await user.click(sendButton);

    await waitFor(() => {
      expect(sendInvitationMock).toHaveBeenCalledWith(
        "alice@example.com",
        "user",
        "org-1",
        "emp-1",
        undefined,
      );
    });
  });

  it("shows a reconcile step when the existing org member name does not match and confirms with account name", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onInvited = vi.fn();

    fetchOrganizationUsersMock.mockResolvedValue([
      {
        id: "user-1",
        email: "alice@example.com",
        firstName: "Alicia",
        lastName: "Smith",
        orgRole: "user",
        platformRole: "none",
        adminPermissions: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastSignInAt: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
        departmentIds: [],
        deptAdminIds: [],
      },
    ]);
    linkEmployeeToUserMock.mockRejectedValue(
      new NameMismatchError({
        employeeId: "emp-1",
        userId: "user-1",
        employeeFirstName: "Alice",
        employeeLastName: "Smith",
        accountFirstName: "Alicia",
        accountLastName: "Smith",
      }),
    );

    render(
      <InviteEmployeeModal
        employee={employee}
        orgId="org-1"
        orgName="Test Org"
        onClose={onClose}
        onInvited={onInvited}
      />,
    );

    await screen.findByText(/existing user found/i);
    await user.click(screen.getByRole("button", { name: /link to/i }));

    expect(await screen.findByText("Name mismatch found")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Alicia Smith")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use Account Name and Link" }));

    await waitFor(() => {
      expect(reconcileEmployeeNameAndLinkUserMock).toHaveBeenCalledWith("emp-1", "user-1", "org-1");
      expect(onInvited).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
