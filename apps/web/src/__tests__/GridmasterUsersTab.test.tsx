import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { UsersTab } from "@/components/gridmaster/organization-detail/UsersTab";

const stepUpRun = vi.fn();
const requireCredentialAssurance = vi.fn();
const assignGridmasterOrgRoleByEmail = vi.fn();
const createOrganizationInvitation = vi.fn();

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
  updateOrganizationMembershipGuarded: vi.fn(),
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
