import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createSafeAreaContextModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

const routerPush = vi.fn();
const routerReplace = vi.fn();
const useSessionState = vi.fn();
const getSupabaseClient = vi.fn();
const loginToOrganization = vi.fn();
const lookupOrganization = vi.fn();
const registerMobileSessionPresence = vi.fn();
const verifyMobileTotpFactor = vi.fn();
const loadLastOrg = vi.fn();
const saveLastOrg = vi.fn();
const pushToast = vi.fn();
const getBootstrap = vi.fn();

vi.mock("expo-router", async () => {
  const React = await import("react");

  return {
    Redirect: ({ href }: { href: string }) => React.createElement("div", {}, `redirect:${href}`),
    router: {
      push: routerPush,
      replace: routerReplace,
    },
  };
});

vi.mock("../../../shared/providers/AuthSessionProvider", () => ({
  useSessionState,
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient,
}));

vi.mock("../../../shared/lib/api", () => ({
  getBootstrap,
  loginToOrganization,
  lookupOrganization,
  registerMobileSessionPresence,
  verifyMobileTotpFactor,
}));

vi.mock("../../../shared/lib/session", () => ({
  loadLastOrg,
  saveLastOrg,
}));

let isConsentDecisionPending = false;
const recheckConsentDecision = vi.fn();

vi.mock("../../consent/components/ConsentGate", () => ({
  useIsConsentDecisionPending: () => isConsentDecisionPending,
  useRecheckConsentDecision: () => recheckConsentDecision,
}));

let LoginScreen: (typeof import("./LoginScreen"))["default"];

beforeAll(async () => {
  LoginScreen = (await import("./LoginScreen")).default;
});

