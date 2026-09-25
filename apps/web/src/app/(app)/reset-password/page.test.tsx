import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./page";

const exchangeBrowserCodeForSession = vi.fn();
const completeBrowserPasswordRecovery = vi.fn();
const subscribeToBrowserAuthChanges = vi.fn();
const updateBrowserUserPassword = vi.fn();
const toastError = vi.fn();

vi.mock("@/features/account/client", () => ({
  exchangeBrowserCodeForSession: (...args: unknown[]) => exchangeBrowserCodeForSession(...args),
  completeBrowserPasswordRecovery: (...args: unknown[]) => completeBrowserPasswordRecovery(...args),
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
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/reset-password");
    window.sessionStorage.setItem("dubgrid:recovery-verified", "1");
    exchangeBrowserCodeForSession.mockResolvedValue({ error: null });
    subscribeToBrowserAuthChanges.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    updateBrowserUserPassword.mockResolvedValue(undefined);
    completeBrowserPasswordRecovery.mockResolvedValue(undefined);
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
    expect(completeBrowserPasswordRecovery).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { name: "Password updated" })).toBeInTheDocument();
  });

  async function submitNewPassword() {
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
  }

  // The recovery session is already cleared when revocation fails, so the old
  // "couldn't update your password" retry could only fail again, and was false.
  it("reports a changed password when only the revocation fails", async () => {
    completeBrowserPasswordRecovery.mockRejectedValue(
      new Error("Recovery session revocation failed"),
    );

    await submitNewPassword();

    expect(await screen.findByRole("heading", { name: "Password updated" })).toBeInTheDocument();
    expect(screen.getByText(/review your active sessions/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Set new password" })).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps the form for a definite rejection, with nothing revoked", async () => {
    updateBrowserUserPassword.mockRejectedValue({
      code: "same_password",
      status: 422,
      message: "New password should be different from the old password.",
    });

    await submitNewPassword();

    expect(completeBrowserPasswordRecovery).not.toHaveBeenCalled();
    expect(
      screen.getByText("New password must be different from your current password."),
    ).toBeInTheDocument();
  });

  it("shows the recovery state without trying to restore a session for an invalid link", async () => {
    window.history.replaceState({}, "", "/reset-password?error=invalid_link");

    render(<ResetPasswordPage />);

    expect(
      await screen.findByRole("heading", { name: "Invalid or expired link" }),
    ).toBeInTheDocument();
  });

  it("does not authorize an ordinary signed-in session", async () => {
    vi.useFakeTimers();
    window.sessionStorage.clear();

    render(<ResetPasswordPage />);

    expect(screen.queryByRole("heading", { name: "Set new password" })).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole("heading", { name: "Check your connection" })).toBeInTheDocument();
    expect(updateBrowserUserPassword).not.toHaveBeenCalled();
    vi.useRealTimers();
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

  // A late provider success used to leave the form up for a retry of a change
  // that had landed, with no revocation behind it.
  it("finishes a timed-out update once, without re-offering the form", async () => {
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

    expect(
      await screen.findByRole("heading", { name: "Check your new password" }),
    ).toBeInTheDocument();
    expect(completeBrowserPasswordRecovery).toHaveBeenCalledOnce();
    expect(updateBrowserUserPassword).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Set new password" })).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });
});
