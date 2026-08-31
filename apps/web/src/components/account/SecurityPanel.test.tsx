import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecurityPanel } from "@/components/account/SecurityPanel";

const mockSignOut = vi.fn();
const mockSignOutOthers = vi.fn();

vi.mock("@dubgrid/domain", () => ({
  getPasswordMismatchError: () => null,
  isPasswordAcceptable: () => false,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/settings/shared", () => ({
  SectionCard: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

vi.mock("@/components/Form", () => ({
  Form: ({ children }: { children: React.ReactNode }) => <form>{children}</form>,
}));

vi.mock("@/components/auth/PasswordInput", () => ({
  PasswordInput: () => null,
}));

vi.mock("@/components/auth/PasswordStrength", () => ({
  PasswordStrength: () => null,
}));

vi.mock("@/components/profile/MFASetup", () => ({
  MFASetup: () => null,
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
  useLogout: () => ({ signOut: mockSignOut, signOutOthers: mockSignOutOthers }),
}));

vi.mock("@/features/account/client", () => ({
  signInBrowserWithPassword: vi.fn(),
  updateBrowserUserPassword: vi.fn(),
}));

function renderSecurityPanel() {
  return render(
    <SecurityPanel
      user={{ email: "alex@example.com" } as User}
      profile={null}
      setProfile={vi.fn()}
    />,
  );
}

describe("SecurityPanel session actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignOutOthers.mockResolvedValue(undefined);
  });

  it("confirms before signing out other devices", () => {
    renderSecurityPanel();

    fireEvent.click(screen.getByRole("button", { name: "Sign out other devices" }));

    expect(mockSignOutOthers).not.toHaveBeenCalled();
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

    await waitFor(() => expect(mockSignOutOthers).toHaveBeenCalledOnce());
  });

  it("confirms before signing out everywhere", () => {
    renderSecurityPanel();

    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Sign out everywhere?" })).toBeInTheDocument();
  });

  it("signs out everywhere only after confirmation", () => {
    renderSecurityPanel();
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));

    const dialog = screen.getByRole("dialog", { name: "Sign out everywhere?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out everywhere" }));

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
