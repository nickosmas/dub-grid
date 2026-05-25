import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import AppShell from "@/components/AppShell";
import { fetchOrganizationBilling } from "@/features/billing/client";
import { fetchOnboardingStatus } from "@/features/onboarding/client";

let mockPathname = "/dashboard";
let mockSection: string | null = null;
const mockRouter = {
  replace: vi.fn(),
};

const mockAuth = {
  user: { id: "user-1" },
  isLoading: false,
};

const mockPermissions = {
  role: "admin",
  orgId: "org-1",
  isLoading: false,
  isGridmaster: false,
  isSuperAdmin: false,
  isImpersonating: false,
  canManageOrg: true,
};

const mockOrganizationData = {
  org: { id: "org-1", name: "Acme" },
  setupStatus: {
    isComplete: false,
    missing: {
      focusAreas: true,
      scheduleDefinitions: true,
      certifications: true,
      orgRoles: true,
    },
  },
  loading: false,
};

const mockEmployeesData = {
  employees: [] as Array<{ id: string }>,
  loading: false,
};

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => mockRouter,
  useSearchParams: () => ({
    get: (key: string) => (key === "section" ? mockSection : null),
  }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("@/hooks", () => ({
  usePermissions: () => mockPermissions,
  useOrganizationData: () => mockOrganizationData,
  useEmployees: () => mockEmployeesData,
}));

vi.mock("@/features/onboarding/client", () => ({
  fetchOnboardingStatus: vi.fn(),
  // Same-session completion/phase guards are sessionStorage-backed; default them
  // off so these scenarios exercise the setupStatus-driven gate logic.
  isOnboardingComplete: vi.fn(() => false),
  getOnboardingPhase: vi.fn(() => null),
  freezeOnboardingPhase: vi.fn(),
}));

vi.mock("@/features/billing/client", () => ({
  fetchOrganizationBilling: vi.fn(),
}));

vi.mock("@/features/billing/useBillingRealtimeInvalidation", () => ({
  useBillingRealtimeInvalidation: vi.fn(),
}));

vi.mock("@/components/onboarding/SetupPendingScreen", () => ({
  default: () => <div>Setup pending</div>,
}));

vi.mock("@/components/onboarding/OnboardingWizard", () => ({
  default: () => <div>Onboarding wizard</div>,
}));

vi.mock("@/components/Header", () => ({
  default: () => <nav aria-label="App header">Dashboard Schedule Profile</nav>,
}));

vi.mock("@/components/ImpersonationBanner", () => ({
  default: () => null,
}));

vi.mock("@/components/UserViewBanner", () => ({
  default: () => null,
}));

vi.mock("@/components/TrialWelcomeModal", () => ({
  default: () => null,
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function renderGate() {
  return renderWithQueryClient(
    <OnboardingGate>
      <div>Protected app</div>
    </OnboardingGate>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname = "/dashboard";
  mockSection = null;
  mockRouter.replace.mockReset();
  mockAuth.user = { id: "user-1" };
  mockAuth.isLoading = false;
  mockPermissions.role = "admin";
  mockPermissions.orgId = "org-1";
  mockPermissions.isLoading = false;
  mockPermissions.isGridmaster = false;
  mockPermissions.isSuperAdmin = false;
  mockPermissions.isImpersonating = false;
  mockPermissions.canManageOrg = true;
  mockOrganizationData.setupStatus = {
    isComplete: false,
    missing: {
      focusAreas: true,
      scheduleDefinitions: true,
      certifications: true,
      orgRoles: true,
    },
  };
  mockOrganizationData.loading = false;
  mockEmployeesData.employees = [];
  mockEmployeesData.loading = false;
  vi.mocked(fetchOnboardingStatus).mockResolvedValue({
    completed: false,
    completedAt: null,
    tooltipToursCompleted: {},
  });
  vi.mocked(fetchOrganizationBilling).mockResolvedValue({
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
  });
});

describe("OnboardingGate setup lock", () => {
  it("shows setup pending for regular users even when onboarding is completed", async () => {
    mockPermissions.role = "user";
    mockPermissions.canManageOrg = false;
    vi.mocked(fetchOnboardingStatus).mockResolvedValue({
      completed: true,
      completedAt: "2026-05-02T00:00:00.000Z",
      tooltipToursCompleted: {},
    });

    renderGate();

    expect(await screen.findByText("Setup pending")).toBeInTheDocument();
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
  });

  it("renders the onboarding wizard inline for setup-capable users while setup is incomplete", async () => {
    renderGate();

    expect(await screen.findByText("Onboarding wizard")).toBeInTheDocument();
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("renders the wizard inline on every route, including /settings, while setup is incomplete", async () => {
    mockPathname = "/settings";

    renderGate();

    expect(await screen.findByText("Onboarding wizard")).toBeInTheDocument();
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("shows setup pending to admins without any manage-* permission while setup is incomplete", async () => {
    // Admin role with no manage capability — can't actually advance the
    // org config wizard, so they wait alongside regular users instead of
    // looping on an orientation that doesn't flip isOrgSetupComplete.
    mockPermissions.role = "admin";
    mockPermissions.canManageOrg = false;

    renderGate();

    expect(await screen.findByText("Setup pending")).toBeInTheDocument();
    expect(screen.queryByText("Onboarding wizard")).not.toBeInTheDocument();
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
  });

  it("allows completed organizations through normally", async () => {
    mockOrganizationData.setupStatus = {
      isComplete: true,
      missing: {
        focusAreas: false,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };
    mockEmployeesData.employees = [{ id: "employee-1" }];
    vi.mocked(fetchOnboardingStatus).mockResolvedValue({
      completed: true,
      completedAt: "2026-05-02T00:00:00.000Z",
      tooltipToursCompleted: {},
    });

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
  });

  it("treats org setup as complete even when no employees exist (adding employees is post-wizard)", async () => {
    mockOrganizationData.setupStatus = {
      isComplete: true,
      missing: {
        focusAreas: false,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };
    mockEmployeesData.employees = [];
    vi.mocked(fetchOnboardingStatus).mockResolvedValue({
      completed: true,
      completedAt: "2026-05-02T00:00:00.000Z",
      tooltipToursCompleted: {},
    });

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
  });

  it("bypasses the setup lock for gridmasters", () => {
    mockPermissions.isGridmaster = true;

    renderGate();

    expect(screen.getByText("Protected app")).toBeInTheDocument();
    expect(fetchOnboardingStatus).not.toHaveBeenCalled();
  });

  it("redirects super admins to billing recovery when billing is locked", async () => {
    mockPermissions.isSuperAdmin = true;
    mockOrganizationData.setupStatus = {
      isComplete: true,
      missing: {
        focusAreas: false,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };
    mockEmployeesData.employees = [{ id: "employee-1" }];
    vi.mocked(fetchOrganizationBilling).mockResolvedValue({
      orgId: "org-1",
      orgName: "Acme",
      orgSlug: "acme",
      status: "canceled",
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAt: null,
      canceledAt: null,
      subscriptionSeats: null,
      appUserCount: 1,
      seatDelta: null,
      hasStripeCustomer: true,
      hasStripeSubscription: false,
      stripeConfigured: true,
      canManageBilling: true,
      billingAccess: {
        state: "locked",
        reason: "payment_status",
        isLocked: true,
        shouldNotifyAdmins: true,
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
    });

    renderGate();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith(
        "/settings?section=org-billing",
      );
    });
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
  });

  it("allows super admins to stay on billing recovery when billing is locked", async () => {
    mockPathname = "/settings";
    mockSection = "org-billing";
    mockPermissions.isSuperAdmin = true;
    mockOrganizationData.setupStatus = {
      isComplete: true,
      missing: {
        focusAreas: false,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };
    mockEmployeesData.employees = [{ id: "employee-1" }];
    vi.mocked(fetchOrganizationBilling).mockResolvedValue({
      orgId: "org-1",
      orgName: "Acme",
      orgSlug: "acme",
      status: "canceled",
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAt: null,
      canceledAt: null,
      subscriptionSeats: null,
      appUserCount: 1,
      seatDelta: null,
      hasStripeCustomer: true,
      hasStripeSubscription: false,
      stripeConfigured: true,
      canManageBilling: true,
      billingAccess: {
        state: "locked",
        reason: "payment_status",
        isLocked: true,
        shouldNotifyAdmins: true,
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
    });

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("renders billing recovery without waiting for setup data", async () => {
    mockPathname = "/settings";
    mockSection = "org-billing";
    mockPermissions.isSuperAdmin = true;
    mockOrganizationData.loading = true;
    mockEmployeesData.loading = true;
    vi.mocked(fetchOrganizationBilling).mockResolvedValue({
      orgId: "org-1",
      orgName: "Acme",
      orgSlug: "acme",
      status: "canceled",
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAt: null,
      canceledAt: null,
      subscriptionSeats: null,
      appUserCount: 1,
      seatDelta: null,
      hasStripeCustomer: true,
      hasStripeSubscription: false,
      stripeConfigured: true,
      canManageBilling: true,
      billingAccess: {
        state: "locked",
        reason: "payment_status",
        isLocked: true,
        shouldNotifyAdmins: true,
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
    });

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe("AppShell setup lock header", () => {
  it("hides operational header navigation while setup is incomplete", () => {
    mockPathname = "/settings";

    renderWithQueryClient(
      <AppShell>
        <div>Settings page</div>
      </AppShell>,
    );

    expect(screen.getByText("Settings page")).toBeInTheDocument();
    expect(screen.queryByLabelText("App header")).not.toBeInTheDocument();
  });

  it("shows the operational header once setup is complete", () => {
    mockPathname = "/settings";
    mockOrganizationData.setupStatus = {
      isComplete: true,
      missing: {
        focusAreas: false,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };
    mockEmployeesData.employees = [{ id: "employee-1" }];

    renderWithQueryClient(
      <AppShell>
        <div>Settings page</div>
      </AppShell>,
    );

    expect(screen.getByLabelText("App header")).toBeInTheDocument();
  });

  it("hides operational header navigation while billing is locked", async () => {
    mockPathname = "/settings";
    mockPermissions.isSuperAdmin = true;
    mockOrganizationData.setupStatus = {
      isComplete: true,
      missing: {
        focusAreas: false,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };
    mockEmployeesData.employees = [{ id: "employee-1" }];
    vi.mocked(fetchOrganizationBilling).mockResolvedValue({
      orgId: "org-1",
      orgName: "Acme",
      orgSlug: "acme",
      status: "canceled",
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAt: null,
      canceledAt: null,
      subscriptionSeats: null,
      appUserCount: 1,
      seatDelta: null,
      hasStripeCustomer: true,
      hasStripeSubscription: false,
      stripeConfigured: true,
      canManageBilling: true,
      billingAccess: {
        state: "locked",
        reason: "payment_status",
        isLocked: true,
        shouldNotifyAdmins: true,
        daysUntilTrialEnd: null,
        trialGraceEndsAt: null,
      },
    });

    renderWithQueryClient(
      <AppShell>
        <div>Billing page</div>
      </AppShell>,
    );

    expect(screen.getByText("Billing page")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByLabelText("App header")).not.toBeInTheDocument();
    });
  });
});
