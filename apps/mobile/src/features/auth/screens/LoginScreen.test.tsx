import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const routerReplace = vi.fn();
const useSessionState = vi.fn();
const getSupabaseClient = vi.fn();
const loginToWorkspace = vi.fn();
const lookupWorkspace = vi.fn();
const loadLastWorkspaceSlug = vi.fn();
const saveLastWorkspaceSlug = vi.fn();

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

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient,
}));

vi.mock("../../../shared/lib/api", () => ({
  loginToWorkspace,
  lookupWorkspace,
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
    loadLastWorkspaceSlug.mockReset();
    saveLastWorkspaceSlug.mockReset();

    useSessionState.mockReturnValue({
      session: null,
      accessToken: null,
      isLoading: false,
    });
    loadLastWorkspaceSlug.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads a remembered workspace slug on mount", async () => {
    loadLastWorkspaceSlug.mockResolvedValue("dubgrid-health");

    render(<LoginScreen />);

    expect(await screen.findByDisplayValue("dubgrid-health")).toBeInTheDocument();
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

  it("signs in successfully and routes into the Me tab", async () => {
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
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "staff@dubgrid.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
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
    expect(routerReplace).toHaveBeenCalledWith("/(tabs)/me");
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
      await screen.findByText("Invalid email or password"),
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
      await screen.findByText("No workspace matched that slug."),
    ).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
