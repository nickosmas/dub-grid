import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Header from "@/components/Header";

const mockSignOut = vi.fn();
let mockPathname = "/schedule";

const mockPermissions = {
  role: "admin",
  orgId: "org-1",
  level: 2,
  isLoading: false,
  isGridmaster: false,
  isSuperAdmin: false,
  canManageOrg: true,
  canEditShifts: true,
  canEditNotes: true,
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
  useLogout: () => ({ signOutLocal: mockSignOut }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => mockPathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: any) => (
    <a href={href} className={className} {...rest}>{children}</a>
  ),
}));

vi.mock("@/components/PageTransition", () => ({
  usePageTransition: () => ({ startNavigation: vi.fn(), setPageReady: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
    }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPathname = "/schedule";
  mockPermissions.isGridmaster = false;
  mockPermissions.isSuperAdmin = false;
  mockPermissions.canEditShifts = true;
  mockPermissions.canManageOrg = true;
});

describe("Header rendering", () => {
  it("renders orgName when provided", () => {
    render(<Header orgName="Acme Corp" />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("does NOT render org name when omitted", () => {
    render(<Header />);
    expect(screen.queryByText(/Acme/)).not.toBeInTheDocument();
  });

  it('renders nav links: "Schedule", "Staff", "Settings"', () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /Schedule/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Staff/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Settings/i })).toBeInTheDocument();
  });
});

describe("Header active nav link", () => {
  it("active nav link (schedule) has active class", () => {
    mockPathname = "/schedule";
    render(<Header />);
    const link = screen.getByRole("link", { name: /Schedule/i });
    expect(link.className).toContain("active");
  });

  it("active nav link (staff) has active class", () => {
    mockPathname = "/staff";
    render(<Header />);
    const link = screen.getByRole("link", { name: /Staff/i });
    expect(link.className).toContain("active");
  });

  it("active nav link (settings) has active class", () => {
    mockPathname = "/settings";
    render(<Header />);
    const link = screen.getByRole("link", { name: /Settings/i });
    expect(link.className).toContain("active");
  });

  it("inactive nav links do not have active class", () => {
    mockPathname = "/schedule";
    render(<Header />);
    const staffLink = screen.getByRole("link", { name: /Staff/i });
    expect(staffLink.className).not.toContain("active");
  });
});

describe("Header nav link hrefs", () => {
  it("Schedule link points to /schedule", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: /Schedule/i });
    expect(link).toHaveAttribute("href", "/schedule");
  });

  it("Staff link points to /staff", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: /Staff/i });
    expect(link).toHaveAttribute("href", "/staff");
  });

  it("Settings link points to /settings", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: /Settings/i });
    expect(link).toHaveAttribute("href", "/settings");
  });
});

describe("Header permission-based tab visibility", () => {
  it("hides Staff tab when user cannot edit shifts", () => {
    mockPermissions.canEditShifts = false;
    render(<Header />);
    expect(screen.queryByRole("link", { name: /Staff/i })).not.toBeInTheDocument();
  });

  it("hides Settings tab when user has no org management perms", () => {
    mockPermissions.canManageOrg = false;
    mockPermissions.isSuperAdmin = false;
    mockPermissions.isGridmaster = false;
    render(<Header />);
    expect(screen.queryByRole("link", { name: /Settings/i })).not.toBeInTheDocument();
  });

  it("shows Settings tab for super admins", () => {
    mockPermissions.canManageOrg = false;
    mockPermissions.isSuperAdmin = true;
    render(<Header />);
    expect(screen.getByRole("link", { name: /Settings/i })).toBeInTheDocument();
  });
});

describe("Header Gridmaster button", () => {
  it('"Gridmaster" button is hidden for non-gridmaster users', () => {
    mockPermissions.isGridmaster = false;
    render(<Header />);
    expect(
      screen.queryByRole("button", { name: /Gridmaster/i }),
    ).not.toBeInTheDocument();
  });

  it('"Gridmaster" button is visible for gridmaster users', () => {
    mockPermissions.isGridmaster = true;
    render(<Header />);
    expect(
      screen.getByRole("button", { name: /Gridmaster/i }),
    ).toBeInTheDocument();
  });
});
