import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import EditEmployeePanel from "@/components/EditEmployeePanel";
import { Employee, Wing } from "@/types";
import { DESIGNATIONS, ROLES } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const wings: Wing[] = [
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
  id: 42,
  name: "Alice Smith",
  designation: "STAFF",
  roles: [],
  fteWeight: 1.0,
  seniority: 3,
  wings: ["North"],
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
    onDelete: (id: number) => void;
    onCancel: () => void;
  }> = {},
) {
  const onSave = overrides.onSave ?? vi.fn();
  const onDelete = overrides.onDelete ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();

  render(
    <EditEmployeePanel
      employee={employee}
      wings={wings}
      onSave={onSave}
      onDelete={onDelete}
      onCancel={onCancel}
    />,
  );

  return { onSave, onDelete, onCancel };
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

    it("FTE input is pre-populated with employee.fteWeight", () => {
      renderPanel();
      const fteInput = screen.getByDisplayValue("1");
      expect(fteInput).toBeInTheDocument();
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
      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "CSN II");
      expect(
        screen.getByRole("button", { name: "Save Changes" }),
      ).not.toBeDisabled();
    });

    it("Save Changes is disabled when name is cleared even if other fields are modified", async () => {
      const user = userEvent.setup();
      renderPanel();
      // First modify designation so isModified would be true
      const select = screen.getByRole("combobox");
      await user.selectOptions(select, "CSN II");
      // Then clear the name
      const nameInput = screen.getByDisplayValue("Alice Smith");
      await user.clear(nameInput);
      expect(
        screen.getByRole("button", { name: "Save Changes" }),
      ).toBeDisabled();
    });

    it("Save Changes is disabled when all wings are deselected", async () => {
      const user = userEvent.setup();
      renderPanel();
      // Modify name so isModified is true
      const nameInput = screen.getByDisplayValue("Alice Smith");
      await user.clear(nameInput);
      await user.type(nameInput, "Bob Jones");
      // Deselect the only assigned wing (North)
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
          id: 42,
          name: "Bob Jones",
          designation: "STAFF",
          wings: ["North"],
          fteWeight: 1.0,
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
    it("clicking Cancel calls onCancel", async () => {
      const user = userEvent.setup();
      const onCancel = vi.fn();
      renderPanel({ onCancel });
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Delete flow
  // -------------------------------------------------------------------------
  describe("Delete flow", () => {
    it("clicking Delete Employee shows confirmation text with employee name and 'This cannot be undone.'", async () => {
      const user = userEvent.setup();
      renderPanel();
      await user.click(screen.getByRole("button", { name: "Delete Employee" }));
      expect(
        screen.getByText(/Delete Alice Smith\? This cannot be undone\./),
      ).toBeInTheDocument();
    });

    it("clicking Delete in confirmation calls onDelete with employee.id", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      renderPanel({ onDelete });
      await user.click(screen.getByRole("button", { name: "Delete Employee" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(onDelete).toHaveBeenCalledOnce();
      expect(onDelete).toHaveBeenCalledWith(42);
    });

    it("clicking Cancel in confirmation returns to normal view without calling onDelete", async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      renderPanel({ onDelete });
      await user.click(screen.getByRole("button", { name: "Delete Employee" }));
      // Cancel in the confirmation UI
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onDelete).not.toHaveBeenCalled();
      // Normal view should be restored
      expect(
        screen.getByRole("button", { name: "Delete Employee" }),
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
      const arbWingName = fc.string({ minLength: 1, maxLength: 20 });
      const arbEmployee = fc.record({
        id: fc.integer({ min: 1, max: 9999 }),
        name: fc.string({ minLength: 1, maxLength: 40 }),
        designation: fc.constantFrom(...DESIGNATIONS),
        roles: fc.array(fc.constantFrom(...ROLES)),
        fteWeight: fc.float({
          min: Math.fround(0.1),
          max: Math.fround(1.0),
          noNaN: true,
        }),
        seniority: fc.integer({ min: 1, max: 999 }),
        wings: fc.array(arbWingName, { minLength: 1, maxLength: 5 }),
        phone: fc.string({ maxLength: 20 }),
        email: fc.string({ maxLength: 30 }),
        contactNotes: fc.string({ maxLength: 50 }),
      });

      fc.assert(
        fc.property(arbEmployee, (emp) => {
          // Build Wing objects from the employee's wings list
          const empWings: Wing[] = emp.wings.map((name, i) => ({
            id: i + 1,
            orgId: "org-1",
            name,
            colorBg: "#EFF6FF",
            colorText: "#1D4ED8",
            sortOrder: i + 1,
          }));

          const { unmount, container } = render(
            <EditEmployeePanel
              employee={emp}
              wings={empWings}
              onSave={vi.fn()}
              onDelete={vi.fn()}
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
