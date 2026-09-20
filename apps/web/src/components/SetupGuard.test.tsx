import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useOrganizationData = vi.fn();
const usePermissions = vi.fn();

vi.mock("@/hooks", () => ({
  useOrganizationData: () => useOrganizationData(),
  usePermissions: () => usePermissions(),
  useLogout: () => ({ signOut: vi.fn() }),
}));
vi.mock("@/components/AuthTransitionScreen", () => ({
  default: ({ phase }: { phase: string }) => <div data-testid="transition">{phase}</div>,
}));

import SetupGuard from "./SetupGuard";

describe("SetupGuard", () => {
  it("keeps a loading affordance mounted while the bootstrap is still loading with nothing cached", () => {
    usePermissions.mockReturnValue({
      isLoading: false,
      isGridmaster: false,
      isImpersonating: false,
      isSuperAdmin: false,
      canManageOrg: false,
    });
    useOrganizationData.mockReturnValue({
      org: null,
      loading: true,
      setupStatus: { isComplete: false },
      activeEmployeeCount: 0,
    });

    render(
      <SetupGuard>
        <div>app</div>
      </SetupGuard>,
    );

    expect(screen.getByTestId("transition")).toHaveTextContent("workspace");
    expect(screen.queryByText("app")).not.toBeInTheDocument();
  });

  it("renders the app while revalidating cached org data", () => {
    usePermissions.mockReturnValue({
      isLoading: false,
      isGridmaster: false,
      isImpersonating: false,
      isSuperAdmin: true,
      canManageOrg: true,
    });
    useOrganizationData.mockReturnValue({
      org: { id: "org-1" },
      loading: false,
      setupStatus: { isComplete: true },
      activeEmployeeCount: 3,
    });

    render(
      <SetupGuard>
        <div>app</div>
      </SetupGuard>,
    );

    expect(screen.getByText("app")).toBeInTheDocument();
    expect(screen.queryByTestId("transition")).not.toBeInTheDocument();
  });
});
