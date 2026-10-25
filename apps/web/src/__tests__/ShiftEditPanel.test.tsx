// Pin to UTC (production runtime) so the panel's week-range labels and
// local-midnight date probes are deterministic regardless of the dev machine's
// timezone.
// Set in vi.hoisted, which runs before the imports: a plain assignment runs
// after them, and a module that builds a date formatter on load keeps the
// machine's timezone.
vi.hoisted(() => {
  process.env.TZ = "UTC";
});

import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import ShiftEditPanel from "@/components/ShiftEditPanel";
import { fetchRepeatOverwriteCount } from "@/features/schedule/client";
import {
  activeNoteIds,
  toggleDraftNote,
  type DraftNoteState,
} from "@/app/(app)/schedule/_lib/editor-session";
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
    currentRestOfDayAbsenceTypeId?: number | null;
    currentRestOfDayAbsenceStartTime?: string | null;
    currentRestOfDayAbsenceEndTime?: string | null;
    publishedRestOfDayAbsenceTypeId?: number | null;
    onRepeatConfirm?: ReturnType<typeof vi.fn>;
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
    jobsOverride?: JobDefinition[];
    absenceTypesOverride?: AbsenceType[];
    certificationsOverride?: NamedItem[];
    shiftDisplayMode?: ShiftDisplayMode;
    indicatorTypesOverride?: IndicatorType[];
    canEditScheduleIndicators?: boolean;
    allowShiftEdits?: boolean;
    getActiveIndicatorIds?: (
      focusAreaId: number,
      shift: { shiftId: number | null; jobId: number } | null,
    ) => number[];
    onNoteToggle?: ReturnType<typeof vi.fn>;
    seriesId?: string | null;
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
  const result = render(panelElement(overrides, onSelect, onClose));
  return { ...result, onSelect, onClose };
}

