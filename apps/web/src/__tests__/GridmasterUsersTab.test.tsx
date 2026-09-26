import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { UsersTab } from "@/components/gridmaster/organization-detail/UsersTab";

const stepUpRun = vi.fn();
const requireCredentialAssurance = vi.fn();
const assignGridmasterOrgRoleByEmail = vi.fn();
const createOrganizationInvitation = vi.fn();
const updateOrganizationMembershipGuarded = vi.fn();

vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));
vi.mock("@/features/account/client", () => ({
  requireCredentialAssurance: (...args: unknown[]) => requireCredentialAssurance(...args),
}));
vi.mock("@/features/gridmaster/client", () => ({
  assignGridmasterOrgRoleByEmail: (...args: unknown[]) => assignGridmasterOrgRoleByEmail(...args),
}));
vi.mock("@/features/organization/client", () => ({
  createOrganizationInvitation: (...args: unknown[]) => createOrganizationInvitation(...args),
  OrganizationAccessConflictError: class extends Error {},
  removeOrganizationMembershipGuarded: vi.fn(),
  updateOrganizationMembershipGuarded: (...args: unknown[]) =>
    updateOrganizationMembershipGuarded(...args),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";

async function addAsSuperAdmin(email: string) {
  render(<UsersTab users={[]} orgId={ORG_ID} onUsersChanged={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Add/ }));
  fireEvent.change(screen.getByPlaceholderText("user@example.com"), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole("button", { name: "User" }));
  fireEvent.click(await screen.findByRole("option", { name: "Super Admin" }));
  fireEvent.submit(screen.getByPlaceholderText("user@example.com").closest("form")!);
  fireEvent.click(await screen.findByRole("button", { name: "Add" }));
}

describe("Gridmaster Users tab: adding a person (41d4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
      await action("fresh-token");
      return true;
    });
    requireCredentialAssurance.mockResolvedValue({ success: true });
    assignGridmasterOrgRoleByEmail.mockResolvedValue(undefined);
    createOrganizationInvitation.mockResolvedValue({ invitationId: "inv-1", expiresAt: "x" });
  });

  it("assigns an existing account as Super Admin with the assured token", async () => {
    await addAsSuperAdmin("owner@example.com");

    await waitFor(() =>
      expect(assignGridmasterOrgRoleByEmail).toHaveBeenCalledWith(
        ORG_ID,
        "owner@example.com",
        "super_admin",
        "fresh-token",
      ),
    );
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(createOrganizationInvitation).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("User added as Super Admin");
  });

  it("invites an address with no account, still inside the step-up", async () => {
    assignGridmasterOrgRoleByEmail.mockRejectedValue(
      Object.assign(new Error("No account uses that email."), {
        status: 404,
        code: "ACCOUNT_NOT_FOUND",
      }),
    );

    await addAsSuperAdmin("new-owner@example.com");

    await waitFor(() =>
      expect(createOrganizationInvitation).toHaveBeenCalledWith(
        { orgId: ORG_ID, email: "new-owner@example.com", role: "super_admin" },
        "fresh-token",
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Invitation sent to new-owner@example.com");
  });

  it("sends nothing when step-up is cancelled", async () => {
    stepUpRun.mockResolvedValue(false);

    await addAsSuperAdmin("owner@example.com");

    await waitFor(() => expect(stepUpRun).toHaveBeenCalled());
    expect(assignGridmasterOrgRoleByEmail).not.toHaveBeenCalled();
    expect(createOrganizationInvitation).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports any other failure and invites nobody", async () => {
    assignGridmasterOrgRoleByEmail.mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 403 }),
    );

    await addAsSuperAdmin("owner@example.com");

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(createOrganizationInvitation).not.toHaveBeenCalled();
  });
});

describe("Gridmaster Users tab: permissions (41d4, F-61)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
      await action("fresh-token");
      return true;
    });
    requireCredentialAssurance.mockResolvedValue({ success: true });
    updateOrganizationMembershipGuarded.mockResolvedValue({});
  });

  const admin = {
    id: "user-1",
    email: "admin@example.com",
    firstName: "Ada",
    lastName: "Admin",
    orgRole: "admin",
    adminPermissions: null,
    updatedAt: "2026-09-26T00:00:00.000Z",
  } as unknown as React.ComponentProps<typeof UsersTab>["users"][number];

  async function saveAPermission() {
    render(<UsersTab users={[admin]} orgId={ORG_ID} onUsersChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Configure" }));
    fireEvent.click(await screen.findByRole("switch", { name: "Coverage view" }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    const confirm = screen.queryByRole("button", { name: /confirm save/i });
    if (confirm) fireEvent.click(confirm);
  }

  it("saves a permission change with the assured token", async () => {
    await saveAPermission();

    await waitFor(() =>
      expect(updateOrganizationMembershipGuarded).toHaveBeenCalledWith(
        expect.objectContaining({ orgId: ORG_ID, userId: "user-1" }),
        "fresh-token",
      ),
    );
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(toast.success).toHaveBeenCalledWith("Permissions updated");
  });

  it("saves nothing when step-up is cancelled", async () => {
    stepUpRun.mockResolvedValue(false);

    await saveAPermission();

    await waitFor(() => expect(stepUpRun).toHaveBeenCalled());
    expect(updateOrganizationMembershipGuarded).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
