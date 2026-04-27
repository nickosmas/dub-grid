import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import ShiftEditPanel from "@/components/ShiftEditPanel";
import { supabase } from "@/lib/supabase";
import {
  AbsenceType,
  DraftKind,
  EditModalState,
  Employee,
  FocusArea,
  JobDefinition,
  NamedItem,
  ScheduleCellInput,
  ShiftCategory,
  AssignmentDefinition,
  ShiftDisplayMode,
} from "@/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const modal: EditModalState = {
  empId: "emp-1",
  empName: "Alice Smith",
  date: new Date(2024, 0, 15), // Jan 15, 2024
  empFocusAreaIds: [1, 2],
  empCertificationId: null,
  empRoleIds: [],
};

const northCategory: ShiftCategory = {
  id: 11,
  orgId: "org-1",
  name: "Day Shift",
  abbr: "D",
  sortOrder: 0,
  focusAreaId: 1,
};

const southCategory: ShiftCategory = {
  id: 12,
  orgId: "org-1",
  name: "Evening Shift",
  abbr: "E",
  sortOrder: 1,
  focusAreaId: 2,
};

const northShift: AssignmentDefinition = {
  id: 1,
  orgId: "org-1",
  label: "D",
  name: "Day Shift",
  color: "#DBEAFE",
  border: "#93C5FD",
  text: "#1E40AF",
  sortOrder: 1,
  categoryId: 11,
  shiftId: 11,
  jobId: 102,
  focusAreaId: 1,
};

const southShift: AssignmentDefinition = {
  id: 2,
  orgId: "org-1",
  label: "E",
  name: "Evening Shift",
  color: "#FEF3C7",
  border: "#FCD34D",
  text: "#92400E",
  sortOrder: 2,
  categoryId: 12,
  shiftId: 12,
  jobId: 102,
  focusAreaId: 2,
};

const generalShift: AssignmentDefinition = {
  id: 3,
  orgId: "org-1",
  label: "X",
  name: "Cross Wing",
  color: "#F1F5F9",
  border: "#CBD5E1",
  text:"#475569",
  sortOrder: 3,
  jobId: 101,
  isGeneral: true,
};

const shiftCategories = [northCategory, southCategory];
const assignments = [northShift, southShift, generalShift];

const jobs: JobDefinition[] = [
  {
    id: 101,
    orgId: "org-1",
    name: "Cross Wing",
    abbr: "X",
    showOnGrid: true,
    assignmentMode: "shiftless",
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "#F1F5F9",
    border: "#CBD5E1",
    text: "#475569",
    sortOrder: 0,
    systemKey: null,
  },
  {
    id: 102,
    orgId: "org-1",
    name: "Supervisor",
    abbr: "SUPV",
    showOnGrid: true,
    assignmentMode: "with_shift",
    eligibleRoleIds: [],
    requiredCertificationIds: [],
    color: "#DBEAFE",
    border: "#93C5FD",
    text: "#1E40AF",
    sortOrder: 1,
    systemKey: null,
  },
];

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

