import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule, createScreenModule } from "../../../test/native";
import {
  navigatedActions,
  pressBack,
  resetNavigationShim,
} from "../../../test/shims/react-navigation-native";

const useQuery = vi.fn();
const useAccessToken = vi.fn();
const getSupabaseClient = vi.fn();
const handleExpiredMobileSession = vi.fn();
const disablePushForCurrentDevice = vi.fn();
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
    useQuery,
  };
});

vi.mock("../../auth/hooks/useAccessToken", () => ({
  useAccessToken,
}));

vi.mock("../../../shared/lib/api", () => ({
  getProfile: vi.fn(),
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
  disablePushForCurrentDevice,
  handleExpiredMobileSession,
}));

vi.mock("../../../shared/providers/ToastProvider", () => ({
  useToast: () => ({
    pushToast,
  }),
}));

let ProfilePasswordScreen: (typeof import("./ProfilePasswordScreen"))["default"];

beforeAll(async () => {
  ProfilePasswordScreen = (await import("./ProfilePasswordScreen")).default;
});

function fillValidPassword() {
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "old-password" },
  });
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "New-password-123" },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: "New-password-123" },
  });
}

describe("ProfilePasswordScreen", () => {
  beforeEach(() => {
    resetNavigationShim();
    useQuery.mockReset();
    useAccessToken.mockReset();
    getSupabaseClient.mockReset();
    handleExpiredMobileSession.mockReset();
    disablePushForCurrentDevice.mockReset();
    disablePushForCurrentDevice.mockResolvedValue(undefined);
    pushToast.mockReset();

    useAccessToken.mockReturnValue("token-123");
    useQuery.mockReturnValue({
      data: {
        user: { email: "mina@dubgrid.com", mfaEnabled: false },
        pendingAccountDeletionRequest: false,
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
  });

  it("changes the password and signs out every session", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    getSupabaseClient.mockReturnValue({
      auth: { signInWithPassword, updateUser, signOut },
    } as never);
    handleExpiredMobileSession.mockResolvedValue(undefined);

    render(<ProfilePasswordScreen />);

    // The form is the screen — no "Change password" button to open it first.
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();

    fillValidPassword();
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByText("Update password?")).toBeInTheDocument();
    expect(
      screen.getByText("You'll be signed out of every device after the password is updated."),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("alert")).getByRole("button", { name: "Update and sign out" }),
      );
    });

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "mina@dubgrid.com",
        password: "old-password",
      });
      expect(updateUser).toHaveBeenCalledWith({ password: "New-password-123" });
      // Pushes off before the token dies, not after.
      expect(disablePushForCurrentDevice).toHaveBeenCalled();
      expect(signOut).toHaveBeenCalledWith({ scope: "global" });
      expect(handleExpiredMobileSession).toHaveBeenCalledWith({ skipSignOut: true });
    });
  });

  it("masks each field until its own toggle is pressed, and shows the strength rules", () => {
    getSupabaseClient.mockReturnValue({ auth: {} } as never);

    render(<ProfilePasswordScreen />);

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

    expect(screen.getByText("At least 10 characters")).toBeInTheDocument();
    expect(screen.getByText("Uppercase letter")).toBeInTheDocument();
    expect(screen.getByText("Number")).toBeInTheDocument();
    expect(screen.getByText("Symbol")).toBeInTheDocument();
    expect(screen.queryByText("Too short")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "New-password-123" },
    });
    expect(screen.getByText("Strong")).toBeInTheDocument();
  });

  it("surfaces a wrong current password inline rather than proceeding", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    const updateUser = vi.fn();
    getSupabaseClient.mockReturnValue({
      auth: { signInWithPassword, updateUser, signOut: vi.fn() },
    } as never);

    render(<ProfilePasswordScreen />);

    fillValidPassword();
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("alert")).getByRole("button", { name: "Update and sign out" }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Could not change password")).toBeInTheDocument();
    });
    expect(updateUser).not.toHaveBeenCalled();
    expect(handleExpiredMobileSession).not.toHaveBeenCalled();
  });

  it("leaves an untouched screen without asking", () => {
    render(<ProfilePasswordScreen />);

    act(() => {
      expect(pressBack()).toBe(false);
    });
    expect(navigatedActions).toEqual([{ type: "GO_BACK" }]);
  });

  it("asks before a back press throws away a part-entered password", () => {
    render(<ProfilePasswordScreen />);

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "old-password" },
    });

    act(() => {
      expect(pressBack()).toBe(true);
    });
    expect(navigatedActions).toHaveLength(0);
    expect(screen.getByText("Discard this password change?")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Discard" }));

    expect(navigatedActions).toEqual([{ type: "GO_BACK" }]);
  });

  it("keeps what was typed when the back press is called off", () => {
    render(<ProfilePasswordScreen />);

    fireEvent.change(screen.getByLabelText("Current password"), {
      target: { value: "old-password" },
    });
    act(() => {
      pressBack();
    });
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Keep Editing" }),
    );

    expect(navigatedActions).toHaveLength(0);
    expect(screen.getByLabelText("Current password")).toHaveValue("old-password");
  });
});
