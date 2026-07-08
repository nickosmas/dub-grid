import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import EditEmployeePanel from "@/components/EditEmployeePanel";
import { Employee, FocusArea, NamedItem } from "@/types";
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

function renderPanel(
  overrides: Partial<{
    onSave: (e: Employee) => void;
    onCancel: () => void;
  }> = {},
) {
  const onSave = overrides.onSave ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();

  render(
    <EditEmployeePanel
      employee={employee}
      focusAreas={focusAreas}
      certifications={[...DESIGNATIONS]}
      roles={[...ROLES]}
      onSave={onSave}
      onCancel={onCancel}
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
  });

  // -------------------------------------------------------------------------
  // isModified / Save button state
  // -------------------------------------------------------------------------
  describe("isModified / Save button state", () => {
    it("Save button is disabled when form is unmodified", () => {
      renderPanel();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
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