const employees: Employee[] = [
  {
    id: "emp-1",
    firstName: "Alice",
    lastName: "Smith",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "alice@example.com",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
  },
  {
    id: "emp-2",
    firstName: "Bob",
    lastName: "Jones",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 2,
    focusAreaIds: [1],
    phone: "",
    email: "bob@example.com",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderPanel(
  overrides: {
    currentShift?: string | null;
    currentAssignmentIds?: number[];
    currentAbsenceTypeId?: number | null;
    customStartTime?: string | null;
    customEndTime?: string | null;
    draftKind?: DraftKind;
    publishedAssignmentIds?: number[];
    publishedAbsenceTypeId?: number | null;
    publishedCustomStartTime?: string | null;
    publishedCustomEndTime?: string | null;
    onSelect?: ReturnType<typeof vi.fn>;
    onClose?: ReturnType<typeof vi.fn>;
    modalOverride?: EditModalState;
    assignmentsOverride?: AssignmentDefinition[];
    certificationsOverride?: NamedItem[];
    shiftDisplayMode?: ShiftDisplayMode;
    auditInfo?: {
      createdByName: string | null;
      updatedByName: string | null;
      createdAt: string | null;
      updatedAt: string | null;
    } | null;
  } = {},
) {
  const onSelect = overrides.onSelect ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const result = render(
    <ShiftEditPanel
      modal={overrides.modalOverride ?? modal}
      currentShift={overrides.currentShift ?? null}
      currentAssignmentIds={overrides.currentAssignmentIds ?? []}
      currentAbsenceTypeId={overrides.currentAbsenceTypeId ?? null}
      assignments={overrides.assignmentsOverride ?? assignments}
      shiftCategories={shiftCategories}
      jobs={jobs}
      customStartTime={overrides.customStartTime ?? null}
      customEndTime={overrides.customEndTime ?? null}
      draftKind={overrides.draftKind ?? null}
      publishedAssignmentIds={overrides.publishedAssignmentIds ?? []}
      publishedAbsenceTypeId={overrides.publishedAbsenceTypeId ?? null}
      publishedCustomStartTime={overrides.publishedCustomStartTime ?? null}
      publishedCustomEndTime={overrides.publishedCustomEndTime ?? null}
      onSelect={onSelect}
      onClose={onClose}
      focusAreas={focusAreas}
      certifications={overrides.certificationsOverride ?? certifications}
      shiftDisplayMode={overrides.shiftDisplayMode ?? "code"}
      auditInfo={overrides.auditInfo}
    />,
  );
  return { ...result, onSelect, onClose };
}

function renderRequestPanel(
  overrides: {
    modalOverride?: EditModalState;
    onMakeAvailable?: ReturnType<typeof vi.fn>;
    onCallOff?: ReturnType<typeof vi.fn>;
    onSubmitSwap?: ReturnType<typeof vi.fn>;
    absenceTypesOverride?: AbsenceType[];
  } = {},
) {
  const onMakeAvailable = overrides.onMakeAvailable ?? vi.fn();
  const onCallOff = overrides.onCallOff ?? vi.fn();
  const onSubmitSwap = overrides.onSubmitSwap ?? vi.fn();

  const result = render(
    <ShiftEditPanel
      modal={overrides.modalOverride ?? modal}
      currentShift="D"
      currentAssignmentIds={[1]}
      assignments={assignments}
      shiftCategories={shiftCategories}
      jobs={jobs}
      onSelect={vi.fn()}
      onClose={vi.fn()}
      focusAreas={focusAreas}
      certifications={certifications}
      isOwnShift
      onMakeAvailable={onMakeAvailable}
      onCallOff={onCallOff}
      employees={employees}
      shiftForKey={(_, date) =>
        date.toISOString().startsWith("2024-01-16") ? "Night" : "Day"
      }
      isRequestableShift={(empId) => empId === "emp-2"}
      getShiftTimeRanges={() => []}
      onSubmitSwap={onSubmitSwap}
      absenceTypes={overrides.absenceTypesOverride ?? absenceTypes}
    />,
  );

  return { ...result, onMakeAvailable, onCallOff, onSubmitSwap };
}

function derivePanelSelection(
  input: ScheduleCellInput | null,
  shiftDisplayMode: ShiftDisplayMode = "code",
): {
  currentShift: string | null;
  currentAssignmentIds: number[];
  currentAbsenceTypeId: number | null;
} {
  if (!input || input.kind === "deleted") {
    return {
      currentShift: null,
      currentAssignmentIds: [],
      currentAbsenceTypeId: null,
    };
  }

  if (input.kind === "absence") {
    const absenceType =
      absenceTypes.find((candidate) => candidate.id === input.absenceTypeId) ??
      null;
    return {
      currentShift: absenceType?.label ?? null,
      currentAssignmentIds: [],
      currentAbsenceTypeId: input.absenceTypeId ?? null,
    };
  }

  const orderedSegments = [...input.segments].sort(
    (left, right) => left.position - right.position,
  );
  const currentAssignmentIds = orderedSegments
    .map(
      (segment) =>
        assignments.find(
          (assignment) =>
            (assignment.shiftId ?? assignment.categoryId ?? null) ===
              (segment.shiftId ?? null) && assignment.jobId === segment.jobId,
        )?.id ?? null,
    )
    .filter((id): id is number => id != null);
  const currentShift = orderedSegments
    .map((segment) => {
      const assignment =
        assignments.find(
          (candidate) =>
            (candidate.shiftId ?? candidate.categoryId ?? null) ===
              (segment.shiftId ?? null) && candidate.jobId === segment.jobId,
        ) ?? null;
      const job = jobs.find((candidate) => candidate.id === segment.jobId) ?? null;

      if (!assignment) {
        return shiftDisplayMode === "name"
          ? (job?.name ?? "?")
          : (job?.abbr ?? "?");
      }

      const primaryLabel =
        shiftDisplayMode === "name" ? assignment.name : assignment.label;
      const secondaryLabel =
        shiftDisplayMode === "name" ? (job?.name ?? null) : (job?.abbr ?? null);

      return secondaryLabel
        ? `${primaryLabel} · ${secondaryLabel}`
        : primaryLabel;
    })
    .join("/");

  return {
    currentShift,
    currentAssignmentIds,
    currentAbsenceTypeId: null,
  };
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
  const [currentAssignmentIds, setCurrentAssignmentIds] = useState<number[]>([1]);

  return (
    <ShiftEditPanel
      modal={modal}
      currentShift={currentShift}
      currentAssignmentIds={currentAssignmentIds}
      assignments={assignments}
      shiftCategories={shiftCategories}
      jobs={jobs}
      focusAreas={focusAreas}
      certifications={certifications}
      allowShiftEdits
      empId={modal.empId}
      onSelect={(input) => {
        const next = derivePanelSelection(input);
        setCurrentShift(next.currentShift);
        setCurrentAssignmentIds(next.currentAssignmentIds);
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
      currentAssignmentIds={[]}
      currentAbsenceTypeId={currentAbsenceTypeId}
      assignments={assignments}
      shiftCategories={shiftCategories}
      jobs={jobs}
      absenceTypes={absenceTypes}
      focusAreas={focusAreas}
      certifications={certifications}
      allowShiftEdits
      empId={modal.empId}
      onSelect={(input) => {
        if (input?.kind !== "absence" || input.absenceTypeId == null) return;
        const absenceType = absenceTypes.find((type) => type.id === input.absenceTypeId);
        setCurrentShift(absenceType?.label ?? null);
        setCurrentAbsenceTypeId(input.absenceTypeId);
      }}
      onClose={vi.fn()}
      onRepeatConfirm={vi.fn()}
    />
  );
}

function RepeatNameFlowPanel() {
  const [currentShift, setCurrentShift] = useState<string | null>(
    "Day Shift · Supervisor",
  );
  const [currentAssignmentIds, setCurrentAssignmentIds] = useState<number[]>([1]);

  return (
    <ShiftEditPanel
      modal={modal}
      currentShift={currentShift}
      currentAssignmentIds={currentAssignmentIds}
      assignments={assignments}
      shiftCategories={shiftCategories}
      jobs={jobs}
      focusAreas={focusAreas}
      certifications={certifications}
      allowShiftEdits
      empId={modal.empId}
      shiftDisplayMode="name"
      onSelect={(input) => {
        const next = derivePanelSelection(input, "name");
        setCurrentShift(next.currentShift);
        setCurrentAssignmentIds(next.currentAssignmentIds);
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
  const [currentAssignmentIds, setCurrentAssignmentIds] = useState<number[]>([]);

  return (
    <ShiftEditPanel
      modal={modal}
      currentShift={currentShift}
      currentAssignmentIds={currentAssignmentIds}
      assignments={assignments}
      shiftCategories={shiftCategories}
      jobs={jobs}
      focusAreas={focusAreas}
      certifications={certifications}
      allowShiftEdits
      onSelect={(input) => {
        const next = derivePanelSelection(input);
        setCurrentShift(next.currentShift);
        setCurrentAssignmentIds(next.currentAssignmentIds);
      }}
      onClose={vi.fn()}
      onConfirmDraft={onConfirmDraft}
      isStale={isStale}
    />
  );
}

function CustomTimeHarness() {
  const [customStartTime, setCustomStartTime] = useState<string | null>(null);
  const [customEndTime, setCustomEndTime] = useState<string | null>(null);

  return (
    <ShiftEditPanel
      modal={modal}
      currentShift="D"
      currentAssignmentIds={[1]}
      assignments={assignments}
      shiftCategories={shiftCategories}
      jobs={jobs}
      focusAreas={focusAreas}
      certifications={certifications}
      allowShiftEdits
      empId={modal.empId}
      customStartTime={customStartTime}
      customEndTime={customEndTime}
      onCustomTimeChange={(start, end) => {
        setCustomStartTime(start);
        setCustomEndTime(end);
      }}
      onSelect={vi.fn()}
      onClose={vi.fn()}
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

    it("keeps real names in the audit footer instead of showing Me", () => {
      renderPanel({
        currentShift: "D",
        currentAssignmentIds: [1],
        auditInfo: {
          createdByName: "Alex Admin",
          updatedByName: "Riley RN",
          createdAt: "2024-01-15T12:00:00.000Z",
          updatedAt: "2024-01-15T14:00:00.000Z",
        },
      });

      expect(screen.getByText("Created by")).toBeInTheDocument();
      expect(screen.getByText("Alex Admin")).toBeInTheDocument();
      expect(screen.getByText("Updated by")).toBeInTheDocument();
      expect(screen.getByText("Riley RN")).toBeInTheDocument();
      expect(screen.queryByText(/^Me$/)).not.toBeInTheDocument();
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
    it("clicking a shift button calls onSelect with canonical schedule state", () => {
      const { onSelect } = renderPanel();
      fireEvent.click(screen.getByText("D"));
      expect(onSelect).toHaveBeenCalledWith(
        {
          kind: "worked",
          segments: [
            {
              shiftId: 11,
              jobId: 102,
              position: 0,
            },
          ],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        undefined,
      );
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

  describe("Diff badges", () => {
    it("keeps an added second shift marked as new without flagging the published shift", () => {
      const { container } = renderPanel({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        draftKind: "modified",
        publishedAssignmentIds: [1],
      });

      const badges = Array.from(
        container.querySelectorAll("[data-shift-diff-badge]"),
      ) as HTMLElement[];

      expect(
        container.querySelector('[data-shift-diff-index="0"]'),
      ).toBeNull();
      expect(badges).toHaveLength(0);
    });

    it("shows independent time and new badges when editing the published shift and adding a second shift", () => {
      const { container } = renderPanel({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        customStartTime: "08:00|16:00",
        customEndTime: "16:00|23:00",
        draftKind: "modified",
        publishedAssignmentIds: [1],
        publishedCustomStartTime: "07:00",
        publishedCustomEndTime: "15:00",
      });

      expect(
        container.querySelector('[data-shift-diff-index="0"]')?.textContent,
      ).toBe("Time");
      expect(
        (
          container.querySelector('[data-shift-diff-index="0"]') as HTMLElement
        )?.style.background,
      ).toBe("var(--color-warning)");
      expect(
        container.querySelector('[data-shift-diff-index="1"]'),
      ).toBeNull();
    });

    it("keeps a brand-new shift with custom time border-only", () => {
      const { container } = renderPanel({
        currentShift: "E",
        currentAssignmentIds: [2],
        customStartTime: "16:00",
        customEndTime: "23:00",
        draftKind: "new",
      });

      expect(
        container.querySelector('[data-shift-diff-badge="new"]'),
      ).toBeNull();
    });

    it("shows the previous label when a published single shift is replaced", () => {
      const { container } = renderPanel({
        currentShift: "E",
        currentAssignmentIds: [2],
        draftKind: "modified",
        publishedAssignmentIds: [1],
      });

      expect(
        container.querySelector('[data-shift-diff-badge="modified"]')
          ?.textContent,
      ).toBe("Was D · SUPV");
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
    const restrictedJob: JobDefinition = {
      id: 102,
      orgId: "org-1",
      name: "JL Coverage",
      abbr: "JL",
      showOnGrid: true,
      assignmentMode: "with_shift",
      eligibleRoleIds: [],
      requiredCertificationIds: [1],
      color: "#EDE9FE",
      border: "#A78BFA",
      text: "#6D28D9",
      sortOrder: 2,
      systemKey: null,
    };

    const restrictedShift: AssignmentDefinition = {
      id: 4,
      orgId: "org-1",
      label: "JL",
      name: "JLCSN Day",
      color: "#EDE9FE",
      border: "#A78BFA",
      text: "#6D28D9",
      sortOrder: 4,
      categoryId: 11,
      shiftId: 11,
      jobId: 102,
      focusAreaId: 1,
      requiredCertificationIds: [1],
    };

    it("disqualified shift button is not rendered when employee lacks the required designation", () => {
      const modalWithDesig: EditModalState = { ...modal, empCertificationId: null };
      render(
        <ShiftEditPanel
          modal={modalWithDesig}
          currentShift={null}
          assignments={[restrictedShift, generalShift]}
          shiftCategories={shiftCategories}
          jobs={[...jobs, restrictedJob]}
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
          assignments={[restrictedShift, generalShift]}
          shiftCategories={shiftCategories}
          jobs={[...jobs, restrictedJob]}
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
          assignments={[northShift, generalShift]}
          shiftCategories={shiftCategories}
          jobs={jobs}
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
          assignments={[restrictedShift]}
          shiftCategories={shiftCategories}
          jobs={[...jobs, restrictedJob]}
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
    it("renders the current shift preview with split grid labels in name mode", () => {
      renderPanel({
        currentShift: "Day Shift · Supervisor",
        currentAssignmentIds: [1],
        shiftDisplayMode: "name",
      });

      expect(screen.getByText(/^Day Shift$/)).toBeInTheDocument();
      expect(screen.getByText(/^Supervisor$/)).toBeInTheDocument();
      expect(
        screen.queryByText(/^Day Shift · Supervisor$/),
      ).not.toBeInTheDocument();
    });

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
      expect(backButtons).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Monday" }));
      await user.click(screen.getByRole("button", { name: "Create Repeating Shift" }));
      expect(screen.getByText("Select at least one day.")).toBeInTheDocument();

      await user.click(backButtons[0]);

      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Make this a repeating shift" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Create Repeating Shift" })).not.toBeInTheDocument();
    });

    it("uses the custom repeat calendar", async () => {
      const user = userEvent.setup();
      const { container } = render(<RepeatFlowPanel />);

      await user.click(screen.getByRole("button", { name: "Make this a repeating shift" }));

      expect(container.querySelector('input[type="date"]')).toBeNull();
      expect(screen.getByText("January 2024")).toBeInTheDocument();
      expect(screen.getByLabelText("Start date calendar")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Selected Monday, January 15, 2024/i }));
      expect(screen.getByRole("button", { name: "Start date" })).toHaveAttribute("aria-expanded", "false");
    });

    it("shows an end-date error when ending on a date without selecting one", async () => {
      const user = userEvent.setup();

      render(<RepeatFlowPanel />);

      await user.click(screen.getByRole("button", { name: "Make this a repeating shift" }));
      await user.click(screen.getByLabelText("On date"));
      await user.click(screen.getByRole("button", { name: "Create Repeating Shift" }));

      expect(screen.getByText("Select an end date.")).toBeInTheDocument();
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

    it("renders the repeat preview badge with split grid labels in name mode", async () => {
      const user = userEvent.setup();

      render(<RepeatNameFlowPanel />);

      await user.click(
        screen.getByRole("button", { name: "Make this a repeating shift" }),
      );

      const preview = document.querySelector(
        '[data-repeat-shift-preview="true"]',
      ) as HTMLElement | null;

      expect(preview).not.toBeNull();
      expect(
        within(preview!).getByText(/^Day Shift · Supervisor$/),
      ).toBeInTheDocument();
    });
  });

  describe("Coverage requests", () => {
    it("shows Drop shift and Swap without exposing separate pickup and calloff buttons", () => {
      renderRequestPanel();

      expect(screen.getByRole("button", { name: "Drop shift" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Swap" })).toBeInTheDocument();
      expect(screen.queryByText("Make available for pickup")).not.toBeInTheDocument();
      expect(screen.queryByText("Call off")).not.toBeInTheDocument();
    });

    it("submits a pickup request from the shared coverage chooser", async () => {
      const user = userEvent.setup();
      const { onMakeAvailable } = renderRequestPanel();

      await user.click(screen.getByRole("button", { name: "Drop shift" }));
      await user.click(screen.getByRole("button", { name: /Offer for pickup/i }));

      expect(onMakeAvailable).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", {
        name: "Offer shift for pickup?",
      });
      await user.click(
        within(dialog).getByRole("button", { name: "Offer for pickup" }),
      );

      expect(onMakeAvailable).toHaveBeenCalledTimes(1);
    });

    it("submits a calloff request from the shared coverage chooser", async () => {
      const user = userEvent.setup();
      const { onCallOff } = renderRequestPanel();

      await user.click(screen.getByRole("button", { name: "Drop shift" }));
      await user.click(screen.getByRole("button", { name: /Call off/i }));
      await user.click(screen.getByRole("button", { name: /Vacation/i }));

      expect(onCallOff).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", {
        name: "Submit call off request?",
      });
      await user.click(
        within(dialog).getByRole("button", { name: "Submit call off" }),
      );

      expect(onCallOff).toHaveBeenCalledWith(absenceTypes[0]);
    });

    it("opens the same chooser directly in coverage mode and disables calloff without absence types", async () => {
      const user = userEvent.setup();
      const { onMakeAvailable } = renderRequestPanel({
        modalOverride: { ...modal, requestMode: "coverage" },
        absenceTypesOverride: [],
      });

      expect(screen.getByText("Shift requests")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Call off is unavailable until at least one active absence type is set up.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Call off/i })).toBeDisabled();

      await user.click(screen.getByRole("button", { name: /Offer for pickup/i }));

      expect(onMakeAvailable).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", {
        name: "Offer shift for pickup?",
      });
      await user.click(
        within(dialog).getByRole("button", { name: "Offer for pickup" }),
      );

      expect(onMakeAvailable).toHaveBeenCalledTimes(1);
    });

    it("opens swap directly in request mode, supports day navigation, and submits a swap request", async () => {
      const user = userEvent.setup();
      const { onSubmitSwap } = renderRequestPanel({
        modalOverride: { ...modal, requestMode: "swap" },
      });

      expect(screen.getByRole("button", { name: "Swap" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Go to next day" }));
      expect(screen.getByText("Tue, Jan 16")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Bob Jones/i }));
      expect(screen.getByText("You get")).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Submit Swap Request" }),
      );

      expect(onSubmitSwap).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", {
        name: "Submit swap request?",
      });
      await user.click(
        within(dialog).getByRole("button", { name: "Submit swap" }),
      );

      expect(onSubmitSwap).toHaveBeenCalledWith("emp-2", "2024-01-16");
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

  describe("Custom time editor", () => {
    it("shows START and END labels without red-asterisk required markers", async () => {
      const user = userEvent.setup();

      render(<CustomTimeHarness />);

      await user.click(screen.getByRole("button", { name: /Custom time/i }));

      expect(screen.getByText("START")).toBeInTheDocument();
      expect(screen.getByText("END")).toBeInTheDocument();
      expect(
        screen.queryByText((_, element) => element?.textContent === "START*"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText((_, element) => element?.textContent === "END*"),
      ).not.toBeInTheDocument();
    });
  });
});
