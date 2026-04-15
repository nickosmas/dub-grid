import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import ShiftEditPanel from "@/components/ShiftEditPanel";
import { supabase } from "@/lib/supabase";
import { AbsenceType, EditModalState, FocusArea, NamedItem, ShiftCode } from "@/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const modal: EditModalState = {
  empId: "emp-1",
  empName: "Alice Smith",
  date: new Date(2024, 0, 15), // Jan 15, 2024
  empFocusAreaIds: [1, 2],
  empCertificationId: null,
};

const northShift: ShiftCode = {
  id: 1,
  orgId: "org-1",
  label: "D",
  name: "Day",
  color: "#DBEAFE",
  border: "#93C5FD",
  text: "#1E40AF",
  sortOrder: 1,
  focusAreaId: 1,
};

const southShift: ShiftCode = {
  id: 2,
  orgId: "org-1",
  label: "E",
  name: "Eve",
  color: "#FEF3C7",
  border: "#FCD34D",
  text: "#92400E",
  sortOrder: 2,
  focusAreaId: 2,
};

const generalShift: ShiftCode = {
  id: 3,
  orgId: "org-1",
  label: "X",
  name: "Off",
  color: "#F1F5F9",
  border: "#CBD5E1",
  text:"#475569",
  sortOrder: 3,
  isGeneral: true,
};

const shiftCodes = [northShift, southShift, generalShift];

const absenceTypes: AbsenceType[] = [
  {
    id: 7,
    orgId: "org-1",
    label: "VAC",
    name: "Vacation",
    color: "#DCFCE7",
    border: "#86EFAC",
    text: "#166534",
    sortOrder: 1,
  },
];

const certifications: NamedItem[] = [
  { id: 1, name: "JLCSN", orgId: "org-1", abbr: "JLCSN", sortOrder: 0 },
  { id: 2, name: "CSN II", orgId: "org-1", abbr: "CSN2", sortOrder: 1 },
];

