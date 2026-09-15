import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useQuery = vi.fn();
const useAccessToken = vi.fn();
const getSupabaseClient = vi.fn();
const updateProfileMfaStatus = vi.fn();
const pushToast = vi.fn();
const enrollMobileMfa = vi.fn();
const removeMobileMfa = vi.fn();
const requireMobileCredentialAssurance = vi.fn();
const stepUpRun = vi.fn();
const setQueryData = vi.fn();

vi.mock("../../../shared/lib/mfa-lifecycle", () => ({
  withMfaDeadline: <T,>(request: Promise<T>) => request,
  MfaRequestTimeoutError: class extends Error {},
  enrollMobileMfa: (...args: unknown[]) => enrollMobileMfa(...args),
  removeMobileMfa: (...args: unknown[]) => removeMobileMfa(...args),
}));

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

vi.mock("../../../shared/components/Screen", async () => createScreenModule(await import("react")));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();

  return {
    ...actual,
    useQuery,
    useQueryClient: () => ({ setQueryData }),
  };
});

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../../shared/lib/api", () => ({
  getProfile: vi.fn(),
  requireMobileCredentialAssurance: (...args: unknown[]) =>
    requireMobileCredentialAssurance(...args),
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

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

vi.mock("../hooks/useMobileStepUpAction", () => ({
  useMobileStepUpAction: () => ({ run: stepUpRun, active: false, sheet: null }),
}));

let ProfileTwoFactorScreen: (typeof import("./ProfileTwoFactorScreen"))["default"];

function mockProfile(mfaEnabled: boolean) {
  useQuery.mockReturnValue({
    data: {
      user: { email: "mina@dubgrid.com", mfaEnabled },
      pendingAccountDeletionRequest: false,
    },
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  });
}

beforeAll(async () => {
  ProfileTwoFactorScreen = (await import("./ProfileTwoFactorScreen")).default;
});

