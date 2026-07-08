import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsRoute from "./page";
import { fetchOrganizationBilling } from "@/features/billing/client";
import { useOrganizationData, usePermissions } from "@/hooks";
import type { OrganizationBillingSummary } from "@/types";

const mockReplace = vi.fn();
let mockSection: string | null = null;

const permissions = {
  role: "admin",
  orgId: "org-1",
  canManageOrg: true,
  canAccessSettings: true,
  isSuperAdmin: false,
  isGridmaster: false,
  isLoading: false,
  canManageOrgLabels: true,
  canViewOrgLabels: true,
  canManageFocusAreas: true,
  canViewFocusAreas: true,
  canManageScheduleDefinitions: true,
  canViewScheduleDefinitions: true,
  canManageIndicatorTypes: true,
  canViewIndicatorTypes: true,
  canManageOrgSettings: true,
  canManageCoverageRequirements: true,
  canViewCoverageRequirements: true,
};

const organizationData = {
  org: { id: "org-1", name: "Acme", featureOverrides: null },
  focusAreas: [],
  assignments: [],
  allAssignmentDefinitions: [],
  allAssignmentDefinitionsRef: { current: [] },
  absenceTypes: [],
  allAbsenceTypes: [],
  allAbsenceTypesRef: { current: [] },
  shiftCategories: [],
  jobs: [],
  indicatorTypes: [],
  certifications: [],
  orgRoles: [],
  departments: [],
  assignmentLabelMap: new Map(),
  absenceTypeMap: new Map(),
  coverageRequirements: [],
  loading: false,
  loadError: null,
  setupStatus: {
    isComplete: true,
    missing: {
      focusAreas: false,
      scheduleDefinitions: false,
      certifications: false,
      orgRoles: false,
    },
  },
  setOrg: vi.fn(),
  setFocusAreas: vi.fn(),
  handleAssignmentDefinitionsChange: vi.fn(),
  handleAbsenceTypesChange: vi.fn(),
  setShiftCategories: vi.fn(),
  setJobs: vi.fn(),
  setIndicatorTypes: vi.fn(),
  handleCertificationsChange: vi.fn(),
  setOrgRoles: vi.fn(),
  setDepartments: vi.fn(),
  setCoverageRequirements: vi.fn(),
};

const billingSummary: OrganizationBillingSummary = {
  orgId: "org-1",
  orgName: "Acme",
  orgSlug: "acme",
  status: "active",
  trialEndsAt: null,
  currentPeriodEnd: null,
  cancelAt: null,
  canceledAt: null,
  subscriptionSeats: null,
  appUserCount: 1,
  seatDelta: null,
  hasStripeCustomer: true,
  hasStripeSubscription: true,
  stripeConfigured: true,
  canManageBilling: true,
  billingAccess: {
    state: "active",
    reason: "active_subscription",
    isLocked: false,
    shouldNotifyAdmins: false,
    daysUntilTrialEnd: null,
    trialGraceEndsAt: null,
  },
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => (key === "section" ? mockSection : null),
  }),
}));

vi.mock("@/components/RouteGuards", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ProgressBar", () => ({
  default: ({ loading }: { loading: boolean }) => (
    <div data-testid="progress" data-loading={String(loading)} />
  ),
}));

vi.mock("@/components/settings/SettingsPage", () => ({
  default: () => <div>Settings content</div>,
}));

vi.mock("@/components/settings/BillingSettings", () => ({
  default: ({ organization }: { organization: { id: string } }) => (
    <div>Billing recovery for {organization.id}</div>
  ),
}));

vi.mock("@/features/billing/client", () => ({
  fetchOrganizationBilling: vi.fn(),
}));

vi.mock("@/hooks", () => ({
  usePermissions: vi.fn(),
  useOrganizationData: vi.fn(),
}));

function renderSettingsRoute() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsRoute />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSection = null;
  vi.mocked(fetchOrganizationBilling).mockResolvedValue(billingSummary);
  vi.mocked(usePermissions).mockReturnValue({ ...permissions } as ReturnType<
    typeof usePermissions
  >);
  vi.mocked(useOrganizationData).mockReturnValue(
    organizationData as unknown as ReturnType<typeof useOrganizationData>,
  );
});

describe("SettingsRoute", () => {
  it("redirects regular users and does not enable settings bootstrap", async () => {
    vi.mocked(usePermissions).mockReturnValue({
      ...permissions,
      role: "user",
      canManageOrg: false,
      canAccessSettings: true,
    } as ReturnType<typeof usePermissions>);

    renderSettingsRoute();

    expect(screen.queryByText("Settings content")).not.toBeInTheDocument();
    expect(useOrganizationData).toHaveBeenCalledWith({
      includeAssignmentDefinitionCompatibility: false,
      enabled: false,
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/profile");
    });
  });

  it("renders settings for admins with settings access", () => {
    renderSettingsRoute();

    expect(screen.getByText("Settings content")).toBeInTheDocument();
    expect(useOrganizationData).toHaveBeenCalledWith({
      includeAssignmentDefinitionCompatibility: false,
      enabled: true,
    });
  });

  it("renders normal billing inside settings when billing is not locked", async () => {
    mockSection = "org-billing";
    vi.mocked(usePermissions).mockReturnValue({
      ...permissions,
      role: "super_admin",
      isSuperAdmin: true,
    } as ReturnType<typeof usePermissions>);

    renderSettingsRoute();

    expect(await screen.findByText("Settings content")).toBeInTheDocument();
    expect(screen.queryByText("Billing recovery for org-1")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(useOrganizationData).toHaveBeenCalledWith({
        includeAssignmentDefinitionCompatibility: false,
        enabled: true,
      });
    });
  });

  it("renders billing recovery without enabling settings bootstrap when billing is locked", async () => {
    mockSection = "org-billing";
    vi.mocked(usePermissions).mockReturnValue({
      ...permissions,
      role: "super_admin",
      isSuperAdmin: true,
    } as ReturnType<typeof usePermissions>);
    vi.mocked(fetchOrganizationBilling).mockResolvedValueOnce({
      ...billingSummary,
      status: "canceled",
      billingAccess: {
        state: "locked",
        reason: "payment_status",
        isLocked: true,
        shouldNotifyAdmins: true,
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
    });

    renderSettingsRoute();

    expect(await screen.findByText("Billing recovery for org-1")).toBeInTheDocument();
    expect(screen.queryByText("Settings content")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(useOrganizationData).toHaveBeenCalledWith({
        includeAssignmentDefinitionCompatibility: false,
        enabled: false,
      });
    });
  });
});
