import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserManagementSettings from "@/components/settings/UserManagement";
import {
  fetchInvitations,
  fetchOrganizationUsers,
  updateOrganizationMembershipGuarded,
} from "@/lib/db";
import type { Invitation, OrganizationUser } from "@/types";

vi.mock("@/lib/db", () => ({
  fetchOrganizationUsers: vi.fn(),
  updateOrganizationMembershipGuarded: vi.fn(),
  fetchInvitations: vi.fn(),
  removeOrganizationMembershipGuarded: vi.fn(),
  revokeOrganizationInvitationGuarded: vi.fn(),
  resendOrganizationInvitationGuarded: vi.fn(),
  OrganizationAccessConflictError: class OrganizationAccessConflictError extends Error {
    latestUser: OrganizationUser;

    constructor(latestUser: OrganizationUser) {
      super("Organization access changed elsewhere.");
      this.latestUser = latestUser;
      this.name = "OrganizationAccessConflictError";
    }
  },
  InvitationAccessConflictError: class InvitationAccessConflictError extends Error {
    latestInvitation: Invitation;

    constructor(latestInvitation: Invitation) {
      super("Invitation changed elsewhere.");
      this.latestInvitation = latestInvitation;
      this.name = "InvitationAccessConflictError";
    }
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/hooks", () => ({
  useMediaQuery: () => false,
  MOBILE: "(max-width: 767px)",
}));

vi.mock("@/lib/notify", () => ({
  queueNotification: vi.fn(),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "owner-user-id" },
  }),
}));

function makeAdminUser(overrides: Partial<OrganizationUser> = {}): OrganizationUser {
  const { updatedAt = "2024-01-05T00:00:00.000Z", ...restOverrides } = overrides;

  return {
    id: "admin-user-id",
    email: "alex@example.com",
    firstName: "Alex",
    lastName: "Admin",
    orgRole: "admin",
    platformRole: "none",
    adminPermissions: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    lastSignInAt: "2024-01-10T00:00:00.000Z",
    updatedAt,
    departmentIds: [],
    deptAdminIds: [],
    ...restOverrides,
  };
}

const updateOrganizationMembershipGuardedMock = vi.mocked(updateOrganizationMembershipGuarded);

describe("UserManagement dirty save controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchOrganizationUsers).mockResolvedValue([makeAdminUser()]);
    vi.mocked(fetchInvitations).mockResolvedValue([]);
    updateOrganizationMembershipGuardedMock.mockResolvedValue(
      makeAdminUser({
        updatedAt: "2024-01-06T00:00:00.000Z",
        adminPermissions: {
          canViewSchedule: true,
          canEditShifts: true,
          canPublishSchedule: false,
          canApplyRecurringSchedule: false,
          canEditNotes: false,
          canViewRecurringShifts: false,
          canManageRecurringShifts: false,
          canManageShiftSeries: false,
          canViewStaff: true,
          canViewEmployeeDetails: true,
          canManageEmployees: true,
          canViewFocusAreas: false,
          canManageFocusAreas: false,
          canViewScheduleDefinitions: false,
          canManageScheduleDefinitions: false,
          canViewIndicatorTypes: false,
          canManageIndicatorTypes: false,
          canManageOrgSettings: false,
          canViewOrgLabels: false,
          canManageOrgLabels: false,
          canViewCoverageRequirements: false,
          canManageCoverageRequirements: false,
          canApproveShiftRequests: false,
          canViewDashboardAnalytics: false,
        },
      }),
    );
  });

  it("shows Close for a clean permissions panel and collapses it", async () => {
    const user = userEvent.setup();

    render(<UserManagementSettings orgId="org-1" isSuperAdmin />);

    await screen.findByText("Alex Admin");
    await user.click(screen.getByText("Alex Admin"));

    expect(await screen.findByRole("button", { name: /^close$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^close$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    });
  });

  it("shows Discard for dirty permissions and restores the saved draft without collapsing", async () => {
    const user = userEvent.setup();

    render(<UserManagementSettings orgId="org-1" isSuperAdmin />);

    await screen.findByText("Alex Admin");
    await user.click(screen.getByText("Alex Admin"));

    const saveButton = await screen.findByRole("button", { name: /^save$/i });
    const toggles = screen.getAllByRole("switch");
    const editableToggle = toggles.find((toggle) => !toggle.hasAttribute("disabled"));
    if (!editableToggle) throw new Error("Expected at least one editable permission toggle");
    const initialChecked = editableToggle.getAttribute("aria-checked");

    await user.click(editableToggle);

    const cancelButton = screen.getByRole("button", { name: /^discard$/i });
    expect(saveButton).toBeEnabled();
    expect(cancelButton).toBeInTheDocument();
    expect(cancelButton.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();

    await user.click(cancelButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
      expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
      const resetToggle = screen.getAllByRole("switch").find((toggle) => !toggle.hasAttribute("disabled"));
      expect(resetToggle).toHaveAttribute("aria-checked", initialChecked ?? "false");
    });
  });

  it("prompts before collapsing dirty permissions from the row toggle", async () => {
    const user = userEvent.setup();

    render(<UserManagementSettings orgId="org-1" isSuperAdmin />);

    await screen.findByText("Alex Admin");
    await user.click(screen.getByText("Alex Admin"));

    const toggles = screen.getAllByRole("switch");
    const editableToggle = toggles.find((toggle) => !toggle.hasAttribute("disabled"));
    if (!editableToggle) throw new Error("Expected at least one editable permission toggle");

    await user.click(editableToggle);
    await user.click(screen.getByText("Alex Admin"));

    expect(screen.getByRole("dialog", { name: /unsaved changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep editing/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /keep editing/i }));

    expect(screen.queryByRole("dialog", { name: /unsaved changes/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("switch").length).toBeGreaterThan(0);
  });

  it("dismisses the review modal after confirming a successful permissions save", async () => {
    const user = userEvent.setup();

    render(<UserManagementSettings orgId="org-1" isSuperAdmin />);

    await screen.findByText("Alex Admin");
    await user.click(screen.getByText("Alex Admin"));

    const editableToggle = screen
      .getAllByRole("switch")
      .find((toggle) => !toggle.hasAttribute("disabled"));
    if (!editableToggle) throw new Error("Expected at least one editable permission toggle");

    await user.click(editableToggle);
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      await screen.findByRole("dialog", { name: /review permission changes/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirm save/i }));

    await waitFor(() => {
      expect(updateOrganizationMembershipGuardedMock).toHaveBeenCalledOnce();
      expect(
        screen.queryByRole("dialog", { name: /review permission changes/i }),
      ).not.toBeInTheDocument();
    });
  });
});
