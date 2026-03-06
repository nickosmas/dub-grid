/**
 * Feature: login-auth-fix
 * Property 2: PublicRoute redirect destination is determined by isSuperAdmin
 * Property 3: No redirect fires while loading
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 4.1, 4.2, 4.3
 */

import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { PublicRoute } from "@/components/RouteGuards";

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/components/AuthProvider";

const fakeSession = { user: { id: "user-1" }, access_token: "token" };

beforeEach(() => {
  mockReplace.mockClear();
});

describe("PublicRoute — Property 3: No redirect fires while loading", () => {
  /**
   * Validates: Requirement 2.3, 4.3
   * While isLoading=true, PublicRoute SHALL display a loading indicator and SHALL NOT redirect.
   */
  it("renders loading UI and does not call router.replace when isLoading=true", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: fakeSession as any,
      isSuperAdmin: true,
      isLoading: true,
      signOut: vi.fn(),
    });

    render(
      <PublicRoute>
        <div data-testid="child">Child Content</div>
      </PublicRoute>,
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByTestId("child")).not.toBeInTheDocument();

    // Give effects a chance to fire — replace must still not be called
    await new Promise((r) => setTimeout(r, 50));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("PublicRoute — Property 2: Redirect destination is determined by isSuperAdmin", () => {
  /**
   * Validates: Requirement 2.1, 4.1
   * WHEN session exists and isLoading=false, PublicRoute SHALL redirect to /admin if isSuperAdmin=true.
   */
  it("redirects to /admin when session exists, isLoading=false, isSuperAdmin=true", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-1" } as any,
      session: fakeSession as any,
      isSuperAdmin: true,
      isLoading: false,
      signOut: vi.fn(),
    });

    render(
      <PublicRoute>
        <div data-testid="child">Child Content</div>
      </PublicRoute>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/admin");
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/schedule");
  });

  /**
   * Validates: Requirement 2.2, 4.2
   * WHEN session exists and isLoading=false, PublicRoute SHALL redirect to /schedule if isSuperAdmin=false.
   */
  it("redirects to /schedule when session exists, isLoading=false, isSuperAdmin=false", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-1" } as any,
      session: fakeSession as any,
      isSuperAdmin: false,
      isLoading: false,
      signOut: vi.fn(),
    });

    render(
      <PublicRoute>
        <div data-testid="child">Child Content</div>
      </PublicRoute>,
    );

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/schedule");
    });
    expect(mockReplace).not.toHaveBeenCalledWith("/admin");
  });

  /**
   * Validates: Requirement 2.3
   * No session + isLoading=false → renders children, no redirect.
   */
  it("renders children and does not redirect when no session and isLoading=false", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      session: null,
      isSuperAdmin: false,
      isLoading: false,
      signOut: vi.fn(),
    });

    render(
      <PublicRoute>
        <div data-testid="child">Child Content</div>
      </PublicRoute>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("child")).toBeInTheDocument();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
