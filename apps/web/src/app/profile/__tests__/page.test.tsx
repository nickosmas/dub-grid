import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePageContent } from "@/app/profile/page";
import { supabase } from "@/lib/supabase";

const mockUsePermissions = vi.fn();
const mockUseOrganizationData = vi.fn();
const mockUseSelfProfileData = vi.fn();
const mockAuthUpdateUser = vi.fn();
const mockSetProfile = vi.fn();
const mockSetEmployee = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("@/hooks", () => ({
  usePermissions: () => mockUsePermissions(),
  useOrganizationData: () => mockUseOrganizationData(),
}));

vi.mock("@/hooks/useSelfProfileData", () => ({
  useSelfProfileData: () => mockUseSelfProfileData(),
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
  MFASetup: ({ onStatusChange }: { onStatusChange?: (enabled: boolean) => void }) => (
    <button type="button" data-testid="mfa-setup" onClick={() => onStatusChange?.(true)}>
      MFA
    </button>
  ),
}));

vi.mock("@/components/profile/SessionList", () => ({
  SessionList: () => <div data-testid="session-list" />,
}));

vi.mock("@/components/profile/SelfWorkProfile", () => ({
  SelfWorkOverview: ({ employee }: { employee: { firstName: string; lastName: string } }) => (
    <div data-testid="self-work-overview">{`${employee.firstName} ${employee.lastName}`.trim()}</div>
  ),
  SelfWorkSchedule: ({ employee }: { employee: { firstName: string; lastName: string } }) => (
    <div data-testid="self-work-schedule">{`${employee.firstName} ${employee.lastName}`.trim()}</div>
  ),
}));

vi.mock("@/components/auth/PasswordInput", () => ({
  PasswordInput: ({
    value,
    onChange,
    showPassword,
    onToggle,
    ariaDescribedBy,
    ...props
  }: {
    value: string;
    onChange: (value: string) => void;
    showPassword?: boolean;
    onToggle?: () => void;
    ariaDescribedBy?: string;
  }) => {
    void showPassword;
    void onToggle;

    return (
      <input
        {...props}
        aria-describedby={ariaDescribedBy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  },
}));

vi.mock("@/components/auth/PasswordStrength", () => ({
  PasswordStrength: () => <div data-testid="password-strength" />,
}));

function buildSelfProfileData(overrides: Partial<ReturnType<typeof mockUseSelfProfileData>> = {}) {
  return {
    user: {
      id: "user-1",
      email: "jane@example.com",
      created_at: "2024-01-01T00:00:00.000Z",
      last_sign_in_at: "2024-01-02T00:00:00.000Z",
    },
    profile: {
      first_name: "Jane",
      last_name: "Doe",
      mfa_enabled: false,
    },
    employee: {
      id: "emp-1",
      firstName: "Jane",
      lastName: "Doe",
      status: "active",
      statusChangedAt: null,
      statusNote: "",
      certificationId: null,
      roleIds: [],
      seniority: 1,
      focusAreaIds: [],
      phone: "",
      email: "jane@example.com",
      contactNotes: "",
      userId: "user-1",
      departmentIds: [],
      deptAdminIds: [],
      version: 0,
    },
    shifts: {},
    recurringShifts: [],
    shiftRequests: [],
    auditNames: new Map(),
    isLoading: false,
    error: null,
    setProfile: mockSetProfile,
    setEmployee: mockSetEmployee,
    ...overrides,
  };
}

describe("ProfilePageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUsePermissions.mockReturnValue({
      role: "admin",
      orgId: "org-1",
      isLoading: false,
    });

    mockUseOrganizationData.mockReturnValue({
      org: { shiftDisplayMode: "code" },
      focusAreas: [],
      assignments: [],
      shiftCategories: [],
      absenceTypes: [],
      certifications: [],
      orgRoles: [],
      assignmentLabelMap: new Map(),
      absenceTypeMap: new Map(),
    });

    mockUseSelfProfileData.mockReturnValue(buildSelfProfileData());

    vi.mocked(supabase.from).mockImplementation(() => ({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }) as unknown as ReturnType<typeof supabase.from>);

    mockAuthUpdateUser.mockResolvedValue({ error: null });
  });

  it("disables name save until the edited name actually changes", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await screen.findByRole("button", { name: /edit account details/i });

    await user.click(screen.getByRole("button", { name: /edit account details/i }));

    const saveButton = screen.getByRole("button", { name: /save changes/i });
    expect(saveButton).toBeDisabled();

    const firstNameInput = screen.getByPlaceholderText("First name");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Janet");
    expect(saveButton).toBeEnabled();

    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Jane");
    expect(saveButton).toBeDisabled();
  });

  it("uses a single Close-or-Discard action for profile sub-editors", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await user.click(screen.getByRole("button", { name: /edit account details/i }));
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();

    const firstNameInput = screen.getByPlaceholderText("First name");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Janet");
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^close$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(screen.getByPlaceholderText("First name")).toHaveValue("Jane");
    expect(screen.getByRole("button", { name: /^close$/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /change password/i }));
    expect(screen.getAllByRole("button", { name: /^close$/i })).toHaveLength(2);

    await user.type(screen.getByPlaceholderText("Enter new password"), "password-123");
    expect(screen.getByRole("button", { name: /^discard$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^close$/i })).toHaveLength(1);
  });

  it("updates both profile and linked employee names from /profile", async () => {
    const user = userEvent.setup();

    const profileEq = vi.fn().mockResolvedValue({ error: null });
    const employeeEq = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          update: vi.fn().mockReturnValue({ eq: profileEq }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      if (table === "employees") {
        return {
          update: vi.fn().mockReturnValue({ eq: employeeEq }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    render(<ProfilePageContent />);

    await user.click(screen.getByRole("button", { name: /edit account details/i }));
    const firstNameInput = screen.getByPlaceholderText("First name");
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Janet");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(profileEq).toHaveBeenCalledWith("id", "user-1");
      expect(employeeEq).toHaveBeenCalledWith("id", "emp-1");
      expect(mockSetProfile).toHaveBeenCalled();
      expect(mockSetEmployee).toHaveBeenCalled();
    });
  });

  it("disables email save until the normalized email actually changes", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await screen.findByRole("button", { name: /edit account details/i });

    await user.click(screen.getByRole("button", { name: /edit account details/i }));

    const saveButton = screen.getByRole("button", { name: /save changes/i });
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

  it("shows security options immediately and reveals the password form from a button", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    expect(await screen.findByText("Two-Factor Authentication")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change password/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Enter new password")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /change password/i }));

    expect(screen.getByPlaceholderText("Enter new password")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Confirm new password")).toBeInTheDocument();
  });

  it("renders self work tabs for a linked employee even without employee detail permission", async () => {
    const user = userEvent.setup();

    mockUsePermissions.mockReturnValue({
      role: "user",
      orgId: "org-1",
      isLoading: false,
      canViewEmployeeDetails: false,
    });

    render(<ProfilePageContent />);

    expect(await screen.findByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.queryByTestId("self-work-overview")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Overview" }));
    expect(screen.getByTestId("self-work-overview")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(screen.getByTestId("self-work-schedule")).toBeInTheDocument();
  });

  it("keeps /profile account-only when the user has no linked employee", async () => {
    mockUseSelfProfileData.mockReturnValue(buildSelfProfileData({ employee: null }));

    render(<ProfilePageContent />);

    await screen.findByRole("button", { name: /edit account details/i });
    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("self-work-overview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("self-work-schedule")).not.toBeInTheDocument();
  });
});
