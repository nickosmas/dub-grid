import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Header from "@/components/Header";

const mockSignOut = vi.fn();

const mockPermissions = {
  role: "admin",
  orgId: "org-1",
  level: 3,
  isLoading: false,
  isGridmaster: false,
  canManageOrg: true,
  canEditSchedule: true,
  canAddNotes: true,
  canRead: true,
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const defaultProps = {
  viewMode: "schedule" as const,
  onViewChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Header rendering", () => {
  it('renders orgName with "/" prefix when provided', () => {
    render(<Header {...defaultProps} orgName="Acme Corp" />);
    expect(screen.getByText("/ Acme Corp")).toBeInTheDocument();
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
    expect(btn.style.background).not.toBe("transparent");
    expect(btn.style.background).toBe("var(--color-border-light)");
  });

  it("active nav button (staff) has non-transparent background", () => {
    render(<Header {...defaultProps} viewMode="staff" />);
    const btn = screen.getByRole("button", { name: /Staff/i });
    expect(btn.style.background).toBe("var(--color-border-light)");
  });

  it("active nav button (settings) has non-transparent background", () => {
    render(<Header {...defaultProps} viewMode="settings" />);
    const btn = screen.getByRole("button", { name: /Settings/i });
    expect(btn.style.background).toBe("var(--color-border-light)");
  });

  it("inactive nav buttons have transparent background", () => {
    render(<Header {...defaultProps} viewMode="schedule" />);
    const staffBtn = screen.getByRole("button", { name: /Staff/i });
    expect(staffBtn.style.background).toBe("transparent");
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
