import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GridmasterLogin from "../GridmasterLogin";
import { RequestTimeoutError } from "@/lib/fetch-with-timeout";

const replace = vi.fn();
const setBrowserSession = vi.fn();
const syncBrowserSessionInBackground = vi.fn();
let signedInUser: { id: string } | null = null;
const primeSignInQueries = vi.fn();
const queryClient = {};
const toastError = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));
// The apex is a separate origin, so the links back to it carry the theme.
// Defaults to undefined, matching next-themes before it has mounted.
let mockTheme: string | undefined;
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: vi.fn() }),
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: signedInUser }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => queryClient }));
vi.mock("@/components/SignInPrefetch", () => ({
  primeSignInQueries: (...args: unknown[]) => primeSignInQueries(...args),
}));
vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const getBrowserAuthSession = vi.fn();
const refreshBrowserSession = vi.fn();
const recordBrowserSignInCompleted = vi.fn();
const resolvePostLoginDestination = vi.fn();
vi.mock("@/features/account/client", () => ({
  getBrowserAuthSession: (...args: unknown[]) => getBrowserAuthSession(...args),
  recordBrowserSignInCompleted: (...args: unknown[]) => recordBrowserSignInCompleted(...args),
  refreshBrowserSession: (...args: unknown[]) => refreshBrowserSession(...args),
  setBrowserSession: (...args: unknown[]) => setBrowserSession(...args),
  signOutFromBrowser: vi.fn().mockResolvedValue(undefined),
  syncBrowserSessionInBackground: (...args: unknown[]) => syncBrowserSessionInBackground(...args),
}));
vi.mock("../shared", () => ({
  AccountDisabledModal: () => <div>Account disabled</div>,
  resolvePostLoginDestination: (...args: unknown[]) => resolvePostLoginDestination(...args),
  useClientHost: () => ({
    parsed: { rootDomain: "localhost", port: "" },
    protocol: "http:",
  }),
  useSessionInvalidToast: vi.fn(),
}));

vi.mock("@/components/profile/MFAVerify", () => ({
  MFAVerify: ({ onVerified }: { onVerified: () => Promise<void> }) => (
    <button type="button" onClick={() => void onVerified()}>
      Complete MFA
    </button>
  ),
}));

function submit() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "admin@dubgrid.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password123" },
  });
  fireEvent.submit(screen.getByRole("button", { name: "Access Portal" }));
}

describe("GridmasterLogin recovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockReset();
    setBrowserSession.mockReset().mockResolvedValue(undefined);
    toastError.mockReset();
  });

  it("finishes a slow successful response before the deadline", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    render(<GridmasterLogin />);
    const button = screen.getByRole("button", { name: "Access Portal" });
    submit();

    expect(button).toBeDisabled();
    resolveRequest?.(
      new Response(
        JSON.stringify({
          session: { access_token: "access", refresh_token: "refresh" },
          mfa_required: false,
          destination: "/dashboard",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("preserves credentials and re-enables retry after a timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new RequestTimeoutError(15_000));
    render(<GridmasterLogin />);
    submit();

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "That took too long. Check your connection and try again.",
      );
    });
    expect(screen.getByLabelText("Email")).toHaveValue("admin@dubgrid.test");
    expect(screen.getByLabelText("Password")).toHaveValue("password123");
    expect(screen.getByRole("button", { name: "Access Portal" })).toBeEnabled();
  });

  it("keeps terminal credential handling specific and prevents duplicate submission", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "provider detail" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    render(<GridmasterLogin />);
    const form = screen.getByLabelText("Email").closest("form")!;
    submit();
    fireEvent.submit(form);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Check your email and password and try again.");
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("provider detail")).not.toBeInTheDocument();
  });
});

describe("GridmasterLogin with session cookies from the server", () => {
  const SESSION = { access_token: "access", refresh_token: "refresh" };

  function respondWithCookiesSet() {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          session: SESSION,
          user: { id: "gridmaster-1" },
          mfa_required: false,
          destination: "/dashboard",
          sessionCookieSet: true,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    replace.mockReset();
    signedInUser = null;
    setBrowserSession.mockReset().mockReturnValue(new Promise(() => {}));
    syncBrowserSessionInBackground.mockReset().mockResolvedValue(undefined);
    primeSignInQueries.mockReset();
  });

  it("navigates without waiting for the browser's own session check", async () => {
    respondWithCookiesSet();
    render(<GridmasterLogin />);
    submit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(syncBrowserSessionInBackground).toHaveBeenCalledExactlyOnceWith(SESSION);
    expect(primeSignInQueries).toHaveBeenCalledExactlyOnceWith(queryClient, SESSION.access_token);
    expect(setBrowserSession).not.toHaveBeenCalled();
  });

  it("waits for the browser session when a different account is signed in here", async () => {
    signedInUser = { id: "someone-else" };
    respondWithCookiesSet();
    render(<GridmasterLogin />);
    submit();

    await waitFor(() => expect(setBrowserSession).toHaveBeenCalledWith(SESSION));
    expect(replace).not.toHaveBeenCalled();
    expect(syncBrowserSessionInBackground).not.toHaveBeenCalled();
  });
});

