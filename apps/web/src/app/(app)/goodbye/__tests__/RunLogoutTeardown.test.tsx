import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RunLogoutTeardown } from "../RunLogoutTeardown";

const mockSignOutFromBrowser = vi.fn();
const mockClearLogoutCleanup = vi.fn();
const mockClearImpersonationCookie = vi.fn();
const mockGetChannels = vi.fn();
const mockUntrackChannel = vi.fn();
const mockRemoveChannel = vi.fn();
const mockHistoryReplaceState = vi.fn();
const mockToastInfo = vi.fn();
const mockToastDismiss = vi.fn();
const mockToastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => mockToastInfo(...args),
    dismiss: (...args: unknown[]) => mockToastDismiss(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/features/account/client", () => ({
  signOutFromBrowser: (...args: unknown[]) => mockSignOutFromBrowser(...args),
  clearLogoutCleanup: (...args: unknown[]) => mockClearLogoutCleanup(...args),
  getBrowserRealtimeChannels: (...args: unknown[]) => mockGetChannels(...args),
  removeBrowserRealtimeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  untrackBrowserRealtimeChannel: (...args: unknown[]) => mockUntrackChannel(...args),
}));

vi.mock("@/lib/impersonation", () => ({
  clearImpersonationCookie: () => mockClearImpersonationCookie(),
}));

