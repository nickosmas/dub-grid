import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePageContent } from "@/app/profile/page";

const mockUsePermissions = vi.fn();
const mockUseOrganizationData = vi.fn();
const mockUseSelfProfileData = vi.fn();
const mockUpdateSelfProfileDetails = vi.fn();
const mockUpdateSelfProfilePhone = vi.fn();
const mockUpdateBrowserUserEmail = vi.fn();
const mockUpdateBrowserUserPassword = vi.fn();
const mockSignInBrowserWithPassword = vi.fn();
const mockSignOutFromBrowser = vi.fn();
const mockFetchOwnProfileChangeRequests = vi.fn();
const mockCreateOwnProfileChangeRequest = vi.fn();
const mockSetProfile = vi.fn();
const mockSetEmployee = vi.fn();
const mockLocationReplace = vi.fn();

Object.defineProperty(window, "location", {
  value: { replace: mockLocationReplace },
  writable: true,
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("@/hooks", () => ({
  MOBILE: "(max-width: 768px)",
  usePermissions: () => mockUsePermissions(),
  useOrganizationData: () => mockUseOrganizationData(),
  useMediaQuery: () => false,
}));

vi.mock("@/hooks/useSelfProfileData", () => ({
  useSelfProfileData: () => mockUseSelfProfileData(),
}));

vi.mock("@/features/account/client", () => ({
  updateSelfProfileDetails: (...args: unknown[]) =>
    mockUpdateSelfProfileDetails(...args),
  updateSelfProfilePhone: (...args: unknown[]) =>
    mockUpdateSelfProfilePhone(...args),
  fetchOwnProfileChangeRequests: (...args: unknown[]) =>
    mockFetchOwnProfileChangeRequests(...args),
  createOwnProfileChangeRequest: (...args: unknown[]) =>
    mockCreateOwnProfileChangeRequest(...args),
  updateBrowserUserEmail: (...args: unknown[]) =>
    mockUpdateBrowserUserEmail(...args),
  updateBrowserUserPassword: (...args: unknown[]) =>
    mockUpdateBrowserUserPassword(...args),
  signInBrowserWithPassword: (...args: unknown[]) =>
    mockSignInBrowserWithPassword(...args),
  signOutFromBrowser: (...args: unknown[]) => mockSignOutFromBrowser(...args),
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
  MFASetup: ({
    onStatusChange,
  }: {
    onStatusChange?: (enabled: boolean) => void;
  }) => (
    <button
      type="button"
      data-testid="mfa-setup"
      onClick={() => onStatusChange?.(true)}
    >
      MFA
    </button>
  ),
}));

vi.mock("@/components/profile/SessionList", () => ({
  SessionList: () => <div data-testid="session-list" />,
}));

vi.mock("@/components/profile/SelfWorkProfile", () => ({
  SelfWorkOverview: ({
    employee,
  }: {
    employee: { firstName: string; lastName: string };
  }) => (
    <div data-testid="self-work-overview">
      {`${employee.firstName} ${employee.lastName}`.trim()}
    </div>
  ),
  SelfWorkSchedule: ({
    employee,
  }: {
    employee: { firstName: string; lastName: string };
  }) => (
    <div data-testid="self-work-schedule">
      {`${employee.firstName} ${employee.lastName}`.trim()}
    </div>
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

function buildSelfProfileData(
  overrides: Partial<ReturnType<typeof mockUseSelfProfileData>> = {},
) {
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
      employmentType: "full_time",
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
      canManageEmployees: false,
      isSuperAdmin: false,
      isGridmaster: false,
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
    mockUpdateSelfProfilePhone.mockResolvedValue({
      employee: {
        id: "emp-1",
        firstName: "Jane",
        lastName: "Doe",
        employmentType: "full_time",
        status: "active",
        statusChangedAt: null,
        statusNote: "",
        certificationId: null,
        roleIds: [],
        seniority: 1,
        focusAreaIds: [],
        phone: "(415) 555-0199",
        email: "jane@example.com",
        contactNotes: "",
        userId: "user-1",
        departmentIds: [],
        deptAdminIds: [],
        version: 0,
      },
    });
    mockUpdateSelfProfileDetails.mockResolvedValue({
      profile: {
        first_name: "Janet",
        last_name: "Doe",
        mfa_enabled: false,
      },
      employee: {
        id: "emp-1",
        firstName: "Janet",
        lastName: "Doe",
        employmentType: "full_time",
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
    });
    mockFetchOwnProfileChangeRequests.mockResolvedValue({ requests: [] });
    mockCreateOwnProfileChangeRequest.mockResolvedValue({
      request: {
        id: "request-1",
        orgId: "org-1",
        requesterUserId: "user-1",
        requesterEmployeeId: "emp-1",
        requesterEmployeeVersion: 0,
        requesterName: "Jane Doe",
        requesterEmail: "jane@example.com",
        type: "profile_update",
        status: "pending",
        requestedChanges: { firstName: "Janet" },
        currentValues: {},
        requestNote: "",
        resolverUserId: null,
        resolverNote: "",
        resolvedAt: null,
        cancelledAt: null,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        version: 0,
      },
    });
    mockUpdateBrowserUserEmail.mockResolvedValue(undefined);
    mockUpdateBrowserUserPassword.mockResolvedValue(undefined);
    mockSignInBrowserWithPassword.mockResolvedValue({ error: null });
    mockSignOutFromBrowser.mockResolvedValue(undefined);
    mockLocationReplace.mockReset();
  });

  it("keeps names read-only in the account editor", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await screen.findByRole("button", { name: /edit account details/i });

    await user.click(
      screen.getByRole("button", { name: /edit account details/i }),
    );

    const saveButton = screen.getByRole("button", { name: /save changes/i });
    expect(saveButton).toBeDisabled();
    expect(screen.queryByPlaceholderText("First name")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Last name")).not.toBeInTheDocument();
  });

  it("only offers name fields in regular-user name change requests", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    expect(
      await screen.findByPlaceholderText("Requested first name"),
    ).toBeInTheDocument();
    expect(screen.getByText("Name change requests")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ask an admin to update your name. Email and phone are managed in Account details.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Requested last name"),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Requested staff email"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Requested contact notes"),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Requested first name"),
      "Janet",
    );
    await user.click(
      screen.getByRole("button", { name: /^request name change$/i }),
    );
    expect(await screen.findByText("Send request?")).toBeInTheDocument();
    expect(
      screen.getByText("Confirm that you want to send this name change request."),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /^confirm request$/i }),
    );

    await waitFor(() => {
      expect(mockCreateOwnProfileChangeRequest).toHaveBeenCalledWith({
        orgId: "org-1",
        type: "profile_update",
        requestedChanges: { firstName: "Janet" },
        requestNote: "",
      });
    });
  });

  it("lets employee managers edit their own profile name directly", async () => {
    const user = userEvent.setup();
    mockUsePermissions.mockReturnValue({
      role: "admin",
      orgId: "org-1",
      isLoading: false,
      canManageEmployees: true,
      isSuperAdmin: false,
      isGridmaster: false,
    });

    render(<ProfilePageContent />);

    await user.click(
      screen.getByRole("button", { name: /edit account details/i }),
    );
    await user.clear(screen.getByLabelText("First name"));
    await user.type(screen.getByLabelText("First name"), "Janet");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("Save changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^confirm save$/i }));

    await waitFor(() => {
      expect(mockUpdateSelfProfileDetails).toHaveBeenCalledWith({
        firstName: "Janet",
        lastName: "Doe",
        orgId: "org-1",
      });
      expect(mockCreateOwnProfileChangeRequest).not.toHaveBeenCalled();
    });
  });

  it("uses a single Close-or-Discard action for profile sub-editors", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await user.click(
      screen.getByRole("button", { name: /edit account details/i }),
    );
    expect(
      screen.getByRole("button", { name: /^close$/i }),
    ).toBeInTheDocument();

    const emailInput = screen.getByDisplayValue("jane@example.com");
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");
    expect(
      screen.getByRole("button", { name: /^discard$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^close$/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^discard$/i }));
    expect(screen.getByDisplayValue("jane@example.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^close$/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /change password/i }));
    expect(screen.getAllByRole("button", { name: /^close$/i })).toHaveLength(2);

    await user.type(
      screen.getByPlaceholderText("Enter new password"),
      "password-123",
    );
    expect(
      screen.getByRole("button", { name: /^discard$/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^close$/i })).toHaveLength(1);
  });

  it("updates the linked employee phone from /profile", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await user.click(
      screen.getByRole("button", { name: /edit account details/i }),
    );
    const phoneInput = screen.getByPlaceholderText("Phone");
    await user.type(phoneInput, "415-555-0199");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText("Save changes?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^confirm save$/i }));

    await waitFor(() => {
      expect(mockUpdateSelfProfilePhone).toHaveBeenCalledWith({
        orgId: "org-1",
        phone: "(415) 555-0199",
        expectedVersion: 0,
      });
      expect(mockSetEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "emp-1",
          phone: "(415) 555-0199",
        }),
      );
    });
  });

  it("blocks account detail save when the phone number is invalid", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await user.click(
      screen.getByRole("button", { name: /edit account details/i }),
    );
    const phoneInput = screen.getByPlaceholderText("Phone");
    await user.type(phoneInput, "123");

    expect(
      screen.getByText("Enter a 10-digit US phone number"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save changes/i }),
    ).toBeDisabled();
  });

  it("disables email save until the normalized email actually changes", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await screen.findByRole("button", { name: /edit account details/i });

    await user.click(
      screen.getByRole("button", { name: /edit account details/i }),
    );

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

    expect(
      await screen.findByText("Two-Factor Authentication"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /change password/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Enter new password"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /change password/i }));

    expect(
      screen.getByPlaceholderText("Enter current password"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Enter new password"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Confirm new password"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("password-strength")).toBeInTheDocument();
  });

  it("confirms password updates and signs out after confirmation", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await user.click(screen.getByRole("button", { name: /change password/i }));
    await user.type(
      screen.getByPlaceholderText("Enter current password"),
      "current-password",
    );
    await user.type(
      screen.getByPlaceholderText("Enter new password"),
      "Password-123",
    );
    await user.type(
      screen.getByPlaceholderText("Confirm new password"),
      "Password-123",
    );
    await user.click(screen.getByRole("button", { name: /^update password$/i }));

    expect(await screen.findByText("Update password?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Confirm that you want to update your password. You will be signed out of every session.",
      ),
    ).toBeInTheDocument();
    expect(mockUpdateBrowserUserPassword).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: /update and sign out/i }),
    );

    await waitFor(() => {
      expect(mockSignInBrowserWithPassword).toHaveBeenCalledWith({
        email: "jane@example.com",
        password: "current-password",
      });
      expect(mockUpdateBrowserUserPassword).toHaveBeenCalledWith(
        "Password-123",
      );
      expect(mockSignOutFromBrowser).toHaveBeenCalledWith("global");
      expect(mockLocationReplace).toHaveBeenCalledWith("/login");
    });
  });

  it("requires the current password before updating the web password", async () => {
    const user = userEvent.setup();

    render(<ProfilePageContent />);

    await user.click(screen.getByRole("button", { name: /change password/i }));
    await user.type(
      screen.getByPlaceholderText("Enter new password"),
      "Password-123",
    );
    await user.type(
      screen.getByPlaceholderText("Confirm new password"),
      "Password-123",
    );

    expect(
      screen.getByRole("button", { name: /^update password$/i }),
    ).toBeDisabled();
    expect(mockSignInBrowserWithPassword).not.toHaveBeenCalled();
    expect(mockUpdateBrowserUserPassword).not.toHaveBeenCalled();
  });

  it("blocks web password updates when current password verification fails", async () => {
    const user = userEvent.setup();
    mockSignInBrowserWithPassword.mockResolvedValue({
      error: new Error("Invalid login credentials"),
    });

    render(<ProfilePageContent />);

    await user.click(screen.getByRole("button", { name: /change password/i }));
    await user.type(
      screen.getByPlaceholderText("Enter current password"),
      "wrong-password",
    );
    await user.type(
      screen.getByPlaceholderText("Enter new password"),
      "Password-123",
    );
    await user.type(
      screen.getByPlaceholderText("Confirm new password"),
      "Password-123",
    );
    await user.click(screen.getByRole("button", { name: /^update password$/i }));
    await user.click(
      await screen.findByRole("button", { name: /update and sign out/i }),
    );

    expect(
      await screen.findByText("That password did not match this account."),
    ).toBeInTheDocument();
    expect(mockUpdateBrowserUserPassword).not.toHaveBeenCalled();
    expect(mockSignOutFromBrowser).not.toHaveBeenCalled();
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

    expect(
      await screen.findByRole("button", { name: "Overview" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Schedule" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("self-work-overview")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Overview" }));
    expect(screen.getByTestId("self-work-overview")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(screen.getByTestId("self-work-schedule")).toBeInTheDocument();
  });

  it("keeps /profile account-only when the user has no linked employee", async () => {
    mockUseSelfProfileData.mockReturnValue(
      buildSelfProfileData({ employee: null }),
    );

    render(<ProfilePageContent />);

    await screen.findByRole("button", { name: /edit account details/i });
    expect(
      screen.queryByRole("button", { name: "Overview" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Schedule" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("self-work-overview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("self-work-schedule")).not.toBeInTheDocument();
  });
});
