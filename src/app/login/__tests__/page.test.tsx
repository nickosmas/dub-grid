/**
 * Unit tests for login/page.tsx submit states.
 * Validates: Requirements 3.1, 3.3
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import LoginPage from "@/app/login/page";

// Mock supabase module so we can control signInWithPassword per-test
const mockSignInWithPassword = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      signOut: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
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
    // parseHost reads window.location.host (not hostname); set host to a subdomain
    Object.defineProperty(window, 'location', {
      value: { host: 'test-org.localhost', hostname: 'test-org.localhost', replace: vi.fn(), reload: vi.fn(), href: '', search: '?verified=1' },
      writable: true,
      configurable: true,
    });
    mockSignInWithPassword.mockReset();
    mockToastError.mockReset();
  });

  it("successful sign-in: button stays disabled and shows 'Signing in…'", async () => {
    // Arrange: signInWithPassword resolves with no error (but never settles synchronously
    // so loading stays true long enough to assert)
    mockSignInWithPassword.mockReturnValue(new Promise(() => {})); // never resolves

    const { container } = render(<LoginPage />);
    submitForm(container);

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /signing in/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    }, { timeout: 3000 });
  });

  it("failed sign-in: loading resets to false and error message is displayed", async () => {
    // Arrange: signInWithPassword resolves with an error
    mockSignInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });

    const { container } = render(<LoginPage />);
    submitForm(container);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Invalid email or password. Please try again.");
    });

    // Button must be re-enabled — loading=false on error
    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).not.toBeDisabled();
  });
});
