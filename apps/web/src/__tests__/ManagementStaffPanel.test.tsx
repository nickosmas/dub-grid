import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ManagementStaffPanel } from "@/components/staff/ManagementStaffPanel";
import type { DirectoryPerson } from "@/types";

function makePerson(overrides: Partial<DirectoryPerson> = {}): DirectoryPerson {
  return {
    personId: "user-1",
    source: "user_only",
    employeeId: null,
    employeeNumber: null,
    userId: "user-1",
    firstName: "Jordan",
    lastName: "Lee",
    email: "jordan@example.com",
    phone: "(415) 425-3334",
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
  contactEmail: string | null = null,
  panelOverrides: Partial<
    Pick<
      React.ComponentProps<typeof ManagementStaffPanel>,
      | "canManageScheduleEmployees"
      | "canManageManagementAccess"
      | "onAddToSchedule"
      | "onRoleChange"
      | "onSave"
      | "onRevokeInvitation"
      | "onResendInvitation"
    >
  > = {},
) {
  const onSave = panelOverrides.onSave ?? vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();

  render(
    <ManagementStaffPanel
      person={makePerson({
        managementDepartmentIds: [10],
        isManagementUser: true,
        ...personOverrides,
      })}
      contactEmail={contactEmail}
      departments={departments}
      departmentLabel="Departments"
      canManageScheduleEmployees
      canManageManagementAccess
      onClose={onClose}
      onSave={onSave}
      {...panelOverrides}
    />,
  );

  return { onSave, onClose };
}

describe("ManagementStaffPanel", () => {
  it("closes after a successful save", async () => {
    const user = userEvent.setup();
    const { onSave, onClose } = renderPanel();

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
        email: "jordan@example.com",
        phone: "(415) 425-3334",
        managementDepartmentIds: [10],
      });
      expect(saveButton).toBeDisabled();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("stays open with the draft intact when saving fails", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    const { onClose } = renderPanel({}, undefined, null, { onSave });

    const firstNameInput = screen.getByDisplayValue("Jordan");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Jordyn");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onClose).not.toHaveBeenCalled();
    expect(firstNameInput).toHaveValue("Jordyn");
    expect(screen.getByRole("button", { name: /^save$/i })).toBeEnabled();
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
        email: "jordan@example.com",
        phone: "(415) 425-3334",
        managementDepartmentIds: [10],
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
      [
        {
          id: 10,
          orgId: "org-1",
          name: "Leadership",
          abbr: "LEAD",
          sortOrder: 0,
        },
      ],
    );

    await user.click(screen.getByRole("button", { name: "Leadership" }));

    expect(
      screen.getByText(/must stay assigned to at least one management department/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  it("prompts before closing the panel with unsaved changes", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();

    const firstNameInput = screen.getByDisplayValue("Jordan");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Jordyn");

    // The footer dismiss button now reads "Discard" while dirty (it resets
    // the draft in place and never auto-closes). The icon close button in
    // the header is the only remaining "Close" affordance, and still goes
    // through the confirm-before-closing flow.
    await user.click(screen.getByRole("button", { name: /^close$/i }));

    expect(screen.getByRole("dialog", { name: /unsaved changes/i })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(
      within(screen.getByRole("dialog", { name: /unsaved changes/i })).getByRole("button", {
        name: /^discard$/i,
      }),
    );

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("keeps management actions outside the scroll region and above editor actions", () => {
    renderPanel({}, undefined, null, { onAddToSchedule: vi.fn() });

    const actionFooter = document.querySelector<HTMLElement>('[data-slot="staff-panel-actions"]');
    const editorFooter = document.querySelector<HTMLElement>(
      '[data-slot="staff-panel-editor-actions"]',
    );
    const scrollRegion = Array.from(document.querySelectorAll<HTMLElement>("div")).find(
      (element) => element.style.overflowY === "auto",
    );

    expect(screen.getByRole("button", { name: /add to schedule/i })).toBeInTheDocument();
    expect(actionFooter).not.toBeNull();
    expect(editorFooter).not.toBeNull();
    expect(scrollRegion).not.toContainElement(actionFooter);
    expect(actionFooter?.nextElementSibling).toBe(editorFooter);
  });

  it("places the authorized access dropdown in the management-only header", () => {
    renderPanel({}, undefined, null, { onRoleChange: vi.fn().mockResolvedValue(undefined) });

    const headerAccess = document.querySelector<HTMLElement>(
      '[data-slot="management-header-access"]',
    );

    expect(headerAccess).toContainElement(screen.getByText("Admin"));
    expect(headerAccess).not.toHaveTextContent("Role");
    expect(document.querySelector('[data-slot="management-body-access"]')).toBeNull();
  });

  describe("revoking a pending invitation", () => {
    const pending = {
      personId: "inv:invite-1",
      source: "pending_invite" as const,
      userId: null,
      hasAppAccess: false,
      lastSignInAt: null,
      invitationStatus: "pending" as const,
    };

    it("asks once in a dialog and only revokes once that is confirmed", async () => {
      const user = userEvent.setup();
      const onRevokeInvitation = vi.fn().mockResolvedValue(true);
      const { onClose } = renderPanel(pending, undefined, null, { onRevokeInvitation });

      await user.click(screen.getByRole("button", { name: "Revoke Invitation" }));

      const dialog = await screen.findByRole("dialog", { name: "Revoke Invitation?" });
      expect(onRevokeInvitation).not.toHaveBeenCalled();
      expect(screen.queryByText(/Revoke this invitation\?/)).not.toBeInTheDocument();

      await user.click(within(dialog).getByRole("button", { name: "Revoke" }));

      expect(onRevokeInvitation).toHaveBeenCalledWith("invite-1");
      await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    });

    it("does nothing and stays open when the revoke is cancelled", async () => {
      const user = userEvent.setup();
      const onRevokeInvitation = vi.fn().mockResolvedValue(true);
      const { onClose } = renderPanel(pending, undefined, null, { onRevokeInvitation });

      await user.click(screen.getByRole("button", { name: "Revoke Invitation" }));
      const dialog = await screen.findByRole("dialog", { name: "Revoke Invitation?" });
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(onRevokeInvitation).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Revoke Invitation" })).toBeEnabled();
    });

    it("asks before reissuing, and resends only once confirmed", async () => {
      const user = userEvent.setup();
      const onResendInvitation = vi.fn().mockResolvedValue(undefined);
      renderPanel(pending, undefined, null, { onResendInvitation });

      await user.click(screen.getByRole("button", { name: "Resend Invitation" }));
      const dialog = await screen.findByRole("dialog", { name: "Reissue Invitation?" });
      expect(onResendInvitation).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole("button", { name: "Reissue" }));
      expect(onResendInvitation).toHaveBeenCalledWith("invite-1");
    });
  });
});
