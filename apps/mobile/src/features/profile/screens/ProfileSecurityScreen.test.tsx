import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useMutation = vi.fn();
const useQuery = vi.fn();
const useAccessToken = vi.fn();
const useBootstrap = vi.fn();
const getSupabaseClient = vi.fn();
const handleExpiredMobileSession = vi.fn();
const pushToast = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

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

const updateProfileMfaStatus = vi.fn();

vi.mock("../../../shared/lib/api", () => ({
  createProfileChangeRequest: vi.fn(),
  getProfile: vi.fn(),
  getProfileSessions: vi.fn(),
  revokeProfileSession: vi.fn(),
  updateProfileMfaStatus: (...args: unknown[]) => updateProfileMfaStatus(...args),
}));

vi.mock("../../../shared/lib/env", () => ({
  getMobileEnvConfig: () => ({
    apiBaseUrl: "https://app.dubgrid.com",
  }),
}));

vi.mock("../../../shared/lib/supabase", () => ({
  getSupabaseClient,
}));

vi.mock("../../../shared/lib/auth-reset", () => ({
  handleExpiredMobileSession,
}));

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

const profileData = {
  user: {
    email: "mina@dubgrid.com",
    mfaEnabled: false,
  },
  pendingAccountDeletionRequest: false,
};

beforeAll(async () => {
  ProfileSecurityScreen = (await import("./ProfileSecurityScreen")).default;
});

describe("ProfileSecurityScreen", () => {
  beforeEach(() => {
    useMutation.mockReset();
    useQuery.mockReset();
    useAccessToken.mockReset();
    useBootstrap.mockReset();
    getSupabaseClient.mockReset();
    handleExpiredMobileSession.mockReset();
    pushToast.mockReset();
    updateProfileMfaStatus.mockReset();
    updateProfileMfaStatus.mockResolvedValue({ user: { mfaEnabled: true } });
    hasHardwareAsync.mockReset();
    isEnrolledAsync.mockReset();
    hasHardwareAsync.mockResolvedValue(true);
    isEnrolledAsync.mockResolvedValue(true);

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
          data: { active: [], stale: [] },
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

  it("changes the password from the security page and signs out all sessions", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    getSupabaseClient.mockReturnValue({
      auth: {
        signInWithPassword,
        updateUser,
        signOut,
      },
    } as never);
    handleExpiredMobileSession.mockResolvedValue(undefined);

    render(<ProfileSecurityScreen />);

    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm new password")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("New password")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show current password" }));
    fireEvent.click(screen.getByRole("button", { name: "Show new password" }));
    fireEvent.click(screen.getByRole("button", { name: "Show confirm password" }));
    expect(screen.getByLabelText("Current password")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("New password")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide current password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide new password" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide confirm password" })).toBeInTheDocument();
    expect(screen.getByText("At least 10 characters")).toBeInTheDocument();
    expect(screen.getByText("Uppercase letter")).toBeInTheDocument();
    expect(screen.getByText("Number")).toBeInTheDocument();
    expect(screen.getByText("Symbol")).toBeInTheDocument();
    expect(screen.queryByText("Too short")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "New-password-123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "New-password-123" },
    });
    expect(screen.getByText("Strong")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByText("Update password?")).toBeInTheDocument();
    expect(
      screen.getByText("You'll be signed out of every device after the password is updated."),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("alert")).getByRole("button", {
          name: "Update and sign out",
        }),
      );
    });

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "mina@dubgrid.com",
        password: "old-password",
      });
      expect(updateUser).toHaveBeenCalledWith({
        password: "New-password-123",
      });
      expect(signOut).toHaveBeenCalledWith({ scope: "global" });
      expect(handleExpiredMobileSession).toHaveBeenCalledWith({
        skipSignOut: true,
      });
    });
  });

  it("enrolls in two-factor authentication with a manually-entered secret", async () => {
    const listFactors = vi.fn().mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    });
    const enroll = vi.fn().mockResolvedValue({
      data: { id: "factor-1", totp: { secret: "SECRET123" } },
      error: null,
    });
    const challengeAndVerify = vi.fn().mockResolvedValue({ data: {}, error: null });
    getSupabaseClient.mockReturnValue({
      auth: {
        mfa: { listFactors, enroll, challengeAndVerify, unenroll: vi.fn() },
      },
    } as never);

    render(<ProfileSecurityScreen />);

    expect(screen.getByText("Not enabled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));

    await waitFor(() => {
      expect(enroll).toHaveBeenCalledWith({
        factorType: "totp",
        friendlyName: "DubGrid Mobile Authenticator",
      });
    });

    expect(await screen.findByText("SECRET123")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("6-digit verification code"), {
      target: { value: "123456" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Verify & enable" }));

    await waitFor(() => {
      expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "factor-1", code: "123456" });
      expect(updateProfileMfaStatus).toHaveBeenCalledWith("token-123", { enabled: true });
    });
  });

  it("disables two-factor authentication after confirming", async () => {
    const unenroll = vi.fn().mockResolvedValue({ error: null });
    const listFactors = vi.fn().mockResolvedValue({
      data: {
        all: [{ id: "factor-1", factor_type: "totp", status: "verified" }],
        totp: [{ id: "factor-1", factor_type: "totp", status: "verified" }],
      },
      error: null,
    });
    getSupabaseClient.mockReturnValue({
      auth: {
        mfa: { listFactors, unenroll, enroll: vi.fn(), challengeAndVerify: vi.fn() },
      },
    } as never);
    useQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const key = queryKey.join(":");
      if (key.includes("sessions")) {
        return {
          data: { active: [], stale: [] },
          error: null,
          isLoading: false,
          refetch: vi.fn(),
        };
      }

      return {
        data: {
          user: { email: "mina@dubgrid.com", mfaEnabled: true },
          pendingAccountDeletionRequest: false,
        },
        error: null,
        isLoading: false,
        refetch: vi.fn(),
      };
    });

    render(<ProfileSecurityScreen />);

    expect(screen.getByText("Enabled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));

    expect(screen.getByText("Disable two-factor authentication?")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Disable" }));
    });

    await waitFor(() => {
      expect(unenroll).toHaveBeenCalledWith({ factorId: "factor-1" });
      expect(updateProfileMfaStatus).toHaveBeenCalledWith("token-123", { enabled: false });
    });
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
});
