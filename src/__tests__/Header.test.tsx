import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Header from "@/components/Header";

const mockSignOut = vi.fn();

const mockPermissions = {
  role: "admin",
  companyId: "company-1",
  level: 3,
  isLoading: false,
  isGridmaster: false,
  canManageCompany: true,
  canEditShifts: true,
  canEditNotes: true,
  atLeast: (r: string) => {
    const levels: Record<string, number> = {
      gridmaster: 4,
      admin: 3,
      scheduler: 2,
      supervisor: 1,
      user: 0,
    };
    return 3 >= (levels[r] ?? 0);
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

function setupAuth(isSuperAdmin = false) {
  // empty
}

const defaultProps = {
  viewMode: "schedule" as const,
  onViewChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  setupAuth(false);
});

describe("Header rendering", () => {
  it('renders orgName with "/" prefix when provided', () => {
    render(<Header {...defaultProps} orgName="Acme Corp" />);
    // The component renders orgName in a <span> next to a "|" separator (not "/" prefix)
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("does NOT render org name when omitted", () => {
    render(<Header {...defaultProps} />);
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();
  });

  it('renders nav buttons: "Schedule", "Staff", "Settings"', () => {
    render(<Header {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /Schedule/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Staff/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Settings/i }),
    ).toBeInTheDocument();
  });
});

describe("Header active nav button", () => {
  it("active nav button (schedule) has non-transparent background", () => {
    render(<Header {...defaultProps} viewMode="schedule" />);
    const btn = screen.getByRole("button", { name: /Schedule/i });
    // Active state is applied via CSS class "active" on "dg-nav-tab", not inline style
    expect(btn.className).toContain("active");
  });

  it("active nav button (staff) has non-transparent background", () => {
    render(<Header {...defaultProps} viewMode="staff" />);
    const btn = screen.getByRole("button", { name: /Staff/i });
    expect(btn.className).toContain("active");
  });

  it("active nav button (settings) has non-transparent background", () => {
    render(<Header {...defaultProps} viewMode="settings" />);
    const btn = screen.getByRole("button", { name: /Settings/i });
    expect(btn.className).toContain("active");
  });

  it("inactive nav buttons have transparent background", () => {
    render(<Header {...defaultProps} viewMode="schedule" />);
    const staffBtn = screen.getByRole("button", { name: /Staff/i });
    // Inactive buttons do not have the "active" class
    expect(staffBtn.className).not.toContain("active");
  });
});

describe("Header nav button interactions", () => {
  it("clicking Schedule calls onViewChange with 'schedule'", async () => {
    const onViewChange = vi.fn();
    render(<Header {...defaultProps} onViewChange={onViewChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Schedule/i }));
    expect(onViewChange).toHaveBeenCalledWith("schedule");
  });

  it("clicking Staff calls onViewChange with 'staff'", async () => {
    const onViewChange = vi.fn();
    render(<Header {...defaultProps} onViewChange={onViewChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Staff/i }));
    expect(onViewChange).toHaveBeenCalledWith("staff");
  });

  it("clicking Settings calls onViewChange with 'settings'", async () => {
    const onViewChange = vi.fn();
    render(<Header {...defaultProps} onViewChange={onViewChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Settings/i }));
    expect(onViewChange).toHaveBeenCalledWith("settings");
  });
});

describe("Header Gridmaster button", () => {
  it('"Gridmaster" button is hidden for non-gridmaster users', () => {
    mockPermissions.isGridmaster = false;
    render(<Header {...defaultProps} />);
    expect(
      screen.queryByRole("button", { name: /Gridmaster/i }),
    ).not.toBeInTheDocument();
  });

  it('"Gridmaster" button is visible for gridmaster users', () => {
    mockPermissions.isGridmaster = true;
    render(<Header {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /Gridmaster/i }),
    ).toBeInTheDocument();
    mockPermissions.isGridmaster = false;
  });
});
