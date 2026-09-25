/**
 * Unit tests for OrgLogin's submit states.
 * Validates: Requirements 3.1, 3.3
 *
 * LoginPage itself is now an async Server Component that only picks which
 * of DomainSelector/OrgLogin/GridmasterLogin to render based on the Host
 * header (see app/login/page.tsx) — the actual submit logic under test here
 * lives in OrgLogin.
 */
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OrgLogin, { type OrgLoginSeed } from "@/app/(app)/login/OrgLogin";
import { RequestTimeoutError } from "@/lib/fetch-with-timeout";

function renderWithQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>), client };
}

// Mock account client — setBrowserSession is called after server-side auth succeeds
const mockSetSession = vi.fn();
const mockClearAuthState = vi.fn();
const mockExitSandbox = vi.fn();
const mockFetchOrganizations = vi.fn();
const mockFetchTerms = vi.fn();
const mockGetSession = vi.fn();
const mockRefreshSession = vi.fn();
const mockSignOut = vi.fn();
const mockStartTrial = vi.fn();
const mockSwitchOrganization = vi.fn();
const mockMfaFailure = vi.fn();
const mockRecordSignInCompleted = vi.fn();
vi.mock("@/features/account/client", () => ({
  clearBrowserAuthState: (...args: unknown[]) => mockClearAuthState(...args),
  exitSandbox: (...args: unknown[]) => mockExitSandbox(...args),
  fetchAccessibleOrganizations: (...args: unknown[]) => mockFetchOrganizations(...args),
  fetchTermsAcceptanceStatus: (...args: unknown[]) => mockFetchTerms(...args),
  getBrowserAuthSession: (...args: unknown[]) => mockGetSession(...args),
  recordBrowserSignInCompleted: (...args: unknown[]) => mockRecordSignInCompleted(...args),
  refreshBrowserSession: (...args: unknown[]) => mockRefreshSession(...args),
  setBrowserSession: (...args: unknown[]) => mockSetSession(...args),
  signOutFromBrowser: (...args: unknown[]) => mockSignOut(...args),
  startBrowserTrial: (...args: unknown[]) => mockStartTrial(...args),
  switchBrowserOrganization: (...args: unknown[]) => mockSwitchOrganization(...args),
}));

vi.mock("@/components/profile/MFAVerify", () => ({
  MFAVerify: ({
    onVerified,
    onCancel,
  }: {
    onVerified: () => Promise<void>;
    onCancel: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => void onVerified().catch(mockMfaFailure)}>
        Complete MFA
      </button>
      <button type="button" onClick={onCancel}>
        Cancel MFA
      </button>
    </div>
  ),
}));

vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: vi.fn() },
}));

const mockRouterReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockRouterReplace }),
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

const TARGET_ORG_ID = "11111111-1111-4111-8111-111111111111";

function sessionToken(userId: string, orgId: string, orgSlug: string): string {
  return `header.${btoa(JSON.stringify({ sub: userId, org_id: orgId, org_slug: orgSlug }))}.signature`;
}

function browserSession(userId: string, orgId: string, orgSlug: string) {
  return {
    access_token: sessionToken(userId, orgId, orgSlug),
    refresh_token: "refresh-token",
    user: { id: userId },
  };
}

function loginResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      user: { email_confirmed_at: "2026-09-08T00:00:00Z" },
      session: {
        access_token: sessionToken("user-1", TARGET_ORG_ID, "calmhaven"),
        refresh_token: "refresh-token",
      },
      mfa_required: false,
      didSwitchOrg: true,
      destination: "/dashboard",
      ...overrides,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("OrgLogin submit states", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    mockSetSession.mockResolvedValue(undefined);
    mockClearAuthState.mockReset();
    mockExitSandbox.mockReset().mockResolvedValue({ success: true });
    mockFetchOrganizations.mockReset().mockResolvedValue({ organizations: [] });
    mockFetchTerms.mockReset().mockResolvedValue({ acceptedCurrentTerms: true });
    mockGetSession.mockReset().mockResolvedValue(null);
    mockRefreshSession.mockReset().mockResolvedValue(null);
    mockSignOut.mockReset().mockResolvedValue(undefined);
    mockStartTrial.mockReset().mockResolvedValue({ success: true });
    mockSwitchOrganization.mockReset().mockResolvedValue({ success: true });
    mockMfaFailure.mockReset();
    mockToastError.mockReset();
    mockRouterReplace.mockReset();
    sessionStorage.clear();
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
      expect(screen.queryByText("Signing you in…")).not.toBeInTheDocument();
    });
  });

  it("renders the lockout state instead of the form for a suspended or deleted organization", () => {
    const deleted = renderWithQueryClient(
      <OrgLogin orgSlug="test-org" seed={{ status: "deleted", name: "Calm Haven" }} />,
    );
    expect(screen.getByText("This organization has been deleted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
    deleted.unmount();

    renderWithQueryClient(
      <OrgLogin
        orgSlug="test-org"
        seed={{ status: "found", name: "Calm Haven" }}
        lockout="suspended"
      />,
    );
    expect(screen.getByText("This organization is suspended")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
  });

  it("switches to the lockout state when the login route answers ORG_SUSPENDED", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/validate-domain")) {
        return Promise.resolve(validateDomainResponse());
      }
      return Promise.resolve(
        new Response(JSON.stringify({ success: false, code: "ORG_SUSPENDED" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const { container } = renderWithQueryClient(<OrgLogin orgSlug="test-org" seed={FOUND} />);
    submitForm(container);

    await waitFor(() =>
      expect(screen.getByText("This organization is suspended")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
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

  it("finishes a delayed valid sign-in before the request deadline", async () => {
    let resolveLogin: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    const { container } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );
    submitForm(container);

    resolveLogin?.(
      new Response(
        JSON.stringify({
          user: { email_confirmed_at: "2026-09-08T00:00:00Z" },
          session: { access_token: "access", refresh_token: "refresh" },
          mfa_required: false,
          didSwitchOrg: false,
          destination: "/dashboard",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await waitFor(() => {
      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: "access",
        refresh_token: "refresh",
      });
    });
  });

  it("does not set a browser session when the server rejects a stale post-switch session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/validate-domain")) {
        return Promise.resolve(validateDomainResponse());
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: false,
            code: "SESSION_REFRESH_FAILED",
            error: "We couldn't verify your session. Sign in again.",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      );
    });

    const { container } = renderWithQueryClient(<OrgLogin orgSlug="test-org" seed={FOUND} />);
    submitForm(container);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "We couldn't verify your session. Sign in again.",
      );
    });
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockClearAuthState).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't finish switching organizations. Sign in again.",
    );
    expect(screen.getByRole("button", { name: /sign in/i })).not.toBeDisabled();
  });

  it("holds a switched password login behind the handoff until the browser session settles", async () => {
    let finishSetSession!: () => void;
    mockSetSession.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSetSession = resolve;
      }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(loginResponse());

    const { container, client } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );
    client.setQueryData(["old-organization"], "must-clear");
    submitForm(container);

    await waitFor(() => expect(screen.getByText("Loading your organization")).toBeInTheDocument());
    expect(client.getQueryData(["old-organization"])).toBeUndefined();
    expect(window.location.replace).not.toHaveBeenCalled();

    finishSetSession();
    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith("/dashboard"));
    expect(mockSetSession).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the switched password session cannot be stored", async () => {
    mockSetSession.mockRejectedValue(new Error("storage unavailable"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(loginResponse());

    const { container } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );
    submitForm(container);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We couldn't finish switching organizations. Sign in again.",
      );
    });
    expect(mockClearAuthState).toHaveBeenCalledTimes(1);
    expect(window.location.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /sign in/i })).not.toBeDisabled();
  });

  it("waits for a matching refreshed MFA session and coalesces duplicate completion", async () => {
    let finishRefresh!: (session: ReturnType<typeof browserSession>) => void;
    const refresh = new Promise<ReturnType<typeof browserSession>>((resolve) => {
      finishRefresh = resolve;
    });
    mockGetSession.mockResolvedValue(browserSession("user-1", "org-old", "other"));
    mockFetchOrganizations.mockResolvedValue({
      organizations: [{ org_id: TARGET_ORG_ID, org_slug: "calmhaven" }],
    });
    mockRefreshSession.mockReturnValue(refresh);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      loginResponse({
        session: {
          access_token: sessionToken("user-1", "org-old", "other"),
          refresh_token: "refresh-token",
        },
        mfa_required: true,
        didSwitchOrg: false,
        destination: null,
      }),
    );

    const { container } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );
    submitForm(container);
    const complete = await screen.findByRole("button", { name: "Complete MFA" });
    fireEvent.click(complete);
    fireEvent.click(complete);

    await waitFor(() => expect(screen.getByText("Loading your organization")).toBeInTheDocument());
    expect(mockSwitchOrganization).toHaveBeenCalledTimes(1);
    expect(window.location.replace).not.toHaveBeenCalled();

    finishRefresh(browserSession("user-1", TARGET_ORG_ID, "calmhaven"));
    await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith("/dashboard"));
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    // The sign-in is recorded as complete once, in the organization it ended in.
    expect(mockRecordSignInCompleted).toHaveBeenCalledTimes(1);
    expect(mockSwitchOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      mockRecordSignInCompleted.mock.invocationCallOrder[0]!,
    );
  });

  it("refetches what the shell loaded before the second factor, then navigates", async () => {
    mockGetSession.mockResolvedValue(browserSession("user-1", TARGET_ORG_ID, "calmhaven"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      loginResponse({ mfa_required: true, didSwitchOrg: false, destination: null }),
    );

    const { container, client } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );
    const resetQueries = vi.spyOn(client, "resetQueries");
    submitForm(container);
    fireEvent.click(await screen.findByRole("button", { name: "Complete MFA" }));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalled());
    expect(resetQueries).toHaveBeenCalledTimes(1);
    expect(resetQueries.mock.invocationCallOrder[0]).toBeLessThan(
      mockRouterReplace.mock.invocationCallOrder[0]!,
    );
  });

  it("fails closed when MFA switching succeeds but refresh does not", async () => {
    mockGetSession.mockResolvedValue(browserSession("user-1", "org-old", "other"));
    mockFetchOrganizations.mockResolvedValue({
      organizations: [{ org_id: TARGET_ORG_ID, org_slug: "calmhaven" }],
    });
    mockRefreshSession.mockRejectedValue(new Error("refresh failed"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      loginResponse({
        session: {
          access_token: sessionToken("user-1", "org-old", "other"),
          refresh_token: "refresh-token",
        },
        mfa_required: true,
        didSwitchOrg: false,
        destination: null,
      }),
    );

    const { container } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );
    submitForm(container);
    fireEvent.click(await screen.findByRole("button", { name: "Complete MFA" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We couldn't finish switching organizations. Sign in again.",
      );
    });
    expect(mockSwitchOrganization).toHaveBeenCalledTimes(1);
    expect(mockClearAuthState).toHaveBeenCalledTimes(1);
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it("fails closed when MFA refresh returns a token for the wrong organization", async () => {
    mockGetSession.mockResolvedValue(browserSession("user-1", "org-old", "other"));
    mockFetchOrganizations.mockResolvedValue({
      organizations: [{ org_id: TARGET_ORG_ID, org_slug: "calmhaven" }],
    });
    mockRefreshSession.mockResolvedValue(browserSession("user-1", "org-wrong", "wrong"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      loginResponse({
        session: {
          access_token: sessionToken("user-1", "org-old", "other"),
          refresh_token: "refresh-token",
        },
        mfa_required: true,
        didSwitchOrg: false,
        destination: null,
      }),
    );

    const { container } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );
    submitForm(container);
    fireEvent.click(await screen.findByRole("button", { name: "Complete MFA" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "We couldn't finish switching organizations. Sign in again.",
      );
    });
    expect(mockClearAuthState).toHaveBeenCalledTimes(1);
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it("does not navigate when a delayed switched password handoff finishes after unmount", async () => {
    let finishSetSession!: () => void;
    mockSetSession.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSetSession = resolve;
      }),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(loginResponse());

    const { container, unmount } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );
    submitForm(container);
    await waitFor(() => expect(screen.getByText("Loading your organization")).toBeInTheDocument());

    unmount();
    finishSetSession();
    await Promise.resolve();

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it("does not navigate when MFA is cancelled during a delayed destination lookup", async () => {
    let finishTermsLookup!: (value: { acceptedCurrentTerms: boolean }) => void;
    mockFetchTerms.mockReturnValue(
      new Promise<{ acceptedCurrentTerms: boolean }>((resolve) => {
        finishTermsLookup = resolve;
      }),
    );
    mockGetSession.mockResolvedValue(browserSession("user-1", TARGET_ORG_ID, "calmhaven"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      loginResponse({
        mfa_required: true,
        didSwitchOrg: false,
        destination: null,
      }),
    );

    const { container } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );
    submitForm(container);
    fireEvent.click(await screen.findByRole("button", { name: "Complete MFA" }));
    await waitFor(() => expect(mockGetSession).toHaveBeenCalledTimes(1));
    expect(mockMfaFailure).not.toHaveBeenCalled();
    await waitFor(() => expect(mockStartTrial).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockFetchTerms).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Cancel MFA" }));
    await act(async () => {
      finishTermsLookup({ acceptedCurrentTerms: true });
      await Promise.resolve();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockClearAuthState).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith("local");
  });

  it("does not start an organization switch after a delayed lookup is cancelled", async () => {
    let finishOrganizationLookup!: (value: {
      organizations: { org_id: string; org_slug: string }[];
    }) => void;
    mockFetchOrganizations.mockReturnValue(
      new Promise<{ organizations: { org_id: string; org_slug: string }[] }>((resolve) => {
        finishOrganizationLookup = resolve;
      }),
    );
    mockGetSession.mockResolvedValue(browserSession("user-1", "org-old", "other"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      loginResponse({
        session: {
          access_token: sessionToken("user-1", "org-old", "other"),
          refresh_token: "refresh-token",
        },
        mfa_required: true,
        didSwitchOrg: false,
        destination: null,
      }),
    );

    const { container } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );
    submitForm(container);
    fireEvent.click(await screen.findByRole("button", { name: "Complete MFA" }));
    await waitFor(() => expect(mockFetchOrganizations).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Cancel MFA" }));
    await act(async () => {
      finishOrganizationLookup({
        organizations: [{ org_id: TARGET_ORG_ID, org_slug: "calmhaven" }],
      });
      await Promise.resolve();
    });

    expect(mockSwitchOrganization).not.toHaveBeenCalled();
    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it("directs gridmaster accounts to the portal without storing a tenant session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/validate-domain")) {
        return Promise.resolve(validateDomainResponse());
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: false,
            code: "GRIDMASTER_PORTAL_REQUIRED",
            error: "Gridmaster accounts must sign in through the Gridmaster Portal.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      );
    });

    const { container } = renderWithQueryClient(<OrgLogin orgSlug="test-org" seed={FOUND} />);
    submitForm(container);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This account uses the Gridmaster Portal.",
      );
    });
    expect(mockSetSession).not.toHaveBeenCalled();
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

  it("uses safe retry copy for timeout and temporary server failure", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new RequestTimeoutError(15_000))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "private rate-limit detail" }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      );
    const { container } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );

    submitForm(container);
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "That took too long. Check your connection and try again.",
      );
    });
    submitForm(container);
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "DubGrid is temporarily unavailable. Please try again.",
      );
    });
    submitForm(container);
    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Too many sign-in attempts. Wait a few minutes and try again.",
      );
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(screen.getByDisplayValue("user@example.com")).toBeInTheDocument();
    expect(screen.queryByText("private rate-limit detail")).not.toBeInTheDocument();
  });

  it("prevents two credential requests from the same active submission", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(
      <OrgLogin orgSlug="calmhaven" seed={{ status: "found", name: "Calm Haven" }} />,
    );

    submitForm(container);
    fireEvent.submit(screen.getByRole("button", { name: /sign in/i }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
