import React from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecurityPanel } from "@/components/account/SecurityPanel";
import { queryKeys } from "@/lib/query-keys";
import MfaNagBanner from "@/components/MfaNagBanner";

const mockSignOut = vi.fn();
const signOutAccountSessions = vi.fn();
const requireCredentialAssurance = vi.fn();
const updateBrowserUserPassword = vi.fn();
let reconciledMfaEnabled = false;

vi.mock("next/navigation", () => ({
  usePathname: () => "/profile",
  useSearchParams: () => new URLSearchParams("section=security"),
}));
const stepUpMocks = vi.hoisted(() => ({ context: vi.fn(), confirm: vi.fn() }));
vi.mock("@/features/account/client/step-up", async (load) => ({
  ...(await load<typeof import("@/features/account/client/step-up")>()),
  readStepUpContext: stepUpMocks.context,
  confirmBrowserStepUp: stepUpMocks.confirm,
}));
vi.mock("@/features/account/client/auth", () => ({}));

vi.mock("@dubgrid/domain", () => ({
  getPasswordMismatchError: (password: string, confirmation: string) =>
    confirmation.length > 0 && password !== confirmation ? "Passwords do not match." : null,
  isPasswordAcceptable: (password: string) => password.length >= 10,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/settings/shared", () => ({
  SectionCard: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

vi.mock("@/components/Form", () => ({
  Form: ({ children, ...props }: React.FormHTMLAttributes<HTMLFormElement>) => (
    <form {...props}>{children}</form>
  ),
}));

vi.mock("@/components/auth/PasswordInput", () => ({
  PasswordInput: ({
    placeholder,
    value,
    onChange,
  }: {
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <input
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock("@/components/auth/PasswordStrength", () => ({
  PasswordStrength: () => null,
}));

vi.mock("@/components/profile/MFASetup", () => ({
  MFASetup: ({ onStatusChange }: { onStatusChange: (enabled: boolean) => void }) => (
    <>
      <button onClick={() => onStatusChange(true)}>Confirm MFA enabled</button>
      <button onClick={() => onStatusChange(false)}>Confirm MFA disabled</button>
    </>
  ),
}));

vi.mock("@/components/profile/SessionList", () => ({
  SessionList: ({
    onOtherSessionCountChange,
  }: {
    onOtherSessionCountChange?: (count: number) => void;
  }) => (
    <button type="button" onClick={() => onOtherSessionCountChange?.(0)}>
      Report no other sessions
    </button>
  ),
}));

vi.mock("@/components/ui/editor-action-labels", () => ({
  getEditorDismissLabel: () => "Cancel",
}));

vi.mock("@/lib/error-handling", () => ({
  extractErrorMessage: () => "",
}));

vi.mock("@/hooks", () => ({
  useLogout: () => ({ signOut: mockSignOut }),
  usePermissions: () => {
    const { data } = useQuery({
      queryKey: queryKeys.account.permissions("user-1", "org-1"),
      queryFn: async () => ({ mfaNagRequired: !reconciledMfaEnabled }),
      staleTime: Infinity,
    });
    return { ...data, isSuperAdmin: true, orgId: "org-1" };
  },
}));

vi.mock("@/features/account/client", () => ({
  requireCredentialAssurance: (...args: unknown[]) => requireCredentialAssurance(...args),
  updateBrowserUserPassword: (...args: unknown[]) => updateBrowserUserPassword(...args),
  signOutAccountSessions: (...args: unknown[]) => signOutAccountSessions(...args),
}));

function renderSecurityPanel(queryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>
      <SecurityPanel
        user={{ id: "user-1", email: "alex@example.com" } as User}
        profile={null}
        setProfile={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("SecurityPanel session actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    reconciledMfaEnabled = false;
    signOutAccountSessions.mockReset().mockResolvedValue({ success: true });
    requireCredentialAssurance.mockReset().mockResolvedValue({ success: true });
    updateBrowserUserPassword.mockReset().mockResolvedValue(undefined);
    stepUpMocks.context.mockResolvedValue({ key: "account-org", accessToken: "old-token" });
    stepUpMocks.confirm.mockReset().mockResolvedValue("fresh-token");
  });

  it("removes the mounted banner after successful MFA reconciliation without reloading", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MfaNagBanner />
        <SecurityPanel user={{ id: "user-1" } as User} profile={null} setProfile={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("status")).toHaveTextContent("two-factor");

    reconciledMfaEnabled = true;
    fireEvent.click(screen.getByRole("button", { name: "Confirm MFA enabled" }));

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(sessionStorage.getItem("dg_mfa_nag_dismissed")).toBeNull();
  });

  it("changes a password once after server-selected TOTP step-up", async () => {
    requireCredentialAssurance.mockRejectedValueOnce(
      Object.assign(new Error("Confirm"), {
        status: 403,
        code: "STEP_UP_REQUIRED",
        method: "totp",
      }),
    );
    renderSecurityPanel();
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    fireEvent.change(screen.getByLabelText("Enter new password"), {
      target: { value: "StrongPass1!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "StrongPass1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Update password?" })).getByRole("button", {
        name: "Update and sign out",
      }),
    );

    const challenge = await screen.findByRole("dialog", { name: "Confirm your identity" });
    expect(updateBrowserUserPassword).not.toHaveBeenCalled();
    fireEvent.change(within(challenge).getByLabelText("Authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(within(challenge).getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(updateBrowserUserPassword).toHaveBeenCalledOnce());
    expect(requireCredentialAssurance).toHaveBeenNthCalledWith(1, "old-token");
    expect(requireCredentialAssurance).toHaveBeenNthCalledWith(2, "fresh-token");
    expect(updateBrowserUserPassword).toHaveBeenCalledWith("StrongPass1!");
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("keeps the new password draft and original confirmation after cancelling step-up", async () => {
    requireCredentialAssurance.mockRejectedValueOnce(
      Object.assign(new Error("Confirm"), {
        status: 403,
        code: "STEP_UP_REQUIRED",
        method: "totp",
      }),
    );
    renderSecurityPanel();
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    fireEvent.change(screen.getByLabelText("Enter new password"), {
      target: { value: "StrongPass1!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "StrongPass1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Update password?" })).getByRole("button", {
        name: "Update and sign out",
      }),
    );

    const challenge = await screen.findByRole("dialog", { name: "Confirm your identity" });
    fireEvent.click(within(challenge).getByRole("button", { name: "Cancel" }));

    await screen.findByRole("dialog", { name: "Update password?" });
    expect(screen.getByLabelText("Enter new password")).toHaveValue("StrongPass1!");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("StrongPass1!");
    expect(updateBrowserUserPassword).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it.each(["enabled", "disabled"])(
    "refreshes only this account's shared status after MFA is confirmed %s",
    async (status) => {
      const client = new QueryClient();
      const ownPermissions = queryKeys.account.permissions("user-1", "org-1");
      const otherOrg = queryKeys.account.permissions("user-1", "org-2");
      const otherUser = queryKeys.account.permissions("user-2", "org-1");
      for (const key of [ownPermissions, otherOrg, otherUser]) client.setQueryData(key, {});
      renderSecurityPanel(client);
      expect(client.getQueryState(ownPermissions)?.isInvalidated).toBe(false);

      fireEvent.click(screen.getByRole("button", { name: `Confirm MFA ${status}` }));

      await waitFor(() => expect(client.getQueryState(ownPermissions)?.isInvalidated).toBe(true));
      expect(client.getQueryState(otherOrg)?.isInvalidated).toBe(true);
      expect(client.getQueryState(otherUser)?.isInvalidated).toBe(false);
    },
  );

  it("confirms before signing out other devices", () => {
    renderSecurityPanel();

    fireEvent.click(screen.getByRole("button", { name: "Sign out other devices" }));

    expect(signOutAccountSessions).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Sign out other devices?" })).toBeInTheDocument();
  });

  it("disables the other-devices action when there are no other active sessions", () => {
    renderSecurityPanel();

    fireEvent.click(screen.getByRole("button", { name: "Report no other sessions" }));

    expect(screen.getByRole("button", { name: "Sign out other devices" })).toBeDisabled();
  });

  it("signs out other devices only after confirmation", async () => {
    renderSecurityPanel();
    fireEvent.click(screen.getByRole("button", { name: "Sign out other devices" }));

    const dialog = screen.getByRole("dialog", { name: "Sign out other devices?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out other devices" }));

    await waitFor(() =>
      expect(signOutAccountSessions).toHaveBeenCalledExactlyOnceWith("others", "old-token"),
    );
  });

  it("confirms before signing out everywhere", () => {
    renderSecurityPanel();

    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Sign out everywhere?" })).toBeInTheDocument();
  });

  it("signs out everywhere before starting local browser teardown", async () => {
    renderSecurityPanel();
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));

    const dialog = screen.getByRole("dialog", { name: "Sign out everywhere?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(signOutAccountSessions).toHaveBeenCalledExactlyOnceWith("global", "old-token");
  });

  it.each(["others", "global"] as const)(
    "reuses fresh proof for %s without stacking dialogs",
    async (scope) => {
      signOutAccountSessions.mockRejectedValueOnce(
        Object.assign(new Error("Confirm"), {
          status: 403,
          code: "STEP_UP_REQUIRED",
          method: "totp",
        }),
      );
      renderSecurityPanel();
      const name = scope === "others" ? "Sign out other devices" : "Sign out everywhere";
      fireEvent.click(screen.getByRole("button", { name }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name }));
      const challenge = await screen.findByRole("dialog", { name: "Confirm your identity" });
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(mockSignOut).not.toHaveBeenCalled();
      fireEvent.change(within(challenge).getByLabelText("Authenticator code"), {
        target: { value: "123456" },
      });
      fireEvent.click(within(challenge).getByRole("button", { name: "Continue" }));
      await waitFor(() =>
        expect(signOutAccountSessions).toHaveBeenLastCalledWith(scope, "fresh-token"),
      );
      expect(signOutAccountSessions).toHaveBeenCalledTimes(2);
      if (scope === "global")
        await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" }));
      else expect(mockSignOut).not.toHaveBeenCalled();
    },
  );

  it("restores the original confirmation when fresh proof is cancelled", async () => {
    signOutAccountSessions.mockRejectedValueOnce(
      Object.assign(new Error("Confirm"), {
        status: 403,
        code: "STEP_UP_REQUIRED",
        method: "totp",
      }),
    );
    renderSecurityPanel();
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Sign out everywhere" }),
    );
    const challenge = await screen.findByRole("dialog", { name: "Confirm your identity" });
    fireEvent.click(within(challenge).getByRole("button", { name: "Cancel" }));
    await screen.findByRole("dialog", { name: "Sign out everywhere?" });
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(signOutAccountSessions).toHaveBeenCalledOnce();
  });

  it("does not automatically retry or navigate after an ambiguous bulk failure", async () => {
    signOutAccountSessions.mockRejectedValueOnce(new TypeError("network failure"));
    renderSecurityPanel();
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Sign out everywhere" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Sign out everywhere" }),
      ).toBeEnabled(),
    );
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(signOutAccountSessions).toHaveBeenCalledOnce();
  });
});
