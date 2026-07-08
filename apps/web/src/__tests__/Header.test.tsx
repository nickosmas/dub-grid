import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Header from "@/components/Header";
import { fetchOrganizationBilling } from "@/features/billing/client";
import { exitSandbox } from "@/features/account/client";
import { queryKeys } from "@/lib/query-keys";

const mockSignOut = vi.fn().mockResolvedValue(undefined);
const mockSetUserViewActive = vi.fn();
let mockPathname = "/schedule";
let mockAuthUser: { id: string; email: string } | null = null;

const mockPermissions = {
  role: "admin",
  orgId: "org-1",
  level: 2,
  isLoading: false,
  isGridmaster: false,
  isSuperAdmin: false,
  isUserViewActive: false,
  actualLevel: 2,
  canManageOrg: true,
  canAccessSettings: true,
  canEditShifts: true,
  canEditNotes: true,
  canViewStaff: true,
  atLeast: (r: string) => {
    const levels: Record<string, number> = {
      gridmaster: 4,
      super_admin: 3,
      admin: 2,
      user: 0,
    };
    return 2 >= (levels[r] ?? 0);
  },
};

vi.mock("@/hooks", () => ({
  usePermissions: () => mockPermissions,
  useLogout: () => ({ signOut: mockSignOut }),
  setUserViewActive: (active: boolean) => mockSetUserViewActive(active),
  useMediaQuery: () => false,
  MOBILE: "(max-width: 767px)",
  TABLET: "(min-width: 768px) and (max-width: 1024px)",
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: mockAuthUser, signOut: vi.fn(), isLoading: false }),
}));

vi.mock("@/features/organization/client/api", () => ({
  fetchOrganizationBootstrap: vi.fn().mockResolvedValue({
    org: { workspaceKind: "real" },
  }),
}));

// NotificationBell starts a realtime subscription once a user is present; stub
// it so the sandbox sign-out tests (which set a user) don't hit realtime.
vi.mock("@/components/NotificationBell", () => ({
  default: () => null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => mockPathname,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/account/client", () => ({
  fetchAccountIdentity: vi.fn().mockResolvedValue({
    displayName: null,
    firstName: null,
    lastName: null,
    orgSlug: null,
    hasOrganizationMembership: false,
  }),
  exitSandbox: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/features/billing/client", () => ({
  fetchOrganizationBilling: vi.fn(),
}));

function renderHeader(ui: React.ReactElement, opts?: { inSandbox?: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  if (opts?.inSandbox !== undefined) {
    // Seed the bootstrap cache so Header's isInSandbox is set synchronously.
    queryClient.setQueryData(queryKeys.org.bootstrap(null, false), {
      org: { workspaceKind: opts.inSandbox ? "sandbox" : "real" },
    });
  }

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchOrganizationBilling).mockResolvedValue({
    orgId: "org-1",
    orgName: "Acme",
    orgSlug: "acme",
    status: "trialing",
    trialEndsAt: "2026-05-16T00:00:00.000Z",
    currentPeriodEnd: null,
    cancelAt: null,
    canceledAt: null,
    subscriptionSeats: null,
    appUserCount: 4,
    seatDelta: null,
    hasStripeCustomer: false,
    hasStripeSubscription: false,
    stripeConfigured: true,
    canManageBilling: true,
    billingAccess: {
      state: "trialing",
      reason: "trial_active",
      isLocked: false,
      shouldNotifyAdmins: false,
      daysUntilTrialEnd: 14,
      trialGraceEndsAt: "2026-05-19T00:00:00.000Z",
    },
  });
  mockPathname = "/schedule";
  mockAuthUser = null;
  mockPermissions.role = "admin";
  mockPermissions.isGridmaster = false;
  mockPermissions.isSuperAdmin = false;
  mockPermissions.isUserViewActive = false;
  mockPermissions.canEditShifts = true;
  mockPermissions.canViewStaff = true;
  mockPermissions.canManageOrg = true;
  mockPermissions.canAccessSettings = true;
});

