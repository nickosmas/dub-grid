import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./page";

const exchangeBrowserCodeForSession = vi.fn();
const completeBrowserPasswordRecovery = vi.fn();
const subscribeToBrowserAuthChanges = vi.fn();
const updateBrowserUserPassword = vi.fn();
const getBrowserAssuranceLevel = vi.fn();
const signOutFromBrowser = vi.fn();
const toastError = vi.fn();

vi.mock("@/features/account/client", () => ({
  exchangeBrowserCodeForSession: (...args: unknown[]) => exchangeBrowserCodeForSession(...args),
  completeBrowserPasswordRecovery: (...args: unknown[]) => completeBrowserPasswordRecovery(...args),
  subscribeToBrowserAuthChanges: (...args: unknown[]) => subscribeToBrowserAuthChanges(...args),
  updateBrowserUserPassword: (...args: unknown[]) => updateBrowserUserPassword(...args),
  getBrowserAssuranceLevel: (...args: unknown[]) => getBrowserAssuranceLevel(...args),
  signOutFromBrowser: (...args: unknown[]) => signOutFromBrowser(...args),
}));

vi.mock("@/components/profile/MFAVerify", () => ({
  MFAVerify: ({ onVerified, onCancel }: { onVerified: () => void; onCancel: () => void }) => (
    <section>
      <h1>Two-factor authentication</h1>
      <button onClick={onVerified}>Verify code</button>
      <button onClick={onCancel}>Back to login</button>
    </section>
  ),
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
    getBrowserAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });
    signOutFromBrowser.mockResolvedValue(undefined);
  });

  // Supabase refuses the new password from a two-factor account's recovery
  // session until the code promotes it to aal2 (41b2).
  describe("a two-factor account", () => {
    beforeEach(() => {
      getBrowserAssuranceLevel.mockResolvedValue({
        data: { currentLevel: "aal1", nextLevel: "aal2" },
        error: null,
      });
    });

    it("asks for the authenticator code before the new password", async () => {
      render(<ResetPasswordPage />);

      expect(
        await screen.findByRole("heading", { name: "Two-factor authentication" }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
      });
      expect(await screen.findByRole("heading", { name: "Set new password" })).toBeInTheDocument();
    });

    it("signs the recovery session out and returns to login when the person backs out", async () => {
      const original = window.location;
      const assign = vi.fn();
      Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...original, assign, pathname: "/reset-password", search: "" },
      });
      try {
        render(<ResetPasswordPage />);

        await screen.findByRole("heading", { name: "Two-factor authentication" });
        await act(async () => {
          fireEvent.click(screen.getByRole("button", { name: "Back to login" }));
        });

        expect(signOutFromBrowser).toHaveBeenCalledWith("local");
        expect(assign).toHaveBeenCalledWith("/login");
      } finally {
        Object.defineProperty(window, "location", { configurable: true, value: original });
      }
    });
  });

  // The link's one-time code or capability is spent once the session exists,
  // so the retry must not go back through it (F-01).
  it("recovers from a failed assurance check with Try again", async () => {
    getBrowserAssuranceLevel.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<ResetPasswordPage />);

    await screen.findByRole("heading", { name: "Check your connection" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(await screen.findByRole("heading", { name: "Set new password" })).toBeInTheDocument();
  });

  it("finishes a two-factor recovery once the code is verified", async () => {
    getBrowserAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });
    render(<ResetPasswordPage />);
    await screen.findByRole("heading", { name: "Two-factor authentication" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    });

    await screen.findByRole("heading", { name: "Set new password" });
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

  it("offers a retry when the session's assurance cannot be read", async () => {
    getBrowserAssuranceLevel.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ResetPasswordPage />);

    expect(
      await screen.findByRole("heading", { name: "Check your connection" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });

  it("goes to the code step when the update is refused for its assurance level", async () => {
    updateBrowserUserPassword.mockRejectedValue(
      Object.assign(new Error("AAL2 session is required"), {
        status: 401,
        code: "insufficient_aal",
      }),
    );
    await submitNewPassword();

    expect(
      await screen.findByRole("heading", { name: "Two-factor authentication" }),
    ).toBeInTheDocument();
    expect(completeBrowserPasswordRecovery).not.toHaveBeenCalled();
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
