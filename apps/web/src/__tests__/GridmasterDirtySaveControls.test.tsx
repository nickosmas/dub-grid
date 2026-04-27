import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FeatureFlagsEditor from "@/components/gridmaster/FeatureFlagsEditor";
import OrganizationDetail from "@/components/gridmaster/OrganizationDetail";
import {
  fetchEmployeeCount,
  updateOrganization,
  updateOrganizationSettings,
} from "@/lib/db";
import type { Organization } from "@/types";

vi.mock("@/lib/db", () => ({
  fetchOrganizationUsers: vi.fn(),
  fetchEmployees: vi.fn(),
  fetchEmployeeCount: vi.fn(),
  fetchFocusAreas: vi.fn(),
  fetchShiftCategories: vi.fn(),
  fetchJobDefinitions: vi.fn(),
  fetchCertifications: vi.fn(),
  fetchOrganizationRoles: vi.fn(),
  fetchIndicatorTypes: vi.fn(),
  fetchAbsenceTypes: vi.fn(),
  updateOrganization: vi.fn(),
  updateOrganizationSettings: vi.fn(),
  OrganizationSettingsConflictError: class OrganizationSettingsConflictError extends Error {
    latestOrganization: Organization;

    constructor(latestOrganization: Organization) {
      super("Organization settings were updated by someone else.");
      this.latestOrganization = latestOrganization;
      this.name = "OrganizationSettingsConflictError";
    }
  },
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
    addressLine1: "123 Main St",
    addressLine2: "",
    addressCity: "San Francisco",
    addressState: "CA",
    addressPostalCode: "94108",
    addressCountry: "United States",
    phone: "555-0100",
    employeeCount: 42,
    focusAreaLabel: "Focus Areas",
    certificationLabel: "Certifications",
    roleLabel: "Roles",
    departmentLabel: "Departments",
    shiftDisplayMode: "code",
    timezone: "America/Los_Angeles",
    payPeriodStartDate: null,
    archivedAt: null,
    suspendedAt: null,
    suspendedReason: null,
    enforceConflictPrevention: false,
    stripeCustomerId: null,
    subscriptionStatus: "active",
    trialEndsAt: null,
    subscriptionSeats: null,
    dataRetentionDays: 365,
    updatedAt: "2026-04-15T18:00:00.000000+00:00",
    featureOverrides: {
      beta_shift_requests: false,
      beta_coverage_panel: false,
    },
    ...overrides,
  };
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe("gridmaster dirty save controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateOrganization).mockResolvedValue(undefined);
    vi.mocked(updateOrganizationSettings).mockResolvedValue(makeOrganization());
    vi.mocked(fetchEmployeeCount).mockResolvedValue(42);
  });

  it("only shows feature flag Discard when there are unsaved flag edits", async () => {
    const user = userEvent.setup();

    render(<FeatureFlagsEditor organization={makeOrganization()} />);

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/shift requests \(beta\)/i));
    const discardButton = screen.getByRole("button", { name: /^discard$/i });
    expect(saveButton).toBeEnabled();
    expect(discardButton).toBeEnabled();

    await user.click(discardButton);
    expect(saveButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it("disables feature flag Save again immediately after a successful save", async () => {
    const user = userEvent.setup();

    render(<FeatureFlagsEditor organization={makeOrganization()} />);

    const saveButton = screen.getByRole("button", { name: /^save$/i });

    await user.click(screen.getByLabelText(/shift requests \(beta\)/i));
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
  });

  it("disables organization overview Review & Save until persisted values actually differ", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(
      <OrganizationDetail
        organization={makeOrganization()}
        stats={{ orgId: "org-1", userCount: 8, employeeCount: 42 }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const saveButton = screen.getByRole("button", { name: /review & save/i });
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    const nameInput = screen.getByDisplayValue("Acme Health");
    await user.clear(nameInput);
    await user.type(nameInput, "Acme Health 2");
    expect(saveButton).toBeEnabled();
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(screen.getByDisplayValue("Acme Health")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^discard$/i })).not.toBeInTheDocument();
  });

  it("shows the organization review modal before gridmaster saves overview changes", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(
      <OrganizationDetail
        organization={makeOrganization()}
        stats={{ orgId: "org-1", userCount: 8, employeeCount: 42 }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const nameInput = screen.getByDisplayValue("Acme Health");
    await user.clear(nameInput);
    await user.type(nameInput, "Acme Health 2");

    await user.click(screen.getByRole("button", { name: /review & save/i }));

    expect(screen.getByText(/review organization changes/i)).toBeInTheDocument();
    expect(screen.getByText("Organization Name")).toBeInTheDocument();
    expect(updateOrganizationSettings).not.toHaveBeenCalled();
  });
});