describe("Header rendering", () => {
  it("renders orgName when provided", () => {
    renderHeader(<Header orgName="Acme Corp" />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("does NOT render org name when omitted", () => {
    renderHeader(<Header />);
    expect(screen.queryByText(/Acme/)).not.toBeInTheDocument();
  });

  it('renders nav links: "Schedule", "People", "Reports", "Settings"', () => {
    renderHeader(<Header />);
    expect(screen.getByRole("link", { name: /Schedule/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /People/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reports/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Settings/i })).toBeInTheDocument();
  });
});

describe("Header active nav link", () => {
  it("active nav link (schedule) has active class", () => {
    mockPathname = "/schedule";
    renderHeader(<Header />);
    const link = screen.getByRole("link", { name: /Schedule/i });
    expect(link.className).toContain("active");
  });

  it("active nav link (staff) has active class", () => {
    mockPathname = "/people";
    renderHeader(<Header />);
    const link = screen.getByRole("link", { name: /People/i });
    expect(link.className).toContain("active");
  });

  it("active nav link (settings) has active class", () => {
    mockPathname = "/settings";
    renderHeader(<Header />);
    const link = screen.getByRole("link", { name: /Settings/i });
    expect(link.className).toContain("active");
  });

  it("active nav link (reports) has active class", () => {
    mockPathname = "/reports";
    renderHeader(<Header />);
    const link = screen.getByRole("link", { name: /Reports/i });
    expect(link.className).toContain("active");
  });

  it("inactive nav links do not have active class", () => {
    mockPathname = "/schedule";
    renderHeader(<Header />);
    const staffLink = screen.getByRole("link", { name: /People/i });
    expect(staffLink.className).not.toContain("active");
  });
});

describe("Header nav link hrefs", () => {
  it("Schedule link points to /schedule", () => {
    renderHeader(<Header />);
    const link = screen.getByRole("link", { name: /Schedule/i });
    expect(link).toHaveAttribute("href", "/schedule");
  });

  it("People link points to /people", () => {
    renderHeader(<Header />);
    const link = screen.getByRole("link", { name: /People/i });
    expect(link).toHaveAttribute("href", "/people");
  });

  it("Settings link points to /settings", () => {
    renderHeader(<Header />);
    const link = screen.getByRole("link", { name: /Settings/i });
    expect(link).toHaveAttribute("href", "/settings");
  });

  it("Reports link points to /reports", () => {
    renderHeader(<Header />);
    const link = screen.getByRole("link", { name: /Reports/i });
    expect(link).toHaveAttribute("href", "/reports");
  });
});

describe("Header permission-based tab visibility", () => {
  it("hides Staff tab when user cannot view staff", () => {
    mockPermissions.canViewStaff = false;
    renderHeader(<Header />);
    expect(screen.queryByRole("link", { name: /People/i })).not.toBeInTheDocument();
  });

  it("hides Settings tab when user has no org management perms", () => {
    mockPermissions.canManageOrg = false;
    mockPermissions.canAccessSettings = false;
    mockPermissions.isSuperAdmin = false;
    mockPermissions.isGridmaster = false;
    renderHeader(<Header />);
    expect(screen.queryByRole("link", { name: /Settings/i })).not.toBeInTheDocument();
  });

  it("hides Settings tab for regular users even if view permissions are present", () => {
    mockPermissions.role = "user";
    mockPermissions.canManageOrg = false;
    mockPermissions.canAccessSettings = true;
    mockPermissions.isSuperAdmin = false;
    mockPermissions.isGridmaster = false;
    renderHeader(<Header />);
    expect(screen.queryByRole("link", { name: /Settings/i })).not.toBeInTheDocument();
  });

  it("shows Settings tab for super admins", () => {
    mockPermissions.canManageOrg = false;
    mockPermissions.canAccessSettings = false;
    mockPermissions.isSuperAdmin = true;
    renderHeader(<Header />);
    expect(screen.getByRole("link", { name: /Settings/i })).toBeInTheDocument();
  });

  it("shows Reports tab for organization admins and super admins", () => {
    renderHeader(<Header />);
    expect(screen.getByRole("link", { name: /Reports/i })).toBeInTheDocument();

    mockPermissions.role = "super_admin";
    mockPermissions.isSuperAdmin = true;
    renderHeader(<Header />);
    expect(screen.getAllByRole("link", { name: /Reports/i })).toHaveLength(2);
  });

  it("hides Reports tab for regular users and user view", () => {
    mockPermissions.role = "user";
    renderHeader(<Header />);
    expect(screen.queryByRole("link", { name: /Reports/i })).not.toBeInTheDocument();

    mockPermissions.role = "admin";
    mockPermissions.isUserViewActive = true;
    renderHeader(<Header />);
    expect(screen.queryByRole("link", { name: /Reports/i })).not.toBeInTheDocument();
  });

  it("shows trial time left to super admins in the app header", async () => {
    mockPermissions.isSuperAdmin = true;

    renderHeader(<Header />);

    expect(await screen.findByRole("link", { name: "Trial ends in 14 days" })).toHaveAttribute(
      "href",
      "/settings?section=org-billing",
    );
  });

  it("does not load billing status for regular admins", () => {
    renderHeader(<Header />);

    expect(fetchOrganizationBilling).not.toHaveBeenCalled();
  });
});

describe("Header sign out in sandbox mode", () => {
  async function openSignOut() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("button", { name: /sign out/i }));
    return user;
  }

  it("signs out directly when not in sandbox", async () => {
    mockAuthUser = { id: "u-1", email: "a@b.com" };
    renderHeader(<Header />, { inSandbox: false });

    await openSignOut();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSetUserViewActive).not.toHaveBeenCalled();
    expect(screen.queryByText(/exit sandbox to sign out/i)).not.toBeInTheDocument();
  });

  it("signs out in one sweep from view-as-user, with no confirm prompt", async () => {
    mockAuthUser = { id: "u-1", email: "a@b.com" };
    mockPermissions.isUserViewActive = true;
    renderHeader(<Header />, { inSandbox: false });

    await openSignOut();

    // Logout is a single sweep: signOutLocal tears down the session and clears
    // the view-as-user flag (dg_user_view) during teardown, so the handler must
    // not toggle view-as-user off separately — that re-rendered the app back to
    // the admin context mid-logout and could leave the user still logged in.
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSetUserViewActive).not.toHaveBeenCalled();
    expect(screen.queryByText(/exit sandbox to sign out/i)).not.toBeInTheDocument();
  });

  it("prompts to exit the sandbox before signing out", async () => {
    mockAuthUser = { id: "u-1", email: "a@b.com" };
    renderHeader(<Header />, { inSandbox: true });

    await openSignOut();

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(vi.mocked(exitSandbox)).not.toHaveBeenCalled();
    expect(screen.getByText(/exit sandbox to sign out/i)).toBeInTheDocument();
  });

  it("destroys the sandbox, then signs out, on confirm", async () => {
    mockAuthUser = { id: "u-1", email: "a@b.com" };
    renderHeader(<Header />, { inSandbox: true });

    const user = await openSignOut();
    await user.click(screen.getByRole("button", { name: /exit & sign out/i }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    // Sandbox is destroyed before the session is torn down.
    expect(vi.mocked(exitSandbox)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(exitSandbox).mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOut.mock.invocationCallOrder[0],
    );
  });
});

describe("Header Gridmaster button", () => {
  it('"Gridmaster" button is hidden for non-gridmaster users', () => {
    mockPermissions.isGridmaster = false;
    renderHeader(<Header />);
    expect(screen.queryByRole("button", { name: /Gridmaster/i })).not.toBeInTheDocument();
  });

  it('"Gridmaster" button is visible for gridmaster users', () => {
    mockPermissions.isGridmaster = true;
    renderHeader(<Header />);
    expect(screen.getByRole("button", { name: /Gridmaster/i })).toBeInTheDocument();
  });
});
