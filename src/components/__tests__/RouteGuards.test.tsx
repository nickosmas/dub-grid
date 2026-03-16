/**
 * Tests for RouteGuards.
 *
 * PublicRoute is now a simple passthrough — it always renders children.
 * ProtectedRoute checks auth and redirects to /login if unauthenticated.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 4.1, 4.2, 4.3
 */

import { render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { PublicRoute, ProtectedRoute } from "@/components/RouteGuards";

vi.mock("@/components/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/components/AuthProvider";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PublicRoute — always renders children (passthrough)", () => {
  it("renders children immediately regardless of auth state", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: true,
      signOut: vi.fn(),
    });

    render(
      <PublicRoute>
        <div data-testid="child">Child Content</div>
      </PublicRoute>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders children when user is authenticated", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-1" } as any,
      isLoading: false,
      signOut: vi.fn(),
    });

    render(
      <PublicRoute>
        <div data-testid="child">Child Content</div>
      </PublicRoute>,
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
