/**
 * Unit tests for login/page.tsx submit states.
 * Validates: Requirements 3.1, 3.3
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { supabase } from "@/lib/supabase";
import LoginPage from "@/app/login/page";

vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/** Helper: fill and submit the login form */
function submitForm(container: HTMLElement) {
  const emailInput = container.querySelector(
    'input[type="email"]',
  ) as HTMLInputElement;
  const passwordInput = container.querySelector(
    'input[type="password"]',
  ) as HTMLInputElement;
  fireEvent.change(emailInput, { target: { value: "user@example.com" } });
  fireEvent.change(passwordInput, { target: { value: "password123" } });
  fireEvent.submit(screen.getByRole("button", { name: /sign in/i }));
}

describe("Login page submit states", () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'test-org.localhost', replace: vi.fn(), reload: vi.fn() },
      writable: true
    });
  });

  it("successful sign-in: button stays disabled and message shows 'Please wait...'", async () => {
    // Arrange: signInWithPassword resolves with no error
    (supabase.auth as any).signInWithPassword = vi
      .fn()
      .mockResolvedValue({ error: null });

    const { container } = render(<LoginPage />);
    submitForm(container);

    await waitFor(() => {
      // Both the message div and the button show "Redirecting..."
      const button = screen.getByRole("button", { name: /please wait/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });
  });

  it("failed sign-in: loading resets to false and error message is displayed", async () => {
    // Arrange: signInWithPassword resolves with an error
    (supabase.auth as any).signInWithPassword = vi
      .fn()
      .mockResolvedValue({ error: { message: "Invalid login credentials" } });

    const { container } = render(<LoginPage />);
    submitForm(container);

    await waitFor(() => {
      expect(screen.getByText("Invalid login credentials")).toBeInTheDocument();
    });

    // Button must be re-enabled — loading=false on error
    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).not.toBeDisabled();
  });
});
