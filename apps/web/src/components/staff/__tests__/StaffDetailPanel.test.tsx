import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StaffDetailPanel } from "@/components/staff/StaffDetailPanel";
import type { Employee, Invitation } from "@/types";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "viewer-1" }, signOut: vi.fn(), isLoading: false }),
}));

vi.mock("@/hooks", () => ({
  useIsInSandbox: () => false,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const editorHarness = vi.hoisted(() => ({ saveResult: true }));

vi.mock("@/components/EditEmployeePanel", async () => {
  const React = await import("react");
  return {
    default: React.forwardRef(
      (
        props: {
          onDirtyChange?: (dirty: boolean) => void;
          onSaveCompleted?: () => void;
        },
        ref: React.ForwardedRef<{ save: () => Promise<boolean>; requestDismiss: () => void }>,
      ) => {
        React.useImperativeHandle(ref, () => ({
          save: async () => {
            if (editorHarness.saveResult) props.onSaveCompleted?.();
            return editorHarness.saveResult;
          },
          requestDismiss: () => undefined,
        }));
        return (
          <div data-testid="edit-employee-panel">
            <button onClick={() => props.onDirtyChange?.(true)}>Modify employee</button>
          </div>
        );
      },
    ),
  };
});

vi.mock("@/components/staff-detail/EmployeeStatusActions", () => ({
  EmployeeStatusActions: () => <div data-testid="employee-status-actions" />,
}));

const employee: Employee = {
  id: "emp-1",
  firstName: "Pat",
  lastName: "Doe",
  employmentType: "full_time",
  status: "active",
  statusChangedAt: null,
  statusNote: "",
  certificationId: null,
  roleIds: [],
  seniority: 1,
  focusAreaIds: [1],
  phone: "",
  email: "pat@example.com",
  contactNotes: "",
  userId: "user-1",
  departmentIds: [],
  deptAdminIds: [],
  version: 1,
};

function renderPanel(props: Partial<React.ComponentProps<typeof StaffDetailPanel>> = {}) {
  return render(
    <StaffDetailPanel
      employee={employee}
      focusAreas={[]}
      certifications={[]}
      roles={[]}
      roleLabel="Roles"
      focusAreaLabel="Focus Areas"
      certificationLabel="Certifications"
      canManageEmployees
      orgId="org-1"
      pendingInviteByEmployeeId={new Map<string, Invitation>()}
      onSave={vi.fn()}
      onRemove={vi.fn()}
      onDeactivate={vi.fn()}
      onActivate={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

function getPanelStructureContract() {
  const actionFooter = document.querySelector<HTMLElement>('[data-slot="staff-panel-actions"]');
  const editorFooter = document.querySelector<HTMLElement>(
    '[data-slot="staff-panel-editor-actions"]',
  );

  expect(actionFooter).not.toBeNull();
  expect(editorFooter).not.toBeNull();

  return {
    actionFooterClass: actionFooter?.className,
    editorFooterClass: editorFooter?.className,
    paneClass: actionFooter?.parentElement?.className,
    actionLabels: Array.from(actionFooter?.querySelectorAll("button") ?? []).map(
      (button) => button.textContent,
    ),
    editorLabels: Array.from(editorFooter?.querySelectorAll("button") ?? []).map(
      (button) => button.textContent,
    ),
  };
}

describe("StaffDetailPanel access controls", () => {
  it("closes after the embedded editor reports a successful save", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    editorHarness.saveResult = true;
    renderPanel({ onClose });

    await user.click(screen.getByRole("button", { name: "Modify employee" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("stays open when the embedded editor reports a failed save", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    editorHarness.saveResult = false;
    renderPanel({ onClose });

    await user.click(screen.getByRole("button", { name: "Modify employee" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(onClose).not.toHaveBeenCalled();
    editorHarness.saveResult = true;
  });

  it("renders an editable role dropdown when the viewer can change access", () => {
    renderPanel({ orgRole: "user", onRoleChange: vi.fn() });

    // CustomSelect renders its trigger as a collapsed listbox button.
    const trigger = screen.getByRole("button", { expanded: false });
    expect(trigger.getAttribute("aria-disabled")).not.toBe("true");
    expect(screen.getByText("User")).toBeTruthy();
  });

  it("disables the dropdown rather than hiding it for the viewer's own record", () => {
    renderPanel({
      employee: { ...employee, userId: "viewer-1" },
      orgRole: "admin",
      onRoleChange: vi.fn(),
    });

    // The dropdown still renders so the row reads consistently, but self can't
    // change their own role.
    const trigger = screen.getByText("Admin").closest("button");
    expect(trigger?.getAttribute("aria-disabled")).toBe("true");
  });

  it("falls back to a read-only badge when the viewer cannot change access", () => {
    renderPanel({ orgRole: "admin" });

    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.queryByRole("button", { expanded: false })).toBeNull();
  });

  it("says so plainly when the person has no login at all", () => {
    renderPanel({ orgRole: null });

    expect(screen.getByText("No app access")).toBeTruthy();
  });

  it("keeps access in the header, next to the name, not in the action row", () => {
    renderPanel({
      orgRole: "user",
      onRoleChange: vi.fn(),
      canManageManagementAccess: true,
      onManageManagementAccess: vi.fn(),
    });

    const manageButton = screen.getByRole("button", { name: /Add to Management/ });
    const row = manageButton.parentElement;
    expect(row).not.toBeNull();
    expect(row).not.toContainElement(screen.getByText("User"));
    expect(row).toContainElement(screen.getByTestId("employee-status-actions"));
  });

  it("puts Send Invitation in the same row as Add to Management, not stacked above it", () => {
    renderPanel({
      employee: { ...employee, userId: null, email: "pat@example.com" },
      canManageEmployees: true,
      orgId: "org-1",
      canManageManagementAccess: true,
      onManageManagementAccess: vi.fn(),
      onInvite: vi.fn(),
    });

    const manageButton = screen.getByRole("button", { name: /Add to Management/ });
    const inviteButton = screen.getByRole("button", { name: /Send Invitation/ });
    expect(inviteButton.parentElement).toBe(manageButton.parentElement);
  });

  it("keeps person actions outside the scrolling form and immediately above editor actions", () => {
    renderPanel({
      canManageManagementAccess: true,
      onManageManagementAccess: vi.fn(),
    });

    const actionFooter = document.querySelector<HTMLElement>('[data-slot="staff-panel-actions"]');
    const editorFooter = document.querySelector<HTMLElement>(
      '[data-slot="staff-panel-editor-actions"]',
    );
    const scrollRegion = screen.getByTestId("edit-employee-panel").parentElement;

    expect(actionFooter).not.toBeNull();
    expect(editorFooter).not.toBeNull();
    expect(scrollRegion).not.toContainElement(actionFooter);
    expect(actionFooter?.nextElementSibling).toBe(editorFooter);
  });

  it("keeps the footer structure identical for equivalent records in distinct organizations", () => {
    renderPanel({
      orgId: "calm-haven",
      focusAreaLabel: "Wings",
      certificationLabel: "Credentials",
    });
    const calmHavenContract = getPanelStructureContract();

    cleanup();

    renderPanel({
      orgId: "arden-wood",
      focusAreaLabel: "Focus areas",
      certificationLabel: "Certifications",
    });

    expect(getPanelStructureContract()).toEqual(calmHavenContract);
  });

  it("uses the shared two-column grid for person actions", () => {
    renderPanel({
      employee: { ...employee, userId: null, email: "pat@example.com" },
      canManageManagementAccess: true,
      onManageManagementAccess: vi.fn(),
      onInvite: vi.fn(),
    });

    const actionFooter = document.querySelector<HTMLElement>('[data-slot="staff-panel-actions"]');
    const inviteButton = screen.getByRole("button", { name: /send invitation/i });
    const managementButton = screen.getByRole("button", { name: /add to management/i });

    const personActions = document.querySelector<HTMLElement>('[data-slot="staff-person-actions"]');

    expect(actionFooter).toContainElement(inviteButton);
    expect(inviteButton.parentElement).toBe(managementButton.parentElement);
    expect(personActions).toContainElement(inviteButton);
    expect(personActions).toHaveClass(
      "grid",
      "grid-cols-2",
      "[&>:last-child:nth-child(odd)]:col-span-2",
    );
  });
  // Permissions were only reachable from inside the management-access popup,
  // which now edits departments and nothing else. The launcher lives on the
  // panel instead, and this is the panel's only route to it.
  it("offers a self-descriptive admin-access action for an editable admin", () => {
    renderPanel({ orgRole: "admin", onPermissionsChange: vi.fn() });

    expect(screen.getByRole("button", { name: "Edit admin access" })).toBeInTheDocument();
  });

  it("withholds the admin-access action when the role carries no permission set", () => {
    renderPanel({ orgRole: "user", onPermissionsChange: vi.fn() });

    expect(screen.queryByRole("button", { name: "Edit admin access" })).not.toBeInTheDocument();
  });
});
