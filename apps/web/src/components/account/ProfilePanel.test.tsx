import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

import { ProfilePanel } from "@/components/account/ProfilePanel";
import { updateBrowserUserEmail } from "@/features/account/client";
import { EmployeeProfileConflictError, updateEmployee } from "@/features/employees/client";
import type { Employee } from "@/types";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

vi.mock("@/features/account/client", () => ({
  cancelOwnProfileChangeRequest: vi.fn(),
  createOwnProfileChangeRequest: vi.fn(),
  fetchOwnProfileChangeRequests: vi.fn().mockResolvedValue({ requests: [] }),
  updateBrowserUserEmail: vi.fn(),
  updateSelfProfileDetails: vi.fn(),
  updateSelfProfilePhone: vi.fn(),
}));

vi.mock("@/features/employees/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/employees/client")>()),
  updateEmployee: vi.fn(),
}));
vi.mock("@/features/organization/client", () => ({ updateAppOnlyUser: vi.fn() }));

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
    setManagementDepartmentIds: vi.fn(),
    ...overrides,
  };
  return { ...render(<ProfilePanel {...props} />), props };
}

describe("ProfilePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateEmployee).mockResolvedValue({ ...employee, roleIds: [3], version: 5 });
  });

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

  it("saves staff data before email and reports a later email failure as partial success", async () => {
    const order: string[] = [];
    vi.mocked(updateEmployee).mockImplementation(async () => {
      order.push("employee");
      return { ...employee, roleIds: [3], version: 5 };
    });
    vi.mocked(updateBrowserUserEmail).mockImplementation(async () => {
      order.push("email");
      throw new Error("email failed");
    });

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Change work details" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm save" }),
    );

    await waitFor(() => expect(order).toEqual(["employee", "email"]));
    expect(toast.error).toHaveBeenCalledWith(
      "Your profile was saved, but we couldn't start the email change. Try the email again.",
    );
  });

  it("adopts the latest authoritative staff profile after a version conflict", async () => {
    const latestEmployee = { ...employee, firstName: "Server", version: 6 };
    vi.mocked(updateEmployee).mockRejectedValueOnce(
      new EmployeeProfileConflictError(latestEmployee),
    );
    const setEmployee = vi.fn();

    renderPanel({ setEmployee });
    fireEvent.click(screen.getByRole("button", { name: "Change work details" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm save" }),
    );

    await waitFor(() => expect(setEmployee).toHaveBeenCalledWith(latestEmployee));
    expect(toast.error).toHaveBeenCalledWith(
      "Your staff profile changed elsewhere. Review the latest values and try again.",
    );
  });
});
