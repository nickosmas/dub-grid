import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

import { ProfilePanel } from "@/components/account/ProfilePanel";
import {
  checkOwnContact,
  fetchOwnProfileChangeRequests,
  requireCredentialAssurance,
  updateBrowserUserEmail,
} from "@/features/account/client";
import { EmployeeProfileConflictError, updateEmployee } from "@/features/employees/client";
import type { Employee } from "@/types";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const stepUpRun = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast }));
vi.mock("@/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks")>()),
  useIsInSandbox: () => false,
  useLogout: () => ({ signOut: vi.fn() }),
}));
vi.mock("@/hooks/useStepUpAction", () => ({
  useStepUpAction: () => ({ run: stepUpRun, dialog: null }),
}));

vi.mock("@/features/account/client", () => ({
  cancelOwnProfileChangeRequest: vi.fn(),
  checkOwnContact: vi.fn(),
  createOwnProfileChangeRequest: vi.fn(),
  fetchOwnProfileChangeRequests: vi.fn().mockResolvedValue({ requests: [] }),
  requireCredentialAssurance: vi.fn(),
  updateBrowserUserEmail: vi.fn(),
  updateSelfProfileDetails: vi.fn(),
  updateSelfProfilePhone: vi.fn(),
}));

vi.mock("@/features/employees/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/employees/client")>()),
  updateEmployee: vi.fn(),
}));
vi.mock("@/features/organization/client", () => ({
  updateAppOnlyUser: vi.fn(),
  fetchOrganizationUsers: vi.fn().mockResolvedValue([]),
  updateOrganizationMembershipGuarded: vi.fn(),
}));

let lastManagementAccessEditorProps: {
  employee: Employee;
  onCompleted: (updatedEmployee?: Employee | null) => void | Promise<void>;
} | null = null;

vi.mock("@/components/staff/EmployeeManagementAccessModal", () => ({
  EmployeeManagementAccessEditor: (props: {
    employee: Employee;
    onCompleted: (updatedEmployee?: Employee | null) => void | Promise<void>;
    frame?: (fields: React.ReactNode, actions: React.ReactNode) => React.ReactNode;
  }) => {
    lastManagementAccessEditorProps = props;
    const fields = <div data-testid="employee-management-access-editor" />;
    return props.frame ? props.frame(fields, null) : fields;
  },
}));

vi.mock("@/components/EditEmployeePanel", async () => {
  const React = await import("react");

  type MockProps = {
    employee: Employee;
    onDirtyChange?: (dirty: boolean) => void;
    onSave: (employee: Employee) => void | Promise<void>;
  };

  const MockEditEmployeePanel = React.forwardRef<
    { save: () => Promise<boolean>; requestDismiss: () => void },
    MockProps
  >(function MockEditEmployeePanel({ employee, onDirtyChange, onSave }, ref) {
    const [dirty, setDirty] = React.useState(false);

    React.useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
    React.useImperativeHandle(
      ref,
      () => ({
        requestDismiss: () => setDirty(false),
        save: async () => {
          if (!dirty) return false;
          await onSave({ ...employee, roleIds: [3] });
          return true;
        },
      }),
      [dirty, employee, onSave],
    );

    return (
      <button type="button" onClick={() => setDirty(true)}>
        Change work details
      </button>
    );
  });

  return { default: MockEditEmployeePanel };
});

const user = {
  id: "user-1",
  email: "alice@example.com",
} as User;

const employee: Employee = {
  id: "employee-1",
  employeeNumber: 7,
  firstName: "Alice",
  lastName: "Smith",
  employmentType: "full_time",
  status: "active",
  statusChangedAt: null,
  statusNote: "",
  certificationId: 2,
  roleIds: [],
  seniority: 1,
  focusAreaIds: [1],
  phone: "",
  email: "alice@example.com",
  contactNotes: "",
  userId: "user-1",
  departmentIds: [],
  deptAdminIds: [],
  version: 4,
  createdAt: null,
};

