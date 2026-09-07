import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import EditEmployeePanel from "@/components/EditEmployeePanel";
import { checkEmployeeEmailConflict } from "@/features/employees/client";
import { Employee, FocusArea, Invitation, NamedItem } from "@/types";

vi.mock("@/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks")>()),
  useIsInSandbox: () => false,
}));

vi.mock("@/features/employees/client", () => ({
  checkEmployeeEmailConflict: vi.fn(),
}));

const checkEmployeeEmailConflictMock = vi.mocked(checkEmployeeEmailConflict);
const DESIGNATIONS: NamedItem[] = [
  { id: 1, orgId: "org-1", name: "JLCSN", abbr: "JLCSN", sortOrder: 0 },
  { id: 2, orgId: "org-1", name: "CSN III", abbr: "CSN III", sortOrder: 1 },
  { id: 3, orgId: "org-1", name: "CSN II", abbr: "CSN II", sortOrder: 2 },
  { id: 4, orgId: "org-1", name: "STAFF", abbr: "STAFF", sortOrder: 3 },
  { id: 5, orgId: "org-1", name: "—", abbr: "—", sortOrder: 4 },
];
const ROLES: NamedItem[] = [
  { id: 1, orgId: "org-1", name: "DCSN", abbr: "DCSN", sortOrder: 0 },
  { id: 2, orgId: "org-1", name: "DVCSN", abbr: "DVCSN", sortOrder: 1 },
  { id: 3, orgId: "org-1", name: "Supv", abbr: "Supv", sortOrder: 2 },
  { id: 4, orgId: "org-1", name: "Mentor", abbr: "Mentor", sortOrder: 3 },
  { id: 5, orgId: "org-1", name: "CN", abbr: "CN", sortOrder: 4 },
  { id: 6, orgId: "org-1", name: "SC. Mgr.", abbr: "SC. Mgr.", sortOrder: 5 },
  {
    id: 7,
    orgId: "org-1",
    name: "Activity Coordinator",
    abbr: "Activity Coordinator",
    sortOrder: 6,
  },
  {
    id: 8,
    orgId: "org-1",
    name: "SC/Asst/Act/Cor",
    abbr: "SC/Asst/Act/Cor",
    sortOrder: 7,
  },
];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const focusAreas: FocusArea[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "North",
    sortOrder: 1,
    departmentId: null,
  },
  {
    id: 2,
    orgId: "org-1",
    name: "South",
    sortOrder: 2,
    departmentId: null,
  },
];

