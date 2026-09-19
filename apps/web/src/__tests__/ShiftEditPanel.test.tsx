// Pin to UTC (production runtime) so the panel's week-range labels and
// local-midnight date probes are deterministic regardless of the dev machine's
// timezone.
process.env.TZ = "UTC";

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import ShiftEditPanel from "@/components/ShiftEditPanel";
import { fetchRepeatOverwriteCount } from "@/features/schedule/client";
import {
  AbsenceType,
  DraftKind,
  EditModalState,
  Employee,
  FocusArea,
  IndicatorType,
  JobDefinition,
  NamedItem,
  ScheduleCellInput,
  ShiftCategory,
  AssignmentDefinition,
  ShiftDisplayMode,
  ShiftJobSegment,
} from "@/types";

vi.mock("@/features/schedule/client", () => ({
  fetchRepeatOverwriteCount: vi.fn(),
}));

const fetchRepeatOverwriteCountMock = vi.mocked(fetchRepeatOverwriteCount);

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
  text: "#475569",
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

const indicatorTypes: IndicatorType[] = [
  { id: 80, orgId: "org-1", name: "Float", color: "#2563EB", sortOrder: 0 },
  { id: 81, orgId: "org-1", name: "Training", color: "#D97706", sortOrder: 1 },
];

const employees: Employee[] = [
  {
    id: "emp-1",
    firstName: "Alice",
    lastName: "Smith",
    employmentType: "full_time",
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
    employmentType: "full_time",
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
  {
    id: "emp-3",
    firstName: "Zoe",
    lastName: "Adams",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "zoe@example.com",
    contactNotes: "",
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIsoDateRange(startDate: string, dayCount: number): string[] {
  const start = new Date(`${startDate}T00:00:00.000Z`);

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function renderPanel(
  overrides: {
    currentShift?: string | null;
    currentAssignmentIds?: number[];
    currentSegments?: ShiftJobSegment[];
    currentAbsenceTypeId?: number | null;
    customStartTime?: string | null;
    customEndTime?: string | null;
    draftKind?: DraftKind;
    publishedAssignmentIds?: number[];
    publishedAbsenceTypeId?: number | null;
    publishedCustomStartTime?: string | null;
    publishedCustomEndTime?: string | null;
    onCustomTimeChange?: ReturnType<typeof vi.fn>;
    onSelect?: ReturnType<typeof vi.fn>;
    onClose?: ReturnType<typeof vi.fn>;
    modalOverride?: EditModalState;
    assignmentsOverride?: AssignmentDefinition[];
    certificationsOverride?: NamedItem[];
    shiftDisplayMode?: ShiftDisplayMode;
    indicatorTypesOverride?: IndicatorType[];
    canEditScheduleIndicators?: boolean;
    allowShiftEdits?: boolean;
    getActiveIndicatorIds?: (focusAreaId: number) => number[];
    onNoteToggle?: ReturnType<typeof vi.fn>;
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
      currentSegments={overrides.currentSegments ?? []}
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
      onCustomTimeChange={overrides.onCustomTimeChange}
      onSelect={onSelect}
      onClose={onClose}
      focusAreas={focusAreas}
      certifications={overrides.certificationsOverride ?? certifications}
      shiftDisplayMode={overrides.shiftDisplayMode ?? "code"}
      auditInfo={overrides.auditInfo}
      indicatorTypes={overrides.indicatorTypesOverride}
      canEditScheduleIndicators={overrides.canEditScheduleIndicators}
      allowShiftEdits={overrides.allowShiftEdits}
      getActiveIndicatorIds={overrides.getActiveIndicatorIds}
      onNoteToggle={overrides.onNoteToggle}
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
    shiftNameForKey?: (empId: string, date: Date) => string | null;
    getShiftTimeRanges?: (empId: string, date: Date) => { start: string; end: string }[];
    getShiftFocusAreaIds?: (empId: string, date: Date) => number[];
    getShiftSegments?: (empId: string, date: Date) => ShiftJobSegment[];
    getAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
    isRequestableShift?: (empId: string, date: Date) => boolean;
    isShiftStarted?: (empId: string, date: Date) => boolean;
    isShiftSegmentStarted?: (empId: string, date: Date, segmentIndex: number) => boolean;
    availableSwapDates?: string[];
    absenceTypesOverride?: AbsenceType[];
    currentShift?: string;
    currentAssignmentIds?: number[];
    currentSegments?: ShiftJobSegment[];
  } = {},
) {
  const onMakeAvailable = overrides.onMakeAvailable ?? vi.fn();
  const onCallOff = overrides.onCallOff ?? vi.fn();
  const onSubmitSwap = overrides.onSubmitSwap ?? vi.fn();

  const result = render(
    <ShiftEditPanel
      modal={
        overrides.modalOverride ?? {
          ...modal,
          date: new Date(2026, 4, 4),
        }
      }
      currentShift={overrides.currentShift ?? "D"}
      currentAssignmentIds={overrides.currentAssignmentIds ?? [1]}
      currentSegments={overrides.currentSegments ?? []}
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
      shiftForKey={(_, date) => (date.toISOString().startsWith("2026-05-05") ? "Night" : "Day")}
      shiftNameForKey={
        overrides.shiftNameForKey ??
        ((_, date) => (date.toISOString().startsWith("2026-05-05") ? "Evening Shift" : "Day Shift"))
      }
      isRequestableShift={overrides.isRequestableShift ?? ((empId) => empId === "emp-2")}
      availableSwapDates={overrides.availableSwapDates}
      isShiftStarted={overrides.isShiftStarted}
      isShiftSegmentStarted={overrides.isShiftSegmentStarted}
      getShiftTimeRanges={overrides.getShiftTimeRanges ?? (() => [])}
      getShiftFocusAreaIds={overrides.getShiftFocusAreaIds ?? (() => [1])}
      getShiftSegments={overrides.getShiftSegments}
      getAbsenceTypeIdForKey={
        overrides.getAbsenceTypeIdForKey ??
        ((empId, date) =>
          (empId === "emp-2" || empId === "emp-3") && date.toISOString().startsWith("2026-05-04")
            ? 7
            : null)
      }
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
      absenceTypes.find((candidate) => candidate.id === input.absenceTypeId) ?? null;
    return {
      currentShift: absenceType?.label ?? null,
      currentAssignmentIds: [],
      currentAbsenceTypeId: input.absenceTypeId ?? null,
    };
  }

  const orderedSegments = [...input.segments].sort((left, right) => left.position - right.position);
  const currentAssignmentIds = orderedSegments
    .map(
      (segment) =>
        assignments.find(
          (assignment) =>
            (assignment.shiftId ?? assignment.categoryId ?? null) === (segment.shiftId ?? null) &&
            assignment.jobId === segment.jobId,
        )?.id ?? null,
    )
    .filter((id): id is number => id != null);
  const currentShift = orderedSegments
    .map((segment) => {
      const assignment =
        assignments.find(
          (candidate) =>
            (candidate.shiftId ?? candidate.categoryId ?? null) === (segment.shiftId ?? null) &&
            candidate.jobId === segment.jobId,
        ) ?? null;
      const job = jobs.find((candidate) => candidate.id === segment.jobId) ?? null;

      if (!assignment) {
        return shiftDisplayMode === "name" ? (job?.name ?? "?") : (job?.abbr ?? "?");
      }

      const primaryLabel = shiftDisplayMode === "name" ? assignment.name : assignment.label;
      const secondaryLabel =
        shiftDisplayMode === "name" ? (job?.name ?? null) : (job?.abbr ?? null);

      return secondaryLabel ? `${primaryLabel} · ${secondaryLabel}` : primaryLabel;
    })
    .join("/");

  return {
    currentShift,
    currentAssignmentIds,
    currentAbsenceTypeId: null,
  };
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
  const [currentShift, setCurrentShift] = useState<string | null>("Day Shift · Supervisor");
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
    fetchRepeatOverwriteCountMock.mockResolvedValue({ overwriteCount: 0 });
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

    it("renders a close button", () => {
      renderPanel();
      const closeButtons = screen.getAllByRole("button", { name: "Close" });
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

    it("spells out the current shift and shows the focus area in detail mode", () => {
      renderPanel({
        currentShift: "D",
        currentAssignmentIds: [1],
      });

      expect(screen.getByText(/^Day Shift$/)).toBeInTheDocument();
      expect(screen.getByText(/^Supervisor$/)).toBeInTheDocument();
      expect(screen.getByText(/^North$/)).toBeInTheDocument();
      expect(screen.queryByText(/^D$/)).not.toBeInTheDocument();
    });
  });

  describe("Accessible name", () => {
    it("announces the editor as Edit shift and the read-only panel as Shift details", () => {
      const editable = renderPanel({ currentShift: "D" });
      expect(screen.getByRole("dialog", { name: "Edit shift" })).toBeInTheDocument();
      editable.unmount();

      renderPanel({ currentShift: "D", allowShiftEdits: false });
      expect(screen.getByRole("dialog", { name: "Shift details" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Edit shift" })).not.toBeInTheDocument();
    });
  });

  describe("Close interactions", () => {
    // The panel portals to document.body and defers onClose until its exit
    // animation finishes, so assert on the body and wait for the callback.
    it("clicking close button calls onClose", async () => {
      const { onClose } = renderPanel();
      const closeButton = screen.getAllByRole("button", { name: "Close" })[0];
      fireEvent.click(closeButton);
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("clicking the backdrop overlay calls onClose", async () => {
      const { onClose } = renderPanel();
      const backdrop = document.body.querySelector(".dg-panel-overlay");
      expect(backdrop).not.toBeNull();
      fireEvent.click(backdrop!);
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
  });

  describe("Schedule indicators", () => {
    it("gives active and inactive single-shift indicators explicit actions", async () => {
      const user = userEvent.setup();
      const onNoteToggle = vi.fn();
      renderPanel({
        currentShift: "D",
        currentAssignmentIds: [1],
        indicatorTypesOverride: indicatorTypes,
        canEditScheduleIndicators: true,
        getActiveIndicatorIds: () => [80],
        onNoteToggle,
      });

      await user.click(screen.getByRole("button", { name: "Remove Float indicator" }));
      expect(onNoteToggle).toHaveBeenLastCalledWith(80, false, 1);

      await user.click(screen.getByRole("button", { name: "Add Training indicator" }));
      expect(onNoteToggle).toHaveBeenLastCalledWith(81, true, 1);
    });

    it("routes explicit split-shift indicator removal to the matching focus area", async () => {
      const user = userEvent.setup();
      const onNoteToggle = vi.fn();
      renderPanel({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: [
          { shiftId: 11, jobId: 102, position: 0, label: "D", isMentored: false },
          { shiftId: 12, jobId: 102, position: 1, label: "E", isMentored: false },
        ],
        indicatorTypesOverride: indicatorTypes,
        canEditScheduleIndicators: true,
        getActiveIndicatorIds: (focusAreaId) => (focusAreaId === 1 ? [80] : [81]),
        onNoteToggle,
      });

      await user.click(screen.getByRole("button", { name: "Remove Training indicator" }));
      expect(onNoteToggle).toHaveBeenLastCalledWith(81, false, 2);
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
      expect(screen.getByRole("button", { name: "Day Shift - Supervisor" })).toBeInTheDocument();
    });

    it("clicking another focus area tab shows that area's shifts", () => {
      renderPanel();
      // Initially on North; South's shift is not visible until that tab is opened.
      expect(screen.getByRole("button", { name: "Day Shift - Supervisor" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Evening Shift - Supervisor" }),
      ).not.toBeInTheDocument();

      // Click South tab (the tab button, not the section heading)
      const southButtons = screen.getAllByText("South");
      fireEvent.click(southButtons[0]);
      expect(
        screen.getByRole("button", { name: "Evening Shift - Supervisor" }),
      ).toBeInTheDocument();
    });
  });

  describe("Shift buttons", () => {
    it("clicking a shift button calls onSelect with canonical schedule state", () => {
      const { onSelect } = renderPanel();
      fireEvent.click(screen.getByRole("button", { name: "Day Shift - Supervisor" }));
      expect(onSelect).toHaveBeenCalledWith(
        {
          kind: "worked",
          segments: [
            {
              shiftId: 11,
              jobId: 102,
              position: 0,
              isMentored: false,
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
      const labelSpan = screen.getByText("Day Shift");
      // The pill wrapping div is the nearest ancestor with an inline background
      const pill = labelSpan.closest('div[style*="background"]');
      expect(pill).not.toBeNull();
      // jsdom normalizes #DBEAFE → rgb(219, 234, 254)
      expect((pill as HTMLElement).style.background).toBe("rgb(219, 234, 254)");
    });

    it("preserves the current shift when adding a second shift", async () => {
      const user = userEvent.setup();
      const timedAssignments: AssignmentDefinition[] = [
        {
          ...northShift,
          defaultStartTime: "07:00",
          defaultEndTime: "15:00",
        },
        {
          ...southShift,
          defaultStartTime: "15:00",
          defaultEndTime: "23:00",
        },
      ];
      const { onSelect } = renderPanel({
        currentShift: "D",
        currentAssignmentIds: [1],
        currentSegments: [
          {
            shiftId: 11,
            jobId: 102,
            position: 0,
            label: "D",
            isMentored: false,
          },
        ],
        assignmentsOverride: timedAssignments,
      });

      await user.click(screen.getByRole("button", { name: /add another shift/i }));
      await user.click(screen.getByRole("button", { name: "Evening Shift - Supervisor" }));

      expect(onSelect).toHaveBeenLastCalledWith(
        {
          kind: "worked",
          segments: [
            {
              shiftId: 11,
              jobId: 102,
              position: 0,
              isMentored: false,
            },
            {
              shiftId: 12,
              jobId: 102,
              position: 1,
              isMentored: false,
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

    it("toggles mentored independently for each double-shift card", async () => {
      const user = userEvent.setup();
      const { onSelect } = renderPanel({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: [
          {
            shiftId: 11,
            jobId: 102,
            position: 0,
            label: "D",
            isMentored: true,
          },
          {
            shiftId: 12,
            jobId: 102,
            position: 1,
            label: "E",
            isMentored: false,
          },
        ],
      });

      const mentoredToggles = screen.getAllByRole("switch", {
        name: /Mentored assignment for/i,
      });
      expect(mentoredToggles).toHaveLength(2);
      expect(mentoredToggles[0]).toHaveAttribute("aria-checked", "true");
      expect(mentoredToggles[1]).toHaveAttribute("aria-checked", "false");

      await user.click(mentoredToggles[1]);

      expect(onSelect).toHaveBeenLastCalledWith(
        {
          kind: "worked",
          segments: [
            {
              shiftId: 11,
              jobId: 102,
              position: 0,
              isMentored: true,
            },
            {
              shiftId: 12,
              jobId: 102,
              position: 1,
              isMentored: true,
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
  });

  describe("Diff badges", () => {
    it("keeps an added second shift marked as new without flagging the published shift", () => {
      renderPanel({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        draftKind: "modified",
        publishedAssignmentIds: [1],
      });

      const badges = Array.from(
        document.body.querySelectorAll("[data-shift-diff-badge]"),
      ) as HTMLElement[];

      expect(document.body.querySelector('[data-shift-diff-index="0"]')).toBeNull();
      expect(badges).toHaveLength(0);

      const firstCard = document.body.querySelector(
        '[data-shift-edit-card="0"]',
      ) as HTMLElement | null;
      const secondCard = document.body.querySelector(
        '[data-shift-edit-card="1"]',
      ) as HTMLElement | null;

      expect(firstCard).toHaveStyle({
        borderStyle: "solid",
        borderWidth: "1.5px",
      });
      expect(firstCard).not.toHaveAttribute("data-shift-edit-card-diff");
      expect(secondCard).toHaveAttribute("data-shift-edit-card-diff", "new");
    });

    it("keeps split-shift card corners aligned with the outer card radius", () => {
      renderPanel({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        draftKind: "modified",
        publishedAssignmentIds: [1],
      });

      const card = document.body.querySelector('[data-shift-edit-card="0"]') as HTMLElement | null;
      const header = document.body.querySelector(
        '[data-shift-edit-card-header="0"]',
      ) as HTMLElement | null;
      const body = document.body.querySelector(
        '[data-shift-edit-card-body="0"]',
      ) as HTMLElement | null;

      expect(card?.style.borderRadius).toBe("var(--dg-radius-md)");
      expect(header?.style.borderRadius).toBe(
        "calc(var(--dg-radius-md) - 2px) calc(var(--dg-radius-md) - 2px) 0 0",
      );
      expect(body?.style.borderRadius).toBe(
        "0 0 calc(var(--dg-radius-md) - 2px) calc(var(--dg-radius-md) - 2px)",
      );
      expect(card?.style.overflow).toBe("visible");
    });

    it("shows independent time and new badges when editing the published shift and adding a second shift", () => {
      renderPanel({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        customStartTime: "08:00|16:00",
        customEndTime: "16:00|23:00",
        draftKind: "modified",
        publishedAssignmentIds: [1],
        publishedCustomStartTime: "07:00",
        publishedCustomEndTime: "15:00",
      });

      expect(document.body.querySelector('[data-shift-diff-index="0"]')?.textContent).toBe("Time");
      expect(
        (document.body.querySelector('[data-shift-diff-index="0"]') as HTMLElement)?.style
          .background,
      ).toBe("var(--dg-color-warning)");
      expect(document.body.querySelector('[data-shift-diff-index="1"]')).toBeNull();
    });

    it("keeps a brand-new shift with custom time border-only", () => {
      renderPanel({
        currentShift: "E",
        currentAssignmentIds: [2],
        customStartTime: "16:00",
        customEndTime: "23:00",
        draftKind: "new",
      });

      expect(document.body.querySelector('[data-shift-diff-badge="new"]')).toBeNull();
    });

    it("renders stale split custom times as a single clean custom time after one shift remains", () => {
      renderPanel({
        currentShift: "D",
        currentAssignmentIds: [1],
        currentSegments: [
          {
            shiftId: 11,
            jobId: 102,
            position: 0,
            label: "D",
            isMentored: false,
          },
        ],
        customStartTime: "07:00:00|16:00:00",
        customEndTime: "16:30:00|00:00:00",
        onCustomTimeChange: vi.fn(),
      });

      expect(document.body.textContent).toContain("7:00 AM");
      expect(document.body.textContent).toContain("4:30 PM");
      expect(document.body.textContent).toContain("9h 30m");
      expect(document.body.textContent).not.toContain("NaN");
      expect(document.body.textContent).not.toContain("|");
    });

    it("shows the compact Edited status when a published single shift is replaced", () => {
      renderPanel({
        currentShift: "E",
        currentAssignmentIds: [2],
        draftKind: "modified",
        publishedAssignmentIds: [1],
      });

      expect(document.body.querySelector('[data-shift-diff-badge="modified"]')?.textContent).toBe(
        "Edited",
      );
    });
  });

  describe("General section", () => {
    it("general shifts appear in a 'General' section", () => {
      renderPanel();
      expect(screen.getByText("General")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cross Wing" })).toBeInTheDocument();
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
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Day Shift - JL Coverage" }),
      ).not.toBeInTheDocument();
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
        />,
      );
      const button = screen.getByRole("button", {
        name: "Day Shift - JL Coverage",
      });
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
        />,
      );
      const button = screen.getByRole("button", {
        name: "Day Shift - Supervisor",
      });
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
        />,
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
      expect(screen.queryByText(/^Day Shift · Supervisor$/)).not.toBeInTheDocument();
    });

    it("shows repeat mode only before local edits and keeps the sticky footer hidden while backing out", async () => {
      const user = userEvent.setup();

      render(<RepeatFlowPanel />);

      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Make this a repeating shift" }));

      const createRepeatingShiftButton = screen.getByRole("button", {
        name: "Create Repeating Shift",
      });
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
      expect(
        screen.getByRole("button", { name: "Make this a repeating shift" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Create Repeating Shift" }),
      ).not.toBeInTheDocument();
    });

    it("uses the custom repeat calendar", async () => {
      const user = userEvent.setup();
      const { container } = render(<RepeatFlowPanel />);

      await user.click(screen.getByRole("button", { name: "Make this a repeating shift" }));

      expect(container.querySelector('input[type="date"]')).toBeNull();
      expect(screen.getByText("January 2024")).toBeInTheDocument();
      expect(screen.getByLabelText("Start date calendar")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Selected Monday, January 15, 2024/i }));
      expect(screen.getByRole("button", { name: "Start date" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
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
      expect(screen.getByRole("button", { name: "Create Repeating Off Day" })).toBeInTheDocument();
    });

    it("renders the repeat preview badge with split grid labels in name mode", async () => {
      const user = userEvent.setup();

      render(<RepeatNameFlowPanel />);

      await user.click(screen.getByRole("button", { name: "Make this a repeating shift" }));

      const preview = document.querySelector(
        '[data-repeat-shift-preview="true"]',
      ) as HTMLElement | null;

      expect(preview).not.toBeNull();
      expect(within(preview!).getByText(/^Day Shift · Supervisor$/)).toBeInTheDocument();
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
      await user.click(screen.getByRole("button", { name: "Offer to everyone" }));

      expect(onMakeAvailable).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", {
        name: "Offer shift for pickup?",
      });
      await user.click(within(dialog).getByRole("button", { name: "Offer for pickup" }));

      expect(onMakeAvailable).toHaveBeenCalledTimes(1);
    });

    it("shows loading and blocks duplicate submits while a request is pending", async () => {
      const user = userEvent.setup();
      let resolveRequest: (requestId: string | null) => void = () => {};
      const requestPromise = new Promise<string | null>((resolve) => {
        resolveRequest = resolve;
      });
      const onMakeAvailable = vi.fn(() => requestPromise);
      renderRequestPanel({ onMakeAvailable });

      await user.click(screen.getByRole("button", { name: "Drop shift" }));
      await user.click(screen.getByRole("button", { name: /Offer for pickup/i }));
      await user.click(screen.getByRole("button", { name: "Offer to everyone" }));

      const dialog = screen.getByRole("dialog", {
        name: "Offer shift for pickup?",
      });
      const confirmButton = within(dialog).getByRole("button", {
        name: "Offer for pickup",
      });
      await user.click(confirmButton);

      expect(onMakeAvailable).toHaveBeenCalledTimes(1);
      expect(confirmButton).toBeDisabled();
      expect(within(dialog).getByRole("status", { name: "Loading" })).toBeInTheDocument();

      await user.click(confirmButton);
      expect(onMakeAvailable).toHaveBeenCalledTimes(1);

      resolveRequest("request-1");
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Offer shift for pickup?" }),
        ).not.toBeInTheDocument();
      });
    });

    it("sends the chosen split-shift segment for pickup requests", async () => {
      const user = userEvent.setup();
      const splitSegments: ShiftJobSegment[] = [
        {
          shiftId: 1,
          jobId: 10,
          label: "Day Shift",
          shiftName: "Day Shift",
          startTime: "07:00",
          endTime: "15:00",
        },
        {
          shiftId: 2,
          jobId: 10,
          label: "Evening Shift",
          shiftName: "Evening Shift",
          startTime: "15:00",
          endTime: "23:00",
        },
      ];
      const { onMakeAvailable } = renderRequestPanel({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: splitSegments,
      });

      await user.click(screen.getByRole("button", { name: "Drop shift" }));
      await user.click(
        screen.getByRole("button", {
          name: /Shift 2: Evening Shift \(3:00 PM - 11:00 PM\)/i,
        }),
      );
      await user.click(screen.getByRole("button", { name: /Offer for pickup/i }));
      await user.click(screen.getByRole("button", { name: "Offer to everyone" }));

      const dialog = screen.getByRole("dialog", {
        name: "Offer shift for pickup?",
      });
      await user.click(within(dialog).getByRole("button", { name: "Offer for pickup" }));

      expect(onMakeAvailable).toHaveBeenCalledWith({
        requesterSegmentIndex: 1,
      });
    });

    it("spells out shift names in split-shift request options when segment labels are abbreviations", async () => {
      const user = userEvent.setup();
      const splitSegments: ShiftJobSegment[] = [
        {
          shiftId: 11,
          jobId: 102,
          label: "D",
          startTime: "07:00",
          endTime: "15:00",
        },
        {
          shiftId: 12,
          jobId: 102,
          label: "E",
          startTime: "15:00",
          endTime: "23:00",
        },
      ];
      renderRequestPanel({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: splitSegments,
      });

      await user.click(screen.getByRole("button", { name: "Drop shift" }));

      expect(
        screen.getByRole("button", {
          name: /Shift 1: Day Shift \(7:00 AM - 3:00 PM\)/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: /Shift 2: Evening Shift \(3:00 PM - 11:00 PM\)/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: /Shift 1: D \(7:00 AM - 3:00 PM\)/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("allows dropping an upcoming split-shift segment when an earlier segment is in progress", async () => {
      const user = userEvent.setup();
      const splitSegments: ShiftJobSegment[] = [
        {
          shiftId: 1,
          jobId: 10,
          label: "Day Shift",
          shiftName: "Day Shift",
          startTime: "07:00",
          endTime: "15:00",
        },
        {
          shiftId: 2,
          jobId: 10,
          label: "Evening Shift",
          shiftName: "Evening Shift",
          startTime: "15:00",
          endTime: "23:00",
        },
      ];
      const { onMakeAvailable } = renderRequestPanel({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: splitSegments,
        isShiftSegmentStarted: (_empId, _date, segmentIndex) => segmentIndex === 0,
      });

      await user.click(screen.getByRole("button", { name: "Drop shift" }));

      expect(
        screen.getByRole("button", {
          name: /Shift 1: Day Shift \(7:00 AM - 3:00 PM\) · In progress/i,
        }),
      ).toBeDisabled();

      await user.click(screen.getByRole("button", { name: /Offer for pickup/i }));
      await user.click(screen.getByRole("button", { name: "Offer to everyone" }));
      await user.click(
        within(
          screen.getByRole("dialog", {
            name: "Offer shift for pickup?",
          }),
        ).getByRole("button", { name: "Offer for pickup" }),
      );

      expect(onMakeAvailable).toHaveBeenCalledWith({
        requesterSegmentIndex: 1,
      });
    });

    it("submits a targeted pickup request for an absent teammate", async () => {
      const user = userEvent.setup();
      const { onMakeAvailable } = renderRequestPanel();

      await user.click(screen.getByRole("button", { name: "Drop shift" }));
      await user.click(screen.getByRole("button", { name: /Offer for pickup/i }));
      expect(screen.queryByRole("button", { name: "Go to previous week" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Go to next week" })).not.toBeInTheDocument();
      expect(screen.getAllByText("Vacation").length).toBeGreaterThan(0);
      const zoeButton = screen.getByRole("button", { name: /Zoe Adams/i });
      const bobButton = screen.getByRole("button", { name: /Bob Jones/i });
      expect(
        zoeButton.compareDocumentPosition(bobButton) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      await user.click(screen.getByRole("button", { name: /Bob Jones/i }));

      expect(onMakeAvailable).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", {
        name: "Request pickup?",
      });
      await user.click(within(dialog).getByRole("button", { name: "Request pickup" }));

      expect(onMakeAvailable).toHaveBeenCalledWith({
        targetEmpId: "emp-2",
        targetShiftDate: "2026-05-04",
        absenceTypeId: 7,
      });
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
      await user.click(within(dialog).getByRole("button", { name: "Submit call off" }));

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
      await user.click(screen.getByRole("button", { name: "Offer to everyone" }));

      expect(onMakeAvailable).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", {
        name: "Offer shift for pickup?",
      });
      await user.click(within(dialog).getByRole("button", { name: "Offer for pickup" }));

      expect(onMakeAvailable).toHaveBeenCalledTimes(1);
    });

    it("opens swap directly in request mode, supports day navigation, and submits a swap request", async () => {
      const user = userEvent.setup();
      const { onSubmitSwap } = renderRequestPanel({
        modalOverride: {
          ...modal,
          date: new Date(2037, 4, 4),
          requestMode: "swap",
        },
        shiftNameForKey: (_, date) =>
          date.toISOString().startsWith("2037-05-05")
            ? "Evening Shift · Supervisor"
            : "Day Shift · Supervisor",
        getShiftTimeRanges: (empId, date) =>
          date.toISOString().startsWith("2037-05-05")
            ? empId === "emp-2"
              ? [{ start: "15:00", end: "23:00" }]
              : [{ start: "07:00", end: "15:00" }]
            : empId === "emp-2"
              ? []
              : [{ start: "07:00", end: "15:00" }],
        getShiftFocusAreaIds: (_, date) =>
          date.toISOString().startsWith("2037-05-05") ? [2] : [1],
      });

      expect(screen.getByRole("button", { name: "Swap" })).toBeInTheDocument();
      expect(screen.getByText("Eligible teammates")).toBeInTheDocument();
      expect(screen.getByText("May 3 - May 9")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Go to previous week" })).toHaveClass(
        "dg-btn-secondary",
      );
      expect(screen.getByRole("button", { name: "Go to next week" })).toHaveClass(
        "dg-btn-secondary",
      );
      await user.click(
        screen.getByRole("button", {
          name: "Show eligible teammates for Tue, May 5",
        }),
      );
      const teammateRow = screen.getByRole("button", { name: /Bob Jones/i });
      expect(teammateRow).toHaveTextContent("Evening Shift · Supervisor");
      expect(teammateRow).toHaveTextContent("3:00 PM - 11:00 PM · South");
      expect(screen.queryByText("Night")).not.toBeInTheDocument();

      await user.click(teammateRow);
      expect(screen.getByText("You get")).toBeInTheDocument();
      expect(screen.getAllByText("Day Shift · Supervisor").length).toBeGreaterThan(0);
      expect(screen.getAllByText("7:00 AM - 3:00 PM · North").length).toBeGreaterThan(0);
      expect(screen.getByText("3:00 PM - 11:00 PM · South")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Submit Swap Request" }));

      expect(onSubmitSwap).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", {
        name: "Submit swap request?",
      });
      await user.click(within(dialog).getByRole("button", { name: "Submit swap" }));

      expect(onSubmitSwap).toHaveBeenCalledWith("emp-2", "2037-05-05");
    });

    it("only navigates the swap chooser between weeks with eligible targets", async () => {
      const user = userEvent.setup();

      renderRequestPanel({
        modalOverride: {
          ...modal,
          date: new Date(2037, 4, 4),
          requestMode: "swap",
        },
        availableSwapDates: makeIsoDateRange("2037-05-04", 28),
        isRequestableShift: (empId, date) => {
          // The panel builds the probe Date at LOCAL midnight (new Date(`${iso}T00:00:00`)),
          // so match on the local calendar date rather than the UTC ISO string.
          const localKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          return empId === "emp-2" && (localKey === "2037-05-05" || localKey === "2037-05-26");
        },
      });

      expect(
        screen.getByRole("button", {
          name: "Show eligible teammates for Tue, May 5",
        }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.queryByRole("button", {
          name: "Show eligible teammates for Tue, May 12",
        }),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Go to next week" }));

      expect(screen.getByText("May 24 - May 30")).toBeInTheDocument();
      const selectedDate = screen.getByRole("button", {
        name: "Show eligible teammates for Tue, May 26",
      });
      expect(selectedDate).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.queryByRole("button", {
          name: "Show eligible teammates for Tue, May 12",
        }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Go to next week" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Go to previous week" })).not.toBeDisabled();
    });

    it("filters swap targets by both employees' focus-area eligibility", async () => {
      const user = userEvent.setup();

      renderRequestPanel({
        modalOverride: {
          ...modal,
          date: new Date(2026, 4, 4),
          empFocusAreaIds: [1],
          requestMode: "swap",
        },
        getShiftFocusAreaIds: (empId, date) => {
          if (empId === "emp-2" && date.toISOString().startsWith("2026-05-05")) {
            return [2];
          }
          return [1];
        },
      });

      await user.click(
        screen.getByRole("button", {
          name: "Show eligible teammates for Tue, May 5",
        }),
      );

      expect(screen.queryByRole("button", { name: /Bob Jones/i })).not.toBeInTheDocument();
      expect(screen.getByText("No eligible employees on this date.")).toBeInTheDocument();
    });

    it("does not offer past target shifts in the swap picker", () => {
      renderRequestPanel({
        modalOverride: {
          ...modal,
          date: new Date(2024, 0, 15),
          requestMode: "swap",
        },
      });

      expect(screen.queryByRole("button", { name: /Bob Jones/i })).not.toBeInTheDocument();
      expect(screen.getByText("No eligible employees on this date.")).toBeInTheDocument();
    });

    it("does not offer target shifts that are already in progress", () => {
      renderRequestPanel({
        modalOverride: {
          ...modal,
          requestMode: "swap",
        },
        isShiftStarted: (empId, date) =>
          empId === "emp-2" && date.toISOString().startsWith("2026-05-04"),
      });

      expect(screen.queryByRole("button", { name: /Bob Jones/i })).not.toBeInTheDocument();
      expect(screen.getByText("No eligible employees on this date.")).toBeInTheDocument();
    });
  });

  describe("Confirm-save flow", () => {
    it("undoes a new local shift and allows recreating it before confirming once", async () => {
      const user = userEvent.setup();
      const onConfirmDraft = vi.fn();

      render(<ConfirmDraftHarness onConfirmDraft={onConfirmDraft} />);

      await user.click(screen.getByRole("button", { name: "Day Shift - Supervisor" }));
      expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Undo" }));
      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
      expect(onConfirmDraft).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Day Shift - Supervisor" }));
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      expect(onConfirmDraft).toHaveBeenCalledTimes(1);
      expect(onConfirmDraft).toHaveBeenCalledWith(undefined);
    });

    it("shows a stale warning and disables confirm when the cell changed externally", async () => {
      const user = userEvent.setup();
      const onConfirmDraft = vi.fn();

      render(<ConfirmDraftHarness onConfirmDraft={onConfirmDraft} isStale />);

      await user.click(screen.getByRole("button", { name: "Day Shift - Supervisor" }));

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