function renderPanel(overrides: Partial<React.ComponentProps<typeof ProfilePanel>> = {}) {
  const props: React.ComponentProps<typeof ProfilePanel> = {
    user,
    profile: {
      first_name: "Alice",
      last_name: "Smith",
      mfa_enabled: false,
    },
    employee,
    managementDepartmentIds: [],
    isOrgMember: true,
    orgId: "org-1",
    canEditProfileDirectly: true,
    isGridmaster: false,
    role: "admin",
    departments: [],
    isOnSchedule: true,
    canManageManagementAccess: false,
    canManageScheduleEmployees: true,
    focusAreas: [{ id: 1, orgId: "org-1", name: "North", sortOrder: 0, departmentId: null }],
    certifications: [],
    roles: [],
    setProfile: vi.fn(),
    setEmployee: vi.fn(),
    refetchProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return { ...render(<ProfilePanel {...props} />), props };
}

// Personal details comes first, so its footer holds the first Save.
const personalSave = () => screen.getAllByRole("button", { name: "Save" })[0];

describe("ProfilePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stepUpRun.mockImplementation(async (action: (token: string) => Promise<unknown>) => {
      await action("fresh-token");
      return true;
    });
    vi.mocked(requireCredentialAssurance).mockResolvedValue({ success: true });
    vi.mocked(updateEmployee).mockResolvedValue({ ...employee, roleIds: [3], version: 5 });
    vi.mocked(checkOwnContact).mockResolvedValue({ emailTaken: false, phoneTaken: false });
  });

  async function saveOnceChecked() {
    const save = personalSave();
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
  }

  it("opens as one persistent editor and preserves a dirty draft across a background refetch", () => {
    const view = renderPanel();

    expect(screen.getByLabelText("First name")).toHaveValue("Alice");
    expect(screen.getByLabelText("Email")).toHaveValue("alice@example.com");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Draft" } });
    view.rerender(
      <ProfilePanel {...view.props} profile={{ ...view.props.profile!, first_name: "Server" }} />,
    );

    expect(screen.getByLabelText("First name")).toHaveValue("Draft");
  });

  it("confirms credential assurance before saving a draft that changes email", async () => {
    const order: string[] = [];
    vi.mocked(requireCredentialAssurance).mockImplementation(async () => {
      order.push("assurance");
      return { success: true };
    });
    vi.mocked(updateEmployee).mockImplementation(async () => {
      order.push("employee");
      return { ...employee, roleIds: [3], version: 5 };
    });
    vi.mocked(updateBrowserUserEmail).mockImplementation(async () => {
      order.push("email");
      throw new Error("email failed");
    });

    renderPanel();
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "(503) 555-0142" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    await saveOnceChecked();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(order).toEqual(["assurance", "employee", "email"]));
    expect(requireCredentialAssurance).toHaveBeenCalledWith("fresh-token");
    expect(toast.error).toHaveBeenCalledWith(
      "Your other changes were saved, but we couldn't change your email. Try again.",
    );
  });

  it("says what saved and why the email didn't if the address is taken at the last moment", async () => {
    vi.mocked(updateBrowserUserEmail).mockRejectedValue(
      new Error("A user with this email address has already been registered"),
    );

    renderPanel();
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "(503) 555-0142" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    await saveOnceChecked();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Your other changes were saved, but we can't use that email. Try a different one.",
      ),
    );
  });

  it("says so and keeps Save off when an email or phone belongs to someone else", async () => {
    vi.mocked(checkOwnContact).mockResolvedValue({ emailTaken: true, phoneTaken: true });

    renderPanel();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "taken@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "(503) 555-0142" } });

    expect(await screen.findByText("That email belongs to someone else.")).toBeInTheDocument();
    expect(screen.getByText("That phone number belongs to someone else.")).toBeInTheDocument();
    expect(checkOwnContact).toHaveBeenCalledWith({
      orgId: "org-1",
      email: "taken@example.com",
      phone: "(503) 555-0142",
    });
    expect(personalSave()).toBeDisabled();
  });

  it("keeps Save off until the new email has been checked", async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });

    const save = personalSave();
    expect(save).toBeDisabled();
    await waitFor(() => expect(save).toBeEnabled());
  });

  it("lets the save decide when the check can't answer", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(checkOwnContact).mockRejectedValue(new Error("offline"));

    renderPanel();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });

    await waitFor(() => expect(personalSave()).toBeEnabled());
    consoleError.mockRestore();
  });

  it("keeps the typed account draft and confirmation when step-up is cancelled", async () => {
    stepUpRun.mockResolvedValueOnce(false);

    renderPanel();
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Draft" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    await saveOnceChecked();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(stepUpRun).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("First name")).toHaveValue("Draft");
    expect(screen.getByLabelText("Email")).toHaveValue("new@example.com");
    expect(
      screen.getByRole("alertdialog", { name: "Save your personal details?" }),
    ).toBeInTheDocument();
    expect(requireCredentialAssurance).not.toHaveBeenCalled();
    expect(updateEmployee).not.toHaveBeenCalled();
    expect(updateBrowserUserEmail).not.toHaveBeenCalled();
  });

  it("adopts the latest authoritative staff profile after a version conflict", async () => {
    const latestEmployee = { ...employee, firstName: "Server", version: 6 };
    vi.mocked(updateEmployee).mockRejectedValueOnce(
      new EmployeeProfileConflictError(latestEmployee),
    );
    const setEmployee = vi.fn();

    renderPanel({ setEmployee });
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Draft" } });
    fireEvent.click(personalSave());
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setEmployee).toHaveBeenCalledWith(latestEmployee));
    expect(toast.error).toHaveBeenCalledWith(
      "Someone else just changed your profile. Refresh and try again.",
    );
  });

  it("saves Work on its own, leaving the personal details draft", async () => {
    vi.mocked(updateEmployee).mockResolvedValue({ ...employee, roleIds: [3], version: 5 });

    renderPanel();
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Change work details" }));
    const [personal, work] = screen.getAllByRole("button", { name: "Save" });
    await waitFor(() => expect(work).toBeEnabled());
    fireEvent.click(work);

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Work details saved."));
    expect(updateEmployee).toHaveBeenCalledOnce();
    expect(vi.mocked(updateEmployee).mock.calls[0][0]).toMatchObject({
      firstName: "Alice",
      roleIds: [3],
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toHaveValue("Draft");
    expect(personal).toBeEnabled();
  });

  it("doesn't count a phone saved in another format as an edit", async () => {
    renderPanel({ employee: { ...employee, phone: "415-555-0199" } });
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(checkOwnContact).not.toHaveBeenCalled();
    expect(personalSave()).toBeDisabled();
  });

  it("keeps the staff record's own name when only the phone changes", async () => {
    renderPanel({ employee: { ...employee, firstName: "Ally", phone: "" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "415-555-0199" } });
    await saveOnceChecked();
    const confirm = screen.queryByRole("alertdialog");
    if (confirm) fireEvent.click(within(confirm).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateEmployee).toHaveBeenCalledOnce());
    expect(vi.mocked(updateEmployee).mock.calls[0][0]).toMatchObject({
      firstName: "Ally",
      phone: "(415) 555-0199",
    });
  });

  it("saves personal details on their own, leaving the Work draft", async () => {
    vi.mocked(updateEmployee).mockResolvedValue({ ...employee, firstName: "Draft", version: 5 });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Change work details" }));
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Draft" } });
    await saveOnceChecked();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(updateEmployee).toHaveBeenCalledOnce());
    expect(vi.mocked(updateEmployee).mock.calls[0][0]).toMatchObject({
      firstName: "Draft",
      roleIds: [],
    });
    const work = screen.getAllByRole("button", { name: "Save" })[1];
    expect(work).toBeEnabled();
  });

  // The Access card used to render only when managementDepartmentIds was
  // already non-empty, so a super_admin/gridmaster starting from zero
  // departments had no way to add themselves to management from their own
  // profile - the entry point simply didn't exist.
  describe("Access card", () => {
    it("always shows the viewer's own role, even with no management involvement", () => {
      renderPanel({ role: "user", canManageManagementAccess: false, managementDepartmentIds: [] });

      expect(screen.getByText("Access")).toBeInTheDocument();
      expect(screen.getByText("Access role")).toBeInTheDocument();
      expect(screen.getByText("User")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /add to management|edit management access/i }),
      ).not.toBeInTheDocument();
    });

    it("offers Add to Management for a super_admin/gridmaster with zero departments", () => {
      renderPanel({
        role: "super_admin",
        canManageManagementAccess: true,
        managementDepartmentIds: [],
      });

      expect(
        screen.getByRole("button", { name: "Add to an administrative team" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Edit administrative teams" }),
      ).not.toBeInTheDocument();
    });

    // Management access edits open in the same popup the People directory
    // panels use (EmployeeManagementAccessEditor in a Modal), not an inline
    // department-toggle form of its own - mirrored here for a zero-department
    // self-viewer with permission, same as a brand-new hire's "Add to
    // Management" would.
    it("opens the shared management-access editor in a popup, not an inline form", async () => {
      const refetchProfile = vi.fn().mockResolvedValue(undefined);

      renderPanel({
        role: "super_admin",
        canManageManagementAccess: true,
        managementDepartmentIds: [],
        departments: [
          {
            id: 10,
            orgId: "org-1",
            name: "Leadership",
            abbr: "LEAD",
            type: "management",
            sortOrder: 0,
          },
        ],
        refetchProfile,
      });

      fireEvent.click(screen.getByRole("button", { name: "Add to an administrative team" }));

      const dialog = screen.getByRole("dialog", { name: "Add to an administrative team" });
      expect(within(dialog).getByTestId("employee-management-access-editor")).toBeInTheDocument();
      expect(lastManagementAccessEditorProps?.employee.id).toBe("employee-1");

      await lastManagementAccessEditorProps?.onCompleted(null);
      expect(refetchProfile).toHaveBeenCalled();
    });

    it("says Edit management access, not Add to Management, once departments already exist", () => {
      renderPanel({
        role: "admin",
        canManageManagementAccess: true,
        managementDepartmentIds: [10],
        departments: [
          {
            id: 10,
            orgId: "org-1",
            name: "Leadership",
            abbr: "LEAD",
            type: "management",
            sortOrder: 0,
          },
        ],
      });

      expect(screen.getByRole("button", { name: "Edit administrative teams" })).toBeInTheDocument();
    });

    it("hides the department field entirely for a viewer with neither departments nor permission", () => {
      renderPanel({ role: "admin", canManageManagementAccess: false, managementDepartmentIds: [] });

      expect(screen.queryByText("Management departments")).not.toBeInTheDocument();
    });
  });
});

describe("ProfilePanel change-request loading", () => {
  it("skips the org-scoped change-requests fetch for a non-member", async () => {
    // A gridmaster viewing an organization through impersonation has no
    // membership there; the route answers 403, so the panel must not ask.
    vi.mocked(fetchOwnProfileChangeRequests).mockClear();
    renderPanel({ isOrgMember: false, canEditProfileDirectly: false });
    await waitFor(() => expect(screen.getByText("Alice Smith")).toBeInTheDocument());
    expect(fetchOwnProfileChangeRequests).not.toHaveBeenCalled();
  });

  it("still loads change requests for a member who cannot edit directly", async () => {
    vi.mocked(fetchOwnProfileChangeRequests).mockClear();
    renderPanel({ isOrgMember: true, canEditProfileDirectly: false });
    await waitFor(() => expect(fetchOwnProfileChangeRequests).toHaveBeenCalledWith("org-1"));
  });

  it("asks for a name change in its own dialog, and leaves deletion to the page", async () => {
    renderPanel({ isOrgMember: true, canEditProfileDirectly: false });

    fireEvent.click(await screen.findByRole("button", { name: "Request a name change" }));

    expect(
      await screen.findByRole("dialog", { name: "Request a name change" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });
});
