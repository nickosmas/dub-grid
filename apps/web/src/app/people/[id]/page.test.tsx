import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonDetailRouteContent } from "@/app/people/[id]/page";

const mockReplace = vi.fn();
const mockUseAuth = vi.fn();
const mockUsePermissions = vi.fn();
const mockFetchEmployeeByUserId = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
    back: vi.fn(),
  }),
  notFound: vi.fn(),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks", () => ({
  usePermissions: () => mockUsePermissions(),
}));

vi.mock("@/lib/db", () => ({
  fetchEmployeeByUserId: (...args: unknown[]) => mockFetchEmployeeByUserId(...args),
}));

vi.mock("@/components/staff-detail/StaffDetailPage", () => ({
  StaffDetailPage: ({ employeeId }: { employeeId: string }) => <div data-testid="staff-detail-page">{employeeId}</div>,
}));

describe("PersonDetailRouteContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      isLoading: false,
    });

    mockUsePermissions.mockReturnValue({
      orgId: "org-1",
      isLoading: false,
    });
  });

  it("redirects own employee detail routes to /profile", async () => {
    mockFetchEmployeeByUserId.mockResolvedValue({ id: "emp-1" });

    render(<PersonDetailRouteContent employeeId="emp-1" />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/profile");
    });
    expect(screen.queryByTestId("staff-detail-page")).not.toBeInTheDocument();
  });

  it("renders other employee detail routes normally", async () => {
    mockFetchEmployeeByUserId.mockResolvedValue({ id: "emp-self" });

    render(<PersonDetailRouteContent employeeId="emp-2" />);

    expect(await screen.findByTestId("staff-detail-page")).toHaveTextContent("emp-2");
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
