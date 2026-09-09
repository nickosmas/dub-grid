import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./page";

const getBrowserAuthSession = vi.fn();
const exchangeBrowserCodeForSession = vi.fn();
const signOutFromBrowser = vi.fn();
const subscribeToBrowserAuthChanges = vi.fn();
const updateBrowserUserPassword = vi.fn();
const toastError = vi.fn();

vi.mock("@/features/account/client", () => ({
  exchangeBrowserCodeForSession: (...args: unknown[]) => exchangeBrowserCodeForSession(...args),
  getBrowserAuthSession: () => getBrowserAuthSession(),
  signOutFromBrowser: (...args: unknown[]) => signOutFromBrowser(...args),
  subscribeToBrowserAuthChanges: (...args: unknown[]) => subscribeToBrowserAuthChanges(...args),
  updateBrowserUserPassword: (...args: unknown[]) => updateBrowserUserPassword(...args),
}));

vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("sonner", () => ({ toast: { error: (...args: unknown[]) => toastError(...args) } }));

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/reset-password");
    getBrowserAuthSession.mockResolvedValue({ access_token: "recovery-session" });
    exchangeBrowserCodeForSession.mockResolvedValue({ error: null });
    subscribeToBrowserAuthChanges.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    updateBrowserUserPassword.mockResolvedValue(undefined);
    signOutFromBrowser.mockResolvedValue(undefined);
  });

  it("updates the password then signs out the recovery session before showing success", async () => {
    render(<ResetPasswordPage />);

    expect(await screen.findByRole("heading", { name: "Set new password" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "Str0ng!Passphrase" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reset Password" }));
    });

    expect(updateBrowserUserPassword).toHaveBeenCalledWith("Str0ng!Passphrase");
    expect(signOutFromBrowser).toHaveBeenCalledWith("local");
    expect(await screen.findByRole("heading", { name: "Password updated" })).toBeInTheDocument();
  });

  it("shows the recovery state without trying to restore a session for an invalid link", async () => {
    window.history.replaceState({}, "", "/reset-password?error=invalid_link");

    render(<ResetPasswordPage />);

    expect(
      await screen.findByRole("heading", { name: "Invalid or expired link" }),
    ).toBeInTheDocument();
    expect(getBrowserAuthSession).not.toHaveBeenCalled();
  });

  it("keeps a reset code available for a manual retry after a transport failure", async () => {
    window.history.replaceState({}, "", "/reset-password?code=one-time-code");
    exchangeBrowserCodeForSession
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ error: null });

    render(<ResetPasswordPage />);

    expect(
      await screen.findByRole("heading", { name: "Check your connection" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Set new password" })).toBeInTheDocument();
    expect(exchangeBrowserCodeForSession).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe("");
  });

  it("settles a timed-out password update, preserves both fields, and prevents double activation", async () => {
    let rejectUpdate: ((error: unknown) => void) | undefined;
    updateBrowserUserPassword.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpdate = reject;
        }),
    );
    render(<ResetPasswordPage />);

    expect(await screen.findByRole("heading", { name: "Set new password" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "Str0ng!Passphrase" },
    });
    const button = screen.getByRole("button", { name: "Reset Password" });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(updateBrowserUserPassword).toHaveBeenCalledTimes(1);
    rejectUpdate?.(Object.assign(new Error("late"), { name: "RequestTimeoutError" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "That took too long. Check your connection and try again.",
      );
    });
    expect(screen.getByLabelText("New password")).toHaveValue("Str0ng!Passphrase");
    expect(screen.getByLabelText("Confirm password")).toHaveValue("Str0ng!Passphrase");
    expect(button).toBeEnabled();
  });
});
