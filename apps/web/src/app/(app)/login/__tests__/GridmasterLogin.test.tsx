import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GridmasterLogin from "../GridmasterLogin";
import { RequestTimeoutError } from "@/lib/fetch-with-timeout";

const replace = vi.fn();
const setBrowserSession = vi.fn();
const toastError = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));
// The apex is a separate origin, so the links back to it carry the theme.
// Defaults to undefined, matching next-themes before it has mounted.
let mockTheme: string | undefined;
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: mockTheme, setTheme: vi.fn() }),
}));
vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/account/client", () => ({
  refreshBrowserSession: vi.fn().mockResolvedValue(undefined),
  setBrowserSession: (...args: unknown[]) => setBrowserSession(...args),
  signOutFromBrowser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../shared", () => ({
  AccountDisabledModal: () => <div>Account disabled</div>,
  resolvePostLoginDestination: vi.fn().mockResolvedValue("/dashboard"),
  useClientHost: () => ({
    parsed: { rootDomain: "localhost", port: "" },
    protocol: "http:",
  }),
  useSessionInvalidToast: vi.fn(),
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
