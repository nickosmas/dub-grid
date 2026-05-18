import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReactNativeModule,
  createSafeAreaContextModule,
} from "../../../test/native";

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("react-native-safe-area-context", async () =>
  createSafeAreaContextModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

const routerReplace = vi.fn();
const useSessionState = vi.fn();
const getSupabaseClient = vi.fn();
const loginToWorkspace = vi.fn();
const lookupWorkspace = vi.fn();
const registerMobileSessionPresence = vi.fn();
const verifyMobileTotpFactor = vi.fn();
const loadLastWorkspaceSlug = vi.fn();
const saveLastWorkspaceSlug = vi.fn();
const pushToast = vi.fn();

vi.mock("expo-router", async () => {
  const React = await import("react");

  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement("div", {}, `redirect:${href}`),
    router: {
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
  loginToWorkspace,
  lookupWorkspace,
  registerMobileSessionPresence,
  verifyMobileTotpFactor,
}));

vi.mock("../../../shared/lib/session", () => ({
  loadLastWorkspaceSlug,
  saveLastWorkspaceSlug,
}));

let LoginScreen: (typeof import("./LoginScreen"))["default"];

beforeAll(async () => {
  LoginScreen = (await import("./LoginScreen")).default;
});

describe("LoginScreen", () => {
  beforeEach(() => {
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_URL", "https://example-project.supabase.co");
    vi.stubEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://dubgrid.com");

    routerReplace.mockReset();
    useSessionState.mockReset();
    getSupabaseClient.mockReset();
    loginToWorkspace.mockReset();
    lookupWorkspace.mockReset();
    registerMobileSessionPresence.mockReset();
    verifyMobileTotpFactor.mockReset();
    loadLastWorkspaceSlug.mockReset();
    saveLastWorkspaceSlug.mockReset();
    pushToast.mockReset();

    useSessionState.mockReturnValue({
      session: null,
      accessToken: null,
      isLoading: false,
    });
    loadLastWorkspaceSlug.mockResolvedValue(null);
    registerMobileSessionPresence.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("auto-skips to the credentials stage when the remembered workspace resolves", async () => {
    loadLastWorkspaceSlug.mockResolvedValue("dubgrid-health");
    lookupWorkspace.mockResolvedValue({
      workspace: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });

    render(<LoginScreen />);

    expect(screen.getByLabelText("DubGrid logo")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByText("DubGrid Health")).toBeInTheDocument();
    expect(lookupWorkspace).toHaveBeenCalledWith("dubgrid-health");
  });

  it("still goes to the credentials stage even when the remembered lookup fails", async () => {
    loadLastWorkspaceSlug.mockResolvedValue("dubgrid-health");
    lookupWorkspace.mockRejectedValue(new Error("Network request failed"));

    render(<LoginScreen />);

    expect(await screen.findByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByText("dubgrid-health")).toBeInTheDocument();
  });

  it("verifies the workspace before showing the credential form", async () => {
    lookupWorkspace.mockResolvedValue({
      workspace: {
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

    expect(lookupWorkspace).toHaveBeenCalledWith("dubgrid-health");
    expect(await screen.findByText("DubGrid Health")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  });

  it("signs in successfully and routes into the Home tab", async () => {
    lookupWorkspace.mockResolvedValue({
      workspace: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    loginToWorkspace.mockResolvedValue({
      session: {
        accessToken: "token-123",
        refreshToken: "refresh-123",
        expiresIn: 3600,
        tokenType: "bearer",
      },
      workspace: {
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
      expect(loginToWorkspace).toHaveBeenCalledWith({
        workspaceSlug: "dubgrid-health",
        email: "staff@dubgrid.com",
        password: "super-secret",
      });
    });
    expect(setSession).toHaveBeenCalledWith({
      access_token: "token-123",
      refresh_token: "refresh-123",
    });
    expect(registerMobileSessionPresence).toHaveBeenCalledWith("token-123");
    expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("verifies MFA before storing the mobile session", async () => {
    lookupWorkspace.mockResolvedValue({
      workspace: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    loginToWorkspace.mockResolvedValue({
      session: {
        accessToken: "pending-token",
        refreshToken: "pending-refresh",
        expiresIn: 3600,
        tokenType: "bearer",
      },
      workspace: {
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

    expect(
      await screen.findByText("Two-factor authentication"),
    ).toBeInTheDocument();
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
    expect(registerMobileSessionPresence).toHaveBeenCalledWith("verified-token");
    expect(routerReplace).toHaveBeenCalledWith("/(tabs)/home");
  });

  it("shows a returned auth error without navigating", async () => {
    lookupWorkspace.mockResolvedValue({
      workspace: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    loginToWorkspace.mockRejectedValue(new Error("Invalid email or password"));

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

  it("shows a workspace lookup error before the credential form", async () => {
    lookupWorkspace.mockRejectedValue(new Error("No workspace matched that slug."));

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "missing-org" },
    });
    fireEvent.click(screen.getByText("Continue"));

    expect(
      await screen.findByText(
        "We couldn't find that workspace. Check the subdomain and try again.",
      ),
    ).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("shows client-friendly inline copy for workspace lookup network failures", async () => {
    const backendError =
      "We couldn't reach the mobile backend at http://192.168.1.181:3000 (Network request failed). Check EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env.local and make sure your phone can reach that host.";
    lookupWorkspace.mockRejectedValue(new Error(backendError));

    render(<LoginScreen />);

    fireEvent.change(screen.getByPlaceholderText("yourorg"), {
      target: { value: "dubgrid-health" },
    });
    fireEvent.click(screen.getByText("Continue"));

    expect(
      await screen.findByText(
        "We couldn't connect to DubGrid from this device. Check your internet connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(pushToast).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("shows a persistent network toast instead of an inline login error", async () => {
    lookupWorkspace.mockResolvedValue({
      workspace: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    loginToWorkspace.mockRejectedValue(new Error("Network request failed"));

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
        durationMs: null,
        dedupeKey: "network-connection-error",
      });
    });
    expect(screen.queryByText("Could not sign in")).not.toBeInTheDocument();
  });

  it("recovers when the mobile session handoff stalls after valid credentials", async () => {
    lookupWorkspace.mockResolvedValue({
      workspace: {
        id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
        name: "DubGrid Health",
        slug: "dubgrid-health",
      },
    });
    loginToWorkspace.mockResolvedValue({
      session: {
        accessToken: "token-123",
        refreshToken: "refresh-123",
        expiresIn: 3600,
        tokenType: "bearer",
      },
      workspace: {
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
      durationMs: null,
      dedupeKey: "network-connection-error",
    });
    expect(routerReplace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeEnabled();
  });
});