describe("GridmasterLogin second factor", () => {
  function token(claims: Record<string, unknown>): string {
    return `header.${btoa(JSON.stringify(claims))}.signature`;
  }
  const STAMPED = { access_token: token({ sub: "gm-1", platform_role: "gridmaster" }) };

  beforeEach(() => {
    signedInUser = null;
    replace.mockReset();
    setBrowserSession.mockReset().mockResolvedValue(undefined);
    primeSignInQueries.mockReset();
    getBrowserAuthSession.mockReset().mockResolvedValue(STAMPED);
    refreshBrowserSession.mockReset().mockResolvedValue(STAMPED);
    recordBrowserSignInCompleted.mockReset().mockResolvedValue(undefined);
    resolvePostLoginDestination.mockReset().mockResolvedValue("/gridmaster");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          session: { access_token: token({ sub: "gm-1" }), refresh_token: "refresh" },
          user: { id: "gm-1", email_confirmed_at: "2026-01-01T00:00:00Z" },
          mfa_required: true,
          destination: null,
          sessionCookieSet: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  });

  async function completeSecondFactor() {
    render(<GridmasterLogin />);
    submit();
    fireEvent.click(await screen.findByRole("button", { name: "Complete MFA" }));
  }

  it("lands on the portal without a refresh when the verified token carries the role", async () => {
    let finishTerms!: (destination: string) => void;
    resolvePostLoginDestination.mockReturnValue(
      new Promise((resolve) => {
        finishTerms = resolve;
      }),
    );
    await completeSecondFactor();

    await waitFor(() => expect(recordBrowserSignInCompleted).toHaveBeenCalledTimes(1));
    expect(resolvePostLoginDestination).toHaveBeenCalledExactlyOnceWith("/gridmaster");
    expect(primeSignInQueries).toHaveBeenCalledExactlyOnceWith(queryClient, STAMPED.access_token);
    expect(replace).not.toHaveBeenCalled();

    await act(async () => finishTerms("/gridmaster"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/gridmaster"));
    expect(refreshBrowserSession).not.toHaveBeenCalled();
  });

  it("refreshes once when the verified token lacks the role", async () => {
    getBrowserAuthSession.mockResolvedValue({ access_token: token({ sub: "gm-1" }) });
    await completeSecondFactor();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/gridmaster"));
    expect(refreshBrowserSession).toHaveBeenCalledTimes(1);
    expect(primeSignInQueries).toHaveBeenCalledExactlyOnceWith(queryClient, STAMPED.access_token);
  });
});

describe("GridmasterLogin card and theme handover", () => {
  beforeEach(() => {
    mockTheme = undefined;
  });

  it("keeps the hydration marker on the card so no wrapper can shrink-wrap it", () => {
    render(<GridmasterLogin />);
    expect(screen.getByTestId("gridmaster-login")).toHaveClass("dg-auth-card");
  });

  it("hands the theme to the apex links, which live on another origin", () => {
    mockTheme = "dark";
    render(<GridmasterLogin />);
    expect(screen.getByRole("link", { name: "Back to standard login" })).toHaveAttribute(
      "href",
      "http://localhost/login?theme=dark",
    );
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "http://localhost/?theme=dark",
    );
  });

  it("leaves the apex links bare until next-themes has mounted", () => {
    render(<GridmasterLogin />);
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "http://localhost/",
    );
  });

  // next-themes has no theme on the server but reads localStorage on the
  // client's very first render, so an href built from it alone differs
  // between the two and React reports a hydration mismatch. The server page
  // resolves the theme from the request instead and hands it down.
  it("builds the same apex links on the server and on hydration", async () => {
    mockTheme = undefined;
    const serverHtml = renderToString(<GridmasterLogin initialTheme="dark" />);
    expect(serverHtml).toContain('href="http://localhost/login?theme=dark"');
    expect(serverHtml).toContain('href="http://localhost/?theme=dark"');

    mockTheme = "dark";
    const container = document.body.appendChild(document.createElement("div"));
    container.innerHTML = serverHtml;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <GridmasterLogin initialTheme="dark" />);
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Back to standard login" })).toHaveAttribute(
      "href",
      "http://localhost/login?theme=dark",
    );
    consoleError.mockRestore();
    await act(async () => root?.unmount());
    container.remove();
  });

  it("switches to the live preference once next-themes has mounted", () => {
    mockTheme = "light";
    render(<GridmasterLogin initialTheme="dark" />);
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "http://localhost/?theme=light",
    );
  });
});
