/**
 * Unit tests for login/page.tsx submit states.
 * Validates: Requirements 3.1, 3.3
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import LoginPage from "@/app/login/page";

// Mock account client — setBrowserSession is called after server-side auth succeeds
const mockSetSession = vi.fn();
vi.mock("@/features/account/client", () => ({
  fetchAccessibleOrganizations: vi.fn().mockResolvedValue({ organizations: [] }),
  getBrowserAuthSession: vi.fn().mockResolvedValue(null),
  refreshBrowserSession: vi.fn().mockResolvedValue(undefined),
  setBrowserSession: (...args: unknown[]) => mockSetSession(...args),
  signOutFromBrowser: vi.fn().mockResolvedValue(undefined),
  switchBrowserOrganization: vi.fn().mockResolvedValue(undefined),
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
    mockSetSession.mockReset();
    mockToastError.mockReset();
    vi.restoreAllMocks();
  });

  it("successful sign-in: button stays disabled and shows spinner", async () => {
    // Arrange: fetch never resolves so loading stays true
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));

    const { container } = render(<LoginPage />);
    submitForm(container);

    await waitFor(() => {
      const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn).toBeDisabled();
      // Spinner SVG replaces button text while loading
      expect(submitBtn.querySelector("svg")).toBeInTheDocument();
    });
  });

  it("failed sign-in: loading resets to false and error message is displayed", async () => {
    // Arrange: fetch returns 401 (invalid credentials).
    // Return a fresh Response per call — OrgLogin also fires a /api/validate-domain
    // fetch on mount, and a single shared Response body can only be read once.
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: false, error: "Invalid email or password" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

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