function panelElement(
  overrides: Parameters<typeof renderPanel>[0] & object,
  onSelect: ReturnType<typeof vi.fn>,
  onClose: ReturnType<typeof vi.fn>,
) {
  return (
    <ShiftEditPanel
      modal={overrides.modalOverride ?? modal}
      currentShift={overrides.currentShift ?? null}
      currentAssignmentIds={overrides.currentAssignmentIds ?? []}
      currentSegments={overrides.currentSegments ?? []}
      currentAbsenceTypeId={overrides.currentAbsenceTypeId ?? null}
      currentRestOfDayAbsenceTypeId={overrides.currentRestOfDayAbsenceTypeId ?? null}
      currentRestOfDayAbsenceStartTime={overrides.currentRestOfDayAbsenceStartTime ?? null}
      currentRestOfDayAbsenceEndTime={overrides.currentRestOfDayAbsenceEndTime ?? null}
      publishedRestOfDayAbsenceTypeId={overrides.publishedRestOfDayAbsenceTypeId ?? null}
      onRepeatConfirm={overrides.onRepeatConfirm}
      assignments={overrides.assignmentsOverride ?? assignments}
      shiftCategories={shiftCategories}
      jobs={overrides.jobsOverride ?? jobs}
      absenceTypes={overrides.absenceTypesOverride}
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
      seriesId={overrides.seriesId}
    />
  );
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
  currentSegments: ShiftJobSegment[];
} {
  if (!input || input.kind === "deleted") {
    return {
      currentShift: null,
      currentAssignmentIds: [],
      currentAbsenceTypeId: null,
      currentSegments: [],
    };
  }

  if (input.kind === "absence") {
    const absenceType =
      absenceTypes.find((candidate) => candidate.id === input.absenceTypeId) ?? null;
    return {
      currentShift: absenceType?.label ?? null,
      currentAssignmentIds: [],
      currentAbsenceTypeId: input.absenceTypeId ?? null,
      currentSegments: [],
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
    currentSegments: orderedSegments.map((segment, index) => ({
      label: currentShift.split("/")[index] ?? "",
      shiftId: segment.shiftId,
      jobId: segment.jobId,
      position: segment.position,
      isMentored: segment.isMentored,
    })),
  };
}

function RepeatFlowPanel({ onRepeatConfirm = vi.fn() }: { onRepeatConfirm?: () => void }) {
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
      onRepeatConfirm={onRepeatConfirm}
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
  const [currentSegments, setCurrentSegments] = useState<ShiftJobSegment[]>([]);

  return (
    <ShiftEditPanel
      modal={modal}
      currentShift={currentShift}
      currentAssignmentIds={currentAssignmentIds}
      currentSegments={currentSegments}
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
        setCurrentSegments(next.currentSegments);
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
    it("turns single-shift notes on and off with a switch per note", async () => {
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

      const float = screen.getByRole("switch", { name: "Float schedule note" });
      const training = screen.getByRole("switch", { name: "Training schedule note" });
      expect(float).toHaveAttribute("aria-checked", "true");
      expect(training).toHaveAttribute("aria-checked", "false");
      expect(screen.queryByText(/Appears as/)).not.toBeInTheDocument();

      await user.click(float);
      expect(onNoteToggle).toHaveBeenLastCalledWith(80, false, 1, null);

      await user.click(screen.getByText("Training"));
      expect(onNoteToggle).toHaveBeenLastCalledWith(81, true, 1, null);
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

      const cards = Array.from(
        document.body.querySelectorAll<HTMLElement>("[data-shift-edit-card-body]"),
      );
      await user.click(within(cards[1]).getByRole("switch", { name: "Training schedule note" }));
      expect(onNoteToggle).toHaveBeenLastCalledWith(81, false, 2, { shiftId: 12, jobId: 102 });
    });

    it("keeps a note on one shift of a double shift in one focus area off the other", async () => {
      const user = userEvent.setup();
      const eveningNorth: AssignmentDefinition = {
        ...southShift,
        id: 4,
        label: "N",
        name: "Evening North",
        categoryId: 13,
        shiftId: 13,
        focusAreaId: 1,
      };

      function Harness() {
        const [notes, setNotes] = useState<DraftNoteState[]>([]);
        return panelElement(
          {
            currentShift: "D/N",
            currentAssignmentIds: [1, 4],
            currentSegments: [
              { shiftId: 11, jobId: 102, position: 0, label: "D", isMentored: false },
              { shiftId: 13, jobId: 102, position: 1, label: "N", isMentored: false },
            ],
            assignmentsOverride: [...assignments, eveningNorth],
            indicatorTypesOverride: indicatorTypes,
            canEditScheduleIndicators: true,
            getActiveIndicatorIds: (focusAreaId, shift) =>
              focusAreaId === 1 && shift ? activeNoteIds(notes, shift) : [],
            onNoteToggle: vi.fn((id: number, active: boolean, _fa: number, shift) => {
              if (shift) setNotes((prev) => toggleDraftNote(prev, id, active, shift));
            }),
          },
          vi.fn(),
          vi.fn(),
        );
      }
      render(<Harness />);

      const cards = () =>
        Array.from(document.body.querySelectorAll<HTMLElement>("[data-shift-edit-card-body]"));
      await user.click(within(cards()[1]).getByRole("switch", { name: "Float schedule note" }));

      expect(
        within(cards()[1]).getByRole("switch", { name: "Float schedule note" }),
      ).toHaveAttribute("aria-checked", "true");
      expect(
        within(cards()[0]).getByRole("switch", { name: "Float schedule note" }),
      ).toHaveAttribute("aria-checked", "false");
    });
  });

  // 42a: people who can open a shift but not edit its indicators read them by name.
  describe("Read-only indicators", () => {
    it("lists a single shift's active indicators by name, without edit controls", () => {
      renderPanel({
        currentShift: "D",
        currentAssignmentIds: [1],
        allowShiftEdits: false,
        indicatorTypesOverride: indicatorTypes,
        canEditScheduleIndicators: false,
        getActiveIndicatorIds: () => [80],
      });

      const list = document.body.querySelector<HTMLElement>("[data-read-only-indicators]");
      expect(list).not.toBeNull();
      expect(within(list!).getByText("Float")).toBeInTheDocument();
      expect(within(list!).queryByText("Training")).toBeNull();
      expect(list!.querySelectorAll("[data-note-icon]")).toHaveLength(1);
      expect(screen.queryByRole("button", { name: /schedule note$/ })).toBeNull();
    });

    it("lists each split card's own indicators", () => {
      renderPanel({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: [
          { shiftId: 11, jobId: 102, position: 0, label: "D", isMentored: false },
          { shiftId: 12, jobId: 102, position: 1, label: "E", isMentored: false },
        ],
        allowShiftEdits: false,
        indicatorTypesOverride: indicatorTypes,
        canEditScheduleIndicators: false,
        getActiveIndicatorIds: (focusAreaId) => (focusAreaId === 1 ? [80] : [81]),
      });

      const lists = Array.from(
        document.body.querySelectorAll<HTMLElement>("[data-read-only-indicators]"),
      );
      expect(lists.map((list) => list.textContent)).toEqual([
        expect.stringContaining("Float"),
        expect.stringContaining("Training"),
      ]);
    });

    it("shows no list when no indicator is active", () => {
      renderPanel({
        currentShift: "D",
        currentAssignmentIds: [1],
        allowShiftEdits: false,
        indicatorTypesOverride: indicatorTypes,
        canEditScheduleIndicators: false,
        getActiveIndicatorIds: () => [],
      });

      expect(document.body.querySelector("[data-read-only-indicators]")).toBeNull();
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

    it("has nothing to save once mentored is turned on and back off", () => {
      const segment = (label: string, isMentored: boolean): ShiftJobSegment => ({
        shiftId: 11,
        jobId: 102,
        position: 0,
        label,
        isMentored,
      });
      // A loaded cell and the same cell rebuilt by an edit label it differently.
      const base = {
        currentShift: "D · M",
        currentAssignmentIds: [1],
        currentSegments: [segment("D · M", false)],
      };
      const { rerender } = render(panelElement(base, vi.fn(), vi.fn()));
      rerender(
        panelElement(
          { ...base, currentShift: "DM", currentSegments: [segment("DM", true)] },
          vi.fn(),
          vi.fn(),
        ),
      );
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();

      rerender(
        panelElement(
          { ...base, currentShift: "DM", currentSegments: [segment("DM", false)] },
          vi.fn(),
          vi.fn(),
        ),
      );
      expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    });

    it("Cancel turns mentored back off when the label did not change", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const segment = (isMentored: boolean): ShiftJobSegment => ({
        shiftId: 11,
        jobId: 102,
        position: 0,
        label: "D",
        isMentored,
      });
      const base = {
        currentShift: "D",
        currentAssignmentIds: [1],
        currentSegments: [segment(false)],
      };
      const { rerender } = render(panelElement(base, onSelect, vi.fn()));
      rerender(panelElement({ ...base, currentSegments: [segment(true)] }, onSelect, vi.fn()));

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onSelect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "worked",
          segments: [{ shiftId: 11, jobId: 102, position: 0, isMentored: false }],
        }),
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

  describe("Adding a second shift", () => {
    const medPassJob: JobDefinition = {
      ...jobs[0],
      id: 103,
      name: "Med Pass",
      abbr: "MP",
      sortOrder: 2,
    };
    const medPassShift: AssignmentDefinition = {
      ...generalShift,
      id: 4,
      label: "MP",
      name: "Med Pass",
      sortOrder: 4,
      jobId: 103,
    };
    const daySegment: ShiftJobSegment = {
      shiftId: 11,
      jobId: 102,
      position: 0,
      label: "D",
      isMentored: false,
    };
    const eveningSegment: ShiftJobSegment = { ...daySegment, shiftId: 12, label: "E" };
    const crossWingSegment: ShiftJobSegment = {
      ...daySegment,
      shiftId: null,
      jobId: 101,
      label: "X",
    };

    function renderAddingSecondShift(
      first: { id: number; label: string; segment: ShiftJobSegment },
      dayTimes: [string, string] | null,
      eveningTimes: [string, string] | null,
      customTimes: { customStartTime: string; customEndTime: string } | null = null,
    ) {
      const timed = (shift: AssignmentDefinition, times: [string, string] | null) =>
        times ? { ...shift, defaultStartTime: times[0], defaultEndTime: times[1] } : shift;
      return renderPanel({
        currentShift: first.label,
        currentAssignmentIds: [first.id],
        currentSegments: [first.segment],
        assignmentsOverride: [
          timed(northShift, dayTimes),
          timed(southShift, eveningTimes),
          generalShift,
          medPassShift,
        ],
        jobsOverride: [...jobs, medPassJob],
        absenceTypesOverride: absenceTypes,
        ...customTimes,
      });
    }

    async function openSecondShiftPicker() {
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /add another shift/i }));
      return user;
    }

    it("offers general shifts, earlier shifts and overlapping shifts after a regular shift", async () => {
      renderAddingSecondShift(
        { id: 2, label: "E", segment: eveningSegment },
        ["07:00", "15:00"],
        ["14:00", "23:00"],
      );
      await openSecondShiftPicker();

      expect(screen.getByRole("button", { name: "Day Shift - Supervisor" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cross Wing" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Med Pass" })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Evening Shift - Supervisor" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /vacation/i })).not.toBeInTheDocument();
    });

    it("offers a shift without times after a regular shift", async () => {
      renderAddingSecondShift({ id: 1, label: "D", segment: daySegment }, ["07:00", "15:00"], null);
      await openSecondShiftPicker();

      expect(
        screen.getByRole("button", { name: "Evening Shift - Supervisor" }),
      ).toBeInTheDocument();
    });

    it("lets a general shift without times take a regular or a different general shift", async () => {
      renderAddingSecondShift({ id: 3, label: "X", segment: crossWingSegment }, null, null);
      await openSecondShiftPicker();

      expect(screen.getByRole("button", { name: "Day Shift - Supervisor" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Med Pass" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cross Wing" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /vacation/i })).not.toBeInTheDocument();
    });

    it("puts an earlier shift added second in front of the first", async () => {
      const { onSelect } = renderAddingSecondShift(
        { id: 2, label: "E", segment: eveningSegment },
        ["07:00", "15:00"],
        ["15:00", "23:00"],
      );
      const user = await openSecondShiftPicker();
      await user.click(screen.getByRole("button", { name: "Day Shift - Supervisor" }));

      expect(onSelect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          segments: [
            { shiftId: 11, jobId: 102, position: 0, isMentored: false },
            { shiftId: 12, jobId: 102, position: 1, isMentored: false },
          ],
          customStartTime: null,
          customEndTime: null,
        }),
        undefined,
      );
    });

    it("keeps an untimed general shift picked first ahead of a timed shift", async () => {
      const { onSelect } = renderAddingSecondShift(
        { id: 3, label: "X", segment: crossWingSegment },
        ["07:00", "15:00"],
        ["15:00", "23:00"],
      );
      const user = await openSecondShiftPicker();
      await user.click(screen.getByRole("button", { name: "Day Shift - Supervisor" }));

      expect(onSelect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          segments: [
            { shiftId: null, jobId: 101, position: 0, isMentored: false },
            { shiftId: 11, jobId: 102, position: 1, isMentored: false },
          ],
        }),
        undefined,
      );
    });

    it("keeps the first shift's custom time on it when it moves second", async () => {
      const { onSelect } = renderAddingSecondShift(
        { id: 2, label: "E", segment: eveningSegment },
        ["07:00", "15:00"],
        ["15:00", "23:00"],
        { customStartTime: "15:30", customEndTime: "23:00" },
      );
      const user = await openSecondShiftPicker();
      await user.click(screen.getByRole("button", { name: "Day Shift - Supervisor" }));

      expect(onSelect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          segments: [
            expect.objectContaining({ shiftId: 11, position: 0 }),
            expect.objectContaining({ shiftId: 12, position: 1 }),
          ],
          customStartTime: "|15:30",
          customEndTime: "|23:00",
        }),
        undefined,
      );
    });

    it.each([
      {
        name: "a general shift beside a regular shift",
        first: { id: 1, label: "D", segment: daySegment },
        pick: "Cross Wing",
        second: { shiftId: null, jobId: 101 },
      },
      {
        name: "a different general shift beside a general shift",
        first: { id: 3, label: "X", segment: crossWingSegment },
        pick: "Med Pass",
        second: { shiftId: null, jobId: 103 },
      },
      {
        name: "a regular shift beside a general shift",
        first: { id: 3, label: "X", segment: crossWingSegment },
        pick: "Day Shift - Supervisor",
        second: { shiftId: 11, jobId: 102 },
      },
    ])("saves $name as a double shift", async ({ first, pick, second }) => {
      const { onSelect } = renderAddingSecondShift(first, null, null);
      const user = await openSecondShiftPicker();
      await user.click(screen.getByRole("button", { name: pick }));

      expect(onSelect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "worked",
          segments: [
            {
              shiftId: first.segment.shiftId,
              jobId: first.segment.jobId,
              position: 0,
              isMentored: false,
            },
            { ...second, position: 1, isMentored: false },
          ],
        }),
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

    it("keeps split-shift card corners concentric around the inset header", () => {
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

      // Outer radius = header radius + 5px inset + 1.5px border.
      expect(card?.style.borderRadius).toBe("calc(var(--dg-radius-md) + 6.5px)");
      expect(card?.style.padding).toBe("5px");
      expect(header?.style.borderRadius).toBe("var(--dg-radius-md)");
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

    it("shows the repeat flow for absences", async () => {
      const user = userEvent.setup();

      render(<RepeatAbsenceFlowPanel />);

      await user.click(screen.getByRole("button", { name: "Make this repeating" }));

      expect(screen.getByText("Repeating Absence")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create Repeating Absence" })).toBeInTheDocument();
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

  describe("Repeat overwrites", () => {
    async function submitRepeat(onRepeatConfirm: ReturnType<typeof vi.fn>) {
      const user = userEvent.setup();
      render(<RepeatFlowPanel onRepeatConfirm={onRepeatConfirm} />);
      await user.click(screen.getByRole("button", { name: "Make this a repeating shift" }));
      await user.click(screen.getByRole("button", { name: "Create Repeating Shift" }));
      return user;
    }

    it("creates without asking when no day already has a shift", async () => {
      const onRepeatConfirm = vi.fn();
      await submitRepeat(onRepeatConfirm);

      await waitFor(() => expect(onRepeatConfirm).toHaveBeenCalledTimes(1));
      expect(onRepeatConfirm.mock.calls[0][6]).toBe(false);
      expect(screen.queryByText("Replace existing shifts?")).not.toBeInTheDocument();
    });

    it.each([
      { choice: "Keep existing", keepExisting: true },
      { choice: "Replace", keepExisting: false },
    ])("asks first when days already have shifts: $choice", async ({ choice, keepExisting }) => {
      fetchRepeatOverwriteCountMock.mockResolvedValue({ overwriteCount: 2 });
      const onRepeatConfirm = vi.fn();
      const user = await submitRepeat(onRepeatConfirm);

      const dialog = await screen.findByRole("dialog", { name: "Replace existing shifts?" });
      expect(dialog).toHaveTextContent("2 of these days already have a shift or absence.");
      expect(onRepeatConfirm).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole("button", { name: choice }));

      expect(onRepeatConfirm).toHaveBeenCalledTimes(1);
      expect(onRepeatConfirm.mock.calls[0][6]).toBe(keepExisting);
    });

    it("still asks when the existing shifts cannot be counted", async () => {
      fetchRepeatOverwriteCountMock.mockRejectedValue(new Error("offline"));
      const onRepeatConfirm = vi.fn();
      await submitRepeat(onRepeatConfirm);

      const dialog = await screen.findByRole("dialog", { name: "Replace existing shifts?" });
      expect(dialog).toHaveTextContent("Some of these days may already have a shift or absence.");
      expect(onRepeatConfirm).not.toHaveBeenCalled();
    });
  });

  describe("Repeating shift scope", () => {
    it("opens on the view and removes with the days chosen", async () => {
      const user = userEvent.setup();
      const { onSelect } = renderPanel({
        currentShift: "D",
        currentAssignmentIds: [1],
        allowShiftEdits: true,
        seriesId: "series-1",
      });

      expect(screen.queryByRole("group", { name: "Apply changes to" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Remove" }));
      const dialog = await screen.findByRole("dialog", { name: /Remove repeating shift/ });
      const choices = within(dialog).getByRole("radiogroup", { name: "Days to remove" });
      expect(
        within(choices)
          .getAllByRole("radio")
          .map((radio) => radio.textContent),
      ).toEqual([
        expect.stringContaining("This day only"),
        "This and later days",
        "This and earlier days",
        "All days in the series",
      ]);

      await user.click(within(choices).getByRole("radio", { name: /This and later days/ }));
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));

      expect(onSelect).toHaveBeenLastCalledWith(null, "following");
    });

    it("removes with the earlier days", async () => {
      const user = userEvent.setup();
      const { onSelect } = renderPanel({
        currentShift: "D",
        currentAssignmentIds: [1],
        allowShiftEdits: true,
        seriesId: "series-1",
      });

      await user.click(screen.getByRole("button", { name: "Remove" }));
      const dialog = await screen.findByRole("dialog", { name: /Remove repeating shift/ });
      await user.click(within(dialog).getByRole("radio", { name: /This and earlier days/ }));
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));

      expect(onSelect).toHaveBeenLastCalledWith(null, "previous");
    });

    it("asks which days an edit reaches and keeps times to a single day", async () => {
      const user = userEvent.setup();
      renderPanel({
        currentShift: "D",
        currentAssignmentIds: [1],
        allowShiftEdits: true,
        seriesId: "series-1",
        onCustomTimeChange: vi.fn(),
      });

      await user.click(screen.getByRole("button", { name: "Edit" }));
      const dialog = await screen.findByRole("dialog", { name: /Edit repeating shift/ });
      await user.click(within(dialog).getByRole("radio", { name: /This and later days/ }));
      await user.click(within(dialog).getByRole("button", { name: "Continue" }));

      expect(screen.getByText("Editing this and later days")).toBeInTheDocument();
      expect(screen.getByText(/Times and notes change one day at a time/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Custom time/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    });
  });

  describe("Absence for the rest of the day", () => {
    const sick: AbsenceType = {
      id: 8,
      orgId: "org-1",
      label: "S",
      name: "Sick",
      color: "#FEE2E2",
      border: "#FCA5A5",
      text: "#991B1B",
      sortOrder: 2,
    };
    const timedDay = { ...northShift, defaultStartTime: "07:00", defaultEndTime: "15:00" };
    const timedEvening = { ...southShift, defaultStartTime: "15:00", defaultEndTime: "23:00" };
    const daySegment: ShiftJobSegment = {
      shiftId: 11,
      jobId: 102,
      position: 0,
      label: "D",
      isMentored: false,
    };
    const eveningSegment: ShiftJobSegment = {
      ...daySegment,
      shiftId: 12,
      position: 1,
      label: "E",
    };

    function renderDay(overrides: Parameters<typeof renderPanel>[0] = {}) {
      return renderPanel({
        currentShift: "D",
        currentAssignmentIds: [1],
        currentSegments: [daySegment],
        assignmentsOverride: [timedDay, timedEvening, generalShift],
        absenceTypesOverride: [...absenceTypes, sick],
        allowShiftEdits: true,
        ...overrides,
      });
    }

    it("adds an absence beside the shift and keeps the shift", async () => {
      const user = userEvent.setup();
      const { onSelect } = renderDay();

      await user.click(screen.getByRole("button", { name: "Add an absence" }));
      expect(screen.queryByRole("button", { name: "Evening Shift - Supervisor" })).toBeNull();
      await user.click(screen.getByRole("button", { name: "S - Sick" }));

      expect(onSelect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "worked",
          segments: [{ shiftId: 11, jobId: 102, position: 0, isMentored: false }],
          absenceTypeId: 8,
        }),
        undefined,
      );
    });

    it("draws a left-early absence after the shift with what it covers, and offers no second absence", () => {
      renderDay({
        currentRestOfDayAbsenceTypeId: 8,
        currentRestOfDayAbsenceStartTime: "11:00",
        currentRestOfDayAbsenceEndTime: "15:00",
        customStartTime: "07:00",
        customEndTime: "11:00",
      });

      const card = document.querySelector("[data-rest-of-day-absence-card]");
      expect(card).toHaveAttribute("data-absence-side", "left-early");
      expect(card).toHaveTextContent(
        "Covers 11:00 AM - 3:00 PM, the rest of the Day Shift. No hours.",
      );
      expect(card).not.toHaveTextContent("Mentored");
      expect(screen.queryByRole("button", { name: "Add an absence" })).toBeNull();
      // Nobody works on after leaving early.
      expect(screen.queryByRole("button", { name: "Add another shift" })).toBeNull();
    });

    it("hides Add another shift at two shifts but still offers an absence", () => {
      renderDay({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: [daySegment, eveningSegment],
      });

      expect(screen.queryByRole("button", { name: "Add another shift" })).toBeNull();
      expect(screen.getByRole("button", { name: "Add an absence" })).toBeInTheDocument();
    });

    it("adds a later shift beside an arrived-late absence and keeps the absence", async () => {
      const user = userEvent.setup();
      const { onSelect } = renderDay({
        currentRestOfDayAbsenceTypeId: 8,
        currentRestOfDayAbsenceStartTime: "07:00",
        currentRestOfDayAbsenceEndTime: "11:00",
        customStartTime: "11:00",
        customEndTime: "15:00",
      });

      await user.click(screen.getByRole("button", { name: "Add another shift" }));
      expect(screen.queryByRole("button", { name: "S - Sick" })).toBeNull();
      await user.click(screen.getByRole("button", { name: "Evening Shift - Supervisor" }));

      expect(onSelect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "worked",
          segments: [
            { shiftId: 11, jobId: 102, position: 0, isMentored: false },
            { shiftId: 12, jobId: 102, position: 1, isMentored: false },
          ],
          absenceTypeId: 8,
        }),
        undefined,
      );
    });

    it("removes only the absence and keeps the shifts", async () => {
      const user = userEvent.setup();
      const { onSelect } = renderDay({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: [daySegment, eveningSegment],
        currentRestOfDayAbsenceTypeId: 8,
      });

      await user.click(screen.getByRole("button", { name: "Remove Sick" }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("Remove Sick from Alice Smith on");
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));

      expect(onSelect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "worked",
          segments: [
            { shiftId: 11, jobId: 102, position: 0, isMentored: false },
            { shiftId: 12, jobId: 102, position: 1, isMentored: false },
          ],
          absenceTypeId: null,
        }),
        undefined,
      );
    });

    it("keeps the absence when one of two shifts is removed", async () => {
      const user = userEvent.setup();
      const { onSelect } = renderDay({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: [daySegment, eveningSegment],
        currentRestOfDayAbsenceTypeId: 8,
      });

      await user.click(screen.getByRole("button", { name: /^Remove Day Shift/ }));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }),
      );

      expect(onSelect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          segments: [expect.objectContaining({ shiftId: 12, jobId: 102 })],
          absenceTypeId: 8,
        }),
        undefined,
      );
    });

    it("removes the shift and the absence together, naming both", async () => {
      const user = userEvent.setup();
      const { onSelect } = renderDay({ currentRestOfDayAbsenceTypeId: 8 });

      await user.click(screen.getByRole("button", { name: "Remove shift and absence" }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("Remove Shift and Absence?");
      expect(dialog).toHaveTextContent('the absence "Sick"');
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));

      expect(onSelect).toHaveBeenLastCalledWith(null, undefined);
    });

    it("names two shifts and an absence on the whole-cell remove", async () => {
      renderDay({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: [daySegment, eveningSegment],
        currentRestOfDayAbsenceTypeId: 8,
      });

      expect(screen.getByRole("button", { name: "Remove shifts and absence" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove all shifts" })).toBeNull();
    });

    it("calls two shifts without an absence both shifts", async () => {
      const user = userEvent.setup();
      renderDay({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: [daySegment, eveningSegment],
      });

      await user.click(screen.getByRole("button", { name: "Remove both shifts" }));
      expect(await screen.findByRole("dialog")).toHaveTextContent("Remove Both Shifts?");
    });

    it("spells out Remove on each shift and on the absence", () => {
      renderDay({
        currentShift: "D/E",
        currentAssignmentIds: [1, 2],
        currentSegments: [daySegment, eveningSegment],
        currentRestOfDayAbsenceTypeId: 8,
      });

      const cards = document.querySelectorAll<HTMLElement>("[data-shift-edit-card]");
      expect(cards).toHaveLength(2);
      for (const card of cards) {
        expect(within(card).getByRole("button", { name: /^Remove / })).toHaveTextContent(
          /^Remove$/,
        );
      }
      const absenceCard = document.querySelector<HTMLElement>("[data-rest-of-day-absence-card]");
      expect(within(absenceCard!).getByRole("button", { name: "Remove Sick" })).toHaveTextContent(
        /^Remove$/,
      );
    });

    it("shows Before and After only when a shift that was there is changed", () => {
      const base = {
        currentShift: "D",
        currentAssignmentIds: [1],
        currentSegments: [daySegment],
        assignmentsOverride: [timedDay, timedEvening, generalShift],
        allowShiftEdits: true,
      };
      const { rerender } = render(panelElement(base, vi.fn(), vi.fn()));
      rerender(
        panelElement(
          {
            ...base,
            currentShift: "E",
            currentAssignmentIds: [2],
            currentSegments: [eveningSegment],
          },
          vi.fn(),
          vi.fn(),
        ),
      );
      expect(screen.getByText("Before")).toBeInTheDocument();
      expect(screen.getByText("After")).toBeInTheDocument();
    });

    it("shows no Before and After for a shift on an empty day", () => {
      const base = {
        assignmentsOverride: [timedDay, timedEvening, generalShift],
        allowShiftEdits: true,
      };
      const { rerender } = render(panelElement(base, vi.fn(), vi.fn()));
      rerender(
        panelElement(
          { ...base, currentShift: "D", currentAssignmentIds: [1], currentSegments: [daySegment] },
          vi.fn(),
          vi.fn(),
        ),
      );
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
      expect(screen.queryByText("Before")).not.toBeInTheDocument();
    });

    it("shows no Before and After for an added absence, and Cancel undoes it", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const onClose = vi.fn();
      const base = {
        currentShift: "D",
        currentAssignmentIds: [1],
        currentSegments: [daySegment],
        assignmentsOverride: [timedDay, timedEvening, generalShift],
        absenceTypesOverride: [...absenceTypes, sick],
        allowShiftEdits: true,
      };
      const { rerender } = render(panelElement(base, onSelect, onClose));
      rerender(panelElement({ ...base, currentRestOfDayAbsenceTypeId: 8 }, onSelect, onClose));

      expect(screen.queryByText("Before")).not.toBeInTheDocument();
      expect(screen.queryByText("After")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onSelect).toHaveBeenLastCalledWith(
        expect.objectContaining({
          kind: "worked",
          segments: [{ shiftId: 11, jobId: 102, position: 0, isMentored: false }],
          absenceTypeId: null,
        }),
      );
    });

    describe("left early and arrived late (50c)", () => {
      const nightShift = {
        ...timedDay,
        id: 3,
        label: "N",
        name: "Night",
        shiftId: 13,
        defaultStartTime: "23:00",
        defaultEndTime: "07:00",
      };
      const segmentFor: Record<number, ShiftJobSegment> = { 11: daySegment, 12: eveningSegment };
      const labelFor: Record<number, string> = { 11: "D", 12: "E" };
      const assignmentFor: Record<number, number> = { 11: 1, 12: 2 };

      /** The props the schedule page passes back after the panel writes a draft. */
      function propsFromInput(input: ScheduleCellInput | null) {
        if (!input || input.kind !== "worked") {
          return {
            currentShift: input?.kind === "absence" ? "S" : null,
            currentSegments: [],
            currentAssignmentIds: [],
            currentAbsenceTypeId: input?.kind === "absence" ? input.absenceTypeId : null,
            currentRestOfDayAbsenceTypeId: null,
          };
        }
        return {
          currentShift: input.segments.map((segment) => labelFor[segment.shiftId ?? 0]).join("/"),
          currentSegments: input.segments.map((segment, position) => ({
            ...segmentFor[segment.shiftId ?? 0],
            position,
          })),
          currentAssignmentIds: input.segments.map(
            (segment) => assignmentFor[segment.shiftId ?? 0],
          ),
          customStartTime: input.customStartTime,
          customEndTime: input.customEndTime,
          currentRestOfDayAbsenceTypeId: input.absenceTypeId,
          currentRestOfDayAbsenceStartTime: input.absenceStartTime ?? null,
          currentRestOfDayAbsenceEndTime: input.absenceEndTime ?? null,
        };
      }

      function DraftHarness({
        initial,
        onSelect,
      }: {
        initial: Parameters<typeof renderPanel>[0] & object;
        onSelect: ReturnType<typeof vi.fn>;
      }) {
        const [props, setProps] = useState(initial);
        const [select] = useState(() =>
          vi.fn((input: ScheduleCellInput | null, scope?: unknown) => {
            onSelect(input, scope);
            setProps((previous) => ({ ...previous, ...propsFromInput(input) }));
          }),
        );
        return panelElement(props, select, vi.fn());
      }

      function renderDraft(overrides: Parameters<typeof renderPanel>[0] & object = {}) {
        const onSelect = vi.fn();
        render(
          <DraftHarness
            onSelect={onSelect}
            initial={{
              currentShift: "D",
              currentAssignmentIds: [1],
              currentSegments: [daySegment],
              assignmentsOverride: [timedDay, timedEvening, nightShift, generalShift],
              absenceTypesOverride: [...absenceTypes, sick],
              allowShiftEdits: true,
              onCustomTimeChange: vi.fn(),
              currentRestOfDayAbsenceTypeId: 8,
              ...overrides,
            }}
          />,
        );
        return { onSelect, user: userEvent.setup() };
      }

      async function pick(
        user: ReturnType<typeof userEvent.setup>,
        field: string,
        part: string,
        option: string,
      ) {
        await user.click(screen.getByRole("button", { name: `${field} ${part}` }));
        await user.click(screen.getByRole("option", { name: option }));
      }

      const card = () => document.querySelector<HTMLElement>("[data-rest-of-day-absence-card]")!;
      const save = () => screen.getByRole("button", { name: "Save changes" });
      // With no edit to save the footer is hidden; with one, Save waits.
      const expectSaveBlocked = () => {
        const button = screen.queryByRole("button", { name: "Save changes" });
        if (button) expect(button).toBeDisabled();
      };

      it("asks when they left, then cuts the shift and sends the absence's span", async () => {
        const { onSelect, user } = renderDraft();

        expect(screen.getByText("When did Alice leave the Day Shift?")).toBeVisible();
        await pick(user, "Left at", "hour", "11");

        expect(onSelect).toHaveBeenLastCalledWith(
          expect.objectContaining({
            segments: [expect.objectContaining({ shiftId: 11 })],
            customStartTime: "07:00",
            customEndTime: "11:00",
            absenceTypeId: 8,
            absenceStartTime: "11:00",
            absenceEndTime: "15:00",
          }),
          undefined,
        );
        expect(card()).toHaveTextContent(
          "Covers 11:00 AM - 3:00 PM, the rest of the Day Shift. No hours.",
        );
        expect(
          screen.getByRole("img", { name: "Worked 7:00 AM to 11:00 AM, Sick 11:00 AM to 3:00 PM" }),
        ).toBeInTheDocument();
        expect(save()).toBeEnabled();
      });

      it("moves an arrived-late absence above the shift and covers its start", async () => {
        const { onSelect, user } = renderDraft({
          customStartTime: "07:00",
          customEndTime: "11:00",
          currentRestOfDayAbsenceStartTime: "11:00",
          currentRestOfDayAbsenceEndTime: "15:00",
        });

        await user.click(screen.getByRole("button", { name: "Arrived late" }));

        expect(onSelect).toHaveBeenLastCalledWith(
          expect.objectContaining({
            customStartTime: "11:00",
            customEndTime: "15:00",
            absenceStartTime: "07:00",
            absenceEndTime: "11:00",
          }),
          undefined,
        );
        expect(card()).toHaveAttribute("data-absence-side", "arrived-late");
        expect(screen.getByRole("group", { name: "Arrives at" })).toBeInTheDocument();
        expect(card()).toHaveTextContent(
          "Covers 7:00 AM - 11:00 AM, the start of the Day Shift. No hours.",
        );
        const shiftSwitch = screen.getByRole("switch", { name: "Mentored assignment" });
        expect(card().compareDocumentPosition(shiftSwitch) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
        expect(
          screen.getByRole("img", { name: "Sick 7:00 AM to 11:00 AM, Worked 11:00 AM to 3:00 PM" }),
        ).toBeInTheDocument();
      });

      it("reopens a stored arrived-late absence on its side", () => {
        renderDraft({
          customStartTime: "11:00",
          customEndTime: "15:00",
          currentRestOfDayAbsenceStartTime: "07:00",
          currentRestOfDayAbsenceEndTime: "11:00",
        });

        expect(card()).toHaveAttribute("data-absence-side", "arrived-late");
        expect(screen.getByRole("button", { name: "Arrived late" })).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      });

      it("takes off a second shift that wasn't worked, and brings it back when the time moves", async () => {
        const { onSelect, user } = renderDraft({
          currentShift: "D/E",
          currentAssignmentIds: [1, 2],
          currentSegments: [daySegment, eveningSegment],
        });

        await pick(user, "Left at", "hour", "1");
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Pick a time between 7:00 AM, when the Day Shift starts, and 11:00 PM, when the Evening Shift ends.",
        );
        await pick(user, "Left at", "AM or PM", "PM");

        expect(onSelect).toHaveBeenLastCalledWith(
          expect.objectContaining({
            segments: [expect.objectContaining({ shiftId: 11, position: 0 })],
            customStartTime: "07:00",
            customEndTime: "13:00",
            absenceStartTime: "13:00",
            absenceEndTime: "23:00",
          }),
          undefined,
        );
        expect(card()).toHaveTextContent(
          "Covers 1:00 PM - 11:00 PM: the rest of the Day Shift and all of the Evening Shift. No hours.",
        );
        expect(card()).toHaveTextContent(
          "The Evening Shift starts after Alice left, so it comes off and Sick covers it.",
        );

        await pick(user, "Left at", "hour", "7");
        expect(onSelect).toHaveBeenLastCalledWith(
          expect.objectContaining({
            segments: [
              expect.objectContaining({ shiftId: 11, position: 0 }),
              expect.objectContaining({ shiftId: 12, position: 1 }),
            ],
            customStartTime: "|15:00",
            customEndTime: "|19:00",
            absenceStartTime: "19:00",
            absenceEndTime: "23:00",
          }),
          undefined,
        );
      });

      it("brings a shift taken off back when the absence is removed", async () => {
        const { onSelect, user } = renderDraft({
          currentShift: "D/E",
          currentAssignmentIds: [1, 2],
          currentSegments: [daySegment, eveningSegment],
        });
        await pick(user, "Left at", "hour", "1");
        await pick(user, "Left at", "AM or PM", "PM");

        await user.click(screen.getByRole("button", { name: "Remove Sick" }));
        const dialog = await screen.findByRole("dialog");
        expect(dialog).toHaveTextContent(
          "Remove Sick from Alice Smith on 1/15? The Day Shift goes back to 7:00 AM - 3:00 PM (8 hrs). The Evening Shift comes back.",
        );
        await user.click(within(dialog).getByRole("button", { name: "Remove" }));

        expect(onSelect).toHaveBeenLastCalledWith(
          expect.objectContaining({
            segments: [
              expect.objectContaining({ shiftId: 11 }),
              expect.objectContaining({ shiftId: 12 }),
            ],
            customStartTime: null,
            customEndTime: null,
            absenceTypeId: null,
          }),
          undefined,
        );
      });

      it("offers a whole-day absence when the shift was never started", async () => {
        const { onSelect, user } = renderDraft();

        await pick(user, "Left at", "hour", "7");
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Alice left when the Day Shift started, so none of it was worked.",
        );
        expectSaveBlocked();
        await user.click(screen.getByRole("button", { name: "Make it Sick for the whole day" }));

        expect(onSelect).toHaveBeenLastCalledWith(
          expect.objectContaining({ kind: "absence", absenceTypeId: 8, segments: [] }),
          undefined,
        );
      });

      it("refuses the scheduled end, where the absence covers no time", () => {
        renderDraft({ customStartTime: "07:00", customEndTime: "15:00" });

        expect(screen.getByRole("alert")).toHaveTextContent(
          "The Day Shift ends at 3:00 PM, so Sick would cover no time. Set when Alice left, or remove Sick.",
        );
        expect(screen.getByRole("group", { name: "Left at" })).toHaveAttribute(
          "aria-invalid",
          "true",
        );
        expectSaveBlocked();
      });

      it("refuses a time before the start, which used to count 23.75 hours", () => {
        renderDraft({ customStartTime: "07:00", customEndTime: "06:45" });

        expect(screen.getByRole("alert")).toHaveTextContent(
          "Pick a time after the Day Shift starts at 7:00 AM and before it ends at 3:00 PM.",
        );
      });

      it("names the mirror problem for arrived late", async () => {
        const { user } = renderDraft({
          customStartTime: "11:00",
          customEndTime: "15:00",
          currentRestOfDayAbsenceStartTime: "07:00",
          currentRestOfDayAbsenceEndTime: "11:00",
        });

        await pick(user, "Arrives at", "hour", "7");
        expect(screen.getByRole("alert")).toHaveTextContent(
          "The Day Shift starts at 7:00 AM, so Sick would cover no time. Set when Alice arrives, or remove Sick.",
        );
      });

      it("accepts a time after midnight on an overnight shift", () => {
        renderDraft({
          currentShift: "N",
          currentAssignmentIds: [3],
          currentSegments: [{ ...daySegment, shiftId: 13, label: "N" }],
          customStartTime: "23:00",
          customEndTime: "03:00",
        });

        expect(screen.queryByRole("alert")).toBeNull();
        expect(card()).toHaveTextContent("Covers 3:00 AM - 7:00 AM");
      });

      it("keeps a stored span that covered a shift taken off before", () => {
        renderDraft({
          customStartTime: "07:00",
          customEndTime: "13:00",
          currentRestOfDayAbsenceStartTime: "13:00",
          currentRestOfDayAbsenceEndTime: "23:00",
        });

        expect(card()).toHaveTextContent(
          "Covers 1:00 PM - 11:00 PM: the rest of the Day Shift and the time after it. No hours.",
        );
      });
    });

    describe("adding and removing the absence (50a)", () => {
      async function addSick(times: { customStartTime?: string; customEndTime?: string }) {
        const user = userEvent.setup();
        const { onSelect } = renderDay({ ...times, onCustomTimeChange: vi.fn() });
        await user.click(screen.getByRole("button", { name: "Add an absence" }));
        await user.click(screen.getByRole("button", { name: "S - Sick" }));
        return { onSelect };
      }

      it("leaves the time unset on a shift with no time of its own", async () => {
        const { onSelect } = await addSick({});

        expect(onSelect).toHaveBeenLastCalledWith(
          expect.objectContaining({
            absenceTypeId: 8,
            customEndTime: null,
            absenceStartTime: null,
          }),
          undefined,
        );
      });

      it("clears a time at the scheduled end, which the absence could not cover", async () => {
        const { onSelect } = await addSick({ customStartTime: "07:00", customEndTime: "15:00" });

        expect(onSelect).toHaveBeenLastCalledWith(
          expect.objectContaining({ absenceTypeId: 8, customEndTime: null }),
          undefined,
        );
      });

      it("keeps a time already before the scheduled end, and times the absence from it", async () => {
        const { onSelect } = await addSick({ customStartTime: "07:00", customEndTime: "11:00" });

        expect(onSelect).toHaveBeenLastCalledWith(
          expect.objectContaining({
            absenceTypeId: 8,
            customEndTime: "11:00",
            absenceStartTime: "11:00",
            absenceEndTime: "15:00",
          }),
          undefined,
        );
      });

      it("puts the shift back to its scheduled times when the absence is removed", async () => {
        const user = userEvent.setup();
        const { onSelect } = renderDay({
          currentRestOfDayAbsenceTypeId: 8,
          currentRestOfDayAbsenceStartTime: "11:00",
          currentRestOfDayAbsenceEndTime: "15:00",
          customStartTime: "07:00",
          customEndTime: "11:00",
          onCustomTimeChange: vi.fn(),
        });

        await user.click(screen.getByRole("button", { name: "Remove Sick" }));
        expect(screen.getByRole("dialog")).toHaveTextContent(
          "The Day Shift goes back to 7:00 AM - 3:00 PM (8 hrs).",
        );
        await user.click(screen.getByRole("button", { name: "Remove" }));

        expect(onSelect).toHaveBeenLastCalledWith(
          expect.objectContaining({
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
          }),
          undefined,
        );
      });

      it("says nothing about times when the shift never had its own", async () => {
        const user = userEvent.setup();
        renderDay({ currentRestOfDayAbsenceTypeId: 8, onCustomTimeChange: vi.fn() });

        await user.click(screen.getByRole("button", { name: "Remove Sick" }));
        expect(screen.getByRole("dialog")).not.toHaveTextContent("goes back to");
      });

      it("brings back the absence and its time with Cancel", async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();
        const onClose = vi.fn();
        const base = {
          currentShift: "D",
          currentAssignmentIds: [1],
          currentSegments: [daySegment],
          assignmentsOverride: [timedDay, timedEvening, generalShift],
          absenceTypesOverride: [...absenceTypes, sick],
          allowShiftEdits: true,
          onCustomTimeChange: vi.fn(),
        };
        const { rerender } = render(
          panelElement(
            {
              ...base,
              currentRestOfDayAbsenceTypeId: 8,
              customStartTime: "07:00",
              customEndTime: "11:00",
            },
            onSelect,
            onClose,
          ),
        );
        rerender(panelElement(base, onSelect, onClose));
        await user.click(screen.getByRole("button", { name: "Cancel" }));

        expect(onSelect).toHaveBeenLastCalledWith(
          expect.objectContaining({
            absenceTypeId: 8,
            customStartTime: "07:00",
            customEndTime: "11:00",
          }),
        );
      });
    });

    it("shows no Left at without an absence", () => {
      renderDay({ onCustomTimeChange: vi.fn() });
      expect(screen.queryByRole("group", { name: "Left at" })).toBeNull();
    });

    it("makes Repeat unavailable on a shift with an absence, and says why", () => {
      renderDay({ currentRestOfDayAbsenceTypeId: 8, onRepeatConfirm: vi.fn() });

      expect(screen.getByRole("button", { name: "Make this a repeating shift" })).toBeDisabled();
      expect(
        screen.getByText(/A shift with an absence for the rest of the day can.t repeat/),
      ).toBeInTheDocument();
    });

    it("offers an absence on a repeating shift only for this date", async () => {
      const user = userEvent.setup();
      const editDays = async (choice: RegExp) => {
        await user.click(screen.getByRole("button", { name: "Edit" }));
        const dialog = await screen.findByRole("dialog", { name: /Edit repeating shift/ });
        await user.click(within(dialog).getByRole("radio", { name: choice }));
        await user.click(within(dialog).getByRole("button", { name: "Continue" }));
      };
      renderDay({ seriesId: "series-1" });

      await editDays(/This day only/);
      expect(screen.getByRole("button", { name: "Add an absence" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Back" }));
      await editDays(/This and later days/);
      expect(screen.queryByRole("button", { name: "Add an absence" })).toBeNull();
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
        getShiftSegments: () => [
          { shiftId: 12, jobId: 102, label: "E", startTime: "15:00", endTime: "23:00" },
        ],
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
      expect(teammateRow).not.toHaveTextContent(/Shift 1/);
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

      expect(onSubmitSwap).toHaveBeenCalledWith("emp-2", "2037-05-05", {
        requesterSegmentIndex: undefined,
        targetSegmentIndex: 0,
      });
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
      expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
      expect(onConfirmDraft).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Day Shift - Supervisor" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      expect(onConfirmDraft).toHaveBeenCalledTimes(1);
      expect(onConfirmDraft).toHaveBeenCalledWith(undefined);
    });

    it("never saves on its own after removing a shift from a cell that opened empty", async () => {
      const user = userEvent.setup();
      const onConfirmDraft = vi.fn();

      render(<ConfirmDraftHarness onConfirmDraft={onConfirmDraft} />);

      await user.click(screen.getByRole("button", { name: "Day Shift - Supervisor" }));
      await user.click(screen.getByRole("button", { name: "Remove shift" }));
      const dialog = await screen.findByRole("dialog", { name: /Remove/i });
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));
      await user.click(screen.getByRole("button", { name: "Day Shift - Supervisor" }));

      expect(onConfirmDraft).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
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
      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
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