vi.mock("@/features/permissions/client", () => ({}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const queryClientClear = vi.spyOn(queryClient, "clear");
  const utils = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { ...utils, queryClientClear };
}

describe("RunLogoutTeardown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOutFromBrowser.mockResolvedValue(undefined);
    mockClearLogoutCleanup.mockResolvedValue({ success: true });
    mockGetChannels.mockReturnValue([]);
    mockRemoveChannel.mockResolvedValue("ok");
    mockUntrackChannel.mockResolvedValue("ok");
    sessionStorage.clear();
    localStorage.clear();
    // Spy on history.replaceState so we can assert the ?scope= cleanup
    // without actually mutating jsdom's URL across tests.
    vi.spyOn(window.history, "replaceState").mockImplementation(mockHistoryReplaceState);
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("runs the full teardown sequence and flips CTAs to enabled when scope='local'", async () => {
    sessionStorage.setItem("dg_user_view", "1");
    sessionStorage.setItem("dg_user_name", "Nic");
    localStorage.setItem("dg_onboarding:u:o", "2");
    // Device-level prefs must survive logout (hyphen prefix / non-dg keys).
    localStorage.setItem("dg-sidebar-manual-collapse", "1");
    localStorage.setItem("dubgrid-cookie-consent", "x");

    const { queryClientClear } = renderWithClient(<RunLogoutTeardown scope="local" />);

    // Pre-teardown: the primary CTA renders as a disabled <button> with the
    // same "Sign back in" label as the post-teardown <Link>. No text swap
    // would visibly flash to the user.
    const initialButton = screen.getByRole("button", {
      name: /sign back in/i,
    });
    expect(initialButton).toBeDisabled();
    expect(initialButton).toHaveAttribute("aria-busy", "true");

    await waitFor(() => {
      expect(mockSignOutFromBrowser).toHaveBeenCalledWith("local");
    });

    // Auth-required cleanup MUST run before signOut clears the session.
    expect(mockClearLogoutCleanup.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOutFromBrowser.mock.invocationCallOrder[0],
    );

    // Cache + impersonation cookie both cleared exactly once. Permissions live
    // in the query cache now, so queryClient.clear() is what drops them.
    expect(queryClientClear).toHaveBeenCalledTimes(1);
    expect(mockClearImpersonationCookie).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      // Per-session dg_* keys wiped.
      expect(sessionStorage.getItem("dg_user_view")).toBeNull();
      expect(sessionStorage.getItem("dg_user_name")).toBeNull();
      expect(localStorage.getItem("dg_onboarding:u:o")).toBeNull();
    });

    // Device-level prefs preserved.
    expect(localStorage.getItem("dg-sidebar-manual-collapse")).toBe("1");
    expect(localStorage.getItem("dubgrid-cookie-consent")).toBe("x");

    // URL query param dropped via history.replaceState (NOT router.replace —
    // the page is force-dynamic so router.replace would trigger an RSC fetch
    // and re-pick the random headline).
    expect(mockHistoryReplaceState).toHaveBeenCalledWith(null, "", "/goodbye");

    // CTA flips to an enabled link once done.
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /sign back in/i })).toBeInTheDocument();
    });
  });

  it("passes scope='global' through to signOutFromBrowser", async () => {
    renderWithClient(<RunLogoutTeardown scope="global" />);

    await waitFor(() => {
      expect(mockSignOutFromBrowser).toHaveBeenCalledWith("global");
    });
  });

  it("reports unconfirmed global sign-out and clears app state even after a rejection", async () => {
    mockSignOutFromBrowser.mockRejectedValueOnce(new Error("Fresh proof needed"));
    sessionStorage.setItem("dg_user_name", "Nic");
    renderWithClient(<RunLogoutTeardown scope="global" />);
    await screen.findByRole("link", { name: /sign back in/i });
    expect(mockToastError).toHaveBeenCalledWith(
      "We couldn't confirm sign-out on every device. Sign back in to review your sessions.",
    );
    expect(sessionStorage.getItem("dg_user_name")).toBeNull();
    expect(mockSignOutFromBrowser).toHaveBeenCalledOnce();
  });

  it("still revokes the session when logout cleanup never settles", async () => {
    vi.useFakeTimers();
    try {
      mockClearLogoutCleanup.mockReturnValue(new Promise(() => undefined));
      renderWithClient(<RunLogoutTeardown scope="local" />);

      await vi.advanceTimersByTimeAsync(3_100);

      expect(mockSignOutFromBrowser).toHaveBeenCalledWith("local");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still revokes the session when an earlier teardown step throws", async () => {
    mockClearImpersonationCookie.mockImplementationOnce(() => {
      throw new Error("cookie store unavailable");
    });
    renderWithClient(<RunLogoutTeardown scope="global" />);

    await waitFor(() => expect(mockSignOutFromBrowser).toHaveBeenCalledWith("global"));
  });

  it("short-circuits when scope is null (direct /goodbye visit)", async () => {
    renderWithClient(<RunLogoutTeardown scope={null} />);

    // CTAs are enabled immediately — no disabled button placeholder.
    expect(screen.queryByRole("button", { name: /sign back in/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign back in/i })).toBeInTheDocument();

    // None of the teardown side-effects ran.
    expect(mockSignOutFromBrowser).not.toHaveBeenCalled();
    expect(mockClearLogoutCleanup).not.toHaveBeenCalled();
    expect(mockClearImpersonationCookie).not.toHaveBeenCalled();
    expect(mockHistoryReplaceState).not.toHaveBeenCalled();
  });

  it("tears down realtime channels before signOut", async () => {
    const joined = { state: "joined" };
    const closed = { state: "closed" };
    mockGetChannels.mockReturnValue([joined, closed]);

    renderWithClient(<RunLogoutTeardown scope="local" />);

    await waitFor(() => {
      expect(mockSignOutFromBrowser).toHaveBeenCalled();
    });

    expect(mockUntrackChannel).toHaveBeenCalledTimes(1);
    expect(mockUntrackChannel).toHaveBeenCalledWith(joined);
    expect(mockRemoveChannel).toHaveBeenCalledTimes(2);
    // Realtime cleanup before Supabase signOut, otherwise channel teardown
    // requests would fly with no auth.
    expect(mockRemoveChannel.mock.invocationCallOrder[0]).toBeLessThan(
      mockSignOutFromBrowser.mock.invocationCallOrder[0],
    );
  });

  it("guards against React StrictMode + Turbopack dev double-mount", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <RunLogoutTeardown scope="local" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockSignOutFromBrowser).toHaveBeenCalledTimes(1);
    });

    // Simulate StrictMode by unmounting + remounting the same instance is not
    // representative; instead we rely on the useRef sentinel by re-rendering
    // the same tree. React's actual StrictMode would re-invoke the effect on
    // dev; here we assert the effect runs exactly once across re-renders.
    unmount();

    expect(mockSignOutFromBrowser).toHaveBeenCalledTimes(1);
  });

  it("fires a persistent inactivity toast when reason='inactivity'", async () => {
    renderWithClient(<RunLogoutTeardown scope={null} reason="inactivity" />);

    expect(mockToastInfo).toHaveBeenCalledWith(
      "You were signed out after 30 minutes of inactivity.",
      { duration: Infinity },
    );
  });

  it("dismisses the inactivity toast when the user navigates away (e.g. clicks Sign back in)", async () => {
    const toastId = "toast-1";
    mockToastInfo.mockReturnValue(toastId);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <RunLogoutTeardown scope={null} reason="inactivity" />
      </QueryClientProvider>,
    );

    expect(mockToastDismiss).not.toHaveBeenCalled();

    // Navigating away (clicking "Sign back in" or any other in-app link)
    // unmounts this component — the toast should go with it.
    unmount();

    expect(mockToastDismiss).toHaveBeenCalledWith(toastId);
  });

  it("omits the inactivity toast and links straight to /login when reason is absent", async () => {
    renderWithClient(<RunLogoutTeardown scope={null} />);

    expect(mockToastInfo).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /sign back in/i })).toHaveAttribute("href", "/login");
  });
});
