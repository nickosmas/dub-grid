import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Header from "@/components/Header";
import { Organization } from "@/types";

vi.mock("@/hooks", () => ({
  usePermissions: () => ({
    role: "admin",
    isGridmaster: false,
    canManageOrg: true,
    canEditSchedule: true,
  }),
  useLogout: () => ({ signOutLocal: vi.fn() }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe("Multi-tenant Branding Verification", () => {
  const defaultProps = {
    viewMode: "schedule" as const,
    onViewChange: vi.fn(),
  };

  it("renders custom app name from organization object", () => {
    const org: Organization = {
      id: "org-1",
      name: "Acme Medical Center",
      slug: "acme",
      address: "123 Main St",
      phone: "555-0100",
      employeeCount: 10,
      skillLevels: [],
      roles: [],
      appName: "AcmeScheduler",
    };

    render(<Header {...defaultProps} organization={org} />);
    
    // Should render 'AcmeScheduler' as the app name
    expect(screen.getByText("AcmeScheduler")).toBeInTheDocument();
    // Should render the organization name as well
    expect(screen.getByText("Acme Medical Center")).toBeInTheDocument();
    // Should render the separator
    expect(screen.getByText("|")).toBeInTheDocument();
  });

  it("renders default branding when appName is missing", () => {
    const org: Organization = {
      id: "org-1",
      name: "Acme Medical Center",
      slug: "acme",
      address: "123 Main St",
      phone: "555-0100",
      employeeCount: 10,
      skillLevels: [],
      roles: [],
    };

    render(<Header {...defaultProps} organization={org} />);
    
    // Should render 'DubGrid' as the default app name
    expect(screen.getByText("DubGrid")).toBeInTheDocument();
  });
});
