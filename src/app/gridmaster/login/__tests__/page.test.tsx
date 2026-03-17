/**
 * Unit tests for gridmaster/login/page.tsx submit states.
 * Validates: Requirements 3.2, 3.4, 3.5
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

const mockSignInWithPassword = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
    },
  },
}));

vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/Logo", () => ({
  DubGridLogo: () => <div data-testid="logo" />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import SuperAdminLoginPage from "@/app/gridmaster/login/page";

/** Helper: fill and submit the gridmaster login form */
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

describe("Gridmaster login page submit states", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      value: { replace: vi.fn(), reload: vi.fn(), href: "" },
      writable: true,
      configurable: true,
    });
  });

  it("successful super admin sign-in: button stays disabled and message shows 'Authenticating...'", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const { container } = render(<SuperAdminLoginPage />);
    submitForm(container);

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /authenticating/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
      expect(window.location.replace).toHaveBeenCalledWith("/gridmaster");
    });
  });

  it("failed sign-in (Supabase error): loading resets to false and error message is displayed", async () => {
    mockSignInWithPassword.mockResolvedValue({
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
});
