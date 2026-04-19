import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createQueryStateCardModule,
  createReactNativeModule,
  createScreenModule,
} from "../../../test/native";

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("../../../shared/components/Screen", async () =>
  createScreenModule(await import("react")),
);

vi.mock("../../../shared/components/QueryStateCard", async () =>
  createQueryStateCardModule(await import("react")),
);

const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const getSupabaseClient = vi.fn();
const usePushRegistration = vi.fn();
const registerPushToken = vi.fn();
const loadStoredPushDevice = vi.fn();
const handleExpiredMobileSession = vi.fn();

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient,
}));

vi.mock("../../notifications/hooks/usePushRegistration", () => ({
  usePushRegistration,
}));

vi.mock("../../../shared/lib/api", () => ({
  registerPushToken,
}));

vi.mock("../../../shared/lib/auth-reset", () => ({
  handleExpiredMobileSession,
}));

vi.mock("../../../shared/lib/session", () => ({
  loadStoredPushDevice,
  saveLastWorkspaceSlug: vi.fn(),
}));

vi.mock("../../../shared/lib/query-client", () => ({
  queryClient: {
    clear: vi.fn(),
    invalidateQueries: vi.fn(),
  },
}));

let ProfileScreen: (typeof import("./ProfileScreen"))["default"];

beforeAll(async () => {
  ProfileScreen = (await import("./ProfileScreen")).default;
});

describe("ProfileScreen", () => {
  beforeEach(() => {
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    getSupabaseClient.mockReset();
    usePushRegistration.mockReset();
    registerPushToken.mockReset();
    loadStoredPushDevice.mockReset();
    handleExpiredMobileSession.mockReset();

    useAccessToken.mockReturnValue("token-123");
    usePushRegistration.mockReturnValue({
      permissionState: "granted",
      isRegistering: false,
      error: null,
      isSupported: true,
      enablePush: vi.fn(),
      disablePush: vi.fn(),
      refreshPushRegistration: vi.fn(),
    });
    loadStoredPushDevice.mockResolvedValue(null);
  });

  it("shows the loading state while the bootstrap summary is pending", () => {
    useBootstrap.mockReturnValue({
      data: null,
      error: null,
      isFetching: false,
      isLoading: true,
      refetch: vi.fn(),
    } as never);

    render(<ProfileScreen />);

    expect(screen.getByText("Loading profile")).toBeInTheDocument();
  });

  it("shows a retryable error state when bootstrap fails", () => {
    const refetch = vi.fn();
    useBootstrap.mockReturnValue({
      data: null,
      error: new Error("Invalid session"),
      isFetching: false,
      isLoading: false,
      refetch,
    } as never);

    render(<ProfileScreen />);

    expect(screen.getByText("Could not load profile")).toBeInTheDocument();
    expect(screen.getByText("Force Sign Out")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Try Again"));
    expect(refetch).toHaveBeenCalled();
  });

  it("allows force sign-out from the profile error state", async () => {
    useBootstrap.mockReturnValue({
      data: null,
      error: new Error("Could not load profile"),
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    getSupabaseClient.mockReturnValue({
      auth: {
        signOut: vi.fn().mockResolvedValue({
          error: null,
        }),
      },
    } as never);
    handleExpiredMobileSession.mockResolvedValue(undefined);

    render(<ProfileScreen />);

    fireEvent.click(screen.getByText("Force Sign Out"));

    await waitFor(() => {
      expect(handleExpiredMobileSession).toHaveBeenCalledWith({
        skipSignOut: true,
      });
    });
  });

  it("shows the empty state when no bootstrap summary is available", () => {
    useBootstrap.mockReturnValue({
      data: null,
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);

    render(<ProfileScreen />);

    expect(screen.getByText("Profile unavailable")).toBeInTheDocument();
  });

  it("surfaces sign-out errors without losing the profile summary", async () => {
    useBootstrap.mockReturnValue({
      data: {
        user: {
          firstName: "Mina",
          lastName: "Diaz",
          email: "mina@dubgrid.com",
        },
        currentOrg: {
          name: "DubGrid Health",
          id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
          slug: "dubgrid-health",
        },
        effectiveRole: "admin",
        memberships: [
          {
            id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
            name: "DubGrid Health",
            slug: "dubgrid-health",
            orgRole: "admin",
            platformRole: "none",
            isCurrent: true,
          },
        ],
        unreadNotificationCount: 0,
        absenceTypes: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    getSupabaseClient.mockReturnValue({
      auth: {
        signOut: vi.fn().mockResolvedValue({
          error: {
            message: "Remote sign-out failed",
          },
        }),
      },
    } as never);

    render(<ProfileScreen />);

    fireEvent.click(screen.getByText("Sign Out"));

    expect(
      await screen.findByText("Remote sign-out failed"),
    ).toBeInTheDocument();
    expect(screen.getByText("Mina Diaz")).toBeInTheDocument();
  });

  it("resets the mobile session after a successful sign-out", async () => {
    useBootstrap.mockReturnValue({
      data: {
        user: {
          firstName: "Mina",
          lastName: "Diaz",
          email: "mina@dubgrid.com",
        },
        currentOrg: {
          name: "DubGrid Health",
          id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
          slug: "dubgrid-health",
        },
        effectiveRole: "admin",
        memberships: [
          {
            id: "577a93d3-8f6a-4b45-a93d-b9731122ce11",
            name: "DubGrid Health",
            slug: "dubgrid-health",
            orgRole: "admin",
            platformRole: "none",
            isCurrent: true,
          },
        ],
        unreadNotificationCount: 0,
        absenceTypes: [],
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    } as never);
    getSupabaseClient.mockReturnValue({
      auth: {
        signOut: vi.fn().mockResolvedValue({
          error: null,
        }),
      },
    } as never);
    handleExpiredMobileSession.mockResolvedValue(undefined);

    render(<ProfileScreen />);

    fireEvent.click(screen.getByText("Sign Out"));

    await waitFor(() => {
      expect(handleExpiredMobileSession).toHaveBeenCalledWith({
        skipSignOut: true,
      });
    });
  });
});
