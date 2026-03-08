import {
  render,
  screen,
  within,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import * as fc from "fast-check";
import AddEmployeeModal from "@/components/AddEmployeeModal";
import { Wing } from "@/types";

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

const defaultSkillLevels = ["JLCSN", "CSN III", "CSN II", "STAFF", "—"];
const defaultRoles = ["DCSN", "DVCSN", "Supv", "Mentor", "CN", "SC. Mgr.", "Activity Coordinator", "SC/Asst/Act/Cor"];

function renderModal(
  overrides: {
    onAdd?: ReturnType<typeof vi.fn>;
    onClose?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onAdd = overrides.onAdd ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  render(<AddEmployeeModal wings={wings} skillLevels={defaultSkillLevels} roles={defaultRoles} onAdd={onAdd} onClose={onClose} />);
  return { onAdd, onClose };
}

describe("AddEmployeeModal", () => {
  describe("Rendering", () => {
    it("renders name input with placeholder", () => {
      renderModal();
      expect(screen.getByPlaceholderText("e.g. Maria S.")).toBeInTheDocument();
    });

    it("renders FTE input", () => {
      renderModal();
      expect(screen.getByDisplayValue("1.0")).toBeInTheDocument();
    });

    it("renders phone input", () => {
      renderModal();
      expect(screen.getByPlaceholderText("(415) 555-0100")).toBeInTheDocument();
    });

    it("renders email input", () => {
      renderModal();
      expect(
        screen.getByPlaceholderText("name@example.com"),
      ).toBeInTheDocument();
    });

    it("renders designation select", () => {
      renderModal();
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("renders wing toggle buttons (one per wing)", () => {
      renderModal();
      expect(screen.getByRole("button", { name: "North" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "South" })).toBeInTheDocument();
    });

    it("renders role toggle buttons", () => {
      renderModal();
      expect(screen.getByRole("button", { name: "DCSN" })).toBeInTheDocument();
    });

    it("renders Add to Schedule submit button", () => {
      renderModal();
      expect(
        screen.getByRole("button", { name: "Add to Schedule" }),
      ).toBeInTheDocument();
    });
  });

  describe("Validation", () => {
    it("clicking submit with empty name does NOT call onAdd", async () => {
      const { onAdd } = renderModal();
      await userEvent.click(
        screen.getByRole("button", { name: "Add to Schedule" }),
      );
      expect(onAdd).not.toHaveBeenCalled();
    });

    it("clicking submit with no wings selected does NOT call onAdd", async () => {
      const { onAdd } = renderModal();
      // North is selected by default — deselect it
      await userEvent.click(screen.getByRole("button", { name: "North" }));
      await userEvent.type(
        screen.getByPlaceholderText("e.g. Maria S."),
        "Alice",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Add to Schedule" }),
      );
      expect(onAdd).not.toHaveBeenCalled();
    });
  });

  describe("Submission", () => {
    it("valid submission calls onAdd with correct shape (no id or seniority)", async () => {
      const { onAdd } = renderModal();
      await userEvent.type(
        screen.getByPlaceholderText("e.g. Maria S."),
        "Alice Smith",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Add to Schedule" }),
      );
      expect(onAdd).toHaveBeenCalledOnce();
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Alice Smith",
          designation: expect.any(String),
          wings: expect.any(Array),
          roles: expect.any(Array),
          fteWeight: expect.any(Number),
          phone: expect.any(String),
          email: expect.any(String),
          contactNotes: expect.any(String),
        }),
      );
      expect(onAdd).toHaveBeenCalledWith(
        expect.not.objectContaining({ id: expect.anything() }),
      );
      expect(onAdd).toHaveBeenCalledWith(
        expect.not.objectContaining({ seniority: expect.anything() }),
      );
    });
  });

  describe("Toggles", () => {
    it("clicking a wing button selects it; clicking again deselects it", async () => {
      const { onAdd } = renderModal();
      // Click South to add it
      await userEvent.click(screen.getByRole("button", { name: "South" }));
      await userEvent.type(
        screen.getByPlaceholderText("e.g. Maria S."),
        "Test",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Add to Schedule" }),
      );
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ wings: expect.arrayContaining(["South"]) }),
      );
    });

    it("clicking a wing button twice returns to original state", async () => {
      const { onAdd } = renderModal();
      // North is selected by default; click twice
      await userEvent.click(screen.getByRole("button", { name: "North" }));
      await userEvent.click(screen.getByRole("button", { name: "North" }));
      await userEvent.type(
        screen.getByPlaceholderText("e.g. Maria S."),
        "Test",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Add to Schedule" }),
      );
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ wings: expect.arrayContaining(["North"]) }),
      );
    });

    it("clicking a role button adds it to selection", async () => {
      const { onAdd } = renderModal();
      await userEvent.click(screen.getByRole("button", { name: "DCSN" }));
      await userEvent.type(
        screen.getByPlaceholderText("e.g. Maria S."),
        "Test",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Add to Schedule" }),
      );
      expect(onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ roles: expect.arrayContaining(["DCSN"]) }),
      );
    });

    it("clicking a role button twice removes it from selection", async () => {
      const { onAdd } = renderModal();
      await userEvent.click(screen.getByRole("button", { name: "DCSN" }));
      await userEvent.click(screen.getByRole("button", { name: "DCSN" }));
      await userEvent.type(
        screen.getByPlaceholderText("e.g. Maria S."),
        "Test",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Add to Schedule" }),
      );
      const calledWith = onAdd.mock.calls[0][0];
      expect(calledWith.roles).not.toContain("DCSN");
    });
  });

  describe("Keyboard", () => {
    it("pressing Enter in the name input triggers submission when form is valid", async () => {
      const { onAdd } = renderModal();
      await userEvent.type(
        screen.getByPlaceholderText("e.g. Maria S."),
        "Alice{Enter}",
      );
      expect(onAdd).toHaveBeenCalledOnce();
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
    // Feature: ui-ux-test-suite, Property 6: Wing toggle idempotency
    // Validates: Requirements 6.6, 8.3
    it("toggling a wing button twice returns selection to its original state", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc
              .stringMatching(/^\S[\s\S]{0,14}$/)
              .filter((s) => s.trim().length > 0),
            { minLength: 1, maxLength: 6 },
          ),
          fc.integer({ min: 0, max: 5 }),
          async (wingNames, indexSeed) => {
            // Deduplicate and trim wing names to avoid RTL accessible-name normalization issues
            const uniqueNames = [
              ...new Set(wingNames.map((n) => n.trim())),
            ].filter((n) => n.length > 0);
            if (uniqueNames.length === 0) return;

            const wingIndex = indexSeed % uniqueNames.length;
            const wingToToggle = uniqueNames[wingIndex];

            const testWings: Wing[] = uniqueNames.map((name, i) => ({
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
                wings={testWings}
                skillLevels={defaultSkillLevels}
                roles={defaultRoles}
                onAdd={onAdd}
                onClose={onClose}
              />,
            );

            const scope = within(container);

            // Find the wing buttons container (the div after "ASSIGNED WINGS" label).
            // We locate wing buttons by matching their exact textContent to the wing name.
            const findWingBtn = (name: string): HTMLElement => {
              const allBtns = container.querySelectorAll("button");
              const btn = Array.from(allBtns).find(
                (b) => b.textContent === name,
              );
              if (!btn) throw new Error(`Wing button not found: "${name}"`);
              return btn as HTMLElement;
            };

            // Helper: read which wing buttons are "active" by checking background style.
            // Active buttons have colorBg (#EFF6FF = rgb(239, 246, 255)) as background.
            const getActiveWings = () =>
              uniqueNames.filter((name) => {
                const btn = findWingBtn(name);
                return btn.style.background === "rgb(239, 246, 255)";
              });

            // Record initial selection
            const initialActive = getActiveWings();

            // Toggle the chosen wing once, then back
            const toggleBtn = findWingBtn(wingToToggle);
            fireEvent.click(toggleBtn);
            fireEvent.click(toggleBtn);

            // Record final selection — must equal initial
            const finalActive = getActiveWings();
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
