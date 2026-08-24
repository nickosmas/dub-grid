/**
 * Unit tests for OrgLogin's submit states.
 * Validates: Requirements 3.1, 3.3
 *
 * LoginPage itself is now an async Server Component that only picks which
 * of DomainSelector/OrgLogin/GridmasterLogin to render based on the Host
 * header (see app/login/page.tsx) — the actual submit logic under test here
 * lives in OrgLogin.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OrgLogin from "@/app/(app)/login/OrgLogin";

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// Mock account client — setBrowserSession is called after server-side auth succeeds
const mockSetSession = vi.fn();
vi.mock("@/features/account/client", () => ({
  exitSandbox: vi.fn().mockResolvedValue({ success: true }),
  fetchAccessibleOrganizations: vi.fn().mockResolvedValue({ organizations: [] }),
  getBrowserAuthSession: vi.fn().mockResolvedValue(null),
  refreshBrowserSession: vi.fn().mockResolvedValue(undefined),
  setBrowserSession: (...args: unknown[]) => mockSetSession(...args),
  signOutFromBrowser: vi.fn().mockResolvedValue(undefined),
  startBrowserTrial: vi.fn().mockResolvedValue({ success: true }),
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
  const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
  const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;
  fireEvent.change(emailInput, { target: { value: "user@example.com" } });
  fireEvent.change(passwordInput, { target: { value: "password123" } });
  fireEvent.submit(screen.getByRole("button", { name: /sign in/i }));
}

/** A validate-domain response so OrgLogin's mount effect resolves the org as found. */
function validateDomainResponse() {
  return new Response(JSON.stringify({ valid: true, name: "Test Org" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OrgLogin submit states", () => {
  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: {
        host: "test-org.localhost",
        hostname: "test-org.localhost",
        replace: vi.fn(),
        reload: vi.fn(),
        href: "",
        search: "?verified=1",
      },
      writable: true,
      configurable: true,
    });
    mockSetSession.mockReset();
    mockToastError.mockReset();
    vi.restoreAllMocks();
  });

  it("successful sign-in: button stays disabled and shows spinner", async () => {
    // Arrange: /api/auth/login never resolves so loading stays true; the
    // mount-time validate-domain call resolves normally.
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/validate-domain")) {
        return Promise.resolve(validateDomainResponse());
      }
      return new Promise(() => {});
    });

    const { container } = renderWithQueryClient(<OrgLogin orgSlug="test-org" />);
    submitForm(container);

    await waitFor(() => {
      const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn).toBeDisabled();
      // Spinner SVG replaces button text while loading
      expect(submitBtn.querySelector("svg")).toBeInTheDocument();
    });
  });

  it("failed sign-in: loading resets to false and error message is displayed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/validate-domain")) {
        return Promise.resolve(validateDomainResponse());
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: false, error: "Invalid email or password" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const { container } = renderWithQueryClient(<OrgLogin orgSlug="test-org" />);
    submitForm(container);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Check your email and password and try again.");
    });

    // Button must be re-enabled — loading=false on error
    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).not.toBeDisabled();
  });

  it("shows an organization-not-found state when validate-domain reports the slug doesn't exist", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ valid: false, name: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderWithQueryClient(<OrgLogin orgSlug="nonexistent" />);

    await waitFor(() => {
      expect(screen.getByText("Organization not found")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
  });
});
