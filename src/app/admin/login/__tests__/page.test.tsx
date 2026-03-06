/**
 * Unit tests for admin/login/page.tsx submit states.
 * Validates: Requirements 3.2, 3.4, 3.5
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { supabase } from "@/lib/supabase";
import * as db from "@/lib/db";
import SuperAdminLoginPage from "@/app/admin/login/page";

vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/db", () => ({
  checkIsSuperAdmin: vi.fn(),
}));

/** Helper: fill and submit the admin login form */
function submitForm(container: HTMLElement) {
  const emailInput = container.querySelector(
    'input[type="email"]',
  ) as HTMLInputElement;
  const passwordInput = container.querySelector(
    'input[type="password"]',
  ) as HTMLInputElement;
  fireEvent.change(emailInput, { target: { value: "admin@example.com" } });
  fireEvent.change(passwordInput, { target: { value: "password123" } });
  fireEvent.submit(screen.getByRole("button", { name: /access portal/i }));
}

describe("Admin login page submit states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("successful super admin sign-in: button stays disabled and message shows 'Redirecting...'", async () => {
    // Arrange
    (supabase.auth as any).signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    vi.mocked(db.checkIsSuperAdmin).mockResolvedValue(true);

    const { container } = render(<SuperAdminLoginPage />);
    submitForm(container);

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /redirecting/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });
  });

  it("failed sign-in (Supabase error): loading resets to false and error message is displayed", async () => {
    // Arrange
    (supabase.auth as any).signInWithPassword = vi
      .fn()
      .mockResolvedValue({
        data: null,
        error: { message: "Invalid credentials" },
      });

    const { container } = render(<SuperAdminLoginPage />);
    submitForm(container);

    await waitFor(() => {
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });

    // Button must be re-enabled — loading=false on error
    const button = screen.getByRole("button", { name: /access portal/i });
    expect(button).not.toBeDisabled();
  });

  it("non-super-admin user: signOut called, loading resets to false, error message displayed", async () => {
    // Arrange
    (supabase.auth as any).signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: "user-456" } }, error: null });
    vi.mocked(db.checkIsSuperAdmin).mockResolvedValue(false);
    (supabase.auth as any).signOut = vi.fn().mockResolvedValue({});

    const { container } = render(<SuperAdminLoginPage />);
    submitForm(container);

    await waitFor(() => {
      expect(screen.getByText(/not a super admin/i)).toBeInTheDocument();
    });

    expect(supabase.auth.signOut).toHaveBeenCalled();

    // Button must be re-enabled — loading=false on non-super-admin path
    const button = screen.getByRole("button", { name: /access portal/i });
    expect(button).not.toBeDisabled();
  });
});
