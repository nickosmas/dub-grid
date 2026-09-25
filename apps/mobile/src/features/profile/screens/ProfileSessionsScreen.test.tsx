import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";

const useQuery = vi.fn();
const useMutation = vi.fn();
const useAccessToken = vi.fn();
const handleExpiredMobileSession = vi.fn();
const disablePushForCurrentDevice = vi.fn();
const pushToast = vi.fn();
const stepUpRun = vi.fn();
const requireMobileCredentialAssurance = vi.fn();
const signOutMobileSessions = vi.fn();

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

vi.mock("../../../shared/lib/api", () => ({
  getProfileSessions: vi.fn(),
  requireMobileCredentialAssurance,
  revokeProfileSession: vi.fn(),
  signOutMobileSessions,
}));

vi.mock("../../../shared/lib/env", () => ({
  getMobileEnvConfig: () => ({
    apiBaseUrl: "https://app.dubgrid.com",
  }),
}));

vi.mock("../../../shared/lib/auth-reset", () => ({
  disablePushForCurrentDevice,
  handleExpiredMobileSession,
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

vi.mock("../hooks/useMobileStepUpAction", () => ({
  useMobileStepUpAction: () => ({ run: stepUpRun, active: false, sheet: null }),
}));

let ProfileSessionsScreen: (typeof import("./ProfileSessionsScreen"))["default"];

const currentSession = {
  id: "session-1",
  platform: "ios",
  appVersion: "1.4.0",
  deviceLabel: "Mina's iPhone",
  browserName: null,
  browserVersion: null,
  ipAddress: "203.0.113.7",
  locationCity: "Nairobi",
  locationCountry: "Kenya",
  lastActiveAt: "2026-08-17T09:00:00.000Z",
  createdAt: "2026-08-01T09:00:00.000Z",
  refreshTokenHash: "hash-current",
  isCurrent: true,
};

const otherSession = {
  ...currentSession,
  id: "session-2",
  platform: "android",
  appVersion: "1.3.9",
  deviceLabel: "Pixel 8",
  ipAddress: "198.51.100.4",
  refreshTokenHash: "hash-other",
  isCurrent: false,
};

const staleSession = {
  ...otherSession,
  id: "session-3",
  platform: "web",
  deviceLabel: "Old laptop",
  refreshTokenHash: "hash-stale",
};

function mockSessions(data: {
  active: (typeof currentSession)[];
  stale: (typeof currentSession)[];
}) {
  useQuery.mockReturnValue({
    data,
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  });
}

beforeAll(async () => {
  ProfileSessionsScreen = (await import("./ProfileSessionsScreen")).default;
});

describe("ProfileSessionsScreen", () => {
  beforeEach(() => {
    useQuery.mockReset();
    useMutation.mockReset();
    useAccessToken.mockReset();
    handleExpiredMobileSession.mockReset();
    disablePushForCurrentDevice.mockReset();
    disablePushForCurrentDevice.mockResolvedValue(undefined);
    pushToast.mockReset();
    requireMobileCredentialAssurance.mockReset().mockResolvedValue({ success: true });
    signOutMobileSessions.mockReset().mockResolvedValue({ success: true });
    stepUpRun.mockReset().mockImplementation(async (action) => {
      await action("fresh-token");
      return true;
    });

    useAccessToken.mockReturnValue("token-123");
    useMutation.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    });
    mockSessions({ active: [currentSession, otherSession], stale: [] });
  });

  it("shows device, client, connection, and last-active details in each row", () => {
    render(<ProfileSessionsScreen />);

    expect(screen.getByText("Mina's iPhone")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getByText("Mobile app 1.3.9")).toBeInTheDocument();
    expect(screen.getByText("198.51.100.4 (Nairobi, Kenya)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pixel 8" }));

    expect(screen.getAllByText("198.51.100.4 (Nairobi, Kenya)")).toHaveLength(2);
    expect(screen.getAllByText("Mobile app 1.3.9")).toHaveLength(2);
    expect(screen.getByText("First signed in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out this device" })).toBeInTheDocument();
  });

  it("offers no per-device sign-out for the device you are on", () => {
    render(<ProfileSessionsScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Mina's iPhone" }));

    expect(screen.getAllByText("This device")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Sign out this device" })).not.toBeInTheDocument();
  });

  it("revokes one device from its detail sheet, after confirming", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    useMutation.mockReturnValue({ isPending: false, mutate: vi.fn(), mutateAsync });

    render(<ProfileSessionsScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Pixel 8" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out this device" }));

    // The confirmation names the same device the row did.
    expect(screen.getByText("Sign out this device?")).toBeInTheDocument();
    expect(screen.getByText("Pixel 8 will lose access immediately.")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Sign out" }));
    });

    expect(stepUpRun).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      actionAccessToken: "fresh-token",
      refreshTokenHash: "hash-other",
    });
  });

  it("keeps the selected device and confirmation intact when identity confirmation is cancelled", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    useMutation.mockReturnValue({ isPending: false, mutate: vi.fn(), mutateAsync });
    stepUpRun.mockResolvedValue(false);

    render(<ProfileSessionsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Pixel 8" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out this device" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Sign out" }));
    });

    expect(screen.getByText("Sign out this device?")).toBeInTheDocument();
    expect(screen.getByText("Pixel 8 will lose access immediately.")).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("puts the two bulk sign-outs in a sheet that explains the difference", async () => {
    handleExpiredMobileSession.mockResolvedValue(undefined);

    render(<ProfileSessionsScreen />);

    // Neither destructive action is on the page until it is asked for.
    expect(screen.queryByRole("button", { name: "Sign out everywhere" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign out devices" }));

    expect(
      screen.getByText("Every other device is signed out. You stay signed in here."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));

    expect(screen.getByText("Sign out all devices?")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Sign out" }));
    });

    await waitFor(() => {
      // Pushes off first, while this device's token is still valid.
      expect(disablePushForCurrentDevice).toHaveBeenCalled();
      expect(signOutMobileSessions).toHaveBeenCalledWith("fresh-token", { scope: "global" });
      expect(handleExpiredMobileSession).toHaveBeenCalledWith();
    });
    expect(requireMobileCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(stepUpRun).toHaveBeenCalledTimes(1);
  });

  it("signs out other devices without tearing down this one", async () => {
    render(<ProfileSessionsScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out devices" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out other devices" }));

    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Sign out" }));
    });

    await waitFor(() => {
      expect(signOutMobileSessions).toHaveBeenCalledWith("fresh-token", { scope: "others" });
    });
    expect(disablePushForCurrentDevice).not.toHaveBeenCalled();
    expect(handleExpiredMobileSession).not.toHaveBeenCalled();
  });

  it("changes nothing when a bulk sign-out's identity confirmation is cancelled", async () => {
    stepUpRun.mockResolvedValue(false);

    render(<ProfileSessionsScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out devices" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Sign out" }));
    });

    await waitFor(() => expect(stepUpRun).toHaveBeenCalled());
    expect(signOutMobileSessions).not.toHaveBeenCalled();
    expect(disablePushForCurrentDevice).not.toHaveBeenCalled();
    expect(handleExpiredMobileSession).not.toHaveBeenCalled();
  });

  it("disables signing out other devices when this is the only active session", () => {
    mockSessions({ active: [currentSession], stale: [] });

    render(<ProfileSessionsScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out devices" }));

    expect(screen.getByRole("button", { name: "Sign out other devices" })).toBeDisabled();
    expect(screen.getByText("No other active devices are signed in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out everywhere" })).not.toBeDisabled();
  });

  it("collapses stale sessions behind a disclosure instead of listing them", () => {
    mockSessions({ active: [currentSession], stale: [staleSession] });

    render(<ProfileSessionsScreen />);

    expect(screen.getByText("Inactive devices (1)")).toBeInTheDocument();
  });

  it("omits the disclosure entirely when nothing is stale", () => {
    render(<ProfileSessionsScreen />);

    expect(screen.queryByText(/Inactive devices/)).not.toBeInTheDocument();
  });
});
