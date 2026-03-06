import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ShiftEditPanel from "@/components/ShiftEditPanel";
import { EditModalState, ShiftType } from "@/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const modal: EditModalState = {
  empId: 1,
  empName: "Alice Smith",
  date: new Date(2024, 0, 15), // Jan 15, 2024
  empWings: ["North"],
};

const northShift: ShiftType = {
  id: 1,
  orgId: "org-1",
  label: "D",
  name: "Day",
  color: "#DBEAFE",
  border: "#93C5FD",
  text: "#1E40AF",
  sortOrder: 1,
  wingName: "North",
};

const southShift: ShiftType = {
  id: 2,
  orgId: "org-1",
  label: "E",
  name: "Eve",
  color: "#FEF3C7",
  border: "#FCD34D",
  text: "#92400E",
  sortOrder: 2,
  wingName: "South",
};

const generalShift: ShiftType = {
  id: 3,
  orgId: "org-1",
  label: "X",
  name: "Off",
  color: "#F1F5F9",
  border: "#CBD5E1",
  text: "#64748B",
  sortOrder: 3,
  isGeneral: true,
};

const shiftTypes = [northShift, southShift, generalShift];

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPanel(
  overrides: {
    currentShift?: string | null;
    onSelect?: ReturnType<typeof vi.fn>;
    onClose?: ReturnType<typeof vi.fn>;
    modalOverride?: EditModalState;
    shiftTypesOverride?: ShiftType[];
  } = {},
) {
  const onSelect = overrides.onSelect ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const result = render(
    <ShiftEditPanel
      modal={overrides.modalOverride ?? modal}
      currentShift={overrides.currentShift ?? null}
      shiftTypes={overrides.shiftTypesOverride ?? shiftTypes}
      onSelect={onSelect}
      onClose={onClose}
    />,
  );
  return { ...result, onSelect, onClose };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ShiftEditPanel", () => {
  describe("Rendering", () => {
    it("renders employee name from modal.empName", () => {
      renderPanel();
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    it("renders formatted date from modal.date (1/15)", () => {
      renderPanel();
      expect(screen.getByText("1/15")).toBeInTheDocument();
    });

    it("renders a close button (×)", () => {
      renderPanel();
      const closeButtons = screen.getAllByText("×");
      expect(closeButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Close interactions", () => {
    it("clicking close button calls onClose", () => {
      const { onClose } = renderPanel();
      const closeButton = screen.getByText("×");
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("clicking the backdrop overlay calls onClose", () => {
      const { container, onClose } = renderPanel();
      const backdrop = container.querySelector('div[style*="inset: 0"]');
      expect(backdrop).not.toBeNull();
      fireEvent.click(backdrop!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Wing tabs", () => {
    it("renders a wing tab for each unique wingName in shiftTypes", () => {
      renderPanel();
      expect(screen.getByText(/North/)).toBeInTheDocument();
      expect(screen.getByText(/South/)).toBeInTheDocument();
    });

    it("home wing tab (first in empWings) has '★' suffix", () => {
      renderPanel();
      expect(screen.getByText("North ★")).toBeInTheDocument();
    });

    it("clicking a wing tab filters shift buttons to that wing's shifts", () => {
      renderPanel();
      // Initially on North tab — "D" visible, "E" not visible
      expect(screen.getByText("D")).toBeInTheDocument();
      expect(screen.queryByText("E")).not.toBeInTheDocument();

      // Click South tab
      fireEvent.click(screen.getByText("South"));
      expect(screen.getByText("E")).toBeInTheDocument();
      expect(screen.queryByText("D")).not.toBeInTheDocument();
    });
  });

  describe("Shift buttons", () => {
    it("clicking a shift button calls onSelect with the shift's label", () => {
      const { onSelect } = renderPanel();
      fireEvent.click(screen.getByText("D"));
      expect(onSelect).toHaveBeenCalledWith("D");
    });

    it("active shift button has the shift's color as background style", () => {
      renderPanel({ currentShift: "D" });
      const labelDiv = screen.getByText("D");
      const button = labelDiv.closest("button");
      expect(button).not.toBeNull();
      // jsdom normalizes #DBEAFE → rgb(219, 234, 254)
      expect(button!.style.background).toBe("rgb(219, 234, 254)");
    });
  });

  describe("General section", () => {
    it("general shifts appear in a 'General' section regardless of active tab", () => {
      renderPanel();
      expect(screen.getByText("General")).toBeInTheDocument();
      expect(screen.getByText("X")).toBeInTheDocument();

      // Switch to South tab — general section still visible
      fireEvent.click(screen.getByText("South"));
      expect(screen.getByText("General")).toBeInTheDocument();
      expect(screen.getByText("X")).toBeInTheDocument();
    });
  });
});
