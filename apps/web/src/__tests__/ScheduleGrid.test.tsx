import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import ScheduleGrid, {
  buildScheduleGridModel,
  type ScheduleGridHandlers,
  type ScheduleGridInteractionState,
} from "@/components/ScheduleGrid";
import { getReadableTextOnSurface } from "@/lib/colors";
import { formatDateKey } from "@/lib/utils";
import type {
  AbsenceType,
  CoverageRequirement,
  Department,
  DraftKind,
  Employee,
  FocusArea,
  GridCellId,
  IndicatorType,
  JobDefinition,
  NamedItem,
  ScheduleCellState,
  ShiftCategory,
  AssignmentDefinition,
} from "@/types";

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => ({ user: null, signOut: vi.fn(), isLoading: false }),
}));

const focusAreas: FocusArea[] = [
  { id: 1, orgId: "org-1", departmentId: 1, name: "North", sortOrder: 1 },
  { id: 2, orgId: "org-1", departmentId: 1, name: "South", sortOrder: 2 },
];

const departments: Department[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "Schedule",
    abbr: "SCH",
    type: "scheduled",
    sortOrder: 1,
  },
];

const shiftCategories: ShiftCategory[] = [
  {
    id: 1,
    orgId: "org-1",
    name: "Day",
    sortOrder: 1,
  },
];

const assignments: AssignmentDefinition[] = [
  {
    id: 1,
    orgId: "org-1",
    label: "D",
    name: "Day Shift",
    color: "#E5F3E8",
    border: "#2E9930",
    text: "#1A3D1B",
    categoryId: 1,
    focusAreaId: 1,
    sortOrder: 1,
  },
];

const indicatorTypes: IndicatorType[] = [
  { id: 1, orgId: "org-1", name: "Flag", color: "#ff0000", sortOrder: 1 },
];

const employees: Employee[] = [
  {
    id: "emp-1",
    firstName: "Alex",
    lastName: "Taylor",
    employmentType: "full_time",
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    certificationId: null,
    roleIds: [],
    seniority: 1,
    focusAreaIds: [1],
    phone: "",
    email: "",
    contactNotes: "",
    deptAdminIds: [],
    userId: null,
    departmentIds: [],
    version: 0,
  },
];

const extendedEmployees: Employee[] = [
  employees[0],
  {
    ...employees[0],
    id: "emp-2",
    firstName: "Jordan",
    lastName: "Reed",
    seniority: 2,
  },
  {
    ...employees[0],
    id: "emp-3",
    firstName: "Casey",
    lastName: "Morgan",
    seniority: 3,
  },
];

const week1 = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 7 + index));
const week2 = Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 14 + index));
function getShiftStyleFromCodes(codes: AssignmentDefinition[]) {
  return (type: string) =>
    codes.find((code) => code.label === type || code.name === type) ?? codes[0];
}

function makeShiftAccessors(codes: AssignmentDefinition[], assignments: Record<string, number[]>) {
  const codeById = new Map(codes.map((code) => [code.id, code]));

  return {
    assignmentIdsForKey: (empId: string, date: Date) =>
      assignments[`${empId}_${formatDateKey(date)}`] ?? [],
    shiftForKey: (empId: string, date: Date) => {
      const codeIds = assignments[`${empId}_${formatDateKey(date)}`] ?? [];
      const labels = codeIds
        .map((codeId) => codeById.get(codeId)?.label)
        .filter((label): label is string => !!label);
      return labels.length > 0 ? labels.join("/") : null;
    },
  };
}

let observedWidth = 1600;
const originalResizeObserver = global.ResizeObserver;
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const scrollIntoViewMock = vi.fn();

