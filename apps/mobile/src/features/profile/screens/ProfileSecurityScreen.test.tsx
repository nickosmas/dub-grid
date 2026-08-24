import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const routerPush = vi.fn();
const pushToast = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

vi.mock("expo-router", () => ({
  router: {
    push: routerPush,
  },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();

  return {
    ...actual,
    useMutation,
    useQuery,
  };
});

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../auth/hooks/useBootstrap", () => ({
  useBootstrap,
}));

vi.mock("../../../shared/lib/api", () => ({
  createProfileChangeRequest: vi.fn(),
  getProfile: vi.fn(),
  getProfileSessions: vi.fn(),
}));

vi.mock("../../../shared/lib/env", () => ({
  getMobileEnvConfig: () => ({
    apiBaseUrl: "https://app.dubgrid.com",
  }),
}));

// The real `app-lock` store (its cache and listeners are plain module state, so
// it works under jsdom) behind the same `useSyncExternalStore` read the lock
// itself uses — importing AppLockProvider for real would drag the session
// provider and the lock sheet into a test about a settings row.
vi.mock("../../../shared/providers/AppLockProvider", async () => {
  const { useSyncExternalStore } = await import("react");
  const { getAppLockEnabledSnapshot, subscribeAppLockEnabled } =
    await import("../../../shared/lib/app-lock");

  return {
    useAppLockEnabled: () =>
      useSyncExternalStore(subscribeAppLockEnabled, getAppLockEnabledSnapshot, () => false),
  };
});

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

const hasHardwareAsync = vi.fn();
const isEnrolledAsync = vi.fn();

vi.mock("expo-local-authentication", () => ({
  hasHardwareAsync: (...args: unknown[]) => hasHardwareAsync(...args),
  isEnrolledAsync: (...args: unknown[]) => isEnrolledAsync(...args),
  authenticateAsync: vi.fn(),
}));

let ProfileSecurityScreen: (typeof import("./ProfileSecurityScreen"))["default"];
let setAppLockEnabled: (typeof import("../../../shared/lib/app-lock"))["setAppLockEnabled"];

const profileData = {
  user: {
    email: "mina@dubgrid.com",
    mfaEnabled: false,
  },
  pendingAccountDeletionRequest: false,
};

const sessionsData = {
  active: [
    { id: "session-1", isCurrent: true },
    { id: "session-2", isCurrent: false },
  ],
  stale: [],
};

beforeAll(async () => {
  ProfileSecurityScreen = (await import("./ProfileSecurityScreen")).default;
  setAppLockEnabled = (await import("../../../shared/lib/app-lock")).setAppLockEnabled;
});

describe("ProfileSecurityScreen", () => {
  beforeEach(async () => {
    useMutation.mockReset();
    useQuery.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    routerPush.mockReset();
    pushToast.mockReset();
    hasHardwareAsync.mockReset();
    isEnrolledAsync.mockReset();
    hasHardwareAsync.mockResolvedValue(true);
    isEnrolledAsync.mockResolvedValue(true);
    // Module-level store, so it survives between tests unless reset.
    await setAppLockEnabled(false);

    useAccessToken.mockReturnValue("token-123");
    useBootstrap.mockReturnValue({
      data: {
        permissions: {
          canManageEmployees: true,
        },
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey.join(":");
      if (key.includes("sessions")) {
        return {
          data: sessionsData,
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: profileData,
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      };
    });
    useMutation.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });
  });

  it("routes each security flow to its own screen instead of unfolding it inline", () => {
    render(<ProfileSecurityScreen />);

    // The editors that used to open in place are gone from this page.
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("6-digit verification code")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out all devices" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Password" }));
    expect(routerPush).toHaveBeenCalledWith("/(tabs)/profile/password");

    // Regex, not an exact name: these rows carry a trailing value, so their
    // accessible name is the label plus that value.
    fireEvent.click(screen.getByRole("button", { name: /^Two-factor authentication/ }));
    expect(routerPush).toHaveBeenCalledWith("/(tabs)/profile/two-factor");

    fireEvent.click(screen.getByRole("button", { name: /^Signed-in devices/ }));
    expect(routerPush).toHaveBeenCalledWith("/(tabs)/profile/sessions");
  });

  it("summarises two-factor status and the signed-in device count on the rows", () => {
    render(<ProfileSecurityScreen />);

    expect(screen.getByText("Not enabled")).toBeInTheDocument();
    expect(screen.getByText("2 devices signed in")).toBeInTheDocument();
  });

  it("waits for the sessions query before painting, so there is no second loading wave", () => {
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey.join(":");
      if (key.includes("sessions")) {
        return { data: undefined, error: null, isLoading: true, refetch: vi.fn() };
      }

      return { data: profileData, error: null, isLoading: false, refetch: vi.fn() };
    });

    render(<ProfileSecurityScreen />);

    // The profile query has resolved, but the page must not paint its rows
    // with a device count still missing.
    expect(screen.queryByText("Not enabled")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Signed-in devices/ })).not.toBeInTheDocument();
  });

  it("turns on app lock when the device has biometrics enrolled", async () => {
    render(<ProfileSecurityScreen />);

    const appLockSwitch = screen.getByLabelText("App lock");
    expect(appLockSwitch).not.toBeChecked();

    await act(async () => {
      fireEvent.click(appLockSwitch);
    });

    await waitFor(() => {
      expect(hasHardwareAsync).toHaveBeenCalled();
      expect(isEnrolledAsync).toHaveBeenCalled();
      expect(appLockSwitch).toBeChecked();
    });
  });

  it("refuses to enable app lock when the device has no biometrics/passcode enrolled", async () => {
    isEnrolledAsync.mockResolvedValue(false);

    render(<ProfileSecurityScreen />);

    const appLockSwitch = screen.getByLabelText("App lock");

    await act(async () => {
      fireEvent.click(appLockSwitch);
    });

    await waitFor(() => {
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({ tone: "error", title: "Could not enable app lock" }),
      );
      expect(appLockSwitch).not.toBeChecked();
    });
  });

  it("requests account deletion after confirming, for a user who can't edit their own record", async () => {
    // `mutateAsync`, not `mutate`: the confirmation sheet latches on the
    // promise its handler returns, which is what stops a second confirm from
    // filing a second deletion request.
    const mutateAsync = vi.fn(() => Promise.resolve());
    useMutation.mockReturnValue({ isPending: false, mutate: vi.fn(), mutateAsync });
    useBootstrap.mockReturnValue({
      data: { permissions: { canManageEmployees: false } },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<ProfileSecurityScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Request account deletion" }));

    expect(screen.getByText("Request account deletion?")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Request" }));
    });

    expect(mutateAsync).toHaveBeenCalled();
  });

  it("hides account deletion from a user who can edit employee records", () => {
    render(<ProfileSecurityScreen />);

    expect(
      screen.queryByRole("button", { name: "Request account deletion" }),
    ).not.toBeInTheDocument();
  });
});