describe("ProfileTwoFactorScreen", () => {
  beforeEach(() => {
    useQuery.mockReset();
    useAccessToken.mockReset();
    getSupabaseClient.mockReset();
    updateProfileMfaStatus.mockReset();
    updateProfileMfaStatus.mockResolvedValue({ user: { mfaEnabled: true } });
    pushToast.mockReset();
    enrollMobileMfa
      .mockReset()
      .mockResolvedValue({ id: "factor-1", totp: { secret: "SECRET123" } });
    removeMobileMfa.mockReset().mockResolvedValue({ success: true });
    requireMobileCredentialAssurance.mockReset().mockResolvedValue({ success: true });
    stepUpRun.mockReset().mockImplementation(async (action) => {
      await action("fresh-token");
      return true;
    });
    setQueryData.mockReset();

    useAccessToken.mockReturnValue("token-123");
    mockProfile(false);
  });

  it("enrolls with a manually-entered secret", async () => {
    const listFactors = vi.fn().mockResolvedValue({
      data: { all: [], totp: [] },
      error: null,
    });
    const enroll = vi.fn().mockResolvedValue({
      data: { id: "factor-1", totp: { secret: "SECRET123" } },
      error: null,
    });
    const challengeAndVerify = vi.fn().mockResolvedValue({
      data: { access_token: "aal2-token" },
      error: null,
    });
    getSupabaseClient.mockReturnValue({
      auth: { mfa: { listFactors, enroll, challengeAndVerify, unenroll: vi.fn() } },
    } as never);

    render(<ProfileTwoFactorScreen />);

    expect(screen.getByText("Not enabled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));

    await waitFor(() => {
      expect(stepUpRun).toHaveBeenCalledTimes(1);
      expect(requireMobileCredentialAssurance).toHaveBeenCalledWith("fresh-token");
      expect(enrollMobileMfa).toHaveBeenCalledWith("fresh-token");
    });

    expect(await screen.findByText("SECRET123")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("6-digit verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify & enable" }));

    await waitFor(() => {
      expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "factor-1", code: "123456" });
      expect(updateProfileMfaStatus).toHaveBeenCalledWith("aal2-token");
    });
  });

  it("unenrolls the half-finished factor when the screen is left mid-enrollment", async () => {
    const unenroll = vi.fn().mockResolvedValue({ error: null });
    getSupabaseClient.mockReturnValue({
      auth: {
        mfa: {
          listFactors: vi.fn().mockResolvedValue({ data: { all: [], totp: [] }, error: null }),
          enroll: vi
            .fn()
            .mockResolvedValue({ data: { id: "factor-1", totp: { secret: "S" } }, error: null }),
          challengeAndVerify: vi.fn(),
          unenroll,
        },
      },
    } as never);

    const { unmount } = render(<ProfileTwoFactorScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));
    expect(await screen.findByLabelText("6-digit verification code")).toBeInTheDocument();

    // Back is the way out of a pushed screen, so the cleanup — not a Cancel
    // button — is what has to stop an unverified factor being left behind.
    await act(async () => {
      unmount();
    });

    expect(removeMobileMfa).toHaveBeenCalledWith("fresh-token", "factor-1", true);
    expect(unenroll).not.toHaveBeenCalled();
  });

  it("does not remove a verified factor when persisting its status fails", async () => {
    const unenroll = vi.fn().mockResolvedValue({ error: null });
    updateProfileMfaStatus.mockRejectedValue(new Error("Status write failed"));
    getSupabaseClient.mockReturnValue({
      auth: {
        mfa: {
          listFactors: vi.fn().mockResolvedValue({ data: { all: [], totp: [] }, error: null }),
          enroll: vi
            .fn()
            .mockResolvedValue({ data: { id: "factor-1", totp: { secret: "S" } }, error: null }),
          challengeAndVerify: vi.fn().mockResolvedValue({
            data: { access_token: "aal2-token" },
            error: null,
          }),
          unenroll,
        },
      },
    } as never);

    const { unmount } = render(<ProfileTwoFactorScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));
    await screen.findByLabelText("6-digit verification code");
    fireEvent.change(screen.getByLabelText("6-digit verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify & enable" }));

    await waitFor(() => {
      expect(updateProfileMfaStatus).toHaveBeenCalledWith("aal2-token");
    });
    await act(async () => {
      unmount();
    });

    expect(unenroll).not.toHaveBeenCalled();
    expect(removeMobileMfa).not.toHaveBeenCalled();
  });

  it("disables two-factor after confirming", async () => {
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
        mfa: {
          listFactors,
          unenroll,
          enroll: vi.fn(),
          challengeAndVerify: vi
            .fn()
            .mockResolvedValue({ data: { access_token: "aal2-token" }, error: null }),
        },
      },
    } as never);
    mockProfile(true);

    render(<ProfileTwoFactorScreen />);

    expect(screen.getByText("Enabled")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Disable 2FA" }));

    expect(screen.getByText("Disable two-factor authentication?")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Disable" }));
    });

    await waitFor(() => {
      expect(requireMobileCredentialAssurance).toHaveBeenCalledWith("fresh-token");
      expect(removeMobileMfa).toHaveBeenCalledWith("fresh-token", "factor-1");
      expect(updateProfileMfaStatus).toHaveBeenCalledWith("fresh-token");
    });
    expect(getSupabaseClient().auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("does not enroll when identity confirmation is cancelled", async () => {
    getSupabaseClient.mockReturnValue({
      auth: {
        mfa: {
          listFactors: vi.fn().mockResolvedValue({ data: { all: [], totp: [] }, error: null }),
        },
      },
    });
    stepUpRun.mockResolvedValue(false);
    render(<ProfileTwoFactorScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));
    await waitFor(() => expect(stepUpRun).toHaveBeenCalledTimes(1));
    expect(requireMobileCredentialAssurance).not.toHaveBeenCalled();
    expect(enrollMobileMfa).not.toHaveBeenCalled();
  });

  it("retries live status without repeating verification or removing a factor", async () => {
    const challengeAndVerify = vi
      .fn()
      .mockResolvedValue({ data: { access_token: "aal2-token" }, error: null });
    getSupabaseClient.mockReturnValue({
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: { access_token: "aal2-token" } }, error: null }),
        mfa: {
          listFactors: vi.fn().mockResolvedValue({ data: { all: [], totp: [] }, error: null }),
          challengeAndVerify,
        },
      },
    });
    updateProfileMfaStatus.mockRejectedValueOnce(new Error("Status unavailable"));
    render(<ProfileTwoFactorScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Enable 2FA" }));
    fireEvent.change(await screen.findByLabelText("6-digit verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify & enable" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await waitFor(() => expect(updateProfileMfaStatus).toHaveBeenCalledTimes(2));
    expect(challengeAndVerify).toHaveBeenCalledTimes(1);
    expect(removeMobileMfa).not.toHaveBeenCalled();
    expect(setQueryData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ user: { mfaEnabled: true } }),
    );
  });
});
