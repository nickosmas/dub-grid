import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./page";

const getBrowserAuthSession = vi.fn();
const signOutFromBrowser = vi.fn();
const subscribeToBrowserAuthChanges = vi.fn();
const updateBrowserUserPassword = vi.fn();

vi.mock("@/features/account/client", () => ({
  exchangeBrowserCodeForSession: vi.fn(),
  getBrowserAuthSession: () => getBrowserAuthSession(),
  signOutFromBrowser: (...args: unknown[]) => signOutFromBrowser(...args),
  subscribeToBrowserAuthChanges: (...args: unknown[]) => subscribeToBrowserAuthChanges(...args),
  updateBrowserUserPassword: (...args: unknown[]) => updateBrowserUserPassword(...args),
}));

vi.mock("@/components/RouteGuards", () => ({
  PublicRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/reset-password");
    getBrowserAuthSession.mockResolvedValue({ access_token: "recovery-session" });
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
});