const focusAreas: FocusArea[] = [
  { id: 1, orgId: "org-1", name: "North", sortOrder: 0, departmentId: null },
  { id: 2, orgId: "org-1", name: "South", sortOrder: 1, departmentId: null },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPanel(
  overrides: {
    currentShift?: string | null;
    onSelect?: ReturnType<typeof vi.fn>;
    onClose?: ReturnType<typeof vi.fn>;
    modalOverride?: EditModalState;
    shiftCodesOverride?: ShiftCode[];
    certificationsOverride?: NamedItem[];
  } = {},
) {
  const onSelect = overrides.onSelect ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const result = render(
    <ShiftEditPanel
      modal={overrides.modalOverride ?? modal}
      currentShift={overrides.currentShift ?? null}
      shiftCodes={overrides.shiftCodesOverride ?? shiftCodes}
      onSelect={onSelect}
      onClose={onClose}
      focusAreas={focusAreas}
      certifications={overrides.certificationsOverride ?? certifications}
    />,
  );
  return { ...result, onSelect, onClose };
}

function createSupabaseBuilder() {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn().mockResolvedValue({ data: [], error: null }),
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.gte.mockReturnValue(builder);

  return builder as unknown as ReturnType<typeof supabase.from>;
}

function RepeatFlowPanel() {
  const [currentShift, setCurrentShift] = useState<string | null>("D");
  const [currentShiftCodeIds, setCurrentShiftCodeIds] = useState<number[]>([1]);

  return (
    <ShiftEditPanel
      modal={modal}
      currentShift={currentShift}
      currentShiftCodeIds={currentShiftCodeIds}
      shiftCodes={shiftCodes}
      focusAreas={focusAreas}
      certifications={certifications}
      allowShiftEdits
      empId={modal.empId}
      onSelect={(label, shiftCodeIds) => {
        setCurrentShift(label === "OFF" ? null : label);
        setCurrentShiftCodeIds(shiftCodeIds);
      }}
      onClose={vi.fn()}
      onRepeatConfirm={vi.fn()}
    />
  );
}

function RepeatAbsenceFlowPanel() {
  const [currentShift, setCurrentShift] = useState<string | null>("Vacation");
  const [currentAbsenceTypeId, setCurrentAbsenceTypeId] = useState<number | null>(7);

  return (
    <ShiftEditPanel
      modal={modal}
      currentShift={currentShift}
      currentShiftCodeIds={[]}
      currentAbsenceTypeId={currentAbsenceTypeId}
      shiftCodes={shiftCodes}
      absenceTypes={absenceTypes}
      focusAreas={focusAreas}
      certifications={certifications}
      allowShiftEdits
      empId={modal.empId}
      onSelect={() => {}}
      onAbsenceSelect={(absenceType) => {
        setCurrentShift(absenceType.label);
        setCurrentAbsenceTypeId(absenceType.id);
      }}
      onClose={vi.fn()}
      onRepeatConfirm={vi.fn()}
    />
  );
}

function ConfirmDraftHarness({
  onConfirmDraft,
  isStale = false,
}: {
  onConfirmDraft: ReturnType<typeof vi.fn>;
  isStale?: boolean;
}) {
  const [currentShift, setCurrentShift] = useState<string | null>(null);
  const [currentShiftCodeIds, setCurrentShiftCodeIds] = useState<number[]>([]);

  return (
    <ShiftEditPanel
      modal={modal}
      currentShift={currentShift}
      currentShiftCodeIds={currentShiftCodeIds}
      shiftCodes={shiftCodes}
      focusAreas={focusAreas}
      certifications={certifications}
      allowShiftEdits
      onSelect={(label, shiftCodeIds) => {
        setCurrentShift(label === "OFF" ? null : label);
        setCurrentShiftCodeIds(shiftCodeIds);
      }}
      onClose={vi.fn()}
      onConfirmDraft={onConfirmDraft}
      isStale={isStale}
    />
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ShiftEditPanel", () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockImplementation(() => createSupabaseBuilder());
  });

  describe("Rendering", () => {
    it("renders employee name from modal.empName", () => {
      renderPanel();
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    });

    it("renders formatted date from modal.date (1/15)", () => {
      renderPanel();
      // The date "1/15" is a text node inside a <div> that also contains " · " and
      // the designation span — use getAllByText with a loose matcher and confirm at
      // least one match exists.
      const matches = screen.getAllByText((content, element) => {
        // Match the innermost element whose own text content starts with "1/15"
        if (!element) return false;
        const direct = Array.from(element.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? "")
          .join("");
        return direct.trimStart().startsWith("1/15");
      });
      expect(matches.length).toBeGreaterThanOrEqual(1);
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
      // The backdrop uses className="dg-panel-overlay" with no inline inset style
      const backdrop = container.querySelector('.dg-panel-overlay');
      expect(backdrop).not.toBeNull();
      fireEvent.click(backdrop!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Focus area tabs", () => {
    it("renders all focus area tabs including home and other areas", () => {
      renderPanel();
      // Both North (home) and South (other) visible as tabs
      // North appears as both tab and section heading
      expect(screen.getAllByText(/North/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("South")).toBeInTheDocument();
    });

    it("home focus area is selected by default with its shifts showing", () => {
      renderPanel();
      // North appears as tab + section heading
      expect(screen.getAllByText("North").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("D")).toBeInTheDocument();
    });

    it("clicking another focus area tab shows that area's shifts", () => {
      renderPanel();
      // Initially on North — "D" visible, "E" not visible
      expect(screen.getByText("D")).toBeInTheDocument();
      expect(screen.queryByText("E")).not.toBeInTheDocument();

      // Click South tab (the tab button, not the section heading)
      const southButtons = screen.getAllByText("South");
      fireEvent.click(southButtons[0]);
      expect(screen.getByText("E")).toBeInTheDocument();
    });
  });

  describe("Shift buttons", () => {
    it("clicking a shift button calls onSelect with the shift's label", () => {
      const { onSelect } = renderPanel();
      fireEvent.click(screen.getByText("D"));
      // Component calls onSelect(label, shiftCodeIds, seriesScope | undefined)
      expect(onSelect).toHaveBeenCalledWith("D", [1], undefined);
    });

    it("active shift button has the shift's color as background style", () => {
      renderPanel({ currentShift: "D" });
      // When currentShift is set the panel shows a detail-mode pill <div>
      // (not a picker button), so locate the closest block element with a background.
      const labelSpan = screen.getByText("D");
      // The pill wrapping div is the nearest ancestor with an inline background
      const pill = labelSpan.closest('div[style*="background"]');
      expect(pill).not.toBeNull();
      // jsdom normalizes #DBEAFE → rgb(219, 234, 254)
      expect((pill as HTMLElement).style.background).toBe("rgb(219, 234, 254)");
    });
  });

  describe("General section", () => {
    it("general shifts appear in a 'General' section", () => {
      renderPanel();
      expect(screen.getByText("General")).toBeInTheDocument();
      expect(screen.getByText("X")).toBeInTheDocument();
    });
  });

  describe("Qualification filtering", () => {
    const restrictedShift: ShiftCode = {
      id: 4,
      orgId: "org-1",
      label: "JL",
      name: "JLCSN Day",
      color: "#EDE9FE",
      border: "#A78BFA",
      text: "#6D28D9",
      sortOrder: 4,
      focusAreaId: 1,
      requiredCertificationIds: [1],
    };

    it("disqualified shift button is not rendered when employee lacks the required designation", () => {
      const modalWithDesig: EditModalState = { ...modal, empCertificationId: null };
      render(
        <ShiftEditPanel
          modal={modalWithDesig}
          currentShift={null}
          shiftCodes={[restrictedShift, generalShift]}
          focusAreas={focusAreas}
          certifications={certifications}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          allowShiftEdits
        />
      );
      expect(screen.queryByText("JL")).not.toBeInTheDocument();
    });

    it("qualified shift button is enabled when employee has the required designation", () => {
      const modalWithDesig: EditModalState = { ...modal, empCertificationId: 1 };
      render(
        <ShiftEditPanel
          modal={modalWithDesig}
          currentShift={null}
          shiftCodes={[restrictedShift, generalShift]}
          focusAreas={focusAreas}
          certifications={certifications}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          allowShiftEdits
        />
      );
      const button = screen.getByText("JL").closest("button");
      expect(button).not.toBeDisabled();
    });

    it("unrestricted shift (empty requiredCertificationIds) is always enabled", () => {
      const modalWithDesig: EditModalState = { ...modal, empCertificationId: null };
      render(
        <ShiftEditPanel
          modal={modalWithDesig}
          currentShift={null}
          shiftCodes={[northShift, generalShift]}
          focusAreas={focusAreas}
          certifications={certifications}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          allowShiftEdits
        />
      );
      const button = screen.getByText("D").closest("button");
      expect(button).not.toBeDisabled();
    });

    it("lock icon 🔒 does not appear as shifts are hidden", () => {
      const modalWithDesig: EditModalState = { ...modal, empCertificationId: null };
      render(
        <ShiftEditPanel
          modal={modalWithDesig}
          currentShift={null}
          shiftCodes={[restrictedShift]}
          certifications={certifications}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          allowShiftEdits
        />
      );
      expect(screen.queryByText("🔒")).not.toBeInTheDocument();
    });
  });

  describe("Repeat mode", () => {
    it("shows repeat mode only before local edits and keeps the sticky footer hidden while backing out", async () => {
      const user = userEvent.setup();

      render(<RepeatFlowPanel />);

      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Make this a repeating shift" }));

      const createRepeatingShiftButton = screen.getByRole("button", { name: "Create Repeating Shift" });
      expect(createRepeatingShiftButton).toBeInTheDocument();
      expect(createRepeatingShiftButton).toBeEnabled();
      const backButtons = screen.getAllByRole("button", { name: "Back" });
      expect(backButtons).toHaveLength(2);
      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Monday" }));
      expect(screen.getByRole("button", { name: "Create Repeating Shift" })).toBeDisabled();

      await user.click(backButtons[1]);

      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Make this a repeating shift" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Create Repeating Shift" })).not.toBeInTheDocument();
    });

    it("shows the absence repeat flow for off days", async () => {
      const user = userEvent.setup();

      render(<RepeatAbsenceFlowPanel />);

      await user.click(screen.getByRole("button", { name: "Make this repeating" }));

      expect(screen.getByText("Repeating Off Day")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Create Repeating Off Day" }),
      ).toBeInTheDocument();
    });
  });

  describe("Confirm-save flow", () => {
    it("undoes a new local shift and allows recreating it before confirming once", async () => {
      const user = userEvent.setup();
      const onConfirmDraft = vi.fn();

      render(<ConfirmDraftHarness onConfirmDraft={onConfirmDraft} />);

      await user.click(screen.getByText("D"));
      expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Undo" }));
      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
      expect(onConfirmDraft).not.toHaveBeenCalled();

      await user.click(screen.getByText("D"));
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      expect(onConfirmDraft).toHaveBeenCalledTimes(1);
      expect(onConfirmDraft).toHaveBeenCalledWith(undefined);
    });

    it("shows a stale warning and disables confirm when the cell changed externally", async () => {
      const user = userEvent.setup();
      const onConfirmDraft = vi.fn();

      render(<ConfirmDraftHarness onConfirmDraft={onConfirmDraft} isStale />);

      await user.click(screen.getByText("D"));

      expect(
        screen.getByText(
          "This shift changed in another tab or by another editor. Close and reopen it before saving.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    });
  });
});