const employee: Employee = {
  id: "emp-42",
  employeeNumber: 1042,
  firstName: "Alice",
  lastName: "Smith",
  employmentType: "full_time",
  status: "active",
  statusChangedAt: null,
  statusNote: "",
  certificationId: 4,
  roleIds: [],
  seniority: 3,
  focusAreaIds: [1],
  phone: "(415) 425-3334",
  email: "alice@example.com",
  contactNotes: "",
  userId: null,
  departmentIds: [],
  deptAdminIds: [],
  version: 0,
  createdAt: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pendingInvitation: Invitation = {
  id: "inv-1",
  orgId: "org-1",
  invitedBy: null,
  email: "alice@example.com",
  roleToAssign: "user",
  expiresAt: "2099-01-01T00:00:00.000Z",
  acceptedAt: null,
  revokedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  employeeId: "emp-42",
  firstName: "Alice",
  lastName: "Smith",
  phone: null,
  departmentIds: [10],
  deptAdminIds: [],
};

function renderPanel(
  overrides: Partial<{
    onSave: (e: Employee) => void;
    onCancel: () => void;
    isManagementUser: boolean;
    pendingInvitation: Invitation;
    onSaveWithReinvite: (updated: Employee, oldInvitation: Invitation) => void | Promise<void>;
    orgId: string;
    onEmailConflictChange: (hasConflict: boolean) => void;
    onSaveBlockedChange: (isBlocked: boolean) => void;
    employee: Employee;
    roles: NamedItem[];
    certifications: NamedItem[];
    persistent: boolean;
  }> = {},
) {
  const onSave = overrides.onSave ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();

  render(
    <EditEmployeePanel
      employee={overrides.employee ?? employee}
      orgId={overrides.orgId}
      focusAreas={focusAreas}
      certifications={overrides.certifications ?? [...DESIGNATIONS]}
      roles={overrides.roles ?? [...ROLES]}
      isManagementUser={overrides.isManagementUser}
      onSave={onSave}
      onCancel={onCancel}
      pendingInvitation={overrides.pendingInvitation}
      onSaveWithReinvite={overrides.onSaveWithReinvite}
      onEmailConflictChange={overrides.onEmailConflictChange}
      onSaveBlockedChange={overrides.onSaveBlockedChange}
      persistent={overrides.persistent}
    />,
  );

  return { onSave, onCancel };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EditEmployeePanel", () => {
  // -------------------------------------------------------------------------
  // Pre-population
  // -------------------------------------------------------------------------
  describe("Pre-population", () => {
    it("name inputs are pre-populated with employee firstName and lastName", () => {
      renderPanel();
      expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Smith")).toBeInTheDocument();
    });

    it("phone input is pre-populated with employee.phone", () => {
      renderPanel();
      const phoneInput = screen.getByDisplayValue("(415) 425-3334");
      expect(phoneInput).toBeInTheDocument();
    });

    it("email input is pre-populated with employee.email", () => {
      renderPanel();
      const emailInput = screen.getByDisplayValue("alice@example.com");
      expect(emailInput).toBeInTheDocument();
    });

    it("hides incompatible roles but keeps a selected legacy role removable", () => {
      renderPanel({
        employee: { ...employee, certificationId: null, roleIds: [1] },
        certifications: [
          {
            id: 5,
            orgId: "org-1",
            name: "Registered Nurse",
            abbr: "RN",
            sortOrder: 0,
          },
        ],
        roles: [
          {
            id: 1,
            orgId: "org-1",
            name: "Legacy Lead",
            abbr: "LL",
            sortOrder: 0,
            requiredCertificationIds: [5],
          },
          {
            id: 2,
            orgId: "org-1",
            name: "Clinical Lead",
            abbr: "CL",
            sortOrder: 1,
            requiredCertificationIds: [5],
          },
          {
            id: 3,
            orgId: "org-1",
            name: "Coordinator",
            abbr: "CO",
            sortOrder: 2,
            requiredCertificationIds: [],
          },
        ],
      });

      expect(screen.getByRole("button", { name: "Legacy Lead" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Coordinator" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clinical Lead" })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // isModified / Save button state
  // -------------------------------------------------------------------------
  describe("isModified / Save button state", () => {
    it("Save button is disabled when form is unmodified", () => {
      renderPanel();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("hides pristine Close in persistent mode and shows Discard after an edit", async () => {
      const user = userEvent.setup();
      renderPanel({ persistent: true });

      expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
      await user.type(screen.getByDisplayValue("Alice"), "a");
      expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    });

    it("Save becomes enabled after changing the first name field", async () => {
      const user = userEvent.setup();
      renderPanel();
      const nameInput = screen.getByDisplayValue("Alice");
      await user.clear(nameInput);
      await user.type(nameInput, "Bob");
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });

    it("Save becomes enabled after changing the designation", async () => {
      const user = userEvent.setup();
      renderPanel();
      // Certification is a CustomSelect — open dropdown and pick a different option
      await user.click(screen.getByRole("button", { name: /STAFF/ }));
      await user.click(screen.getByRole("option", { name: "CSN II" }));
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });

    it("saves the selected employment type", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderPanel({ onSave });

      await user.click(screen.getByRole("button", { name: /Full-time/ }));
      await user.click(screen.getByRole("option", { name: "Part-time" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ employmentType: "part_time" }));
    });

    it("Save is disabled when first name is cleared even if other fields are modified", async () => {
      const user = userEvent.setup();
      renderPanel();
      // First modify designation so isModified would be true
      await user.click(screen.getByRole("button", { name: /STAFF/ }));
      await user.click(screen.getByRole("option", { name: "CSN II" }));
      // Then clear the first name
      const nameInput = screen.getByDisplayValue("Alice");
      await user.clear(nameInput);
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("Save is disabled when last name is cleared even if other fields are modified", async () => {
      const user = userEvent.setup();
      renderPanel();
      const lastNameInput = screen.getByDisplayValue("Smith");
      await user.clear(lastNameInput);
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("Save is disabled when all focus areas are deselected", async () => {
      const user = userEvent.setup();
      renderPanel();
      // Modify name so isModified is true
      const nameInput = screen.getByDisplayValue("Alice");
      await user.clear(nameInput);
      await user.type(nameInput, "Bob");
      // Deselect the only assigned focus area (North)
      await user.click(screen.getByRole("button", { name: "North" }));
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("reports blocking validation to a host when required focus areas are cleared", async () => {
      const user = userEvent.setup();
      const onSaveBlockedChange = vi.fn();
      renderPanel({ onSaveBlockedChange });

      expect(onSaveBlockedChange).toHaveBeenLastCalledWith(false);

      await user.click(screen.getByRole("button", { name: "North" }));
      expect(screen.getByText("At least one focus areas is required")).toBeVisible();
      expect(onSaveBlockedChange).toHaveBeenLastCalledWith(true);

      await user.click(screen.getByRole("button", { name: "North" }));
      expect(onSaveBlockedChange).toHaveBeenLastCalledWith(false);
    });
  });

  // -------------------------------------------------------------------------
  // Coming off the schedule (management users)
  // -------------------------------------------------------------------------
  describe("Coming off the schedule (management users)", () => {
    // Deselecting the focus areas is the whole removal path now; there is no
    // separate button, so the tags and the consequence note carry it.
    it("allows a management user to clear all focus areas and save with an empty list", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderPanel({ onSave, isManagementUser: true });

      await user.click(screen.getByRole("button", { name: "North" }));

      expect(screen.getByText(/removes them from the schedule/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ focusAreaIds: [] }));
    });

    it("withholds the removal note from a non-management user, who can't come off the schedule", async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole("button", { name: "North" }));

      expect(screen.queryByText(/removes them from the schedule/i)).not.toBeInTheDocument();
    });

    it("Save is not disabled when all focus areas are deselected for a management user", async () => {
      const user = userEvent.setup();
      renderPanel({ isManagementUser: true });
      // Modify name so isModified is true
      const nameInput = screen.getByDisplayValue("Alice");
      await user.clear(nameInput);
      await user.type(nameInput, "Bob");
      // Deselect the only assigned focus area (North)
      await user.click(screen.getByRole("button", { name: "North" }));
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });

    it("hides saved schedule assignments for a management-only person", () => {
      renderPanel({
        isManagementUser: true,
        employee: { ...employee, focusAreaIds: [], certificationId: null, roleIds: [] },
      });

      expect(screen.queryByText("Assignments")).not.toBeInTheDocument();
      expect(screen.queryByText(/removes them from the schedule/i)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "North" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Full-time" })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Save action
  // -------------------------------------------------------------------------
  describe("Save action", () => {
    it("clicking Save on a valid modified form calls onSave with the updated employee", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderPanel({ onSave });

      const firstNameInput = screen.getByDisplayValue("Alice");
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "Bob");

      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledOnce();
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "emp-42",
          firstName: "Bob",
          lastName: "Smith",
          certificationId: 4,
          focusAreaIds: [1],
          phone: "(415) 425-3334",
          email: "alice@example.com",
        }),
      );
    });

    it("shows an inline error when last name is left blank", async () => {
      const user = userEvent.setup();
      renderPanel();

      const lastNameInput = screen.getByDisplayValue("Smith");
      await user.clear(lastNameInput);
      await user.tab();

      expect(screen.getByText("Last name is required")).toBeInTheDocument();
    });

    it("shows an inline error for an invalid phone number and blocks save", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderPanel({ onSave });

      const phoneInput = screen.getByDisplayValue("(415) 425-3334");
      await user.clear(phoneInput);
      await user.type(phoneInput, "123");
      await user.tab();

      expect(screen.getByText("Enter a 10-digit US phone number")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Real-time duplicate-email check
  // -------------------------------------------------------------------------
  describe("Real-time duplicate-email check", () => {
    beforeEach(() => {
      // mockReset (not mockClear) also drops any queued mockResolvedValueOnce
      // implementation. A prior test's debounced check can still be pending
      // when that test's own assertions finish (its 400ms timer hasn't fired
      // yet) — RTL's cleanup() cancels it via the effect's own cleanup, but a
      // queued *Once* value that call would have consumed is left sitting in
      // the queue and gets consumed by the next test's first call instead.
      checkEmployeeEmailConflictMock.mockReset();
    });

    it("flags an email already used by another employee and blocks saving", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      checkEmployeeEmailConflictMock.mockResolvedValue({
        conflict: true,
        conflictingEmployeeId: "other-emp",
      });
      renderPanel({ onSave, orgId: "org-1" });

      const emailInput = screen.getByDisplayValue("alice@example.com");
      await user.clear(emailInput);
      await user.type(emailInput, "taken@example.com");

      await screen.findByText(/already used by another person on your team/i);
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).not.toHaveBeenCalled();
    });

    it("does not flag or check when the email is unchanged", async () => {
      const user = userEvent.setup();
      checkEmployeeEmailConflictMock.mockResolvedValue({
        conflict: false,
        conflictingEmployeeId: null,
      });
      renderPanel({ orgId: "org-1" });

      // Modify an unrelated field so Save becomes enabled without touching email.
      const firstNameInput = screen.getByDisplayValue("Alice");
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "Bob");

      expect(checkEmployeeEmailConflictMock).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });

    it("does not check when orgId is not provided", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderPanel({ onSave });

      const emailInput = screen.getByDisplayValue("alice@example.com");
      await user.clear(emailInput);
      await user.type(emailInput, "new.address@example.com");

      expect(checkEmployeeEmailConflictMock).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new.address@example.com" }),
      );
    });

    it("clears the conflict and allows saving once the email is fixed", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      checkEmployeeEmailConflictMock.mockResolvedValueOnce({
        conflict: true,
        conflictingEmployeeId: "other-emp",
      });
      renderPanel({ onSave, orgId: "org-1" });

      const emailInput = screen.getByDisplayValue("alice@example.com");
      await user.clear(emailInput);
      await user.type(emailInput, "taken@example.com");
      await screen.findByText(/already used by another person on your team/i);

      checkEmployeeEmailConflictMock.mockResolvedValueOnce({
        conflict: false,
        conflictingEmployeeId: null,
      });
      await user.clear(emailInput);
      await user.type(emailInput, "free@example.com");

      await waitFor(() =>
        expect(
          screen.queryByText(/already used by another person on your team/i),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();

      await user.click(screen.getByRole("button", { name: "Save" }));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ email: "free@example.com" }));
    });

    // Regression guard: a host embedding this panel with `hideActions` (the
    // staff slide-over) renders its own Save button and has no visibility
    // into internal field validation beyond `onDirtyChange` — without this
    // callback, that button stayed enabled while a conflict was showing, and
    // clicking it silently no-op'd instead of visibly disabling. Confirmed
    // live in the browser before this callback was added.
    it("notifies the host via onEmailConflictChange as the conflict appears and clears", async () => {
      checkEmployeeEmailConflictMock.mockResolvedValue({
        conflict: true,
        conflictingEmployeeId: "other-emp",
      });
      const onEmailConflictChange = vi.fn();
      renderPanel({ orgId: "org-1", onEmailConflictChange });

      expect(onEmailConflictChange).toHaveBeenCalledWith(false);

      // A single fireEvent.change (rather than user.type's per-keystroke
      // updates) keeps this deterministic regardless of how the 400ms
      // debounce lands relative to typing speed.
      const emailInput = screen.getByDisplayValue("alice@example.com");
      fireEvent.change(emailInput, { target: { value: "taken@example.com" } });
      await screen.findByText(/already used by another person on your team/i);

      expect(onEmailConflictChange).toHaveBeenLastCalledWith(true);

      checkEmployeeEmailConflictMock.mockResolvedValue({
        conflict: false,
        conflictingEmployeeId: null,
      });
      fireEvent.change(emailInput, { target: { value: "free@example.com" } });
      await waitFor(() =>
        expect(
          screen.queryByText(/already used by another person on your team/i),
        ).not.toBeInTheDocument(),
      );

      expect(onEmailConflictChange).toHaveBeenLastCalledWith(false);
    });
  });

  // -------------------------------------------------------------------------
  // Changing the email with a pending invitation present
  // -------------------------------------------------------------------------
  describe("Changing the email with a pending invitation present", () => {
    async function changeEmail(user: ReturnType<typeof userEvent.setup>) {
      const emailInput = screen.getByDisplayValue("alice@example.com");
      await user.clear(emailInput);
      await user.type(emailInput, "new.address@example.com");
    }

    it("shows a confirm dialog instead of saving immediately, and does not call onSave", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderPanel({ onSave, pendingInvitation, onSaveWithReinvite: vi.fn() });

      await changeEmail(user);
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(
        screen.getByText(/changing the email will revoke the pending invitation/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save & send" })).toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });

    it("Cancel closes the dialog without saving anything", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const onSaveWithReinvite = vi.fn();
      renderPanel({ onSave, pendingInvitation, onSaveWithReinvite });

      await changeEmail(user);
      await user.click(screen.getByRole("button", { name: "Save" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(
        screen.queryByText(/changing the email will revoke the pending invitation/i),
      ).not.toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
      expect(onSaveWithReinvite).not.toHaveBeenCalled();
      // The edit is not discarded — the admin can still adjust and retry.
      expect(screen.getByDisplayValue("new.address@example.com")).toBeInTheDocument();
    });

    it("Save & Send calls onSaveWithReinvite with the updated employee and the old invitation, not onSave", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      const onSaveWithReinvite = vi.fn().mockResolvedValue(undefined);
      renderPanel({ onSave, pendingInvitation, onSaveWithReinvite });

      await changeEmail(user);
      await user.click(screen.getByRole("button", { name: "Save" }));
      await user.click(screen.getByRole("button", { name: "Save & send" }));

      expect(onSaveWithReinvite).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new.address@example.com" }),
        pendingInvitation,
      );
      expect(onSave).not.toHaveBeenCalled();
    });

    it("does not gate the save when there is no pending invitation", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderPanel({ onSave, onSaveWithReinvite: vi.fn() });

      await changeEmail(user);
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new.address@example.com" }),
      );
      expect(
        screen.queryByText(/changing the email will revoke the pending invitation/i),
      ).not.toBeInTheDocument();
    });

    it("falls back to a plain save when onSaveWithReinvite is not provided", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderPanel({ onSave, pendingInvitation });

      await changeEmail(user);
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ email: "new.address@example.com" }),
      );
    });

    it("does not gate the save when the email is unchanged", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderPanel({ onSave, pendingInvitation, onSaveWithReinvite: vi.fn() });

      const firstNameInput = screen.getByDisplayValue("Alice");
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "Bob");
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ firstName: "Bob" }));
    });
  });

  // -------------------------------------------------------------------------
  // Discard
  // -------------------------------------------------------------------------
  describe("Discard", () => {
    it("clicking Close calls onCancel when no changes made", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      renderPanel({ onCancel });
      await user.click(screen.getByRole("button", { name: "Close" }));
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it("swaps Close for Discard after the form becomes dirty and restores the saved values", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      renderPanel({ onCancel });

      const firstNameInput = screen.getByDisplayValue("Alice");
      await user.clear(firstNameInput);
      await user.type(firstNameInput, "Bob");

      const cancelButton = screen.getByRole("button", { name: "Discard" });
      const saveButton = screen.getByRole("button", { name: "Save" });

      expect(cancelButton).toBeInTheDocument();
      expect(
        cancelButton.compareDocumentPosition(saveButton) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();

      await user.click(cancelButton);

      expect(onCancel).not.toHaveBeenCalled();
      expect(screen.getByDisplayValue("Alice")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Shared status actions
  // -------------------------------------------------------------------------
  describe("Shared status actions", () => {
    it("does not render a terminate button inside the edit form", () => {
      renderPanel();
      expect(screen.queryByRole("button", { name: "Terminate" })).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Property-based tests
  // -------------------------------------------------------------------------
  describe("Property-based tests", () => {
    // Feature: ui-ux-test-suite, Property 7: isModified correctness
    it("isModified is false when unmodified and true after mutating a field", () => {
      const validNameArb = fc
        .array(
          fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")),
          { minLength: 1, maxLength: 20 },
        )
        .map((chars) => chars.join(""));

      // Arbitrary Employee generator
      const arbEmployee = fc.record({
        id: fc.uuid(),
        firstName: validNameArb,
        lastName: validNameArb,
        employmentType: fc.constant("full_time" as const),
        status: fc.constant("active" as const),
        statusChangedAt: fc.constant(null as string | null),
        statusNote: fc.constant(""),
        certificationId: fc.oneof(
          fc.constant(null as number | null),
          fc.constantFrom(...DESIGNATIONS.map((d) => d.id)),
        ),
        roleIds: fc.array(fc.constantFrom(...ROLES.map((r) => r.id))),
        seniority: fc.integer({ min: 1, max: 999 }),
        focusAreaIds: fc
          .array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 5 })
          .map((ids) => [...new Set(ids)]),
        phone: fc.constant(""),
        email: fc.constant(""),
        contactNotes: fc.constant(""),
        userId: fc.constant(null as string | null),
        departmentIds: fc.constant([] as number[]),
        deptAdminIds: fc.constant([] as number[]),
        version: fc.constant(0),
      });

      fc.assert(
        fc.property(arbEmployee, (emp) => {
          // Build FocusArea objects from the employee's focusAreaIds list
          const empFocusAreas: FocusArea[] = emp.focusAreaIds.map((id, i) => ({
            id,
            orgId: "org-1",
            name: `Area ${id}`,
            sortOrder: i + 1,
            departmentId: null,
          }));

          const { unmount, container } = render(
            <EditEmployeePanel
              employee={emp}
              focusAreas={empFocusAreas}
              certifications={[...DESIGNATIONS]}
              roles={[...ROLES]}
              onSave={vi.fn()}
              onCancel={vi.fn()}
            />,
          );

          try {
            // Assert Save is disabled when unmodified
            const saveBtn = screen.getByRole("button", {
              name: "Save",
            });
            expect(saveBtn).toBeDisabled();

            // Mutate the name field by appending "X" (ensures it differs from original)
            // Use container.querySelector to find the name input (first text input in the form)
            // Use fireEvent.change for speed across 100 iterations
            const nameInput = container.querySelector<HTMLInputElement>(
              'input:not([type="number"])',
            )!;
            fireEvent.change(nameInput, {
              target: { value: emp.firstName + "X" },
            });

            // Assert Save is enabled after mutation
            expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
          } finally {
            unmount();
          }
        }),
        { numRuns: 25 },
      );
    }, 30000);
  });
});
