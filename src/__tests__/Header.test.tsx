import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Header from "@/components/Header";
import { useAuth } from "@/components/AuthProvider";

vi.mock("@/components/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockSignOut = vi.fn();

function setupAuth(isSuperAdmin = false) {
  vi.mocked(useAuth).mockReturnValue({
    signOut: mockSignOut,
    isSuperAdmin,
  } as ReturnType<typeof useAuth>);
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
  it('renders "DG" logo text', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText("DG")).toBeInTheDocument();
  });

  it('renders "DubGrid" text', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText("DubGrid")).toBeInTheDocument();
  });

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

describe("Header Super Admin button", () => {
  it('"Super Admin" button absent when isSuperAdmin=false', () => {
    setupAuth(false);
    render(<Header {...defaultProps} />);
    expect(
      screen.queryByRole("button", { name: /Super Admin/i }),
    ).not.toBeInTheDocument();
  });

  it('"Super Admin" button present when isSuperAdmin=true', () => {
    setupAuth(true);
    render(<Header {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: /Super Admin/i }),
    ).toBeInTheDocument();
  });
});

describe("Header Sign Out", () => {
  it('clicking "Sign Out" calls signOut', async () => {
    render(<Header {...defaultProps} />);
    await userEvent.click(screen.getByRole("button", { name: /Sign Out/i }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