describe("LoginScreen", () => {
  beforeEach(() => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://example-project.supabase.co");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "anon-key");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://dubgrid.com");

    routerReplace.mockReset();
    useSessionState.mockReset();
    getSupabaseClient.mockReset();
    loginToOrganization.mockReset();
    lookupOrganization.mockReset();
    registerMobileSessionPresence.mockReset();
    verifyMobileTotpFactor.mockReset();
    loadLastOrg.mockReset();
    saveLastOrg.mockReset();
    pushToast.mockReset();
    getBootstrap.mockReset();
    getBootstrap.mockResolvedValue({ currentOrg: { id: "org-1" } });

    useSessionState.mockReturnValue({
      session: null,
      accessToken: null,
      isLoading: false,
    });
    loadLastOrg.mockResolvedValue(null);
    registerMobileSessionPresence.mockResolvedValue({ success: true });
    isConsentDecisionPending = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("auto-skips to the credentials stage when the remembered organization resolves", async () => {
    loadLastOrg.mockResolvedValue({ slug: "dubgrid-health", name: null });
    lookupOrganization.mockResolvedValue({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });

    render(<LoginScreen />);

    expect(screen.getByLabelText("DubGrid logo")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("Email")).toBeInTheDocument();
    // The organization's full name, never the slug it was looked up by.
    expect(screen.getByText(/Continue to/)).toBeInTheDocument();
    expect(screen.getByText("DubGrid Health")).toBeInTheDocument();
    expect(screen.queryByText("dubgrid-health")).not.toBeInTheDocument();
    expect(lookupOrganization).toHaveBeenCalledWith("dubgrid-health");
    // Cache the refreshed name so the next launch has it before the network.
    await waitFor(() => {
      expect(saveLastOrg).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "dubgrid-health", name: "DubGrid Health" }),
      );
    });
  });

  it("keeps the remembered organization ready for an actionable retry when lookup fails", async () => {
    loadLastOrg.mockResolvedValue({ slug: "dubgrid-health", name: "DubGrid Health" });
    lookupOrganization.mockRejectedValue(new Error("Network request failed"));

    render(<LoginScreen />);

    expect(await screen.findByPlaceholderText("yourorg")).toHaveValue("dubgrid-health");
    expect(screen.queryByPlaceholderText("Email")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "We couldn't connect right now. Check your internet connection and try again.",
      ),
    ).toBeInTheDocument();
  });

  // The subdomain is a last resort for when no name is coming. Showing it while
  // the lookup is still in flight flashes it, then replaces it with the name.
  it("shows nothing rather than the subdomain while the name is still resolving", async () => {
    loadLastOrg.mockResolvedValue({ slug: "dubgrid-health", name: null });
    let resolveLookup: (value: unknown) => void = () => {};
    lookupOrganization.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    render(<LoginScreen />);

    expect(await screen.findByPlaceholderText("yourorg")).toHaveValue("dubgrid-health");
    expect(screen.queryByPlaceholderText("Email")).not.toBeInTheDocument();

    await act(async () => {
      resolveLookup({
        organization: {
          id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
          name: "DubGrid Health",
          slug: "dubgrid-health",
        },
      });
    });

    expect(await screen.findByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByText(/Continue to/)).toHaveTextContent("Continue to DubGrid Health.");
  });

  it("does not let a stale remembered organization bypass lookup", async () => {
    loadLastOrg.mockResolvedValue({ slug: "dubgrid-health", name: null });
    lookupOrganization.mockRejectedValue(new Error("Network request failed"));

    render(<LoginScreen />);

    expect(await screen.findByPlaceholderText("yourorg")).toHaveValue("dubgrid-health");
    expect(screen.queryByPlaceholderText("Email")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "We couldn't connect right now. Check your internet connection and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("does not render entry UI over an already authenticated session", () => {
    useSessionState.mockReturnValue({
      session: { user: { id: "user-1" } },
      accessToken: "active-token",
      isLoading: false,
    });

    render(<LoginScreen />);

    expect(screen.getByText("redirect:/(tabs)/home")).toBeInTheDocument();
    expect(loadLastOrg).not.toHaveBeenCalled();
    expect(lookupOrganization).not.toHaveBeenCalled();
  });

  it("verifies the organization before showing the credential form", async () => {
    lookupOrganization.mockResolvedValue({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));

    expect(lookupOrganization).toHaveBeenCalledWith("dubgrid-health");
    expect(await screen.findByText("DubGrid Health")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  });

  // Auto-advancing focuses the email field, which raises the keyboard. Doing
  // that while the consent sheet is about to take over puts the keyboard on top
  // of a sheet the user must answer first.
  it("holds back the remembered-organization skip while consent is undecided", async () => {
    isConsentDecisionPending = true;
    loadLastOrg.mockResolvedValue({ slug: "dubgrid-health", name: null });

    render(<LoginScreen />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("yourorg")).toBeInTheDocument();
    });
    expect(loadLastOrg).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("Email")).not.toBeInTheDocument();
  });

  it("skips ahead as soon as the consent decision lands", async () => {
    isConsentDecisionPending = true;
    loadLastOrg.mockResolvedValue({ slug: "dubgrid-health", name: null });
    lookupOrganization.mockResolvedValue({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });

    const view = render(<LoginScreen />);

    isConsentDecisionPending = false;
    view.rerender(<LoginScreen />);

    expect(await screen.findByPlaceholderText("Email")).toBeInTheDocument();
  });

  // The keyboard covers each stage's submit button, and the 2FA stage's numeric
  // keypad has no return key at all, so the screen offers its own way out.
  it("offers a keyboard dismissal on every stage", async () => {
    lookupOrganization.mockResolvedValue({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });

    render(<LoginScreen />);

    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));
    await screen.findByPlaceholderText("Email");

    const accessoryId = screen
      .getByRole("button", { name: "Done" })
      .closest("[data-native-id]")
      ?.getAttribute("data-native-id");
    expect(accessoryId).toBeTruthy();
    for (const placeholder of ["Email", "Password"]) {
      expect(screen.getByPlaceholderText(placeholder)).toHaveAttribute(
        "data-input-accessory-view-id",
        accessoryId,
      );
    }
  });

  // Resetting a password in Safari would strand the user outside a half-filled
  // sign-in; a native screen keeps them inside the app rather than handing
  // them off to the web app in a browser sheet.
  it("routes to the native password reset screen, carrying the typed email", async () => {
    lookupOrganization.mockResolvedValue({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    routerPush.mockClear();

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));
    await screen.findByPlaceholderText("Email");

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "nurse@dubgrid.test" },
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Forgot password?"));
    });

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/(auth)/forgot-password",
      params: { email: "nurse@dubgrid.test" },
    });
  });

  it("signs in successfully and routes into the Home tab", async () => {
    lookupOrganization.mockResolvedValue({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    loginToOrganization.mockResolvedValue({
      session: {
        accessToken: "token-123",
        refreshToken: "refresh-123",
        expiresIn: 3600,
        tokenType: "bearer",
      },
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
      user: {
        id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
        email: "staff@dubgrid.com",
        firstName: "Mina",
        lastName: "Diaz",
      },
    });
    const setSession = vi.fn().mockResolvedValue({
      error: null,
    });
    getSupabaseClient.mockReturnValue({
      auth: {
        setSession,
      },
    } as never);

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));

    await screen.findByPlaceholderText("Email");
    const passwordInput = screen.getByPlaceholderText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "staff@dubgrid.com" },
    });
    fireEvent.change(passwordInput, {
      target: { value: "super-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(loginToOrganization).toHaveBeenCalledWith({
        orgSlug: "dubgrid-health",
        email: "staff@dubgrid.com",
        password: "super-secret",
      });
    });
    expect(setSession).toHaveBeenCalledWith({
      access_token: "token-123",
      refresh_token: "refresh-123",
    });
    // AuthSessionProvider owns registration for every newly observed token.
    // LoginScreen must not send a second request during the same handoff.
    expect(registerMobileSessionPresence).not.toHaveBeenCalled();
    expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home");
    // Warmed before the handoff, not after it. The tab tree can't draw its tab
    // bar or pick the Home screen without bootstrap, and the launch splash is
    // long spent by now, so arriving without it would blank the screen. The
    // submit button's pending state is what covers this wait.
    expect(getBootstrap).toHaveBeenCalledWith("token-123");
    expect(getBootstrap.mock.invocationCallOrder[0]).toBeLessThan(
      routerReplace.mock.invocationCallOrder[0],
    );
  });

  it("still hands off when warming bootstrap fails", async () => {
    getBootstrap.mockRejectedValue(new Error("offline"));
    lookupOrganization.mockResolvedValue({
      organization: { id: "org-1", name: "DubGrid Health", slug: "dubgrid-health" },
    });
    loginToOrganization.mockResolvedValue({
      organization: { id: "org-1", name: "DubGrid Health", slug: "dubgrid-health" },
      session: { accessToken: "token-123", refreshToken: "refresh-123" },
    });
    const setSession = vi.fn().mockResolvedValue({ data: {}, error: null });
    getSupabaseClient.mockReturnValue({ auth: { setSession } });

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));

    await screen.findByPlaceholderText("Email");
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "staff@dubgrid.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "super-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    // A failed warm-up is the tab gate's problem to report, not a reason to
    // strand the user on the login form with a session already stored.
    await waitFor(() => {
      expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home");
    });
  });

  it("verifies MFA before storing the mobile session", async () => {
    lookupOrganization.mockResolvedValue({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    loginToOrganization.mockResolvedValue({
      session: {
        accessToken: "pending-token",
        refreshToken: "pending-refresh",
        expiresIn: 3600,
        tokenType: "bearer",
      },
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
      user: {
        id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
        email: "staff@dubgrid.com",
        firstName: "Mina",
        lastName: "Diaz",
      },
      mfaRequired: true,
      mfa: {
        factorId: "factor-123",
        friendlyName: "DubGrid Authenticator",
      },
    });
    verifyMobileTotpFactor.mockResolvedValue({
      accessToken: "verified-token",
      refreshToken: "verified-refresh",
      expiresIn: 3600,
      tokenType: "bearer",
    });
    const setSession = vi.fn().mockResolvedValue({
      error: null,
    });
    getSupabaseClient.mockReturnValue({
      auth: {
        setSession,
      },
    } as never);

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));

    await screen.findByPlaceholderText("Email");
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "staff@dubgrid.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "super-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByText("Two-factor authentication")).toBeInTheDocument();
    expect(setSession).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and Sign In" }));

    await waitFor(() => {
      expect(verifyMobileTotpFactor).toHaveBeenCalledWith({
        session: {
          accessToken: "pending-token",
          refreshToken: "pending-refresh",
          expiresIn: 3600,
          tokenType: "bearer",
        },
        factorId: "factor-123",
        code: "123456",
      });
    });
    expect(setSession).toHaveBeenCalledWith({
      access_token: "verified-token",
      refresh_token: "verified-refresh",
    });
    expect(registerMobileSessionPresence).not.toHaveBeenCalled();
    expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("keeps the pending session out of storage when MFA verification fails", async () => {
    lookupOrganization.mockResolvedValue({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    loginToOrganization.mockResolvedValue({
      session: {
        accessToken: "pending-token",
        refreshToken: "pending-refresh",
        expiresIn: 3600,
        tokenType: "bearer",
      },
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
      user: {
        id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
        email: "staff@dubgrid.com",
        firstName: "Mina",
        lastName: "Diaz",
      },
      mfaRequired: true,
      mfa: {
        factorId: "factor-123",
        friendlyName: "DubGrid Authenticator",
      },
    });
    verifyMobileTotpFactor.mockRejectedValue(new Error("That code didn't match"));
    const setSession = vi.fn();
    getSupabaseClient.mockReturnValue({ auth: { setSession } } as never);

    render(<LoginScreen />);
    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));
    await screen.findByPlaceholderText("Email");
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "staff@dubgrid.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "super-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByText("Two-factor authentication");

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and Sign In" }));

    expect(await screen.findByText("That code didn't match")).toBeInTheDocument();
    expect(setSession).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("shows a returned auth error without navigating", async () => {
    lookupOrganization.mockResolvedValue({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    loginToOrganization.mockRejectedValue(new Error("Invalid email or password"));

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));

    await screen.findByPlaceholderText("Email");
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "staff@dubgrid.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(
      await screen.findByText("Check your email and password and try again."),
    ).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("shows an organization lookup error before the credential form", async () => {
    lookupOrganization.mockRejectedValue(new Error("No organization matched that slug."));

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "missing-org" },
    });
    fireEvent.click(screen.getByText("Continue"));

    expect(
      await screen.findByText(
        "We couldn't find that organization. Check the subdomain and try again.",
      ),
    ).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("shows client-friendly inline copy for organization lookup network failures", async () => {
    const backendError =
      "We couldn't reach the mobile backend at http://192.168.1.181:3000 (Network request failed). Check EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env.local and make sure your phone can reach that host.";
    lookupOrganization.mockRejectedValue(new Error(backendError));

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));

    expect(
      await screen.findByText(
        "We couldn't connect right now. Check your internet connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(pushToast).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("shows a persistent network toast instead of an inline login error", async () => {
    lookupOrganization.mockResolvedValue({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    loginToOrganization.mockRejectedValue(new Error("Network request failed"));

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));

    await screen.findByPlaceholderText("Email");
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "staff@dubgrid.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith({
        tone: "error",
        title: "Network connection issue",
        message: "Check your internet connection and try again.",
        dedupeKey: "network-connection-error",
      });
    });
    expect(screen.queryByText("Could not sign in")).not.toBeInTheDocument();
  });

  it("recovers when the mobile session handoff stalls after valid credentials", async () => {
    lookupOrganization.mockResolvedValue({
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    loginToOrganization.mockResolvedValue({
      session: {
        accessToken: "token-123",
        refreshToken: "refresh-123",
        expiresIn: 3600,
        tokenType: "bearer",
      },
      organization: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
      user: {
        id: "8af6f242-c060-4920-a7db-91b4cb66fd26",
        email: "staff@dubgrid.com",
        firstName: "Mina",
        lastName: "Diaz",
      },
    });
    const setSession = vi.fn(() => new Promise(() => {}));
    getSupabaseClient.mockReturnValue({
      auth: {
        setSession,
      },
    } as never);

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));

    await screen.findByPlaceholderText("Email");
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "staff@dubgrid.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "super-secret" },
    });
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(pushToast).toHaveBeenCalledWith({
      tone: "error",
      title: "Network connection issue",
      message: "Check your internet connection and try again.",
      dedupeKey: "network-connection-error",
    });
    expect(routerReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled();
  });
});
