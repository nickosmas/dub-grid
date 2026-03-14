import {
  render,
  screen,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import AddEmployeeModal from "@/components/AddEmployeeModal";
import { FocusArea } from "@/types";

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

const defaultCertifications = [
  { id: 1, orgId: "org-1", name: "JLCSN", abbr: "JLCSN", sortOrder: 0 },
  { id: 2, orgId: "org-1", name: "CSN III", abbr: "CSN III", sortOrder: 1 },
  { id: 3, orgId: "org-1", name: "CSN II", abbr: "CSN II", sortOrder: 2 },
  { id: 4, orgId: "org-1", name: "STAFF", abbr: "STAFF", sortOrder: 3 },
  { id: 5, orgId: "org-1", name: "—", abbr: "—", sortOrder: 4 },
];
const defaultRoles = [
  { id: 1, orgId: "org-1", name: "DCSN", abbr: "DCSN", sortOrder: 0 },
  { id: 2, orgId: "org-1", name: "DVCSN", abbr: "DVCSN", sortOrder: 1 },
  { id: 3, orgId: "org-1", name: "Supv", abbr: "Supv", sortOrder: 2 },
  { id: 4, orgId: "org-1", name: "Mentor", abbr: "Mentor", sortOrder: 3 },
  { id: 5, orgId: "org-1", name: "CN", abbr: "CN", sortOrder: 4 },
  { id: 6, orgId: "org-1", name: "SC. Mgr.", abbr: "SC. Mgr.", sortOrder: 5 },
  { id: 7, orgId: "org-1", name: "Activity Coordinator", abbr: "Activity Coordinator", sortOrder: 6 },
  { id: 8, orgId: "org-1", name: "SC/Asst/Act/Cor", abbr: "SC/Asst/Act/Cor", sortOrder: 7 },
];

function renderModal(
  overrides: {
    onAdd?: ReturnType<typeof vi.fn>;
    onClose?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onAdd = overrides.onAdd ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  render(<AddEmployeeModal focusAreas={focusAreas} certifications={defaultCertifications} roles={defaultRoles} onAdd={onAdd} onClose={onClose} />);
  return { onAdd, onClose };
}

// The component renders 3 rows by default. Each row has a "Full name" input.
// Focus area buttons appear per-row. We scope row interactions by index.
function getRowInputs(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[placeholder="Full name"]'));
}

describe("AddEmployeeModal", () => {
  describe("Rendering", () => {
    it("renders name inputs with 'Full name' placeholder (one per default row)", () => {
      const { container } = render(
        <AddEmployeeModal focusAreas={focusAreas} certifications={defaultCertifications} roles={defaultRoles} onAdd={vi.fn()} onClose={vi.fn()} />,
      );
      const inputs = getRowInputs(container);
      // 3 rows by default
      expect(inputs.length).toBeGreaterThanOrEqual(1);
      expect(inputs[0]).toBeInTheDocument();
    });

    it("renders designation selects (one per default row)", () => {
      renderModal();
      const selects = screen.getAllByRole("combobox");
      expect(selects.length).toBeGreaterThanOrEqual(1);
    });

    it("renders focus area toggle buttons for each focus area (in at least the first row)", () => {
      const { container } = render(
        <AddEmployeeModal focusAreas={focusAreas} certifications={defaultCertifications} roles={defaultRoles} onAdd={vi.fn()} onClose={vi.fn()} />,
      );
      // At minimum one "North" and one "South" button should be present (per-row)
      const northBtns = Array.from(container.querySelectorAll("button")).filter(
        (b) => b.textContent === "North",
      );
      const southBtns = Array.from(container.querySelectorAll("button")).filter(
        (b) => b.textContent === "South",
      );
      expect(northBtns.length).toBeGreaterThanOrEqual(1);
      expect(southBtns.length).toBeGreaterThanOrEqual(1);
    });

    it("renders Add Staff Members submit button", () => {
      renderModal();
      // Button text is dynamic: "Add Staff Members" when no valid rows, or "Add N Staff Member(s)"
      const btn = screen.getByRole("button", { name: /Add.*Staff Member/i });
      expect(btn).toBeInTheDocument();
    });
  });

  describe("Validation", () => {
    it("clicking submit with all empty names does NOT call onAdd", async () => {
      const { onAdd } = renderModal();
      const submitBtn = screen.getByRole("button", { name: /Add.*Staff Member/i });
      await userEvent.click(submitBtn);
      expect(onAdd).not.toHaveBeenCalled();
    });

    it("clicking submit with name but no focus areas selected does NOT call onAdd", async () => {
      const { onAdd, container } = (() => {
        const onAdd = vi.fn();
        const onClose = vi.fn();
        const { container } = render(
          <AddEmployeeModal focusAreas={focusAreas} certifications={defaultCertifications} roles={defaultRoles} onAdd={onAdd} onClose={onClose} />,
        );
        return { onAdd, container };
      })();

      const inputs = getRowInputs(container);
      // Type a name in the first row
      await userEvent.type(inputs[0], "Alice");

      // Deselect North (selected by default) in the first row
      // Find the first row's North button
      const allNorthBtns = Array.from(container.querySelectorAll("button")).filter(
        (b) => b.textContent === "North",
      );
      await userEvent.click(allNorthBtns[0]);

      const submitBtn = screen.getByRole("button", { name: /Add.*Staff Member/i });
      await userEvent.click(submitBtn);
      expect(onAdd).not.toHaveBeenCalled();
    });
  });

  describe("Submission", () => {
    it("valid submission calls onAdd with correct shape (array of employees, no id or seniority)", async () => {
      const onAdd = vi.fn();
      const { container } = render(
        <AddEmployeeModal focusAreas={focusAreas} certifications={defaultCertifications} roles={defaultRoles} onAdd={onAdd} onClose={vi.fn()} />,
      );
      const inputs = getRowInputs(container);
      await userEvent.type(inputs[0], "Alice Smith");

      const submitBtn = screen.getByRole("button", { name: /Add.*Staff Member/i });
      await userEvent.click(submitBtn);

      expect(onAdd).toHaveBeenCalledOnce();
      // onAdd is called with an array
      const calledWithArg = onAdd.mock.calls[0][0];
      expect(Array.isArray(calledWithArg)).toBe(true);
      expect(calledWithArg.length).toBeGreaterThanOrEqual(1);
      const firstEmployee = calledWithArg[0];
      expect(firstEmployee).toEqual(
        expect.objectContaining({
          name: "Alice Smith",
          focusAreaIds: expect.any(Array),
          roleIds: expect.any(Array),
          phone: expect.any(String),
          email: expect.any(String),
          contactNotes: expect.any(String),
        }),
      );
      expect(firstEmployee).toHaveProperty("certificationId");
      expect(firstEmployee).not.toHaveProperty("id");
      expect(firstEmployee).not.toHaveProperty("seniority");
    });
  });

  describe("Toggles", () => {
    it("clicking a focus area button selects it; resulting submission includes that focus area", async () => {
      const onAdd = vi.fn();
      const { container } = render(
        <AddEmployeeModal focusAreas={focusAreas} certifications={defaultCertifications} roles={defaultRoles} onAdd={onAdd} onClose={vi.fn()} />,
      );
      const inputs = getRowInputs(container);
      await userEvent.type(inputs[0], "Test");

      // Click South in the first row to add it
      const allSouthBtns = Array.from(container.querySelectorAll("button")).filter(
        (b) => b.textContent === "South",
      );
      await userEvent.click(allSouthBtns[0]);

      const submitBtn = screen.getByRole("button", { name: /Add.*Staff Member/i });
      await userEvent.click(submitBtn);

      const calledWithArg = onAdd.mock.calls[0][0];
      expect(calledWithArg[0].focusAreaIds).toContain(2);
    });

    it("clicking a focus area button twice returns to original state", async () => {
      const onAdd = vi.fn();
      const { container } = render(
        <AddEmployeeModal focusAreas={focusAreas} certifications={defaultCertifications} roles={defaultRoles} onAdd={onAdd} onClose={vi.fn()} />,
      );
      const inputs = getRowInputs(container);
      await userEvent.type(inputs[0], "Test");

      // North is selected by default in first row; click twice
      const allNorthBtns = Array.from(container.querySelectorAll("button")).filter(
        (b) => b.textContent === "North",
      );
      await userEvent.click(allNorthBtns[0]);
      await userEvent.click(allNorthBtns[0]);

      const submitBtn = screen.getByRole("button", { name: /Add.*Staff Member/i });
      await userEvent.click(submitBtn);

      const calledWithArg = onAdd.mock.calls[0][0];
      expect(calledWithArg[0].focusAreaIds).toContain(1);
    });
  });

  describe("Close", () => {
    it("clicking the close button calls onClose", async () => {
      const { onClose } = renderModal();
      await userEvent.click(
        screen.getByRole("button", { name: "Close modal" }),
      );
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe("Property Tests", () => {
    // Feature: ui-ux-test-suite, Property 6: Focus area toggle idempotency
    // Validates: Requirements 6.6, 8.3
    it("toggling a focus area button twice returns selection to its original state", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc
              .stringMatching(/^\S[\s\S]{0,14}$/)
              .filter((s) => s.trim().length > 0),
            { minLength: 1, maxLength: 6 },
          ),
          fc.integer({ min: 0, max: 5 }),
          async (focusAreaNames, indexSeed) => {
            // Deduplicate and trim focus area names to avoid RTL accessible-name normalization issues
            const uniqueNames = [
              ...new Set(focusAreaNames.map((n) => n.trim())),
            ].filter((n) => n.length > 0);
            if (uniqueNames.length === 0) return;

            const focusAreaIndex = indexSeed % uniqueNames.length;
            const focusAreaToToggle = uniqueNames[focusAreaIndex];

            const testFocusAreas: FocusArea[] = uniqueNames.map((name, i) => ({
              id: i + 1,
              orgId: "org-1",
              name,
              colorBg: "#EFF6FF",
              colorText: "#1D4ED8",
              sortOrder: i + 1,
            }));

            const onAdd = vi.fn();
            const onClose = vi.fn();
            const { container, unmount } = render(
              <AddEmployeeModal
                focusAreas={testFocusAreas}
                certifications={defaultCertifications}
                roles={defaultRoles}
                onAdd={onAdd}
                onClose={onClose}
              />,
            );

            // Find the focus area buttons in the first row.
            // We locate focus area buttons by matching their exact textContent to the focus area name.
            const findFocusAreaBtnInFirstRow = (name: string): HTMLElement => {
              const allBtns = container.querySelectorAll("button");
              const btn = Array.from(allBtns).find(
                (b) => b.textContent === name,
              );
              if (!btn) throw new Error(`Focus area button not found: "${name}"`);
              return btn as HTMLElement;
            };

            // Helper: read which focus area buttons are "active" in the first row by checking background style.
            // Active buttons have colorBg (#EFF6FF = rgb(239, 246, 255)) as background.
            const getActiveFocusAreasInFirstRow = () =>
              uniqueNames.filter((name) => {
                const btn = findFocusAreaBtnInFirstRow(name);
                return btn.style.background === "rgb(239, 246, 255)";
              });

            // Record initial selection
            const initialActive = getActiveFocusAreasInFirstRow();

            // Toggle the chosen focus area once, then back
            const toggleBtn = findFocusAreaBtnInFirstRow(focusAreaToToggle);
            fireEvent.click(toggleBtn);
            fireEvent.click(toggleBtn);

            // Record final selection — must equal initial
            const finalActive = getActiveFocusAreasInFirstRow();
            expect(finalActive.slice().sort()).toEqual(
              initialActive.slice().sort(),
            );

            unmount();
            cleanup();
          },
        ),
        { numRuns: 100 },
      );
    }, 15000);
  });
});
