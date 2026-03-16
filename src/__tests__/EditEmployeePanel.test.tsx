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
  { id: 7, orgId: "org-1", name: "Activity Coordinator", abbr: "Activity Coordinator", sortOrder: 6 },
  { id: 8, orgId: "org-1", name: "SC/Asst/Act/Cor", abbr: "SC/Asst/Act/Cor", sortOrder: 7 },
];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const focusAreas: FocusArea[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "North",
    colorBg: "#EFF6FF",
    colorText: "#1D4ED8",
    sortOrder: 1,
  },
  {
    id: 2,
    orgId: "org-1",
    name: "South",
    colorBg: "#F0FDF4",
    colorText: "#166534",
    sortOrder: 2,
  },
];

const employee: Employee = {
  id: "emp-42",
  name: "Alice Smith",
  status: "active",
  statusChangedAt: null,
  statusNote: "",
  certificationId: 4,
  roleIds: [],
  seniority: 3,
  focusAreaIds: [1],
  phone: "555-1234",
  email: "alice@example.com",
  contactNotes: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPanel(
  overrides: Partial<{
    onSave: (e: Employee) => void;
    onDelete: (id: string) => void;
    onCancel: () => void;
  }> = {},
) {
  const onSave = overrides.onSave ?? vi.fn();
  const onDelete = overrides.onDelete ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  const onBench = vi.fn();
  const onActivate = vi.fn();

  render(
    <EditEmployeePanel
      employee={employee}
      focusAreas={focusAreas}
      certifications={[...DESIGNATIONS]}
      roles={[...ROLES]}
      onSave={onSave}
      onDelete={onDelete}
      onBench={onBench}
      onActivate={onActivate}
      onCancel={onCancel}
    />,
  );

  return { onSave, onDelete, onBench, onActivate, onCancel };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EditEmployeePanel", () => {
  // -------------------------------------------------------------------------
  // Pre-population
  // -------------------------------------------------------------------------
  describe("Pre-population", () => {
    it("name input is pre-populated with employee.name", () => {
      renderPanel();
      const nameInput = screen.getByDisplayValue("Alice Smith");
      expect(nameInput).toBeInTheDocument();
    });

    it("phone input is pre-populated with employee.phone", () => {
      renderPanel();
      const phoneInput = screen.getByDisplayValue("555-1234");
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
    it("Save Changes button is disabled when form is unmodified", () => {
      renderPanel();
      expect(
        screen.getByRole("button", { name: "Save Changes" }),
      ).toBeDisabled();
    });

    it("Save Changes becomes enabled after changing the name field", async () => {
      const user = userEvent.setup();
      renderPanel();
      const nameInput = screen.getByDisplayValue("Alice Smith");
      await user.clear(nameInput);
      await user.type(nameInput, "Bob Jones");
      expect(
        screen.getByRole("button", { name: "Save Changes" }),
      ).not.toBeDisabled();
    });

    it("Save Changes becomes enabled after changing the designation", async () => {
      const user = userEvent.setup();
      renderPanel();
      // Certification is a CustomSelect — open dropdown and pick a different option
      await user.click(screen.getByRole("button", { name: /STAFF/ }));
      await user.click(screen.getByRole("button", { name: "CSN II" }));
      expect(
        screen.getByRole("button", { name: "Save Changes" }),
      ).not.toBeDisabled();
    });

    it("Save Changes is disabled when name is cleared even if other fields are modified", async () => {
      const user = userEvent.setup();
      renderPanel();
      // First modify designation so isModified would be true
      await user.click(screen.getByRole("button", { name: /STAFF/ }));
      await user.click(screen.getByRole("button", { name: "CSN II" }));
      // Then clear the name
      const nameInput = screen.getByDisplayValue("Alice Smith");
      await user.clear(nameInput);
      expect(
        screen.getByRole("button", { name: "Save Changes" }),
      ).toBeDisabled();
    });

    it("Save Changes is disabled when all focus areas are deselected", async () => {
      const user = userEvent.setup();
      renderPanel();
      // Modify name so isModified is true
      const nameInput = screen.getByDisplayValue("Alice Smith");
      await user.clear(nameInput);
      await user.type(nameInput, "Bob Jones");
      // Deselect the only assigned focus area (North)
      await user.click(screen.getByRole("button", { name: "North" }));
      expect(
        screen.getByRole("button", { name: "Save Changes" }),
      ).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Save action
  // -------------------------------------------------------------------------
  describe("Save action", () => {
    it("clicking Save Changes on a valid modified form calls onSave with the updated employee", async () => {
      const user = userEvent.setup();
      const onSave = vi.fn();
      renderPanel({ onSave });

      const nameInput = screen.getByDisplayValue("Alice Smith");
      await user.clear(nameInput);
      await user.type(nameInput, "Bob Jones");

      await user.click(screen.getByRole("button", { name: "Save Changes" }));

      expect(onSave).toHaveBeenCalledOnce();
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "emp-42",
          name: "Bob Jones",
          certificationId: 4,
          focusAreaIds: [1],
          phone: "555-1234",
          email: "alice@example.com",
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------
  describe("Cancel", () => {
    it("clicking Discard Changes calls onCancel", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      renderPanel({ onCancel });
      await user.click(screen.getByRole("button", { name: "Discard Changes" }));
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Delete flow
  // -------------------------------------------------------------------------
  describe("Terminate flow", () => {
    it("clicking Terminate shows confirmation text with employee name", async () => {
      const user = userEvent.setup();
      renderPanel();
      await user.click(screen.getByRole("button", { name: "Terminate" }));
      expect(
        screen.getByText(/Terminate Alice Smith\?/),
      ).toBeInTheDocument();
    });

    it("clicking Confirm Termination in confirmation calls onDelete with employee.id", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      renderPanel({ onDelete });
      await user.click(screen.getByRole("button", { name: "Terminate" }));
      await user.click(screen.getByRole("button", { name: "Confirm Termination" }));
      expect(onDelete).toHaveBeenCalledOnce();
      expect(onDelete).toHaveBeenCalledWith("emp-42");
    });

    it("clicking Cancel in confirmation returns to normal view without calling onDelete", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      renderPanel({ onDelete });
      await user.click(screen.getByRole("button", { name: "Terminate" }));
      // Cancel in the confirmation UI
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onDelete).not.toHaveBeenCalled();
      // Normal view should be restored
      expect(
        screen.getByRole("button", { name: "Terminate" }),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Property-based tests
  // -------------------------------------------------------------------------
  describe("Property-based tests", () => {
    // Feature: ui-ux-test-suite, Property 7: isModified correctness
    it("isModified is false when unmodified and true after mutating a field", () => {
      // Arbitrary Employee generator
      const arbEmployee = fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 40 }),
        status: fc.constant("active" as const),
        statusChangedAt: fc.constant(null as string | null),
        statusNote: fc.constant(""),
        certificationId: fc.oneof(fc.constant(null as number | null), fc.constantFrom(...DESIGNATIONS.map((d) => d.id))),
        roleIds: fc.array(fc.constantFrom(...ROLES.map((r) => r.id))),
        seniority: fc.integer({ min: 1, max: 999 }),
        focusAreaIds: fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 5 }).map(ids => [...new Set(ids)]),
        phone: fc.string({ maxLength: 20 }),
        email: fc.string({ maxLength: 30 }),
        contactNotes: fc.string({ maxLength: 50 }),
      });

      fc.assert(
        fc.property(arbEmployee, (emp) => {
          // Build FocusArea objects from the employee's focusAreaIds list
          const empFocusAreas: FocusArea[] = emp.focusAreaIds.map((id, i) => ({
            id,
            orgId: "org-1",
            name: `Area ${id}`,
            colorBg: "#EFF6FF",
            colorText: "#1D4ED8",
            sortOrder: i + 1,
          }));

          const { unmount, container } = render(
            <EditEmployeePanel
              employee={emp}
              focusAreas={empFocusAreas}
              certifications={[...DESIGNATIONS]}
              roles={[...ROLES]}
              onSave={vi.fn()}
              onDelete={vi.fn()}
              onBench={vi.fn()}
              onActivate={vi.fn()}
              onCancel={vi.fn()}
            />,
          );

          try {
            // Assert Save is disabled when unmodified
            const saveBtn = screen.getByRole("button", {
              name: "Save Changes",
            });
            expect(saveBtn).toBeDisabled();

            // Mutate the name field by appending "X" (ensures it differs from original)
            // Use container.querySelector to find the name input (first text input in the form)
            // Use fireEvent.change for speed across 100 iterations
            const nameInput = container.querySelector<HTMLInputElement>(
              'input:not([type="number"])',
            )!;
            fireEvent.change(nameInput, {
              target: { value: emp.name + "X" },
            });

            // Assert Save is enabled after mutation
            expect(
              screen.getByRole("button", { name: "Save Changes" }),
            ).not.toBeDisabled();
          } finally {
            unmount();
          }
        }),
        { numRuns: 100 },
      );
    }, 30000);
  });
});
