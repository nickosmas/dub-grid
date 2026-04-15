import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FeatureFlagsEditor from "@/components/gridmaster/FeatureFlagsEditor";
import OrganizationDetail from "@/components/gridmaster/OrganizationDetail";
import { updateOrganization } from "@/lib/db";
import type { Organization } from "@/types";

vi.mock("@/lib/db", () => ({
  fetchOrganizationUsers: vi.fn(),
  fetchEmployees: vi.fn(),
  fetchFocusAreas: vi.fn(),
  fetchShiftCodes: vi.fn(),
  fetchCertifications: vi.fn(),
  fetchOrganizationRoles: vi.fn(),
  fetchIndicatorTypes: vi.fn(),
  fetchAbsenceTypes: vi.fn(),
  updateOrganization: vi.fn(),
  restoreOrganization: vi.fn(),
  archiveOrganization: vi.fn(),
  suspendOrganization: vi.fn(),
  unsuspendOrganization: vi.fn(),
  changeOrganizationUserRole: vi.fn(),
  removeUserFromOrganization: vi.fn(),
  assignOrgRoleByEmail: vi.fn(),
  updateAdminPermissions: vi.fn(),
}));

vi.mock("@/lib/notify", () => ({
  queueNotification: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function makeOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    name: "Acme Health",
    slug: "acme-health",
    address: "123 Main St",
    phone: "555-0100",
    employeeCount: 42,
    focusAreaLabel: "Focus Areas",
    certificationLabel: "Certifications",
    roleLabel: "Roles",
    departmentLabel: "Departments",
    shiftDisplayMode: "code",
    timezone: "America/Los_Angeles",
    archivedAt: null,
    suspendedAt: null,
    suspendedReason: null,
    enforceConflictPrevention: false,
    stripeCustomerId: null,
    subscriptionStatus: "active",
    trialEndsAt: null,
    subscriptionSeats: null,
    dataRetentionDays: 365,
    featureOverrides: {
      beta_shift_requests: false,
      beta_coverage_panel: false,
    },
    ...overrides,
  };
}

describe("gridmaster dirty save controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateOrganization).mockResolvedValue(undefined);
  });

  it("keeps feature flag Save/Discard visible and disabled until changes are made, then disables again after discard", async () => {
    const user = userEvent.setup();

    render(<FeatureFlagsEditor organization={makeOrganization()} />);

    const saveButton = screen.getByRole("button", { name: /save changes/i });
    const discardButton = screen.getByRole("button", { name: /discard/i });
    expect(saveButton).toBeDisabled();
    expect(discardButton).toBeDisabled();

    await user.click(screen.getByLabelText(/shift requests \(beta\)/i));
    expect(saveButton).toBeEnabled();
    expect(discardButton).toBeEnabled();

    await user.click(discardButton);
    expect(saveButton).toBeDisabled();
    expect(discardButton).toBeDisabled();
  });

  it("disables feature flag Save Changes again immediately after a successful save", async () => {
    const user = userEvent.setup();

    render(<FeatureFlagsEditor organization={makeOrganization()} />);

    const saveButton = screen.getByRole("button", { name: /save changes/i });

    await user.click(screen.getByLabelText(/shift requests \(beta\)/i));
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
  });

  it("disables organization overview Save until persisted values actually differ", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationDetail
        organization={makeOrganization()}
        stats={{ orgId: "org-1", userCount: 8, employeeCount: 42 }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    const nameInput = screen.getByDisplayValue("Acme Health");
    await user.clear(nameInput);
    await user.type(nameInput, "Acme Health 2");
    expect(saveButton).toBeEnabled();

    await user.clear(nameInput);
    await user.type(nameInput, "Acme Health");
    expect(saveButton).toBeDisabled();
  });
});
