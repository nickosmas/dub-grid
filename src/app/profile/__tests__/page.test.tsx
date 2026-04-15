import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePageContent } from "@/app/profile/page";
import { supabase } from "@/lib/supabase";
import { getVerifiedBrowserUser } from "@/lib/browser-auth";

const mockUsePermissions = vi.fn();
const mockAuthUpdateUser = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("@/hooks", () => ({
  usePermissions: () => mockUsePermissions(),
}));

vi.mock("@/lib/browser-auth", () => ({
  getVerifiedBrowserUser: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      updateUser: (...args: unknown[]) => mockAuthUpdateUser(...args),
      signOut: vi.fn(),
    },
  },
  validateConfig: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/profile/NotificationPreferences", () => ({
  NotificationPreferences: () => <div data-testid="notification-preferences" />,
}));

vi.mock("@/components/profile/MFASetup", () => ({
  MFASetup: () => <div data-testid="mfa-setup" />,
}));

vi.mock("@/components/profile/SessionList", () => ({
  SessionList: () => <div data-testid="session-list" />,
}));

vi.mock("@/components/auth/PasswordInput", () => ({
  PasswordInput: ({ value, onChange, ...props }: { value: string; onChange: (value: string) => void }) => (
    <input
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock("@/components/auth/PasswordStrength", () => ({
  PasswordStrength: () => <div data-testid="password-strength" />,
}));

describe("ProfilePageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUsePermissions.mockReturnValue({
      role: "admin",
      orgId: "org-1",
      isLoading: false,
    });

    vi.mocked(getVerifiedBrowserUser).mockResolvedValue({
      id: "user-1",
      email: "jane@example.com",
      created_at: "2024-01-01T00:00:00.000Z",
      last_sign_in_at: "2024-01-02T00:00:00.000Z",
    } as Awaited<ReturnType<typeof getVerifiedBrowserUser>>);

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table !== "profiles") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                first_name: "Jane",
                last_name: "Doe",
                mfa_enabled: false,
              },
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as unknown as ReturnType<typeof supabase.from>;
    });

    mockAuthUpdateUser.mockResolvedValue({ error: null });
  });

  it("disables name save until the edited name actually changes", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await screen.findByText("Jane Doe");

    await user.click(screen.getByRole("button", { name: /edit name/i }));

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    const firstNameInput = screen.getByPlaceholderText("First name");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Janet");
    expect(saveButton).toBeEnabled();

    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Jane");
    expect(saveButton).toBeDisabled();
  });

  it("disables email save until the normalized email actually changes", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await screen.findByText("Jane Doe");

    await user.click(screen.getByRole("button", { name: "Change" }));

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();

    const emailInput = screen.getByDisplayValue("jane@example.com");
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");
    expect(saveButton).toBeEnabled();

    await user.clear(emailInput);
    await user.type(emailInput, "JANE@EXAMPLE.COM");

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
  });
});