beforeAll(() => {
  global.ResizeObserver = class ResizeObserverMock {
    private callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe() {
      this.callback(
        [
          {
            contentRect: {
              width: observedWidth,
              height: 0,
              x: 0,
              y: 0,
              top: 0,
              right: observedWidth,
              bottom: 0,
              left: 0,
              toJSON: () => ({}),
            },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }

    disconnect() {}
    unobserve() {}
  } as typeof ResizeObserver;

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      width: observedWidth,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      right: observedWidth,
      bottom: 0,
      left: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  HTMLElement.prototype.scrollIntoView = function scrollIntoView(...args: unknown[]) {
    scrollIntoViewMock(...args);
  };
});

afterAll(() => {
  global.ResizeObserver = originalResizeObserver;
  HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

beforeEach(() => {
  scrollIntoViewMock.mockClear();
});

interface RenderGridOptions {
  filteredEmployees?: Employee[];
  allEmployees?: Employee[];
  week1?: Date[];
  week2?: Date[];
  spanWeeks?: 1 | 2;
  shiftForKey?: (empId: string, date: Date) => string | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  segmentsForKey?: (empId: string, date: Date) => ScheduleCellState["segments"];
  publishedSegmentsForKey?: (empId: string, date: Date) => ScheduleCellState["segments"];
  getShiftStyle?: (type: string, focusAreaName?: string) => AssignmentDefinition;
  today?: Date;
  highlightEmpIds?: Set<string>;
  highlightScrollKey?: string;
  focusAreas?: FocusArea[];
  departments?: Department[];
  assignments?: AssignmentDefinition[];
  historicalAssignments?: AssignmentDefinition[];
  shiftCategories?: ShiftCategory[];
  jobs?: JobDefinition[];
  indicatorTypes?: IndicatorType[];
  certifications?: NamedItem[];
  orgRoles?: NamedItem[];
  isCellInteractive?: boolean;
  canDragShifts?: boolean;
  activeIndicatorIdsForKey?: (empId: string, date: Date, focusAreaId?: number) => number[];
  activeFocusArea?: number | null;
  getCustomShiftTimes?: (
    empId: string,
    date: Date,
  ) => {
    start: string;
    end: string;
    perPill?: { start: string; end: string }[];
  } | null;
  getPublishedCustomShiftTimes?: (
    empId: string,
    date: Date,
  ) => {
    start: string;
    end: string;
    perPill?: { start: string; end: string }[];
  } | null;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  showDiffOverlay?: boolean;
  showPublishDiffOverlay?: boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedAssignmentIdsForKey?: (empId: string, date: Date) => number[];
  publishedAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  hasTimeChangesForKey?: (empId: string, date: Date) => boolean;
  publishDiffForKey?: (
    empId: string,
    date: Date,
  ) => {
    empId: string;
    date: string;
    kind: "new" | "modified" | "deleted";
    from?: number[];
    to?: number[];
    fromCustomStart?: string;
    fromCustomEnd?: string;
    toCustomStart?: string;
    toCustomEnd?: string;
    fromAbsenceTypeId?: number | null;
    toAbsenceTypeId?: number | null;
    fromSegments?: Array<{ label: string }>;
    toSegments?: Array<{ label: string }>;
    fromState?: ScheduleCellState | null;
    toState?: ScheduleCellState | null;
    publishedAt: string;
    publishedBy: string;
  } | null;
  recentlyPublishedKeys?: Set<string>;
  cellLocks?: Map<string, { userName: string }>;
  showAudit?: boolean;
  createdByNameForKey?: (empId: string, date: Date) => string | null;
  coverageRequirements?: CoverageRequirement[];
  absenceTypeMap?: Map<number, AbsenceType>;
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  shiftDisplayMode?: "code" | "name";
  resolvePublisherName?: (userId: string) => string | null;
  openShifts?: Array<Record<string, unknown>>;
  activeCellId?: GridCellId | null;
  contextMenuCellId?: GridCellId | null;
  hasClipboard?: boolean;
  bulkDeleteMode?: boolean;
  bulkSelectedCellKeys?: Set<string>;
  bulkSelectableCellKeys?: Set<string>;
  onActivateCell?: ScheduleGridHandlers["onActivateCell"];
  onOpenCellMenu?: NonNullable<ScheduleGridHandlers["onOpenCellMenu"]>;
  onMoveEntry?: NonNullable<ScheduleGridHandlers["onMoveEntry"]>;
  onCopyCell?: NonNullable<ScheduleGridHandlers["onCopyCell"]>;
  onPasteCell?: NonNullable<ScheduleGridHandlers["onPasteCell"]>;
  onClearCell?: NonNullable<ScheduleGridHandlers["onClearCell"]>;
  onToggleBulkDeleteCell?: NonNullable<ScheduleGridHandlers["onToggleBulkDeleteCell"]>;
  onClaimOpenShift?: NonNullable<ScheduleGridHandlers["onClaimOpenShift"]>;
}

function renderGrid(options: RenderGridOptions = {}) {
  const resolvedAssignmentDefinitions = options.assignments ?? assignments;
  const model = buildScheduleGridModel({
    filteredEmployees: options.filteredEmployees ?? employees,
    allEmployees: options.allEmployees ?? employees,
    week1: options.week1 ?? week1,
    week2: options.week2 ?? week2,
    spanWeeks: options.spanWeeks ?? 2,
    today: options.today ?? week1[0],
    focusAreas: options.focusAreas ?? focusAreas,
    departments: options.departments ?? departments,
    assignments: resolvedAssignmentDefinitions,
    historicalAssignments: options.historicalAssignments,
    shiftCategories: options.shiftCategories ?? shiftCategories,
    jobs: options.jobs ?? [],
    indicatorTypes: options.indicatorTypes ?? indicatorTypes,
    certifications: options.certifications ?? [],
    orgRoles: options.orgRoles ?? [],
    coverageRequirements: options.coverageRequirements,
    absenceTypeMap: options.absenceTypeMap,
    recentlyPublishedKeys: options.recentlyPublishedKeys,
    cellLocks: options.cellLocks,
    resolvePublisherName: options.resolvePublisherName,
    openShifts: options.openShifts as any,
    activeFocusArea: options.activeFocusArea ?? null,
    highlightEmpIds: options.highlightEmpIds,
    highlightScrollKey: options.highlightScrollKey,
    isCellInteractive: options.isCellInteractive ?? true,
    canDragShifts: options.canDragShifts,
    shiftDisplayMode: options.shiftDisplayMode ?? "code",
    showDiffOverlay: options.showDiffOverlay,
    showPublishDiffOverlay: options.showPublishDiffOverlay,
    showAudit: options.showAudit,
    accessors: {
      shiftForKey: options.shiftForKey ?? (() => "D"),
      assignmentIdsForKey: options.assignmentIdsForKey ?? (() => [1]),
      segmentsForKey: options.segmentsForKey,
      publishedSegmentsForKey: options.publishedSegmentsForKey,
      getShiftStyle: options.getShiftStyle ?? getShiftStyleFromCodes(resolvedAssignmentDefinitions),
      activeIndicatorIdsForKey: options.activeIndicatorIdsForKey,
      getCustomShiftTimes: options.getCustomShiftTimes,
      getPublishedCustomShiftTimes: options.getPublishedCustomShiftTimes,
      draftKindForKey: options.draftKindForKey,
      publishedLabelForKey: options.publishedLabelForKey,
      publishedAssignmentIdsForKey: options.publishedAssignmentIdsForKey,
      publishedAbsenceTypeIdForKey: options.publishedAbsenceTypeIdForKey,
      hasTimeChangesForKey: options.hasTimeChangesForKey,
      publishDiffForKey: options.publishDiffForKey as any,
      createdByNameForKey: options.createdByNameForKey,
      absenceTypeIdForKey: options.absenceTypeIdForKey,
    },
  });

  const interactionState: ScheduleGridInteractionState = {
    activeCellId: options.activeCellId ?? null,
    contextMenuCellId: options.contextMenuCellId ?? null,
    hasClipboard: options.hasClipboard ?? false,
    bulkDeleteMode: options.bulkDeleteMode,
    bulkSelectedCellKeys: options.bulkSelectedCellKeys,
    bulkSelectableCellKeys: options.bulkSelectableCellKeys,
  };

  const handlers: ScheduleGridHandlers = {
    onActivateCell: options.onActivateCell ?? vi.fn(),
    onOpenCellMenu: options.onOpenCellMenu,
    onMoveEntry: options.onMoveEntry,
    onCopyCell: options.onCopyCell,
    onPasteCell: options.onPasteCell,
    onClearCell: options.onClearCell,
    onToggleBulkDeleteCell: options.onToggleBulkDeleteCell,
    onClaimOpenShift: options.onClaimOpenShift,
  };

  return render(
    <ScheduleGrid model={model} interactionState={interactionState} handlers={handlers} />,
  );
}

describe("ScheduleGrid", () => {
  it("fits a wide 2-week compact code layout to the container", () => {
    observedWidth = 1600;
    const { container } = renderGrid();
    const root = container.firstElementChild as HTMLElement;

    expect(root.dataset.gridFit).toBe("true");
    expect(root.style.getPropertyValue("--dg-grid-name-col-current")).toBe("220px");
    expect(root.style.getPropertyValue("--dg-grid-col-min-current")).toBe("98px");
  });

  it("preserves the staff column width when navigating to an empty 2-week grid", () => {
    observedWidth = 1600;
    const { container } = renderGrid({
      shiftForKey: () => null,
      assignmentIdsForKey: () => [],
    });
    const root = container.firstElementChild as HTMLElement;

    expect(root.dataset.gridFit).toBe("true");
    expect(root.style.getPropertyValue("--dg-grid-name-col-current")).toBe("220px");
    expect(root.style.getPropertyValue("--dg-grid-col-min-current")).toBe("98px");
  });

  it("anchors draggable shift wrappers to the full cell so pills stay centered", () => {
    renderGrid({ canDragShifts: true });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const draggable = firstCell.querySelector(".dg-draggable-shift") as HTMLElement | null;

    expect(draggable).not.toBeNull();
    expect(draggable?.style.position).toBe("absolute");
    expect(draggable?.style.top).toBe("0px");
    expect(draggable?.style.right).toBe("0px");
    expect(draggable?.style.bottom).toBe("0px");
    expect(draggable?.style.left).toBe("0px");
  });

  it("marks mentored single-shift pills without changing the shift label", () => {
    const localAssignments: AssignmentDefinition[] = [
      {
        ...assignments[0],
        jobId: 101,
      },
    ];

    renderGrid({
      assignments: localAssignments,
      segmentsForKey: () => [{ shiftId: 1, jobId: 101, position: 0, isMentored: true }],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const badge = firstCell.querySelector('[data-mentored-badge="true"]') as HTMLElement | null;

    expect(pill).not.toBeNull();
    expect(within(firstCell).getByText("D")).toBeInTheDocument();
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent("M");
    expect(badge?.getAttribute("aria-label")).toBe("Mentored assignment");
    expect(badge?.style.width).toBe("16px");
    expect(badge?.style.height).toBe("16px");
    expect(badge?.style.borderRadius).toBe("999px");
    expect(badge?.style.top).toBe("0.5px");
    expect(badge?.style.right).toBe("0.5px");
    expect(pill?.style.paddingLeft).toBe(pill?.style.paddingRight);
  });

  it("marks only the mentored pill in a split shift", () => {
    const localAssignments: AssignmentDefinition[] = [
      {
        ...assignments[0],
        jobId: 101,
      },
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: 1,
        jobId: 102,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignments,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      segmentsForKey: () => [
        { shiftId: 1, jobId: 101, position: 0, isMentored: false },
        { shiftId: 1, jobId: 102, position: 1, isMentored: true },
      ],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pills = Array.from(
      firstCell.querySelectorAll('[data-shift-pill="multi"]'),
    ) as HTMLElement[];
    const badges = firstCell.querySelectorAll('[data-mentored-badge="true"]');

    expect(pills).toHaveLength(2);
    expect(badges).toHaveLength(1);
    expect(pills[0].querySelector('[data-mentored-badge="true"]')).toBeNull();
    expect(pills[1].querySelector('[data-mentored-badge="true"]')).not.toBeNull();
    expect((badges[0] as HTMLElement).style.width).toBe("15px");
    expect((badges[0] as HTMLElement).style.height).toBe("15px");
    expect((badges[0] as HTMLElement).style.borderRadius).toBe("999px");
    expect((badges[0] as HTMLElement).style.top).toBe("0.5px");
    expect((badges[0] as HTMLElement).style.right).toBe("0.5px");
    expect(pills[1].style.paddingLeft).toBe(pills[1].style.paddingRight);
  });

  it("keeps all staff rows visible and visibly highlights matches when a staff search highlight set is active", async () => {
    const localEmployees: Employee[] = [
      extendedEmployees[0],
      {
        ...extendedEmployees[1],
        focusAreaIds: [2],
      },
      extendedEmployees[2],
    ];
    const accessors = makeShiftAccessors(assignments, {
      [`emp-1_${formatDateKey(week1[0])}`]: [1],
      [`emp-2_${formatDateKey(week1[0])}`]: [1],
      [`emp-3_${formatDateKey(week1[0])}`]: [1],
    });

    renderGrid({
      filteredEmployees: localEmployees,
      allEmployees: localEmployees,
      shiftForKey: accessors.shiftForKey,
      assignmentIdsForKey: accessors.assignmentIdsForKey,
      highlightEmpIds: new Set(["emp-1"]),
      highlightScrollKey: "alex",
    });

    const alexName = screen.getByText("Alex Taylor");
    const alexRow = alexName.closest('[role="row"]');
    const jordanRows = screen
      .getAllByText("Jordan Reed")
      .map((node) => node.closest('[role="row"]'));
    const caseyRows = screen
      .getAllByText("Casey Morgan")
      .map((node) => node.closest('[role="row"]'));

    expect(alexRow).not.toBeNull();
    expect(jordanRows.length).toBeGreaterThan(0);
    expect(caseyRows.length).toBeGreaterThan(0);
    expect(alexRow).toHaveStyle({ opacity: "1" });
    expect(alexName).toHaveStyle({ color: "var(--color-brand)" });
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
    for (const row of jordanRows) {
      expect(row).not.toBeNull();
      expect(row).toHaveStyle({ opacity: "0.35" });
    }
    for (const row of caseyRows) {
      expect(row).not.toBeNull();
      expect(row).toHaveStyle({ opacity: "0.35" });
    }
  });

  it("renders the current job abbreviation instead of a stale derived shift-code suffix", () => {
    const staleDerivedCode: AssignmentDefinition = {
      id: 11,
      orgId: "org-1",
      label: "DSSTA",
      name: "Day Staff",
      color: "#E5F3E8",
      border: "#2E9930",
      text: "#1A3D1B",
      categoryId: 1,
      focusAreaId: 1,
      jobId: 101,
      sortOrder: 1,
    };
    const jobs: JobDefinition[] = [
      {
        id: 101,
        orgId: "org-1",
        name: "Staff",
        abbr: "STA",
        showOnGrid: true,
        assignmentMode: "with_shift",
        eligibilityMode: "and",
        focusAreaId: null,
        focusAreaIds: [],
        departmentIds: [],
        applicableShiftIds: [],
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#E5F3E8",
        border: "#2E9930",
        text: "#1A3D1B",
        shiftTimeOverrides: {},
        shiftColorOverrides: {},
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: 1,
        systemKey: null,
        archivedAt: null,
      },
    ];

    renderGrid({
      assignments: [staleDerivedCode],
      jobs,
      shiftForKey: () => "DSSTA",
      assignmentIdsForKey: () => [11],
      getShiftStyle: getShiftStyleFromCodes([staleDerivedCode]),
    });

    const firstCell = screen.getAllByRole("gridcell")[0];
    expect(within(firstCell).getByText("D")).toBeInTheDocument();
    expect(within(firstCell).getByText("STA")).toBeInTheDocument();
    expect(within(firstCell).queryByText(/^SSTA$/)).not.toBeInTheDocument();
  });

  it("keeps publish diff overlays layout-stable and moves prior labels into the tooltip", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      {
        ...assignments[0],
        jobId: 101,
      },
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: 1,
        jobId: 102,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      showDiffOverlay: true,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        fromState: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 102, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        toState: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 101, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const root = screen
      .getByLabelText("North schedule grid")
      .closest("[data-grid-fit]") as HTMLElement;
    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const cellContent = firstCell.querySelector(".dg-grid-cell__content") as HTMLElement | null;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const badge = firstCell.querySelector('[data-publish-badge="modified"]') as HTMLElement | null;

    expect(root.dataset.gridFit).toBe("true");
    expect(root.style.getPropertyValue("--dg-grid-name-col-current")).toBe("220px");
    expect(root.style.getPropertyValue("--dg-grid-col-min-current")).toBe("98px");
    expect(firstCell.style.height).not.toBe("72px");
    expect(firstCell.style.zIndex).toBe("8");
    expect(cellContent?.style.zIndex).toBe("4");
    expect(pill?.style.justifyContent).toBe("center");
    expect(within(firstCell).queryByText("was: N")).not.toBeInTheDocument();
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("Was N");
    expect(badge).toHaveStyle({
      background: "rgba(217, 119, 6, 0.94)",
    });
    expect(pill?.style.overflow).toBe("visible");
    expect(
      Number.parseFloat(pill?.style.top ?? "0") + Number.parseFloat(badge?.style.top ?? "0"),
    ).toBeGreaterThanOrEqual(2);
    expect(pill?.style.borderColor).toBe("rgba(26, 61, 27, 0.35)");
    expect(badge?.style.top).toBe("-8px");
    expect(badge?.style.left).toBe("4px");

    expect(badge?.getAttribute("aria-label")).toContain("Was N.");
  });

  it("shows publish diffs when only the publish-diff overlay is enabled", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      {
        ...assignments[0],
        jobId: 101,
      },
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: 1,
        jobId: 102,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      showDiffOverlay: false,
      showPublishDiffOverlay: true,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        fromState: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 102, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        toState: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 101, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-publish-badge="modified"]') as HTMLElement | null;

    expect(firstCell.style.background).toBe("var(--color-surface)");
    expect(badge?.textContent).toBe("Was N");
  });

  it("does not add a recent publish cell tint when show changes is off", () => {
    observedWidth = 1600;

    renderGrid({
      recentlyPublishedKeys: new Set(["emp-1_2024-01-07"]),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;

    expect(firstCell.dataset.recent).toBeUndefined();
    expect(firstCell.style.background).toBe("");
  });

  it("keeps the normal cell background when show changes is on", () => {
    observedWidth = 1600;

    renderGrid({
      showDiffOverlay: true,
      recentlyPublishedKeys: new Set(["emp-1_2024-01-07"]),
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        from: [1],
        to: [1],
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;

    expect(firstCell.dataset.recent).toBeUndefined();
    expect(firstCell.dataset.today).toBe("true");
    expect(firstCell.style.background).toBe("var(--color-surface)");
  });

  it("keeps time-only publish diffs compact and exposes the changed time in the tooltip", () => {
    observedWidth = 1600;

    renderGrid({
      showDiffOverlay: true,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        from: [1],
        to: [1],
        fromCustomStart: "07:00:00",
        fromCustomEnd: "15:00:00",
        toCustomStart: "08:00:00",
        toCustomEnd: "16:00:00",
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-publish-badge="time"]') as HTMLElement | null;

    expect(firstCell.style.height).not.toBe("72px");
    expect(
      within(firstCell).queryByText(/Edited time|Added time|Time removed/),
    ).not.toBeInTheDocument();
    expect(badge?.textContent).toBe("Time");

    expect(badge?.getAttribute("aria-label")).toContain(
      "Changed custom time 07:00-15:00 to 08:00-16:00.",
    );
  });

  it("keeps draft label changes compact and shows the edited badge in-cell", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      {
        ...assignments[0],
        jobId: 101,
      },
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: 1,
        jobId: 102,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      showDiffOverlay: true,
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [2],
      publishedLabelForKey: () => "N",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-draft-badge="modified"]') as HTMLElement | null;
    const root = screen
      .getByLabelText("North schedule grid")
      .closest("[data-grid-fit]") as HTMLElement;

    expect(root.dataset.gridFit).toBe("true");
    expect(root.style.getPropertyValue("--dg-grid-name-col-current")).toBe("220px");
    expect(root.style.getPropertyValue("--dg-grid-col-min-current")).toBe("98px");
    expect(firstCell.style.height).toBe("var(--dg-grid-cell-height)");
    expect(within(firstCell).queryByText("was: N")).not.toBeInTheDocument();
    expect(badge?.textContent).toBe("Was N");
    expect(badge).toHaveStyle({
      background: "rgba(217, 119, 6, 0.94)",
    });
    expect(badge?.style.top).toBe("-8px");
    expect(badge?.style.left).toBe("4px");
    expect(badge?.getAttribute("aria-label")).toContain("Was N.");
  });

  it("keeps single-pill draft borders dashed when show changes is off", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: [
        assignments[0],
        {
          id: 2,
          orgId: "org-1",
          label: "N",
          name: "Night Shift",
          color: "#E0F2FE",
          border: "#0284C7",
          text: "#0C4A6E",
          categoryId: 1,
          focusAreaId: 1,
          sortOrder: 2,
        },
      ],
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [2],
      publishedLabelForKey: () => "N",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const badge = firstCell.querySelector("[data-draft-badge]") as HTMLElement | null;

    expect(badge).toBeNull();
    expect(pill).toHaveStyle({
      borderStyle: "dashed",
      borderWidth: "2px",
    });
    expect(pill?.style.borderColor).toBe("rgb(217, 119, 6)");
  });

  it("keeps only the added second shift dashed when show changes is off", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      {
        ...assignments[0],
        jobId: 101,
      },
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: 1,
        jobId: 102,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1],
      publishedLabelForKey: () => "D",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pills = Array.from(
      firstCell.querySelectorAll('[data-shift-pill="multi"]'),
    ) as HTMLElement[];
    const badge = firstCell.querySelector("[data-draft-badge]") as HTMLElement | null;

    expect(pills.length).toBe(2);
    expect(badge).toBeNull();
    expect(pills[0]).toHaveStyle({
      borderStyle: "solid",
      borderWidth: "1px",
    });
    expect(pills[1]).toHaveStyle({
      borderStyle: "dashed",
      borderWidth: "2px",
    });
    expect(pills[1]?.style.borderColor).toBe("rgb(22, 163, 74)");
  });

  it("keeps only the newly mentored split-shift pill dashed when show changes is off", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      {
        ...assignments[0],
        jobId: 101,
      },
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: 1,
        jobId: 102,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      segmentsForKey: () => [
        { shiftId: 1, jobId: 101, position: 0, isMentored: false },
        { shiftId: 1, jobId: 102, position: 1, isMentored: true },
      ],
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1, 2],
      publishedSegmentsForKey: () => [
        { shiftId: 1, jobId: 101, position: 0, isMentored: false },
        { shiftId: 1, jobId: 102, position: 1, isMentored: false },
      ],
      publishedLabelForKey: () => "D/N",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pills = Array.from(
      firstCell.querySelectorAll('[data-shift-pill="multi"]'),
    ) as HTMLElement[];
    const badge = firstCell.querySelector("[data-draft-badge]") as HTMLElement | null;

    expect(pills).toHaveLength(2);
    expect(badge).toBeNull();
    expect(pills[0]).toHaveStyle({
      borderStyle: "solid",
      borderWidth: "1px",
    });
    expect(pills[1]).toHaveStyle({
      borderStyle: "dashed",
      borderWidth: "2px",
    });
    expect(pills[1]?.style.borderColor).toBe("rgb(217, 119, 6)");
    expect(pills[1].querySelector('[data-mentored-badge="true"]')).not.toBeNull();
  });

  it("uses the combined published shift label for draft replacement badges", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      {
        id: 1,
        orgId: "org-1",
        label: "D",
        name: "Day Shift",
        color: "#E5F3E8",
        border: "#2E9930",
        text: "#1A3D1B",
        categoryId: 1,
        focusAreaId: 1,
        sortOrder: 1,
      },
      {
        id: 2,
        orgId: "org-1",
        label: "E",
        name: "Evening Shift",
        color: "#FEF3C7",
        border: "#D97706",
        text: "#92400E",
        categoryId: 1,
        focusAreaId: 1,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "E · Supv",
      assignmentIdsForKey: () => [2],
      showDiffOverlay: true,
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1],
      publishedLabelForKey: () => "D · Supv",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-draft-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Was D · Supv");
    expect(badge?.getAttribute("aria-label")).toContain("Was D · Supv.");
  });

  it("matches stacked edited badge radii to the multi-pill shift container", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      assignments[0],
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: 1,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      showDiffOverlay: true,
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [2, 1],
      publishedLabelForKey: () => "N/D",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-draft-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Changed");
    expect(badge?.style.borderRadius).toBe("3px");
    expect(badge?.style.top).toBe("-8px");
    expect(badge?.style.right).toBe("3px");
  });

  it("renders cross-focus initials in a left-side strip for a single shift card", () => {
    observedWidth = 1600;

    const localFocusAreas: FocusArea[] = [
      focusAreas[0],
      {
        ...focusAreas[1],
        name: "Sheltered Care",
        color: "#FECACA",
      },
    ];
    const localAssignmentDefinitions: AssignmentDefinition[] = [
      assignments[0],
      {
        id: 2,
        orgId: "org-1",
        label: "XT",
        name: "External Shift",
        color: "#DBEAFE",
        border: "#2563EB",
        text: "#1E3A8A",
        categoryId: 1,
        focusAreaId: 2,
        sortOrder: 2,
      },
    ];

    renderGrid({
      focusAreas: localFocusAreas,
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "XT",
      assignmentIdsForKey: () => [2],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const initialsBadge = within(firstCell).getByText("SC") as HTMLElement;

    expect(pill?.style.borderRadius).toBe("8px");
    expect(pill?.style.paddingLeft).toBe("24px");
    expect(initialsBadge.style.position).toBe("absolute");
    expect(initialsBadge.style.left).toBe("0px");
    expect(initialsBadge.style.borderRadius).toBe("2px 0 0 2px");
    expect(initialsBadge).toHaveStyle({
      background: "#DBEAFE",
      color: "#1E3A8A",
    });
    expect(within(firstCell).queryByText("Sheltered Care")).toBeNull();
  });

  it("renders cross-focus initials in a left-side strip for a split shift card", () => {
    observedWidth = 1600;

    const localFocusAreas: FocusArea[] = [
      focusAreas[0],
      {
        ...focusAreas[1],
        name: "Sheltered Care",
        color: "#FECACA",
      },
    ];
    const localAssignmentDefinitions: AssignmentDefinition[] = [
      assignments[0],
      {
        id: 2,
        orgId: "org-1",
        label: "XT",
        name: "External Shift",
        color: "#DBEAFE",
        border: "#2563EB",
        text: "#1E3A8A",
        categoryId: 1,
        focusAreaId: 2,
        sortOrder: 2,
      },
    ];

    renderGrid({
      focusAreas: localFocusAreas,
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "D/XT",
      assignmentIdsForKey: () => [1, 2],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const initialsBadge = within(firstCell).getByText("SC") as HTMLElement;
    const crossPill = initialsBadge.closest('[data-shift-pill="multi"]') as HTMLElement | null;

    expect(crossPill?.style.borderRadius).toBe("6px");
    expect(crossPill?.style.paddingLeft).toBe("20px");
    expect(initialsBadge.style.position).toBe("absolute");
    expect(initialsBadge.style.left).toBe("0px");
    expect(initialsBadge.style.borderRadius).toBe("2px 0 0 2px");
    expect(initialsBadge).toHaveStyle({
      background: "#DBEAFE",
      color: "#1E3A8A",
    });
    expect(within(firstCell).queryByText("Sheltered Care")).toBeNull();
  });

  it("keeps cross-focus split draft pills on the white shift surface when show changes is on", () => {
    observedWidth = 1600;

    const localFocusAreas: FocusArea[] = [
      focusAreas[0],
      {
        ...focusAreas[1],
        name: "Sheltered Care",
        color: "#FECACA",
      },
    ];
    const localAssignmentDefinitions: AssignmentDefinition[] = [
      assignments[0],
      {
        id: 2,
        orgId: "org-1",
        label: "XT",
        name: "External Shift",
        color: "#DBEAFE",
        border: "#2563EB",
        text: "#1E3A8A",
        categoryId: 1,
        focusAreaId: 2,
        sortOrder: 2,
      },
    ];

    renderGrid({
      focusAreas: localFocusAreas,
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "D/XT",
      assignmentIdsForKey: () => [1, 2],
      showDiffOverlay: true,
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1],
      publishedLabelForKey: () => "D",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const initialsBadge = within(firstCell).getByText("SC") as HTMLElement;
    const crossPill = initialsBadge.closest('[data-shift-pill="multi"]') as HTMLElement | null;

    expect(crossPill?.style.background).toBe("var(--color-surface)");
    expect(crossPill).toHaveStyle({
      borderStyle: "dashed",
      borderWidth: "2px",
    });
  });

  it("keeps cross-focus name-mode text in the card body with separate lines", () => {
    observedWidth = 1600;

    const localFocusAreas: FocusArea[] = [
      focusAreas[0],
      {
        ...focusAreas[1],
        name: "Sheltered Care",
        color: "#FECACA",
      },
    ];
    const localShiftCategories: ShiftCategory[] = [
      {
        ...shiftCategories[0],
        name: "Day Shift",
      },
    ];
    const localAssignmentDefinitions: AssignmentDefinition[] = [
      {
        ...assignments[0],
        id: 2,
        label: "XT",
        name: "Sheltered Shift",
        focusAreaId: 2,
        jobId: 101,
      },
    ];
    const jobs: JobDefinition[] = [
      {
        id: 101,
        orgId: "org-1",
        name: "Staff",
        abbr: "STA",
        showOnGrid: true,
        assignmentMode: "with_shift",
        eligibilityMode: "and",
        focusAreaId: null,
        focusAreaIds: [],
        departmentIds: [],
        applicableShiftIds: [],
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#E5F3E8",
        border: "#2E9930",
        text: "#1A3D1B",
        shiftTimeOverrides: {},
        shiftColorOverrides: {},
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: 1,
        systemKey: null,
        archivedAt: null,
      },
    ];

    renderGrid({
      focusAreas: localFocusAreas,
      shiftCategories: localShiftCategories,
      assignments: localAssignmentDefinitions,
      jobs,
      shiftForKey: () => "XT",
      assignmentIdsForKey: () => [2],
      shiftDisplayMode: "name",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const initialsBadge = within(firstCell).getByText("SC") as HTMLElement;

    expect(pill?.style.justifyContent).toBe("center");
    expect(pill?.style.paddingLeft).toBe("24px");
    expect(initialsBadge.style.position).toBe("absolute");
    expect(initialsBadge).toHaveStyle({
      background: "#E5F3E8",
      color: "#1A3D1B",
    });
    expect(within(firstCell).queryByText("Day Shift · Staff")).toBeNull();
    expect(within(firstCell).getByText(/^Day Shift$/)).toBeTruthy();
    expect(within(firstCell).getByText(/^Staff$/)).toBeTruthy();
  });

  it("uses a darker readable text color for foreign-focus name-mode pills on white backgrounds", () => {
    observedWidth = 1600;

    const localFocusAreas: FocusArea[] = [
      focusAreas[0],
      {
        ...focusAreas[1],
        name: "Sheltered Care",
        color: "#DBEAFE",
      },
    ];
    const localShiftCategories: ShiftCategory[] = [
      {
        ...shiftCategories[0],
        name: "Day Shift",
      },
    ];
    const localAssignmentDefinitions: AssignmentDefinition[] = [
      {
        ...assignments[0],
        id: 2,
        label: "XT",
        name: "Sheltered Shift",
        color: "#1D4ED8",
        text: "#F8FAFC",
        focusAreaId: 2,
        jobId: 101,
      },
    ];
    const jobs: JobDefinition[] = [
      {
        id: 101,
        orgId: "org-1",
        name: "Staff",
        abbr: "STA",
        showOnGrid: true,
        assignmentMode: "with_shift",
        eligibilityMode: "and",
        focusAreaId: null,
        focusAreaIds: [],
        departmentIds: [],
        applicableShiftIds: [],
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#1D4ED8",
        border: "#1D4ED8",
        text: "#F8FAFC",
        shiftTimeOverrides: {},
        shiftColorOverrides: {},
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: 1,
        systemKey: null,
        archivedAt: null,
      },
    ];

    renderGrid({
      focusAreas: localFocusAreas,
      shiftCategories: localShiftCategories,
      assignments: localAssignmentDefinitions,
      jobs,
      shiftForKey: () => "XT",
      assignmentIdsForKey: () => [2],
      shiftDisplayMode: "name",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const readableTextColor = getReadableTextOnSurface("#1D4ED8", "#F8FAFC");
    const readableTextColorRgb = `rgb(${parseInt(readableTextColor.slice(1, 3), 16)}, ${parseInt(readableTextColor.slice(3, 5), 16)}, ${parseInt(readableTextColor.slice(5, 7), 16)})`;

    expect(pill?.style.background).toBe("var(--color-surface)");
    expect(pill?.style.color).toBe(readableTextColorRgb);
    expect(pill?.style.color).not.toBe("rgb(248, 250, 252)");
  });

  it("keeps cross-focus draft new cells on the white shift surface when show changes is on", () => {
    observedWidth = 1600;

    const localFocusAreas: FocusArea[] = [
      focusAreas[0],
      {
        ...focusAreas[1],
        name: "Sheltered Care",
      },
    ];
    const localAssignmentDefinitions: AssignmentDefinition[] = [
      assignments[0],
      {
        id: 2,
        orgId: "org-1",
        label: "S",
        name: "South Shift",
        color: "#DBEAFE",
        border: "#2563EB",
        text: "#1E3A8A",
        categoryId: 1,
        focusAreaId: 2,
        sortOrder: 2,
      },
    ];

    renderGrid({
      focusAreas: localFocusAreas,
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "S",
      assignmentIdsForKey: () => [2],
      showDiffOverlay: true,
      draftKindForKey: () => "new",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const badge = firstCell.querySelector('[data-draft-badge="new"]') as HTMLElement | null;

    expect(badge).toBeNull();
    expect(pill?.style.background).toBe("var(--color-surface)");
    expect(within(firstCell).getByText("SC").style.background).toBe("rgb(219, 234, 254)");
  });

  it("keeps cross-focus draft modified cells on the white shift surface when show changes is on", () => {
    observedWidth = 1600;

    const localFocusAreas: FocusArea[] = [
      focusAreas[0],
      {
        ...focusAreas[1],
        name: "Sheltered Care",
      },
    ];
    const localAssignmentDefinitions: AssignmentDefinition[] = [
      assignments[0],
      {
        id: 2,
        orgId: "org-1",
        label: "S",
        name: "South Shift",
        color: "#DBEAFE",
        border: "#2563EB",
        text: "#1E3A8A",
        categoryId: 1,
        focusAreaId: 2,
        sortOrder: 2,
      },
    ];

    renderGrid({
      focusAreas: localFocusAreas,
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "S",
      assignmentIdsForKey: () => [2],
      showDiffOverlay: true,
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1],
      publishedLabelForKey: () => "D",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const badge = firstCell.querySelector('[data-draft-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Was D");
    expect(pill?.style.background).toBe("var(--color-surface)");
  });

  it("keeps a brand-new shift with custom time badge-free", () => {
    observedWidth = 1600;

    renderGrid({
      showDiffOverlay: true,
      draftKindForKey: () => "new",
      getCustomShiftTimes: () => ({
        start: "08:00",
        end: "16:00",
      }),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-draft-badge="new"]') as HTMLElement | null;

    expect(badge).toBeNull();
  });

  it("keeps cross-focus published edited cells on the white shift surface", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      assignments[0],
      {
        id: 2,
        orgId: "org-1",
        label: "S",
        name: "South Shift",
        color: "#DBEAFE",
        border: "#2563EB",
        text: "#1E3A8A",
        categoryId: 1,
        focusAreaId: 2,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "S",
      assignmentIdsForKey: () => [2],
      showDiffOverlay: true,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        from: [1],
        to: [2],
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const badge = firstCell.querySelector('[data-publish-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Was D");
    expect(pill?.style.background).toBe("var(--color-surface)");
  });

  it("uses segment labels for publish replacement badges when they include job text", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      {
        id: 1,
        orgId: "org-1",
        label: "D",
        name: "Day Shift",
        color: "#E5F3E8",
        border: "#2E9930",
        text: "#1A3D1B",
        categoryId: 1,
        focusAreaId: 1,
        sortOrder: 1,
      },
      {
        id: 2,
        orgId: "org-1",
        label: "E",
        name: "Evening Shift",
        color: "#FEF3C7",
        border: "#D97706",
        text: "#92400E",
        categoryId: 1,
        focusAreaId: 1,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "E · Supv",
      assignmentIdsForKey: () => [2],
      showDiffOverlay: true,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        from: [1],
        to: [2],
        fromSegments: [{ label: "D · Supv" }],
        toSegments: [{ label: "E · Supv" }],
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-publish-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Was D · Supv");
    expect(badge?.getAttribute("aria-label")).toContain("Was D · Supv.");
  });

  it("keeps draft new historical cross-focus cells on the white shift surface when show changes is on", () => {
    observedWidth = 1600;

    const localFocusAreas: FocusArea[] = [
      focusAreas[0],
      {
        ...focusAreas[1],
        name: "Sheltered Care",
      },
    ];
    const historicalAssignmentDefinition: AssignmentDefinition = {
      id: 2,
      orgId: "org-1",
      label: "S",
      name: "South Shift",
      color: "#DBEAFE",
      border: "#2563EB",
      text: "#1E3A8A",
      categoryId: 1,
      focusAreaId: 2,
      sortOrder: 2,
    };

    renderGrid({
      assignments,
      historicalAssignments: [historicalAssignmentDefinition],
      focusAreas: localFocusAreas,
      shiftForKey: () => "S",
      assignmentIdsForKey: () => [2],
      getShiftStyle: (type) =>
        assignments.find((code) => code.label === type || code.name === type) ?? {
          id: 0,
          orgId: "org-1",
          label: type,
          name: type,
          color: "var(--color-bg)",
          border: "var(--color-border)",
          text: "var(--color-text-muted)",
          sortOrder: 999,
        },
      showDiffOverlay: true,
      draftKindForKey: () => "new",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;

    expect(pill?.style.background).toBe("var(--color-surface)");
    expect(within(firstCell).getByText("SC").style.background).toBe("rgb(219, 234, 254)");
  });

  it("keeps historical cross-focus published edited cells on the white shift surface", () => {
    observedWidth = 1600;

    const historicalAssignmentDefinition: AssignmentDefinition = {
      id: 2,
      orgId: "org-1",
      label: "S",
      name: "South Shift",
      color: "#DBEAFE",
      border: "#2563EB",
      text: "#1E3A8A",
      categoryId: 1,
      focusAreaId: 2,
      sortOrder: 2,
    };

    renderGrid({
      assignments,
      historicalAssignments: [historicalAssignmentDefinition],
      shiftForKey: () => "S",
      assignmentIdsForKey: () => [2],
      getShiftStyle: (type) =>
        assignments.find((code) => code.label === type || code.name === type) ?? {
          id: 0,
          orgId: "org-1",
          label: type,
          name: type,
          color: "var(--color-bg)",
          border: "var(--color-border)",
          text: "var(--color-text-muted)",
          sortOrder: 999,
        },
      showDiffOverlay: true,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        from: [1],
        to: [2],
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const badge = firstCell.querySelector('[data-publish-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Was D");
    expect(pill?.style.background).toBe("var(--color-surface)");
  });

  it("keeps published edited shift rings orange when a modified entry replaces an absence", () => {
    observedWidth = 1600;

    renderGrid({
      showDiffOverlay: true,
      absenceTypeMap: new Map([
        [
          7,
          {
            id: 7,
            orgId: "org-1",
            label: "VAC",
            name: "Vacation",
            color: "#FDE68A",
            border: "#D97706",
            text: "#92400E",
            countsTowardAvailability: false,
            sortOrder: 1,
          },
        ],
      ]),
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        from: [],
        to: [1],
        fromAbsenceTypeId: 7,
        toAbsenceTypeId: null,
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const badge = firstCell.querySelector('[data-publish-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Was VAC");
    expect(pill?.style.borderColor).toBe("rgba(26, 61, 27, 0.35)");
  });

  it("keeps draft time-only changes compact and shows the time badge in-cell", () => {
    observedWidth = 1600;

    renderGrid({
      showDiffOverlay: true,
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1],
      publishedLabelForKey: () => "D",
      getCustomShiftTimes: () => ({
        start: "08:00",
        end: "16:00",
      }),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-draft-badge="time"]') as HTMLElement | null;

    expect(firstCell.style.height).toBe("var(--dg-grid-cell-height)");
    expect(badge?.textContent).toBe("+ Time");
    expect(badge).toHaveStyle({
      background: "rgba(217, 119, 6, 0.94)",
    });
    expect(badge?.style.top).toBe("-8px");
    expect(badge?.style.left).toBe("4px");
    expect(badge?.getAttribute("aria-label")).toContain("Added custom time 08:00-16:00.");
  });

  it("shows the meaningful edit badge when a draft adds a second shift alongside other edits", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      assignments[0],
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: 1,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      showDiffOverlay: true,
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1],
      getCustomShiftTimes: () => ({
        start: "08:00",
        end: "16:00",
        perPill: [
          { start: "08:00", end: "16:00" },
          { start: "16:00", end: "23:00" },
        ],
      }),
      getPublishedCustomShiftTimes: () => ({
        start: "07:00",
        end: "15:00",
      }),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-draft-badge="time"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Time");
    expect(badge?.getAttribute("aria-label")).toContain(
      "Changed custom time for D 07:00-15:00 to 08:00-16:00.",
    );
  });

  it("keeps deleted publish diffs compact and exposes the deleted shift in the tooltip", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      {
        ...assignments[0],
        jobId: 101,
      },
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: 1,
        jobId: 102,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      shiftForKey: () => null,
      assignmentIdsForKey: () => [],
      showDiffOverlay: true,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "deleted",
        fromState: {
          kind: "worked",
          segments: [{ shiftId: 1, jobId: 102, position: 0 }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        toState: null,
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const root = screen
      .getByLabelText("North schedule grid")
      .closest("[data-grid-fit]") as HTMLElement;
    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const deletedPill = firstCell.querySelector(
      '[data-shift-pill="deleted"]',
    ) as HTMLElement | null;
    const badge = firstCell.querySelector('[data-publish-badge="deleted"]') as HTMLElement | null;

    expect(root.dataset.gridFit).toBe("true");
    expect(root.style.getPropertyValue("--dg-grid-name-col-current")).toBe("220px");
    expect(root.style.getPropertyValue("--dg-grid-col-min-current")).toBe("98px");
    expect(firstCell.style.height).not.toBe("72px");
    expect(badge?.textContent).toBe("Deleted");
    expect(badge).toHaveStyle({
      background: "rgba(220, 38, 38, 0.94)",
    });
    expect(deletedPill?.style.overflow).toBe("visible");
    expect(
      Number.parseFloat(deletedPill?.style.top ?? "0") + Number.parseFloat(badge?.style.top ?? "0"),
    ).toBeGreaterThanOrEqual(2);

    expect(deletedPill?.getAttribute("aria-label")).toContain("Deleted N.");
    expect(badge?.getAttribute("aria-label")).toContain("Deleted N.");
  });

  it("keeps author labels visible for publish diffs when authors are enabled", () => {
    observedWidth = 1600;

    renderGrid({
      showAudit: true,
      showDiffOverlay: true,
      createdByNameForKey: () => "M. Example",
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        from: [1],
        to: [1],
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const root = screen
      .getByLabelText("North schedule grid")
      .closest("[data-grid-fit]") as HTMLElement;
    const cells = screen.getAllByRole("gridcell") as HTMLElement[];
    const firstCell = cells[0];
    const secondCell = cells[1];
    const authorPill = firstCell.querySelector('[data-author-pill="true"]') as HTMLElement | null;
    const secondAuthorPill = secondCell.querySelector(
      '[data-author-pill="true"]',
    ) as HTMLElement | null;
    const authorPillIcon = firstCell.querySelector(
      '[data-author-pill-icon="true"]',
    ) as HTMLElement | null;

    expect(root.style.getPropertyValue("--dg-grid-name-col-current")).toBe("220px");
    expect(root.style.getPropertyValue("--dg-grid-col-min-current")).toBe("98px");
    expect(firstCell.style.height).toBe("var(--dg-grid-cell-height)");
    expect(authorPill?.style.left).toBe("5px");
    expect(authorPill?.style.bottom).toBe("5px");
    expect(authorPill?.style.justifyContent).toBe("flex-start");
    expect(authorPillIcon?.querySelector("svg")).not.toBeNull();
    expect(within(firstCell).getByText("M. Example")).toBeInTheDocument();
  });

  it("keeps readable min widths for dense 2-week rows without taller draft cells", () => {
    observedWidth = 1200;
    renderGrid({
      openShifts: [
        {
          id: "open-1",
          source: "calloff",
          focusAreaId: 1,
          date: "2024-01-07",
          assignmentIds: [1],
          assignmentLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 1,
        },
      ],
      showDiffOverlay: true,
      draftKindForKey: () => "modified",
      createdByNameForKey: () => "Jamie",
    });

    const root = screen
      .getByLabelText("North schedule grid")
      .closest("[data-grid-fit]") as HTMLElement;
    expect(root.dataset.gridFit).toBe("false");
    expect(root.style.getPropertyValue("--dg-grid-name-col-current")).toBe("220px");
    expect(root.style.getPropertyValue("--dg-grid-col-min-current")).toBe("84px");

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    expect(firstCell.style.height).toBe("var(--dg-grid-cell-height)");
  });

  it("wraps open shift chips vertically inside narrow day cells", () => {
    observedWidth = 1200;
    const { container } = renderGrid({
      openShifts: [
        {
          id: "open-1",
          source: "calloff",
          focusAreaId: 1,
          date: "2024-01-07",
          assignmentIds: [1],
          assignmentLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 1,
        },
        {
          id: "open-2",
          source: "calloff",
          focusAreaId: 1,
          date: "2024-01-07",
          assignmentIds: [1],
          assignmentLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 2,
        },
      ],
      draftKindForKey: () => "modified",
      createdByNameForKey: () => "Jamie",
    });

    const openShiftButtons = container.querySelectorAll(".dg-open-shift-btn");
    expect(openShiftButtons).toHaveLength(2);

    const openShiftCell = openShiftButtons[0].parentElement as HTMLElement;
    expect(openShiftCell.style.flexWrap).toBe("wrap");
    expect(openShiftCell.style.gap).toBe("6px");
    expect(openShiftCell.style.minHeight).toBe("");
    expect((openShiftButtons[0] as HTMLElement).style.width).toBe("100%");
  });

  it("renders open shift chips with the same shift and job labels as schedule pills", () => {
    observedWidth = 1200;
    const localAssignment: AssignmentDefinition = {
      id: 11,
      orgId: "org-1",
      label: "DSSTA",
      name: "Day Staff",
      color: "#E5F3E8",
      border: "#2E9930",
      text: "#1A3D1B",
      categoryId: 1,
      focusAreaId: 1,
      jobId: 101,
      sortOrder: 1,
    };
    const jobs: JobDefinition[] = [
      {
        id: 101,
        orgId: "org-1",
        name: "Staff",
        abbr: "STA",
        showOnGrid: true,
        assignmentMode: "with_shift",
        eligibilityMode: "and",
        focusAreaId: null,
        focusAreaIds: [],
        departmentIds: [],
        applicableShiftIds: [],
        eligibleRoleIds: [],
        requiredCertificationIds: [],
        color: "#E5F3E8",
        border: "#2E9930",
        text: "#1A3D1B",
        shiftTimeOverrides: {},
        shiftColorOverrides: {},
        defaultStartTime: null,
        defaultEndTime: null,
        defaultDurationHours: null,
        defaultDurationMinutes: null,
        sortOrder: 1,
        systemKey: null,
        archivedAt: null,
      },
    ];
    const { container } = renderGrid({
      assignments: [localAssignment],
      jobs,
      shiftForKey: () => null,
      assignmentIdsForKey: () => [],
      openShifts: [
        {
          id: "open-job-pill",
          source: "coverage_gap",
          focusAreaId: 1,
          date: "2024-01-07",
          assignmentIds: [11],
          assignmentLabel: "DSSTA",
          segments: [{ shiftId: 1, jobId: 101, position: 0, isMentored: true }],
          customStartTime: null,
          customEndTime: null,
          needed: 1,
        },
      ],
    });

    const openShiftButton = container.querySelector(".dg-open-shift-btn") as HTMLElement;
    expect(openShiftButton).not.toBeNull();
    expect(within(openShiftButton).getByText("D")).toBeInTheDocument();
    expect(within(openShiftButton).getByText("STA")).toBeInTheDocument();
    expect(openShiftButton.querySelector('[data-mentored-badge="true"]')).not.toBeNull();
  });

  it("invokes the context-menu handler from Shift+F10 on the focused cell", () => {
    const onOpenCellMenu = vi.fn();
    renderGrid({ onOpenCellMenu });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    fireEvent.keyDown(firstCell, { key: "F10", shiftKey: true });

    expect(onOpenCellMenu).toHaveBeenCalledTimes(1);
    expect(onOpenCellMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorEl: firstCell,
        cellId: {
          empId: "emp-1",
          dateKey: "2024-01-07",
          sectionId: 1,
        },
        date: new Date("2024-01-07T00:00:00"),
        trigger: "keyboard",
      }),
    );
  });

  it("does not keep a clicked cell active without external context", () => {
    renderGrid();

    const [firstCell, secondCell] = screen.getAllByRole("gridcell") as [HTMLElement, HTMLElement];

    fireEvent.click(firstCell);
    expect(firstCell.dataset.active).toBeUndefined();

    fireEvent.contextMenu(secondCell);
    expect(secondCell.dataset.active).toBeUndefined();
  });

  it("marks the externally active cell for the fill highlight", () => {
    renderGrid({
      activeCellId: {
        empId: "emp-1",
        dateKey: "2024-01-08",
        sectionId: 1,
      },
    });

    const activeCells = (screen.getAllByRole("gridcell") as HTMLElement[]).filter(
      (cell) => cell.dataset.active === "true",
    );

    expect(activeCells).toHaveLength(1);
  });

  it("toggles selectable cells in bulk delete mode instead of opening the editor", () => {
    const onActivateCell = vi.fn();
    const onToggleBulkDeleteCell = vi.fn();
    renderGrid({
      bulkDeleteMode: true,
      bulkSelectableCellKeys: new Set(["emp-1_2024-01-07"]),
      onActivateCell,
      onToggleBulkDeleteCell,
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    fireEvent.click(firstCell);

    expect(onActivateCell).not.toHaveBeenCalled();
    expect(onToggleBulkDeleteCell).toHaveBeenCalledWith({
      empId: "emp-1",
      dateKey: "2024-01-07",
      sectionId: 1,
    });
  });

  it("marks selected bulk delete cells and leaves empty cells unselectable", () => {
    const onActivateCell = vi.fn();
    const onToggleBulkDeleteCell = vi.fn();
    renderGrid({
      shiftForKey: (_empId, date) => (formatDateKey(date) === "2024-01-07" ? "D" : null),
      assignmentIdsForKey: (_empId, date) => (formatDateKey(date) === "2024-01-07" ? [1] : []),
      bulkDeleteMode: true,
      bulkSelectableCellKeys: new Set(["emp-1_2024-01-07"]),
      bulkSelectedCellKeys: new Set(["emp-1_2024-01-07"]),
      onActivateCell,
      onToggleBulkDeleteCell,
    });

    const [selectedCell, emptyCell] = screen.getAllByRole("gridcell") as [HTMLElement, HTMLElement];

    expect(selectedCell.dataset.bulkSelected).toBe("true");
    expect(selectedCell).toHaveAttribute("aria-selected", "true");
    expect(selectedCell.querySelector('[data-bulk-selection-indicator="true"]')).not.toBeNull();
    const selectionRing = selectedCell.querySelector(
      '[data-bulk-selection-ring="true"]',
    ) as HTMLElement | null;
    expect(selectionRing).not.toBeNull();
    expect(selectionRing?.style.top).toBe("3px");
    expect(selectionRing?.style.right).toBe("2px");
    expect(selectionRing?.style.bottom).toBe("2px");
    expect(selectionRing?.style.left).toBe("2px");
    expect(selectionRing?.style.borderRadius).toBe("10px");
    expect(emptyCell.dataset.bulkSelectable).toBeUndefined();

    fireEvent.click(emptyCell);

    expect(onActivateCell).not.toHaveBeenCalled();
    expect(onToggleBulkDeleteCell).not.toHaveBeenCalled();
  });

  it("does not select locked cells in bulk delete mode", () => {
    const onToggleBulkDeleteCell = vi.fn();
    renderGrid({
      bulkDeleteMode: true,
      bulkSelectableCellKeys: new Set(["emp-1_2024-01-07"]),
      cellLocks: new Map([["emp-1_2024-01-07", { userName: "Sam" }]]),
      onToggleBulkDeleteCell,
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    fireEvent.click(firstCell);

    expect(firstCell.dataset.locked).toBe("true");
    expect(firstCell.dataset.bulkSelectable).toBeUndefined();
    expect(onToggleBulkDeleteCell).not.toHaveBeenCalled();
  });

  it("suppresses context menus and keyboard activation in bulk delete mode", () => {
    const onActivateCell = vi.fn();
    const onOpenCellMenu = vi.fn();
    const onToggleBulkDeleteCell = vi.fn();
    renderGrid({
      bulkDeleteMode: true,
      bulkSelectableCellKeys: new Set(["emp-1_2024-01-07"]),
      onActivateCell,
      onOpenCellMenu,
      onToggleBulkDeleteCell,
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    fireEvent.keyDown(firstCell, { key: "Enter" });
    fireEvent.keyDown(firstCell, { key: "F10", shiftKey: true });
    fireEvent.contextMenu(firstCell);

    expect(onActivateCell).not.toHaveBeenCalled();
    expect(onOpenCellMenu).not.toHaveBeenCalled();
    expect(onToggleBulkDeleteCell).toHaveBeenCalledTimes(1);
  });

  it("uses the context-menu cell before the focused cell for keyboard copy", () => {
    const onCopyCell = vi.fn();
    renderGrid({
      contextMenuCellId: {
        empId: "emp-1",
        dateKey: "2024-01-09",
        sectionId: 1,
      },
      onCopyCell,
    });
    const cells = screen.getAllByRole("gridcell") as HTMLElement[];

    fireEvent.focus(cells[0]);

    fireEvent.keyDown(window, { key: "c", ctrlKey: true });

    expect(onCopyCell).toHaveBeenCalledWith({
      empId: "emp-1",
      dateKey: "2024-01-09",
      sectionId: 1,
    });
  });

  it("does not show a hover tooltip for populated schedule cells", () => {
    renderGrid({ shiftDisplayMode: "name" });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    fireEvent.mouseEnter(firstCell);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    const visibleShiftLabel = within(firstCell).getByText("Day");
    fireEvent.mouseEnter(visibleShiftLabel);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders category rows with per-day totals", () => {
    observedWidth = 1600;

    const localEmployees: Employee[] = [
      employees[0],
      {
        ...employees[0],
        id: "emp-2",
        firstName: "Casey",
        lastName: "Jordan",
        seniority: 2,
      },
    ];
    const localAssignmentDefinitions: AssignmentDefinition[] = [
      assignments[0],
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: null,
        sortOrder: 2,
      },
    ];
    const accessors = makeShiftAccessors(localAssignmentDefinitions, {
      [`emp-1_${formatDateKey(week1[0])}`]: [1],
      [`emp-2_${formatDateKey(week1[0])}`]: [1],
      [`emp-1_${formatDateKey(week1[1])}`]: [2],
    });

    renderGrid({
      filteredEmployees: localEmployees,
      allEmployees: localEmployees,
      assignments: localAssignmentDefinitions,
      shiftForKey: accessors.shiftForKey,
      assignmentIdsForKey: accessors.assignmentIdsForKey,
    });

    const northGrid = screen.getByLabelText("North schedule grid");
    const categoryRow = northGrid.querySelector(
      '[data-tally-row="category-1"]',
    ) as HTMLElement | null;

    expect(categoryRow).not.toBeNull();
    expect(northGrid.querySelector('[data-tally-label="Day"]')).toBeInTheDocument();
    expect(northGrid.querySelector('[data-tally-row="category-2"]')).toBeNull();
    expect(northGrid.querySelector('[data-tally-count="1-0"]')?.textContent).toBe("2");
    expect(northGrid.querySelector('[data-tally-count="1-1"]')?.textContent).toBe("1");
    expect(northGrid.querySelector('[data-tally-count="1-2"]')?.textContent).toBe("-");
  });

  it("keeps open shifts separate from footer totals", () => {
    observedWidth = 1600;

    const accessors = makeShiftAccessors(assignments, {
      [`emp-1_${formatDateKey(week1[0])}`]: [1],
    });

    renderGrid({
      shiftForKey: accessors.shiftForKey,
      assignmentIdsForKey: accessors.assignmentIdsForKey,
      openShifts: [
        {
          id: "open-1",
          source: "calloff",
          focusAreaId: 1,
          date: "2024-01-07",
          assignmentIds: [1],
          assignmentLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 1,
        },
      ],
    });

    const northGrid = screen.getByLabelText("North schedule grid");
    expect(screen.getByText("Open Shifts")).toBeInTheDocument();
    expect(northGrid.querySelector('[data-tally-count="1-0"]')?.textContent).toBe("1");
  });

  it("colors covered category totals green and short staffing red", () => {
    observedWidth = 1600;

    const localRequirements: CoverageRequirement[] = [
      {
        id: 1,
        orgId: "org-1",
        focusAreaId: 1,
        assignmentId: 1,
        dayOfWeek: week1[0].getDay(),
        minStaff: 1,
      },
      {
        id: 2,
        orgId: "org-1",
        focusAreaId: 1,
        assignmentId: 1,
        dayOfWeek: week1[1].getDay(),
        minStaff: 2,
      },
      {
        id: 3,
        orgId: "org-1",
        focusAreaId: 1,
        assignmentId: 1,
        dayOfWeek: week1[2].getDay(),
        minStaff: 1,
      },
    ];
    const accessors = makeShiftAccessors(assignments, {
      [`emp-1_${formatDateKey(week1[0])}`]: [1],
      [`emp-1_${formatDateKey(week1[1])}`]: [1],
    });

    renderGrid({
      shiftForKey: accessors.shiftForKey,
      assignmentIdsForKey: accessors.assignmentIdsForKey,
      coverageRequirements: localRequirements,
    });

    const northGrid = screen.getByLabelText("North schedule grid");
    const coveredCell = northGrid.querySelector('[data-tally-count="1-0"]') as HTMLElement;
    const shortCell = northGrid.querySelector('[data-tally-count="1-1"]') as HTMLElement;
    const zeroShortCell = northGrid.querySelector('[data-tally-count="1-2"]') as HTMLElement;

    expect(coveredCell.dataset.tallyStatus).toBe("covered");
    expect(coveredCell.style.background).toBe("rgba(22, 163, 74, 0.12)");
    expect(shortCell.dataset.tallyStatus).toBe("short");
    expect(shortCell.style.background).toBe("rgba(220, 38, 38, 0.12)");
    expect(zeroShortCell.dataset.tallyStatus).toBe("short");
    expect(zeroShortCell.textContent).toBe("0");
  });

  it("excludes foreign focus-area shifts from totals while counting section and global shifts", () => {
    observedWidth = 1600;

    const localAssignmentDefinitions: AssignmentDefinition[] = [
      assignments[0],
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: null,
        sortOrder: 2,
      },
      {
        id: 3,
        orgId: "org-1",
        label: "E",
        name: "Evening Shift",
        color: "#FCE7F3",
        border: "#DB2777",
        text: "#9D174D",
        categoryId: 1,
        focusAreaId: 2,
        sortOrder: 3,
      },
    ];
    const accessors = makeShiftAccessors(localAssignmentDefinitions, {
      [`emp-1_${formatDateKey(week1[0])}`]: [3],
      [`emp-1_${formatDateKey(week1[1])}`]: [1],
      [`emp-1_${formatDateKey(week1[2])}`]: [2],
    });

    renderGrid({
      assignments: localAssignmentDefinitions,
      shiftForKey: accessors.shiftForKey,
      assignmentIdsForKey: accessors.assignmentIdsForKey,
    });

    const northGrid = screen.getByLabelText("North schedule grid");

    expect(northGrid.querySelectorAll("[data-tally-row]").length).toBe(1);
    expect(northGrid.querySelector('[data-tally-count="1-0"]')?.textContent).toBe("-");
    expect(northGrid.querySelector('[data-tally-count="1-1"]')?.textContent).toBe("1");
    expect(northGrid.querySelector('[data-tally-count="1-2"]')?.textContent).toBe("1");
  });

  it("keeps a section visible when it only has open shifts", () => {
    observedWidth = 1200;
    renderGrid({
      filteredEmployees: [],
      allEmployees: [],
      openShifts: [
        {
          id: "open-1",
          source: "calloff",
          focusAreaId: 1,
          date: "2024-01-07",
          assignmentIds: [1],
          assignmentLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 1,
        },
      ],
    });

    expect(screen.getByLabelText("North schedule grid")).toBeInTheDocument();
    expect(screen.getByText("Open Shifts")).toBeInTheDocument();
    expect(
      screen.getByLabelText("North schedule grid").querySelector("[data-tally-row]"),
    ).toBeNull();
    expect(screen.queryByText("No staff added yet")).not.toBeInTheDocument();
  });

  it("does not show OFF for draft-deleted shifts", () => {
    observedWidth = 1600;
    renderGrid({
      shiftForKey: () => null,
      assignmentIdsForKey: () => [],
      showDiffOverlay: true,
      draftKindForKey: () => "deleted" satisfies DraftKind,
      publishedLabelForKey: () => "D",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-draft-badge="deleted"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Deleted");
    expect(screen.queryByText("OFF")).not.toBeInTheDocument();
  });

  it("renders the 2-week boundary as a black divider in the body and tally rows", () => {
    observedWidth = 1600;
    const localRequirements: CoverageRequirement[] = [
      {
        id: 1,
        orgId: "org-1",
        focusAreaId: 1,
        assignmentId: 1,
        dayOfWeek: week1[0].getDay(),
        minStaff: 1,
      },
    ];
    renderGrid({
      filteredEmployees: extendedEmployees,
      allEmployees: extendedEmployees,
      coverageRequirements: localRequirements,
    });

    const northGrid = screen.getByLabelText("North schedule grid");
    const cells = screen.getAllByRole("gridcell") as HTMLElement[];
    const columnCount = week1.length + week2.length;
    const secondMondayRow2 = cells[columnCount + 1];
    const secondSundayRow2 = cells[columnCount + 7];
    const secondSundayRow3 = cells[columnCount * 2 + 7];
    const splitTallyCell = northGrid.querySelector('[data-tally-count="1-7"]') as HTMLElement;

    expect(secondMondayRow2.dataset.leadingDivider).toBe("light");
    expect(secondSundayRow2.dataset.leadingDivider).toBe("split");
    expect(secondSundayRow2.dataset.weekSplitStart).toBe("true");
    expect(secondSundayRow2.dataset.topDivider).toBe("light");
    expect(secondSundayRow3.dataset.leadingDivider).toBe("split");
    expect(secondSundayRow3.dataset.weekSplitStart).toBe("true");
    expect(secondSundayRow3.dataset.topDivider).toBe("light");
    expect(splitTallyCell.dataset.leadingDivider).toBe("split");
    expect(splitTallyCell.dataset.weekSplitStart).toBe("true");
  });

  it("renders the 2-week header boundary as a black divider", () => {
    observedWidth = 1600;
    renderGrid();

    const headers = screen.getAllByRole("columnheader") as HTMLElement[];
    const staffHeader = headers[0];
    const secondDayHeader = headers[2];
    const splitHeader = headers[8];

    // A background-image (not box-shadow) draws this line on both cells so
    // it lands on the same y-position regardless of sticky-column rendering
    // quirks — see ScheduleGrid.tsx.
    expect(staffHeader.style.backgroundImage).toContain(
      "linear-gradient(var(--color-dark), var(--color-dark))",
    );
    expect(staffHeader.style.backgroundPosition).toBe("0px 100%");
    expect(staffHeader.style.backgroundSize).toBe("100% 1px");
    expect(splitHeader.style.backgroundImage).toBe(
      "linear-gradient(var(--color-dark), var(--color-dark))",
    );
    expect(splitHeader.style.backgroundPosition).toBe("0px 100%");
    expect(splitHeader.style.backgroundSize).toBe("100% 1px");
    expect(secondDayHeader.dataset.leadingDivider).toBe("light");
    expect(splitHeader.dataset.leadingDivider).toBe("split");
    expect(splitHeader.dataset.weekSplitStart).toBe("true");
  });

  it("keeps the first-row header divider on edited cells", () => {
    observedWidth = 1600;
    renderGrid({
      showDiffOverlay: true,
      draftKindForKey: (_empId, date) => (formatDateKey(date) === "2024-01-07" ? "modified" : null),
    });

    const [editedCell, nextCell] = screen.getAllByRole("gridcell") as [HTMLElement, HTMLElement];

    expect(editedCell.dataset.topDivider).toBe("dark");
    expect(nextCell.dataset.topDivider).toBeUndefined();
  });

  it("keeps the open-shifts warning divider above first-row edited cells", () => {
    observedWidth = 1600;
    renderGrid({
      showDiffOverlay: true,
      draftKindForKey: (_empId, date) => (formatDateKey(date) === "2024-01-07" ? "modified" : null),
      openShifts: [
        {
          id: "open-1",
          source: "calloff",
          focusAreaId: 1,
          date: "2024-01-07",
          assignmentIds: [1],
          assignmentLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 1,
        },
      ],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;

    expect(firstCell.dataset.topDivider).toBe("warning");
  });

  it("renders compact author labels under shift pills, including Me for the current user", () => {
    observedWidth = 1600;
    renderGrid({
      showAudit: true,
      createdByNameForKey: (_empId, date) => {
        const dateKey = formatDateKey(date);
        if (dateKey === "2024-01-07") return "Me";
        if (dateKey === "2024-01-08") return "R. RN";
        return null;
      },
    });

    const root = screen
      .getByLabelText("North schedule grid")
      .closest("[data-grid-fit]") as HTMLElement;
    const cells = screen.getAllByRole("gridcell") as HTMLElement[];
    const firstCell = cells[0];
    const secondCell = cells[1];
    const authorPill = firstCell.querySelector('[data-author-pill="true"]') as HTMLElement | null;
    const secondAuthorPill = secondCell.querySelector(
      '[data-author-pill="true"]',
    ) as HTMLElement | null;
    const authorPillIcon = firstCell.querySelector(
      '[data-author-pill-icon="true"]',
    ) as HTMLElement | null;

    expect(root.style.getPropertyValue("--dg-grid-name-col-current")).toBe("220px");
    expect(root.style.getPropertyValue("--dg-grid-col-min-current")).toBe("98px");
    expect(firstCell.style.height).toBe("var(--dg-grid-cell-height)");
    expect(authorPill?.style.left).toBe("5px");
    expect(authorPill?.style.bottom).toBe("5px");
    expect(secondAuthorPill?.style.left).toBe("6px");
    expect(secondAuthorPill?.style.bottom).toBe("5px");
    expect(authorPill?.style.justifyContent).toBe("flex-start");
    expect(authorPillIcon?.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("Me")).toBeInTheDocument();
    expect(screen.getByText("R. RN")).toBeInTheDocument();
  });

  it("keeps unusually long author names truncated inside single-shift audit pills", () => {
    observedWidth = 1200;
    const longAuthorName = "Alexandria Catherine Montgomery-Wells";

    renderGrid({
      showAudit: true,
      createdByNameForKey: () => longAuthorName,
    });

    const root = screen
      .getByLabelText("North schedule grid")
      .closest("[data-grid-fit]") as HTMLElement;
    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const authorPill = firstCell.querySelector('[data-author-pill="true"]') as HTMLElement | null;
    const authorPillIcon = firstCell.querySelector(
      '[data-author-pill-icon="true"]',
    ) as HTMLElement | null;
    const authorText = within(firstCell).getByText(longAuthorName) as HTMLElement;
    const authorBody = authorText.parentElement as HTMLElement | null;

    expect(root.dataset.gridFit).toBe("false");
    expect(firstCell.style.height).toBe("var(--dg-grid-cell-height)");
    expect(authorPill?.style.left).toBe("5px");
    expect(authorPill?.style.bottom).toBe("5px");
    expect(authorPillIcon?.querySelector("svg")).not.toBeNull();
    expect(authorBody?.style.display).toBe("inline-flex");
    expect(authorBody?.style.maxWidth).toBe("100%");
    expect(authorText.style.overflow).toBe("hidden");
    expect(authorText.style.textOverflow).toBe("ellipsis");
    expect(authorText.style.whiteSpace).toBe("nowrap");
  });

  it("keeps split-shift author pills compact and inset under the multi-pill stack", () => {
    observedWidth = 1200;
    const longAuthorName = "Alexandria Catherine Montgomery-Wells";
    const localAssignmentDefinitions: AssignmentDefinition[] = [
      assignments[0],
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: 1,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      showAudit: true,
      createdByNameForKey: () => longAuthorName,
    });

    const root = screen
      .getByLabelText("North schedule grid")
      .closest("[data-grid-fit]") as HTMLElement;
    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const multiPills = firstCell.querySelectorAll('[data-shift-pill="multi"]');
    const authorPills = firstCell.querySelectorAll('[data-author-pill="true"]');
    const authorPill = authorPills[0] as HTMLElement | undefined;

    expect(root.dataset.gridFit).toBe("false");
    expect(firstCell.style.height).toBe("var(--dg-grid-cell-height)");
    expect(multiPills).toHaveLength(2);
    expect(authorPills).toHaveLength(1);
    expect(authorPill?.style.left).toBe("4px");
    expect(authorPill?.style.right).toBe("4px");
    expect(authorPill?.style.bottom).toBe("4px");
    expect(within(firstCell).getByText(longAuthorName)).toBeInTheDocument();
  });

  it("renders long split-shift names in name mode with wrapped pill content and a compact audit badge", () => {
    observedWidth = 1200;
    const longAuthorName = "Alexandria Catherine Montgomery-Wells";
    const longDayName = "Daytime Clinical Operations Coordination";
    const longNightName = "Overnight Emergency Intake Coordination";
    const localShiftCategories: ShiftCategory[] = [
      {
        id: 1,
        orgId: "org-1",
        name: longDayName,
        sortOrder: 1,
      },
      {
        id: 2,
        orgId: "org-1",
        name: longNightName,
        sortOrder: 2,
      },
    ];
    const localAssignmentDefinitions: AssignmentDefinition[] = [
      {
        ...assignments[0],
        categoryId: 1,
      },
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 2,
        focusAreaId: 1,
        sortOrder: 2,
      },
    ];

    renderGrid({
      assignments: localAssignmentDefinitions,
      shiftCategories: localShiftCategories,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      shiftDisplayMode: "name",
      showAudit: true,
      createdByNameForKey: () => longAuthorName,
    });

    const root = screen
      .getByLabelText("North schedule grid")
      .closest("[data-grid-fit]") as HTMLElement;
    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const multiPills = firstCell.querySelectorAll('[data-shift-pill="multi"]');
    const authorPill = firstCell.querySelector('[data-author-pill="true"]') as HTMLElement | null;
    const dayLabel = within(firstCell).getByText(longDayName) as HTMLElement;
    const nightLabel = within(firstCell).getByText(longNightName) as HTMLElement;

    expect(root.dataset.gridFit).toBe("false");
    expect(firstCell.style.height).toBe("var(--dg-grid-cell-height)");
    expect(multiPills).toHaveLength(2);
    expect(authorPill).not.toBeNull();
    expect(dayLabel.closest('[data-shift-pill="multi"]')).not.toBeNull();
    expect(nightLabel.closest('[data-shift-pill="multi"]')).not.toBeNull();
    expect(dayLabel.style.display).toBe("-webkit-box");
    expect(dayLabel.style.textAlign).toBe("center");
    expect(dayLabel.style.maxWidth).toBe("100%");
    expect(dayLabel.style.overflowWrap).toBe("break-word");
    expect(dayLabel.style.overflow).toBe("hidden");
    expect(dayLabel.style.lineHeight).toBe("1.2");
    expect(dayLabel.getAttribute("style")).toContain("-webkit-line-clamp: 1");
    expect(nightLabel.style.display).toBe("-webkit-box");
    expect(nightLabel.style.overflowWrap).toBe("break-word");
  });
});
