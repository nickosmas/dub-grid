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
import OrgLogin, { type OrgLoginSeed } from "@/app/(app)/login/OrgLogin";

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

/** The seed app/login/page.tsx hands down once it has resolved the subdomain. */
const FOUND: OrgLoginSeed = { status: "found", name: "Test Org" };

/** A validate-domain response, for the unresolved seed's client-side re-ask. */
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
        protocol: "https:",
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

    const { container } = renderWithQueryClient(<OrgLogin orgSlug="test-org" seed={FOUND} />);
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

    const { container } = renderWithQueryClient(<OrgLogin orgSlug="test-org" seed={FOUND} />);
    submitForm(container);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Check your email and password and try again.");
    });

    // Button must be re-enabled — loading=false on error
    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).not.toBeDisabled();
  });

  it("renders the org name on the first paint, never the raw slug", () => {
    // The regression this guards: orgName used to be resolved in a mount
    // effect, so the heading rendered "test-org" for a frame before swapping
    // to "Test Org". A synchronous assertion (no waitFor) is the point —
    // nothing may have run yet.
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderWithQueryClient(<OrgLogin orgSlug="test-org" seed={FOUND} />);

    expect(screen.getByText("Test Org")).toBeInTheDocument();
    expect(screen.queryByText("test-org")).not.toBeInTheDocument();
    // And no re-ask: the server already answered.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("leaves for the domain selector when an unresolved seed turns out to be no org", async () => {
    // There is nothing to sign in to, so the user should not be left on a
    // sign-in page at all — not even one showing an error.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ valid: false, name: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderWithQueryClient(<OrgLogin orgSlug="nonexistent" seed={{ status: "unresolved" }} />);

    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalledWith(
        "https://localhost/login?org_not_found=1",
      );
    });
  });

  it("stays put when the re-ask fails rather than answers", async () => {
    // A 503 also says `valid: false`. Bouncing a real organization's users off
    // their own sign-in page because Supabase hiccuped is the worse failure.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ valid: false }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    renderWithQueryClient(<OrgLogin orgSlug="test-org" seed={{ status: "unresolved" }} />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(window.location.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});
