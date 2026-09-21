import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingGate from "@/components/onboarding/OnboardingGate";
import AppShell from "@/components/AppShell";
import { fetchOrganizationBilling } from "@/features/billing/client";

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
  entryGate: {
    onboardingCompleted: false,
    adminOnboardingCompleted: true,
    billingLocked: null as boolean | null,
  },
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
  useLogout: () => ({ signOut: vi.fn(), signOutOthers: vi.fn() }),
}));

vi.mock("@/features/onboarding/client", () => ({
  // Same-session completion/phase guards are sessionStorage-backed; default them
  // off so these scenarios exercise the setupStatus-driven gate logic.
  isOnboardingComplete: vi.fn(() => false),
  getOnboardingPhase: vi.fn(() => null),
  freezeOnboardingPhase: vi.fn(),
}));

vi.mock("@/features/billing/client", () => ({
  fetchOrganizationBilling: vi.fn(),
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

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function renderGate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const gate = () => (
    <QueryClientProvider client={queryClient}>
      <OnboardingGate>
        <div>Protected app</div>
      </OnboardingGate>
    </QueryClientProvider>
  );
  const result = render(gate());
  return { ...result, rerenderGate: () => result.rerender(gate()) };
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
  mockOrganizationData.org = { id: "org-1", name: "Acme" };
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
  mockOrganizationData.entryGate = {
    onboardingCompleted: false,
    adminOnboardingCompleted: true,
    billingLocked: null,
  };
  mockEmployeesData.employees = [];
  mockEmployeesData.loading = false;
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
  it("shows setup pending for regular users who have not completed onboarding", async () => {
    mockPermissions.role = "user";
    mockPermissions.canManageOrg = false;

    renderGate();

    expect(await screen.findByText("Setup pending")).toBeInTheDocument();
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
  });

  it("keeps onboarded members in the app while org config is incomplete", async () => {
    mockPermissions.role = "user";
    mockPermissions.canManageOrg = false;
    mockOrganizationData.entryGate.onboardingCompleted = true;

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
    expect(screen.queryByText("Setup pending")).not.toBeInTheDocument();
  });

  it("keeps onboarded setup-capable users in the app while org config is incomplete", async () => {
    mockOrganizationData.entryGate.onboardingCompleted = true;

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
    expect(screen.queryByText("Onboarding wizard")).not.toBeInTheDocument();
  });

  it("does not replace the app with onboarding when setup completeness flips mid-session", async () => {
    // An admin adding a focus area, shift, or job makes setupStatus incomplete
    // for the whole org until they finish placing it, and the bootstrap refetch
    // that carries it reaches every open tab.
    mockPermissions.role = "user";
    mockPermissions.canManageOrg = false;
    mockOrganizationData.setupStatus = {
      isComplete: true,
      missing: {
        focusAreas: false,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };
    mockOrganizationData.entryGate.onboardingCompleted = true;

    const { rerenderGate } = renderGate();
    expect(await screen.findByText("Protected app")).toBeInTheDocument();

    mockOrganizationData.entryGate = {
      onboardingCompleted: false,
      adminOnboardingCompleted: true,
      billingLocked: null,
    };
    mockOrganizationData.setupStatus = {
      isComplete: false,
      missing: {
        focusAreas: true,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };
    rerenderGate();

    expect(screen.getByText("Protected app")).toBeInTheDocument();
    expect(screen.queryByText("Setup pending")).not.toBeInTheDocument();
    expect(screen.queryByText("Onboarding wizard")).not.toBeInTheDocument();
  });

  it("renders the onboarding wizard inline for setup-capable users while setup is incomplete", async () => {
    renderGate();

    expect(await screen.findByText("Onboarding wizard")).toBeInTheDocument();
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("routes a super admin with setup capability to the setup wizard", async () => {
    mockPermissions.role = "super_admin";
    mockPermissions.isSuperAdmin = true;
    mockPermissions.canManageOrg = true;

    renderGate();

    expect(await screen.findByText("Onboarding wizard")).toBeInTheDocument();
    expect(screen.queryByText("Setup pending")).not.toBeInTheDocument();
  });

  it("routes an admin with setup capability to the setup wizard", async () => {
    mockPermissions.role = "admin";
    mockPermissions.canManageOrg = true;

    renderGate();

    expect(await screen.findByText("Onboarding wizard")).toBeInTheDocument();
    expect(screen.queryByText("Setup pending")).not.toBeInTheDocument();
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

  it("uses persisted onboarding completion after a hard refresh without the session guard", async () => {
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
    mockOrganizationData.entryGate.onboardingCompleted = true;

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
  });

  it("keeps an established signed-in page visible while bootstrap refreshes", async () => {
    mockOrganizationData.loading = true;
    mockOrganizationData.entryGate = null as never;

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
    expect(screen.queryByText("Loading your organization")).not.toBeInTheDocument();
  });

  it("waits for matching bootstrap data before applying another org's admission state", async () => {
    mockOrganizationData.entryGate.onboardingCompleted = true;

    const { rerenderGate } = renderGate();
    expect(await screen.findByText("Protected app")).toBeInTheDocument();

    mockPermissions.orgId = "org-2";
    mockOrganizationData.entryGate = {
      onboardingCompleted: false,
      adminOnboardingCompleted: true,
      billingLocked: true,
    };
    rerenderGate();

    expect(screen.getByText("Protected app")).toBeInTheDocument();
    expect(screen.queryByText("Onboarding wizard")).not.toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    mockOrganizationData.org = { id: "org-2", name: "Baker" };
    mockOrganizationData.entryGate = {
      onboardingCompleted: false,
      adminOnboardingCompleted: true,
      billingLocked: null,
    };
    rerenderGate();

    expect(await screen.findByText("Onboarding wizard")).toBeInTheDocument();
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
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
    mockOrganizationData.entryGate.onboardingCompleted = true;

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
  });

  it("bypasses the setup lock for gridmasters", () => {
    mockPermissions.isGridmaster = true;

    renderGate();

    expect(screen.getByText("Protected app")).toBeInTheDocument();
  });

  it("redirects super admins to billing recovery when billing is locked", async () => {
    mockPermissions.role = "super_admin";
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
    mockOrganizationData.entryGate.billingLocked = true;

    renderGate();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/settings?section=org-billing");
    });
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
  });

  it("sends an admin with a stale billing-lock flag to the organization gate, never billing settings", async () => {
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
    mockOrganizationData.entryGate.billingLocked = true;

    renderGate();

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/billing-required");
    });
    expect(mockRouter.replace).not.toHaveBeenCalledWith("/settings?section=org-billing");
  });

  it("allows super admins to stay on billing recovery when billing is locked", async () => {
    mockPathname = "/settings";
    mockSection = "org-billing";
    mockPermissions.role = "super_admin";
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
    mockOrganizationData.entryGate.billingLocked = true;

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("renders billing recovery without waiting for setup data", async () => {
    mockPathname = "/settings";
    mockSection = "org-billing";
    mockPermissions.role = "super_admin";
    mockPermissions.isSuperAdmin = true;
    mockOrganizationData.loading = true;
    mockEmployeesData.loading = true;
    mockOrganizationData.entryGate.billingLocked = true;

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("keeps a completed super admin in the app after billing recovery", async () => {
    mockPathname = "/settings";
    mockSection = "org-billing";
    mockPermissions.role = "super_admin";
    mockPermissions.isSuperAdmin = true;
    mockOrganizationData.entryGate.onboardingCompleted = true;
    mockOrganizationData.entryGate.billingLocked = true;

    const { rerenderGate } = renderGate();
    expect(await screen.findByText("Protected app")).toBeInTheDocument();

    mockOrganizationData.entryGate.billingLocked = false;
    rerenderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
    expect(screen.queryByText("Onboarding wizard")).not.toBeInTheDocument();
    expect(screen.queryByText("Setup pending")).not.toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  // An organization can read as fully configured while its first super admin is
  // still sitting on their own welcome step. Members were being let in there.
  it("holds a member while the first admin is still in their own onboarding", async () => {
    mockPermissions.role = "user";
    mockPermissions.canManageOrg = false;
    mockOrganizationData.setupStatus = {
      isComplete: true,
      missing: {
        focusAreas: false,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };
    mockOrganizationData.entryGate.adminOnboardingCompleted = false;

    renderGate();

    expect(await screen.findByText("Setup pending")).toBeInTheDocument();
    expect(screen.queryByText("Onboarding wizard")).not.toBeInTheDocument();
    expect(screen.queryByText("Protected app")).not.toBeInTheDocument();
  });

  it("lets that member in once the admin has finished", async () => {
    mockPermissions.role = "user";
    mockPermissions.canManageOrg = false;
    mockOrganizationData.setupStatus = {
      isComplete: true,
      missing: {
        focusAreas: false,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };

    renderGate();

    expect(await screen.findByText("Onboarding wizard")).toBeInTheDocument();
    expect(screen.queryByText("Setup pending")).not.toBeInTheDocument();
  });

  // The proxy holds members on /billing-required before an organization is
  // open at all. Anything the onboarding gate renders there covers the screen
  // explaining the wait, and a wizard finished on top of it just puts the user
  // back on the same page.
  it("never intercepts the organization gate for a member who cannot set up the org", async () => {
    mockPathname = "/billing-required";
    mockPermissions.role = "user";
    mockPermissions.canManageOrg = false;

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
    expect(screen.queryByText("Setup pending")).not.toBeInTheDocument();
    expect(screen.queryByText("Onboarding wizard")).not.toBeInTheDocument();
  });

  it("never intercepts the organization gate once org config is complete either", async () => {
    mockPathname = "/billing-required";
    mockPermissions.role = "user";
    mockPermissions.canManageOrg = false;
    mockOrganizationData.setupStatus = {
      isComplete: true,
      missing: {
        focusAreas: false,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };

    renderGate();

    expect(await screen.findByText("Protected app")).toBeInTheDocument();
    expect(screen.queryByText("Onboarding wizard")).not.toBeInTheDocument();
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

describe("OnboardingGate subtree stability", () => {
  it("does not remount the page subtree when permissions resolve", async () => {
    let mounts = 0;
    function MountProbe() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <div>Protected app</div>;
    }

    // Land on the plain "app" decision once permissions resolve.
    mockOrganizationData.entryGate = {
      onboardingCompleted: true,
      adminOnboardingCompleted: true,
      billingLocked: false,
    };
    mockOrganizationData.setupStatus = {
      isComplete: true,
      missing: {
        focusAreas: false,
        scheduleDefinitions: false,
        certifications: false,
        orgRoles: false,
      },
    };

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <OnboardingGate>
          <MountProbe />
        </OnboardingGate>
      </QueryClientProvider>
    );

    mockPermissions.isLoading = true;
    const result = render(tree());
    await screen.findByText("Protected app");
    expect(mounts).toBe(1);

    // Permissions resolve: the gate goes from passing through to deciding.
    // It used to swap `{children}` for a wrapper at that moment, which
    // unmounted and remounted the whole page subtree — dropping the last
    // observer of the org-bootstrap query, cancelling its in-flight request
    // and refetching it (build plan item 26).
    mockPermissions.isLoading = false;
    result.rerender(tree());
    await screen.findByText("Protected app");
    expect(mounts).toBe(1);
  });
});
