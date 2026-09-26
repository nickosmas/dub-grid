import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { PersonMembershipActions } from "@/components/gridmaster/person/PersonMembershipActions";
import type { GridmasterPersonOrganization } from "@/features/gridmaster/person-record";

const updateOrganizationMembershipGuarded = vi.fn();
const removeOrganizationMembershipGuarded = vi.fn();
const requireCredentialAssurance = vi.fn();
const stepUpRun = vi.fn();

class OrganizationAccessConflictError extends Error {}

vi.mock("@/features/organization/client", () => ({
  OrganizationAccessConflictError,
  updateOrganizationMembershipGuarded: (...args: unknown[]) =>
    updateOrganizationMembershipGuarded(...args),
  removeOrganizationMembershipGuarded: (...args: unknown[]) =>
    removeOrganizationMembershipGuarded(...args),
}));
vi.mock("@/features/account/client", () => ({
  requireCredentialAssurance: (...args: unknown[]) => requireCredentialAssurance(...args),
}));
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));
vi.mock("@/components/PermissionsEditor", () => ({
  default: ({ onSave }: { onSave: (permissions: unknown) => Promise<unknown> }) => (
    <button type="button" onClick={() => void onSave({ canManageEmployees: true })}>
      Save permissions stub
    </button>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UPDATED = "2026-02-01T00:00:00.000Z";

function organization(
  overrides: Partial<NonNullable<GridmasterPersonOrganization["membership"]>> = {},
): GridmasterPersonOrganization {
  return {
    org: { id: ORG, name: "Calm Haven", slug: "calmhaven" },
    terminology: {
      focusAreaLabel: "Focus Areas",
      certificationLabel: "Certifications",
      roleLabel: "Roles",
      departmentLabel: "Scheduled Departments",
    },
    names: { departments: {}, focusAreas: {}, roles: {}, certifications: {} },
    membership: {
      id: "m-1",
      orgRole: "admin",
      adminPermissions: { canViewReports: true } as never,
      joinedAt: "2026-01-03T00:00:00.000Z",
      scheduleLastViewedAt: null,
      archivedAt: null,
      archivedBy: null,
      departmentIds: [],
      deptAdminIds: [],
      phone: null,
      onboardingCompletedAt: null,
      tooltipToursCompleted: {},
      updatedAt: UPDATED,
      ...overrides,
    },
    employees: [],
    invitations: [],
  };
}

function renderActions(org = organization()) {
  const onChanged = vi.fn();
  render(
    <PersonMembershipActions organization={org} userId={USER} name="Ada" onChanged={onChanged} />,
  );
  return { onChanged };
}

describe("PersonMembershipActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
      await action("fresh-token");
      return true;
    });
    requireCredentialAssurance.mockResolvedValue({ success: true });
    updateOrganizationMembershipGuarded.mockResolvedValue({});
    removeOrganizationMembershipGuarded.mockResolvedValue(undefined);
  });

  it("changes the role in the card's organization through step-up", async () => {
    const { onChanged } = renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Change role" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Change role" })).getByRole("button", {
        name: "Change role",
      }),
    );

    await waitFor(() =>
      expect(updateOrganizationMembershipGuarded).toHaveBeenCalledWith(
        {
          orgId: ORG,
          userId: USER,
          expectedUpdatedAt: UPDATED,
          orgRole: "user",
          adminPermissions: null,
        },
        "fresh-token",
      ),
    );
    expect(requireCredentialAssurance.mock.invocationCallOrder[0]).toBeLessThan(
      updateOrganizationMembershipGuarded.mock.invocationCallOrder[0],
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("changes no role when step-up is cancelled", async () => {
    stepUpRun.mockResolvedValueOnce(false);
    const { onChanged } = renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Change role" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Change role" })).getByRole("button", {
        name: "Change role",
      }),
    );

    await waitFor(() => expect(stepUpRun).toHaveBeenCalled());
    expect(updateOrganizationMembershipGuarded).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Change role" })).toBeInTheDocument();
  });

  it("saves permissions through step-up", async () => {
    const { onChanged } = renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Edit permissions" }));
    fireEvent.click(screen.getByRole("button", { name: "Save permissions stub" }));

    await waitFor(() =>
      expect(updateOrganizationMembershipGuarded).toHaveBeenCalledWith(
        {
          orgId: ORG,
          userId: USER,
          expectedUpdatedAt: UPDATED,
          adminPermissions: { canManageEmployees: true },
        },
        "fresh-token",
      ),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("removes the membership from the card's organization", async () => {
    const { onChanged } = renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Remove from organization" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Remove from organization" })).getByRole("button", {
        name: "Remove",
      }),
    );

    await waitFor(() =>
      expect(removeOrganizationMembershipGuarded).toHaveBeenCalledWith({
        orgId: ORG,
        userId: USER,
        expectedUpdatedAt: UPDATED,
      }),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("reloads the record when the access changed elsewhere", async () => {
    removeOrganizationMembershipGuarded.mockRejectedValueOnce(
      new OrganizationAccessConflictError(),
    );
    const { onChanged } = renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Remove from organization" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Remove from organization" })).getByRole("button", {
        name: "Remove",
      }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Their access changed elsewhere. Review the latest values and try again.",
      ),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("offers nothing for an archived membership, and no permissions for a user", () => {
    const { unmount } = render(
      <PersonMembershipActions
        organization={organization({ archivedAt: "2026-03-01T00:00:00.000Z" })}
        userId={USER}
        name="Ada"
        onChanged={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();

    renderActions(organization({ orgRole: "user", adminPermissions: null }));
    expect(screen.getByRole("button", { name: "Change role" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit permissions" })).not.toBeInTheDocument();
  });
});
