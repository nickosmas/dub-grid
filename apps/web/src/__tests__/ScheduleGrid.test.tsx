import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import ScheduleGrid, {
  buildScheduleGridModel,
  type ScheduleGridHandlers,
  type ScheduleGridInteractionState,
} from "@/components/ScheduleGrid";
import type { AbsencePillLayout } from "@/lib/absence-pill";
import { getReadableTextOnSurface } from "@/lib/colors";
import { resolveAbsenceStripes } from "@dubgrid/design-tokens";
import {
  MENTORED_CORNER_CLEARANCE,
  REQUEST_FOLD_CLEARANCE,
  REQUEST_FOLD_SIZE,
} from "@/components/schedule-grid/badges";
import { formatPublishedMetadata, GRID_CELL_HEIGHT } from "@/components/schedule-grid/gridHelpers";
import type { ScheduleNoteMark } from "@/components/schedule-grid/noteDots";
import type { AwayRange } from "@/components/schedule-grid/awayRuns";
import { formatDateKey } from "@/lib/utils";
import type {
  AbsenceType,
  ActiveShiftRequestSummary,
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
const isFirstDay = (date: Date) => formatDateKey(date) === formatDateKey(week1[0]);
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
  awayRanges?: ReadonlyMap<string, AwayRange>;
  corrections?: ReadonlyMap<string, { reason: string | null }>;
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
  todayKey?: string;
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
  canOpenCell?: (empId: string, date: Date) => boolean;
  canDragShifts?: boolean;
  activeIndicatorIdsForKey?: (empId: string, date: Date, focusAreaId?: number) => number[];
  noteMarksForKey?: (
    empId: string,
    date: Date,
    focusAreaId?: number,
    shift?: { shiftId: number | null; jobId: number },
  ) => ScheduleNoteMark[];
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
  showPublishDiffOverlay?: boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedAssignmentIdsForKey?: (empId: string, date: Date) => number[];
  publishedAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  restOfDayAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  restOfDayAbsenceLayoutForKey?: (empId: string, date: Date) => AbsencePillLayout | null;
  publishedRestOfDayAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
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
    isNewAddition?: boolean;
    publishedAt: string;
    publishedBy: string;
  } | null;
  publishedMetadataForKey?: (
    empId: string,
    date: Date,
  ) => { publishedAt: string; publishedBy: string; timeZone?: string | null } | null;
  cellEditors?: Map<string, { userId: string; userName: string }>;
  showAudit?: boolean;
  createdByNameForKey?: (empId: string, date: Date) => string | null;
  coverageRequirements?: CoverageRequirement[];
  absenceTypeMap?: Map<number, AbsenceType>;
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  activeRequestForKey?: (empId: string, date: Date) => ActiveShiftRequestSummary | null;
  shiftDisplayMode?: "code" | "name";
  useCompactRoleCertificationLabels?: boolean;
  showShiftDetailHoverCards?: boolean;
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

/** The rowgroup that holds a section's staff rows (the other holds the date row). */
function getGridBody(name: string): HTMLElement {
  const grid = screen.getByRole("grid", { name });
  const body = within(grid)
    .getAllByRole("rowgroup")
    .find((group) => group.querySelector('[role="gridcell"]'));
  if (!body) throw new Error(`No body rowgroup in ${name}`);
  return body;
}

// A fit line's size: its token at the line's fit scale (gridFit.ts).
const fitSize = (token: string) => `calc(${token} * var(--dg-grid-fit-scale, 1))`;
const FIT_TITLE = fitSize("var(--dg-fs-title)");
const FIT_FOOTNOTE = fitSize("var(--dg-fs-footnote)");
const FIT_MICRO = fitSize("var(--dg-fs-micro)");

// Marks on a pill that are not its text.
const PILL_MARKS =
  "[data-mentored-badge], [data-draft-badge], [data-publish-badge], [data-note-dots], [data-request-fold]";

// Every word on a pill sits in a fit line, so it shrinks rather than being cut.
function expectPillTextToFit(cell: HTMLElement) {
  const pills = Array.from(cell.querySelectorAll<HTMLElement>("[data-shift-pill]"));
  expect(pills.length).toBeGreaterThan(0);
  for (const pill of pills) {
    const walker = document.createTreeWalker(pill, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const host = node.parentElement as HTMLElement;
      // The focus-area wing's initials run vertically beside the words.
      if (!node.textContent?.trim() || host.closest(PILL_MARKS) || host.style.writingMode) {
        continue;
      }
      expect(host.closest("[data-pill-fit]"), node.textContent).not.toBeNull();
    }
    for (const el of Array.from(pill.querySelectorAll<HTMLElement>("*"))) {
      if (el.closest(PILL_MARKS)) continue;
      expect(el.style.textOverflow).not.toBe("ellipsis");
      expect(el.getAttribute("style") ?? "").not.toContain("line-clamp");
    }
  }
}

// Note dots sit in the pill's flow, so text has to make room for them.
function expectNoteDotsInFlow(cell: HTMLElement) {
  for (const dots of cell.querySelectorAll<HTMLElement>("[data-note-dots]")) {
    expect(dots.style.position).toBe("");
    // A row of their own, never the end of a line of text.
    expect(dots.dataset.noteDots).toBe("lane");
  }
}

function renderGrid(options: RenderGridOptions = {}) {
  const resolvedAssignmentDefinitions = options.assignments ?? assignments;
  const model = buildScheduleGridModel({
    filteredEmployees: options.filteredEmployees ?? employees,
    allEmployees: options.allEmployees ?? employees,
    week1: options.week1 ?? week1,
    week2: options.week2 ?? week2,
    spanWeeks: options.spanWeeks ?? 2,
    todayKey: options.todayKey ?? formatDateKey(week1[0]),
    awayRanges: options.awayRanges,
    corrections: options.corrections,
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
    cellEditors: options.cellEditors,
    resolvePublisherName: options.resolvePublisherName,
    openShifts: options.openShifts as any,
    activeFocusArea: options.activeFocusArea ?? null,
    highlightEmpIds: options.highlightEmpIds,
    highlightScrollKey: options.highlightScrollKey,
    isCellInteractive: options.isCellInteractive ?? true,
    canDragShifts: options.canDragShifts,
    shiftDisplayMode: options.shiftDisplayMode ?? "code",
    useCompactRoleCertificationLabels: options.useCompactRoleCertificationLabels ?? false,
    showShiftDetailHoverCards: options.showShiftDetailHoverCards,
    showPublishDiffOverlay: options.showPublishDiffOverlay,
    showAudit: options.showAudit,
    accessors: {
      shiftForKey: options.shiftForKey ?? (() => "D"),
      assignmentIdsForKey: options.assignmentIdsForKey ?? (() => [1]),
      segmentsForKey: options.segmentsForKey,
      publishedSegmentsForKey: options.publishedSegmentsForKey,
      getShiftStyle: options.getShiftStyle ?? getShiftStyleFromCodes(resolvedAssignmentDefinitions),
      noteMarksForKey:
        options.noteMarksForKey ??
        (options.activeIndicatorIdsForKey
          ? (empId: string, date: Date, focusAreaId?: number) =>
              options.activeIndicatorIdsForKey!(empId, date, focusAreaId).map(
                (indicatorTypeId) => ({
                  indicatorTypeId,
                  state: "published" as const,
                }),
              )
          : undefined),
      getCustomShiftTimes: options.getCustomShiftTimes,
      getPublishedCustomShiftTimes: options.getPublishedCustomShiftTimes,
      draftKindForKey: options.draftKindForKey,
      publishedLabelForKey: options.publishedLabelForKey,
      publishedAssignmentIdsForKey: options.publishedAssignmentIdsForKey,
      publishedAbsenceTypeIdForKey: options.publishedAbsenceTypeIdForKey,
      restOfDayAbsenceTypeIdForKey: options.restOfDayAbsenceTypeIdForKey,
      restOfDayAbsenceLayoutForKey: options.restOfDayAbsenceLayoutForKey,
      publishedRestOfDayAbsenceTypeIdForKey: options.publishedRestOfDayAbsenceTypeIdForKey,
      publishDiffForKey: options.publishDiffForKey as any,
      publishedMetadataForKey: options.publishedMetadataForKey,
      createdByNameForKey: options.createdByNameForKey,
      absenceTypeIdForKey: options.absenceTypeIdForKey,
      activeRequestForKey: options.activeRequestForKey,
      canOpenCell: options.canOpenCell,
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
    const body = getGridBody("North schedule grid");
    // The fitted grid does not scroll, so neither container may crop a chip
    // that deliberately crosses the shift pill's top edge.
    const scroller = body.parentElement as HTMLElement | null;
    expect(scroller?.style.overflowX).toBe("visible");
    expect(scroller?.style.overflowY).toBe("visible");
    expect((body.parentElement?.parentElement as HTMLElement | null)?.style.overflow).toBe(
      "visible",
    );
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
    expect(draggable?.style.zIndex).toBe("4");
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
    // Each pill of a double shift is drawn like a single shift's, full-size M included.
    expect((badges[0] as HTMLElement).style.width).toBe("16px");
    expect((badges[0] as HTMLElement).style.height).toBe("16px");
    expect((badges[0] as HTMLElement).style.borderRadius).toBe("999px");
    expect((badges[0] as HTMLElement).style.top).toBe("0.5px");
    expect((badges[0] as HTMLElement).style.right).toBe("0.5px");
    expect(pills[1].style.paddingLeft).toBe(pills[1].style.paddingRight);
    // The first line keeps the M's room on both sides, so it stays centred and clear of it.
    const firstLine = pills[1].querySelector<HTMLElement>(":scope > div");
    expect(firstLine?.style.paddingRight).toBe(`${MENTORED_CORNER_CLEARANCE - 3}px`);
    expect(firstLine?.style.paddingLeft).toBe(firstLine?.style.paddingRight);
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
    expect(alexName).toHaveStyle({ color: "var(--dg-color-brand)" });
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
    // The mocked layout gives the sticky group no height.
    expect((alexRow as HTMLElement).style.scrollMarginTop).toBe(
      "calc(var(--dg-app-shell-header-height, 56px) + var(--dg-schedule-chrome-height, 0px) + 0px)",
    );
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

  it("keeps publish diff overlays layout-stable and details the prior value in the shift hover card", async () => {
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
      showPublishDiffOverlay: true,
      assignments: localAssignmentDefinitions,
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
    // A two-pixel shadow paints outside the existing pill border without
    // changing its box-model dimensions.
    expect(pill?.style.boxShadow).toMatch(/^0 0 0 2px /);
    expect(within(firstCell).queryByText("was: N")).not.toBeInTheDocument();
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("Edited");
    expect(badge).toHaveStyle({
      background: "rgba(217, 119, 6, 0.94)",
    });
    expect(pill?.style.overflow).toBe("visible");
    expect(
      Number.parseFloat(pill?.style.top ?? "0") + Number.parseFloat(badge?.style.top ?? "0"),
    ).toBeGreaterThanOrEqual(2);
    expect(pill?.style.borderColor).toBe("rgba(26, 61, 27, 0.35)");
    expect(badge?.style.top).toBe("0px");
    expect(badge?.style.transform).toBe("translateY(-50%)");
    expect(badge?.style.left).toBe("4px");
    expect(badge?.style.zIndex).toBe("10");

    expect(badge?.getAttribute("aria-label")).toContain("Was Night Shift · North");

    fireEvent.mouseEnter(pill!);
    await waitFor(() => {
      expect(screen.getByText("Was")).toBeInTheDocument();
      expect(screen.getByText("Night Shift")).toBeInTheDocument();
      expect(screen.getByText(/Published .*by Mina\./)).toBeInTheDocument();
    });
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

    expect(firstCell.style.background).toBe("var(--dg-color-surface)");
    expect(badge?.textContent).toBe("Edited");
  });

  it("rings side-by-side pills inward so two shifts in one cell never overlap", () => {
    const localAssignmentDefinitions = [
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
      showPublishDiffOverlay: true,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "new",
        fromState: null,
        toState: {
          kind: "worked",
          segments: [
            { shiftId: 1, jobId: 101, position: 0 },
            { shiftId: 1, jobId: 102, position: 1 },
          ],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pills = Array.from(
      firstCell.querySelectorAll('[data-shift-pill="multi"]'),
    ) as HTMLElement[];

    expect(pills.length).toBe(2);
    // A two-pixel ring sits outside the box without changing either pill's
    // layout dimensions.
    for (const pill of pills) {
      expect(pill.style.boxShadow).toMatch(/^0 0 0 2px /);
    }
  });

  describe("published double shifts carry one badge per pill", () => {
    const doubleShiftAssignments = [
      { ...assignments[0], jobId: 101 },
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
    const segments = [
      { shiftId: 1, jobId: 101, position: 0 },
      { shiftId: 1, jobId: 102, position: 1 },
    ];
    const workedState = (cellSegments: typeof segments) => ({
      kind: "worked" as const,
      segments: cellSegments,
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    });

    type PublishDiff = NonNullable<ReturnType<NonNullable<RenderGridOptions["publishDiffForKey"]>>>;

    function renderDoubleShift(
      publishDiff: Omit<PublishDiff, "empId" | "date" | "publishedAt" | "publishedBy">,
    ) {
      renderGrid({
        assignments: doubleShiftAssignments,
        shiftForKey: () => "D/N",
        assignmentIdsForKey: () => [1, 2],
        showPublishDiffOverlay: true,
        publishDiffForKey: () => ({
          empId: "emp-1",
          date: "2024-01-07",
          publishedAt: "2024-01-07T12:00:00.000Z",
          publishedBy: "user-1",
          ...publishDiff,
        }),
      });
      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      const pills = Array.from(
        firstCell.querySelectorAll('[data-shift-pill="multi"]'),
      ) as HTMLElement[];
      expect(pills).toHaveLength(2);
      return { firstCell, pills };
    }

    it("marks both pills New when the whole cell is new", () => {
      const { firstCell, pills } = renderDoubleShift({
        kind: "new",
        fromState: null,
        toState: workedState(segments),
      });

      expect(firstCell.querySelectorAll('[data-publish-badge="new"]')).toHaveLength(2);
      for (const pill of pills) {
        expect(pill.querySelector('[data-publish-badge="new"]')?.textContent).toBe("New");
        expect(pill.style.boxShadow).toMatch(/^0 0 0 2px /);
      }
    });

    it.each([undefined, false])(
      "marks only the added second shift New (isNewAddition %s)",
      (isNewAddition) => {
        const { firstCell, pills } = renderDoubleShift({
          kind: "modified",
          isNewAddition,
          fromState: workedState([segments[0]!]),
          toState: workedState(segments),
        });

        expect(firstCell.querySelectorAll("[data-publish-badge]")).toHaveLength(1);
        expect(pills[0]!.querySelector("[data-publish-badge]")).toBeNull();
        expect(pills[0]!.style.boxShadow).toBe("none");
        expect(pills[1]!.querySelector('[data-publish-badge="new"]')?.textContent).toBe("New");
        expect(pills[1]!.style.boxShadow).toMatch(/^0 0 0 2px /);
      },
    );
  });

  it("keeps the cell-level New badge on a single published pill", () => {
    renderGrid({
      showPublishDiffOverlay: true,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "new",
        isNewAddition: true,
        from: [],
        to: [1],
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    expect(firstCell.querySelectorAll('[data-publish-badge="new"]')).toHaveLength(1);
  });

  it("keeps the normal cell background when show changes is on", () => {
    observedWidth = 1600;

    renderGrid({
      showPublishDiffOverlay: true,
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
    expect(firstCell.style.background).toBe("var(--dg-color-surface)");
  });

  it("keeps time-only publish diffs compact and exposes the changed time in the tooltip", () => {
    observedWidth = 1600;

    renderGrid({
      showPublishDiffOverlay: true,
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
    expect(badge?.textContent).toBe("Edited");

    expect(badge?.getAttribute("aria-label")).toContain(
      "Changed custom time 7:00 AM - 3:00 PM to 8:00 AM - 4:00 PM.",
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
    expect(firstCell.style.height).toBe(GRID_CELL_HEIGHT);
    expect(within(firstCell).queryByText("was: N")).not.toBeInTheDocument();
    expect(badge?.textContent).toBe("Edited");
    expect(badge).toHaveStyle({
      background: "rgba(217, 119, 6, 0.94)",
    });
    expect(badge?.style.top).toBe("0px");
    expect(badge?.style.transform).toBe("translateY(-50%)");
    expect(badge?.style.left).toBe("4px");
    expect(badge?.getAttribute("aria-label")).toContain("Was N.");
  });

  it("annotates a single-pill draft replacement and keeps its border dashed", () => {
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

    expect(badge?.textContent).toBe("Edited");
    expect(pill).toHaveStyle({
      borderStyle: "dashed",
      borderWidth: "2px",
    });
    expect(pill?.style.borderColor).toBe("rgb(217, 119, 6)");
  });

  it("keeps only the added second shift dashed", () => {
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

  it("keeps only the newly mentored split-shift pill dashed", () => {
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
    // The mentored pill says so — a dashed border with nothing naming the edit
    // left the reader guessing which of the two shifts had changed.
    expect(firstCell.querySelectorAll("[data-draft-badge]")).toHaveLength(1);
    expect(badge?.textContent).toBe("Edited");
    expect(badge?.getAttribute("aria-label")).toBe("Marked mentored for N.");
    expect(pills[1].contains(badge)).toBe(true);
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
    const splitPillContainer = pills[0]?.parentElement?.parentElement as HTMLElement | null;
    expect(splitPillContainer?.style.top).toBe("4px");
    expect(
      Number.parseFloat(splitPillContainer?.style.top ?? "0") +
        Number.parseFloat(badge?.style.top ?? "0"),
    ).toBeGreaterThanOrEqual(2);
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
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1],
      publishedLabelForKey: () => "D · Supv",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-draft-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Edited");
    expect(badge?.getAttribute("aria-label")).toContain("Was D · Supv.");
  });

  const twoPillAssignmentDefinitions: AssignmentDefinition[] = [
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
    {
      id: 3,
      orgId: "org-1",
      label: "E",
      name: "Evening Shift",
      color: "#FEF3C7",
      border: "#D97706",
      text: "#92400E",
      categoryId: 1,
      focusAreaId: 1,
      sortOrder: 3,
    },
    {
      id: 4,
      orgId: "org-1",
      label: "S",
      name: "Swing Shift",
      color: "#EDE9FE",
      border: "#7C3AED",
      text: "#4C1D95",
      categoryId: 1,
      focusAreaId: 1,
      sortOrder: 4,
    },
  ];

  it("matches stacked edited badge radii to the multi-pill shift container", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [3, 4],
      publishedLabelForKey: () => "E/S",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = Array.from(firstCell.querySelectorAll('[data-draft-badge="modified"]')).find(
      (candidate) => (candidate as HTMLElement).style.left !== "",
    ) as HTMLElement | undefined;

    expect(badge?.textContent).toBe("Edited");
    expect(badge?.style.borderRadius).toBe("3px");
    expect(badge?.style.top).toBe("0px");
    expect(badge?.style.transform).toBe("translateY(-50%)");
    expect(badge?.style.left).toBe("2px");
  });

  it("rings a reordered pair without claiming either pill was something else", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [2, 1],
      publishedLabelForKey: () => "N/D",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;

    expect(firstCell.querySelector("[data-draft-badge]")).toBeNull();
  });

  it("marks a removed split-shift segment as Edited and names its former value", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      shiftForKey: () => "N",
      assignmentIdsForKey: () => [2],
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1, 2],
      publishedLabelForKey: () => "D/N",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = Array.from(firstCell.querySelectorAll('[data-draft-badge="modified"]')).find(
      (candidate) => (candidate as HTMLElement).style.left !== "",
    ) as HTMLElement | undefined;

    expect(badge?.textContent).toBe("Edited");
    expect(badge?.getAttribute("aria-label")).toBe("Was D.");
    expect(
      (badge?.closest('[data-shift-pill="single"]') as HTMLElement | null)?.style.overflow,
    ).toBe("visible");
  });

  it("names an archived published segment in its Was detail", () => {
    observedWidth = 1600;

    const currentDay = {
      ...assignments[0],
      jobId: 101,
    };
    const archivedEvening = {
      ...twoPillAssignmentDefinitions[2],
      name: "Evening Shift · Supervisor",
      categoryId: 2,
      jobId: 103,
      archivedAt: "2024-01-08T00:00:00.000Z",
    };
    renderGrid({
      assignments: [currentDay],
      historicalAssignments: [archivedEvening],
      shiftCategories: [
        ...shiftCategories,
        { id: 2, orgId: "org-1", name: "Evening Shift", sortOrder: 2 },
      ],
      jobs: [{ id: 103, name: "Supervisor" } as JobDefinition],
      shiftForKey: () => "D",
      assignmentIdsForKey: () => [1],
      showPublishDiffOverlay: true,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        fromState: {
          kind: "worked",
          segments: [
            { shiftId: 1, jobId: 101, position: 0 },
            { shiftId: 2, jobId: 103, position: 1 },
          ],
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
    });

    const badge = screen
      .getAllByRole("gridcell")[0]
      .querySelector('[data-publish-badge="modified"]') as HTMLElement | null;

    expect(badge?.getAttribute("aria-label")).toContain(
      "Shift 2: Evening Shift (archived) · Supervisor · North (removed)",
    );
    expect(badge?.getAttribute("aria-label")).not.toContain("Supervisor · Supervisor");
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
    expect(pill?.style.paddingLeft).toBe("18px");
    expect(initialsBadge.style.position).toBe("absolute");
    expect(initialsBadge.style.writingMode).toBe("vertical-rl");
    expect(initialsBadge.style.textOrientation).toBe("upright");
    expect(initialsBadge.style.left).toBe("0px");
    expect(initialsBadge.style.borderRadius).toBe("7px 0 0 7px");
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

    expect(crossPill?.style.borderRadius).toBe("8px");
    expect(crossPill?.style.paddingLeft).toBe("18px");
    expect(initialsBadge.style.position).toBe("absolute");
    expect(initialsBadge.style.writingMode).toBe("vertical-rl");
    expect(initialsBadge.style.left).toBe("0px");
    expect(initialsBadge.style.borderRadius).toBe("7px 0 0 7px");
    expect(initialsBadge).toHaveStyle({
      background: "#DBEAFE",
      color: "#1E3A8A",
    });
    expect(within(firstCell).queryByText("Sheltered Care")).toBeNull();
  });

  it("keeps cross-focus split draft pills on the white shift surface", () => {
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
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1],
      publishedLabelForKey: () => "D",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const initialsBadge = within(firstCell).getByText("SC") as HTMLElement;
    const crossPill = initialsBadge.closest('[data-shift-pill="multi"]') as HTMLElement | null;

    expect(crossPill?.style.background).toBe("var(--dg-color-surface)");
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
    expect(pill?.style.paddingLeft).toBe("18px");
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

    expect(pill?.style.background).toBe("var(--dg-color-surface)");
    expect(pill?.style.color).toBe(readableTextColorRgb);
    expect(pill?.style.color).not.toBe("rgb(248, 250, 252)");
  });

  it("keeps cross-focus draft new cells on the white shift surface", () => {
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
      draftKindForKey: () => "new",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const badge = firstCell.querySelector('[data-draft-badge="new"]') as HTMLElement | null;

    expect(badge).toBeNull();
    expect(pill?.style.background).toBe("var(--dg-color-surface)");
    expect(within(firstCell).getByText("SC").style.background).toBe("rgb(219, 234, 254)");
  });

  it("keeps cross-focus draft modified cells on the white shift surface", () => {
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
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1],
      publishedLabelForKey: () => "D",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;
    const badge = firstCell.querySelector('[data-draft-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Edited");
    expect(pill?.style.background).toBe("var(--dg-color-surface)");
  });

  it("names the published shift an absence draft replaced", () => {
    observedWidth = 1600;

    renderGrid({
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
      shiftForKey: () => "VAC",
      assignmentIdsForKey: () => [],
      absenceTypeIdForKey: () => 7,
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1],
      publishedLabelForKey: () => "D",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-draft-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Edited");
    expect(badge?.getAttribute("aria-label")).toBe("Was D.");
  });

  it("keeps an absence whose label contains a slash on one pill", () => {
    observedWidth = 1600;
    renderGrid({
      absenceTypeMap: new Map([
        [
          7,
          {
            id: 7,
            orgId: "org-1",
            label: "PTO/Flex",
            name: "PTO/Flex",
            color: "#FDE68A",
            border: "#D97706",
            text: "#92400E",
            countsTowardAvailability: false,
            sortOrder: 1,
          },
        ],
      ]),
      // One day: days in a row would draw as a run (item 52).
      shiftForKey: (_empId: string, date: Date) => (isFirstDay(date) ? "PTO/Flex" : null),
      assignmentIdsForKey: () => [],
      absenceTypeIdForKey: (_empId: string, date: Date) => (isFirstDay(date) ? 7 : null),
    });
    const cell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pills = cell.querySelectorAll("[data-shift-pill]");

    expect(pills.length).toBe(1);
    expect(pills[0].getAttribute("data-shift-pill")).toBe("single");
    expect(pills[0].textContent).toBe("PTO/Flex");
  });

  it("steps a cell badge past the mentored circle it would otherwise cover", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      shiftForKey: () => "D",
      assignmentIdsForKey: () => [1],
      segmentsForKey: () => [{ shiftId: 1, jobId: 101, position: 0, isMentored: true }],
      publishedSegmentsForKey: () => [
        { shiftId: 1, jobId: 101, position: 0, isMentored: false },
        { shiftId: 1, jobId: 102, position: 1, isMentored: false },
      ],
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1, 2],
      publishedLabelForKey: () => "D/N",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = Array.from(firstCell.querySelectorAll('[data-draft-badge="modified"]')).find(
      (candidate) => (candidate as HTMLElement).style.left !== "",
    ) as HTMLElement | undefined;

    expect(badge?.textContent).toBe("Edited");
    expect(firstCell.querySelector('[data-mentored-badge="true"]')).not.toBeNull();
    expect(badge?.style.left).toBe("4px");
  });

  it("keeps an unmentored cell badge in the corner", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      shiftForKey: () => "D",
      assignmentIdsForKey: () => [1],
      segmentsForKey: () => [{ shiftId: 1, jobId: 101, position: 0, isMentored: false }],
      publishedSegmentsForKey: () => [
        { shiftId: 1, jobId: 101, position: 0, isMentored: false },
        { shiftId: 1, jobId: 102, position: 1, isMentored: false },
      ],
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [1, 2],
      publishedLabelForKey: () => "D/N",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-draft-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Edited");
    expect(badge?.style.left).toBe("4px");
  });

  it("stacks the split-shift corner so notes, the mentored circle and the badge do not pile up", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      indicatorTypes: [
        { id: 1, orgId: "org-1", name: "Flag", color: "#ff0000", sortOrder: 1 },
        { id: 2, orgId: "org-1", name: "Note", color: "#00ff00", sortOrder: 2 },
      ],
      activeIndicatorIdsForKey: () => [1, 2],
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      segmentsForKey: () => [
        { shiftId: 1, jobId: 101, position: 0, isMentored: false },
        { shiftId: 1, jobId: 102, position: 1, isMentored: true },
      ],
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [3, 4],
      publishedLabelForKey: () => "E/S",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = Array.from(firstCell.querySelectorAll("[data-draft-badge]")).find(
      (candidate) => (candidate as HTMLElement).style.left !== "",
    ) as HTMLElement | undefined;
    const dots = firstCell.querySelector('[data-mentored-badge="true"]')?.parentElement;

    expect(badge?.textContent).toBe("Edited");
    expect(badge?.style.left).toBe("2px");
    expect(dots).not.toBeNull();
  });

  it("keeps a draft-deleted cell's notes visible", () => {
    observedWidth = 1600;

    renderGrid({
      shiftForKey: () => null,
      assignmentIdsForKey: () => [],
      activeIndicatorIdsForKey: () => [1],
      draftKindForKey: () => "deleted",
      publishedAssignmentIdsForKey: () => [1],
      publishedLabelForKey: () => "D",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;

    const deletedPill = firstCell.querySelector('[data-shift-pill="deleted"]') as HTMLElement;
    expect(deletedPill).not.toBeNull();
    expect(firstCell.querySelectorAll("[data-note-mark]")).toHaveLength(1);
    expect(deletedPill.querySelector('[data-note-dots="lane"] [data-note-mark]')).not.toBeNull();
    expectNoteDotsInFlow(firstCell);
  });

  it("draws a note added but not yet published hollow in its own colour", () => {
    observedWidth = 1600;

    renderGrid({
      indicatorTypes: [{ id: 1, orgId: "org-1", name: "Flag", color: "#ff0000", sortOrder: 1 }],
      noteMarksForKey: () => [{ indicatorTypeId: 1, state: "draft_added" }],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const added = firstCell.querySelector('[data-note-mark="draft_added"]') as HTMLElement;

    expect(within(firstCell).getByLabelText("Flag · Added, not published")).toBeInTheDocument();
    expect(added.style.background).toBe("transparent");
    expect(added.style.boxShadow).toBe("inset 0 0 0 1.75px #ff0000");
  });

  it("draws two notes as dots and counts a third", () => {
    observedWidth = 1600;

    renderGrid({
      indicatorTypes: [1, 2, 3].map((id) => ({
        id,
        orgId: "org-1",
        name: `Note ${id}`,
        color: "#ff0000",
        sortOrder: id,
      })),
      noteMarksForKey: () =>
        [1, 2, 3].map((indicatorTypeId) => ({ indicatorTypeId, state: "published" as const })),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const marks = firstCell.querySelectorAll("[data-note-mark]");

    expect(marks).toHaveLength(2);
    expect(firstCell.querySelector("[data-note-more]")?.textContent).toBe("+1");
    expect(within(firstCell).getByLabelText("3 notes: Note 1, Note 2, Note 3")).toBeInTheDocument();
    expectNoteDotsInFlow(firstCell);
  });

  it("keeps a one-line pill's notes in a strip along its bottom", () => {
    observedWidth = 1600;

    renderGrid({ noteMarksForKey: () => [{ indicatorTypeId: 1, state: "published" }] });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement;
    const lane = pill.querySelector<HTMLElement>('[data-note-dots="lane"]');

    expect(lane?.parentElement).toBe(pill);
    expect(lane?.style.height).toBe("13px");
    expect(lane?.style.justifyContent).toBe("flex-end");
    // The strip keeps the words' room; the dots sit in the pill's bottom-right
    // corner, as the M sits in its top-right.
    const dots = lane?.querySelector<HTMLElement>('[role="img"]');
    expect(dots?.style.position).toBe("absolute");
    expect(dots?.style.right).toBe("2px");
    expect(dots?.style.bottom).toBe("2px");
    expect(lane?.querySelectorAll("[data-note-mark]")).toHaveLength(1);
    // A one-line pill with notes still fits the normal cell.
    expect(
      (firstCell.closest('[role="row"]') as HTMLElement).style.getPropertyValue(
        "--dg-grid-row-cell-height",
      ),
    ).toBe("");
    expectNoteDotsInFlow(firstCell);
  });

  it("puts a timed pill's notes on a row of their own and grows the row to fit", () => {
    observedWidth = 1600;

    renderGrid({
      getCustomShiftTimes: () => ({ start: "08:00", end: "16:00" }),
      noteMarksForKey: () => [{ indicatorTypeId: 1, state: "published" }],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement;
    const row = firstCell.closest('[role="row"]') as HTMLElement;
    const content = firstCell.querySelector<HTMLElement>(".dg-grid-cell__content");

    // The time keeps its line; the dots take the strip below it.
    expect(pill.querySelector('[data-note-dots="lane"]')?.parentElement).toBe(pill);
    expect(row.style.getPropertyValue("--dg-grid-row-cell-height")).toContain(
      "1px + var(--dg-fs-footnote) + 14px",
    );
    // This cell grows with the row rather than holding the normal height.
    expect(content?.style.height).toBe("");
    expectNoteDotsInFlow(firstCell);
    expectPillTextToFit(firstCell);
  });

  it("shows two dots and a count on a double shift's pill with more than two notes", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      indicatorTypes: [1, 2, 3].map((id) => ({
        id,
        orgId: "org-1",
        name: `Note ${id}`,
        color: "#ff0000",
        sortOrder: id,
      })),
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      segmentsForKey: () => [
        { shiftId: 1, jobId: 101, position: 0, isMentored: false },
        { shiftId: 1, jobId: 102, position: 1, isMentored: false },
      ],
      noteMarksForKey: () =>
        [1, 2, 3].map((indicatorTypeId) => ({ indicatorTypeId, state: "published" as const })),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelectorAll('[data-shift-pill="multi"]')[0] as HTMLElement;

    expect(pill.querySelectorAll("[data-note-mark]")).toHaveLength(2);
    expect(pill.querySelector("[data-note-more]")?.textContent).toBe("+1");
    expect(within(pill).getByLabelText("3 notes: Note 1, Note 2, Note 3")).toBeInTheDocument();
  });

  it("stacks a double shift in a taller row when its pills would be too narrow side by side", () => {
    observedWidth = 1440;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pills = Array.from(
      firstCell.querySelectorAll('[data-shift-pill="multi"]'),
    ) as HTMLElement[];
    const row = firstCell.closest('[role="row"]') as HTMLElement;

    expect(pills[0].parentElement?.dataset.shiftLayout).toBe("stacked");
    expect(pills[0].parentElement?.style.gridTemplateRows).toBe(
      "minmax(min-content, 1fr) minmax(min-content, 1fr)",
    );
    expect(firstCell.style.height).toBe(GRID_CELL_HEIGHT);
    expect(row.style.getPropertyValue("--dg-grid-row-cell-height")).toMatch(
      /^max\(var\(--dg-grid-cell-height\), calc\(/,
    );
  });

  it("keeps a single shift at its normal height in a row grown for a double shift", () => {
    observedWidth = 1440;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      shiftForKey: (_empId, date) => (date.getDay() === 1 ? "D/N" : "D"),
      assignmentIdsForKey: (_empId, date) => (date.getDay() === 1 ? [1, 2] : [1]),
    });

    const cells = screen.getAllByRole("gridcell") as HTMLElement[];
    const content = (cell: HTMLElement) =>
      cell.querySelector<HTMLElement>(".dg-grid-cell__content");
    const doubleCell = cells.find((cell) => cell.querySelector('[data-shift-pill="multi"]'))!;
    const singleCell = cells.find((cell) => cell.querySelector('[data-shift-pill="single"]'))!;

    expect(doubleCell.closest('[role="row"]')).toBe(singleCell.closest('[role="row"]'));
    expect(content(doubleCell)?.style.height).toBe("");
    expect(content(singleCell)?.style.height).toBe("var(--dg-grid-cell-height)");
  });

  it("keeps a double shift side by side at the normal height when the column is wide", () => {
    observedWidth = 1440;

    renderGrid({
      spanWeeks: 1,
      assignments: twoPillAssignmentDefinitions,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pills = Array.from(
      firstCell.querySelectorAll('[data-shift-pill="multi"]'),
    ) as HTMLElement[];
    const row = firstCell.closest('[role="row"]') as HTMLElement;

    expect(pills[0].parentElement?.dataset.shiftLayout).toBe("side-by-side");
    expect(pills[0].parentElement?.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    // One pill tall, so the row keeps the grid's height unless a pill's lines need more.
    expect(row.style.getPropertyValue("--dg-grid-row-cell-height")).toContain(" 1 * (");
  });

  describe("absence runs (item 52)", () => {
    const vacation: AbsenceType = {
      id: 7,
      orgId: "org-1",
      label: "VAC",
      name: "Vacation",
      color: "#FDE68A",
      border: "#D97706",
      text: "#92400E",
      sortOrder: 1,
    };
    const absenceTypeMap = new Map([[vacation.id, vacation]]);

    // Alex's whole-day vacation on the given dates; everyone else works a D.
    function renderVacation(dateKeys: string[], options: RenderGridOptions = {}) {
      const isAway = (empId: string, date: Date) =>
        empId === "emp-1" && dateKeys.includes(formatDateKey(date));
      return renderGrid({
        absenceTypeMap,
        shiftForKey: (empId, date) => (isAway(empId, date) ? "VAC" : null),
        assignmentIdsForKey: () => [],
        absenceTypeIdForKey: (empId, date) => (isAway(empId, date) ? vacation.id : null),
        ...options,
      });
    }

    function alexCells(): HTMLElement[] {
      return (screen.getAllByRole("gridcell") as HTMLElement[]).filter(
        (cell) => cell.dataset.empId === "emp-1",
      );
    }

    const monToThu = ["2024-01-08", "2024-01-09", "2024-01-10", "2024-01-11"];

    it("draws days in a row as one bar with one label, each day still its own cell", () => {
      observedWidth = 1600;
      const onActivateCell = vi.fn();
      renderVacation(monToThu, { onActivateCell });

      expect(screen.getAllByText("Vacation \u00d74")).toHaveLength(1);
      const cells = alexCells().slice(1, 5);
      expect(cells.map((cell) => cell.dataset.absenceRun)).toEqual([
        "start",
        "middle",
        "middle",
        "end",
      ]);
      expect(cells.map((cell) => cell.dataset.leadingDivider)).toEqual([
        "light",
        "none",
        "none",
        "none",
      ]);
      for (const cell of cells) {
        expect(cell.getAttribute("aria-label")).toMatch(/^Alex .*: VAC$/);
        const pill = cell.querySelector('[data-shift-pill="single"]') as HTMLElement;
        expect(pill.textContent).toBe("");
        expect(pill.style.background).toBe("transparent");
      }
      expect(cells[0].querySelector("[data-absence-run-bar]")).not.toBeNull();
      expect(cells[1].querySelector("[data-absence-run-bar]")).toBeNull();
      // The day after the run keeps its divider.
      expect(alexCells()[5].dataset.leadingDivider).toBe("light");

      fireEvent.click(cells[2]);
      expect(onActivateCell).toHaveBeenCalledWith(
        expect.objectContaining({
          cellId: { empId: "emp-1", dateKey: "2024-01-10", sectionId: 1 },
          trigger: "click",
        }),
      );
    });

    it("keeps a single day as its own pill with no count", () => {
      observedWidth = 1600;
      renderVacation(["2024-01-08"]);

      const cell = alexCells()[1];
      expect(cell.dataset.absenceRun).toBeUndefined();
      expect(cell.querySelector('[data-shift-pill="single"]')?.textContent).toBe("VAC");
      expect(screen.queryByText(/\u00d7/)).not.toBeInTheDocument();
    });

    it("breaks the bar at the week split", () => {
      observedWidth = 1600;
      renderVacation([...week1, ...week2].map(formatDateKey));

      expect(screen.getAllByText("Vacation \u00d77")).toHaveLength(2);
      const cells = alexCells();
      expect(cells[6].dataset.absenceRun).toBe("end");
      expect(cells[7].dataset.absenceRun).toBe("start");
      expect(cells[7].dataset.leadingDivider).toBe("split");
    });

    it("breaks the bar at a day changed in the draft", () => {
      observedWidth = 1600;
      renderVacation(monToThu, {
        draftKindForKey: (empId, date) =>
          empId === "emp-1" && formatDateKey(date) === "2024-01-10" ? "modified" : null,
      });

      expect(screen.getAllByText("Vacation \u00d72")).toHaveLength(1);
      const cells = alexCells();
      expect(cells[3].dataset.absenceRun).toBeUndefined();
      expect(cells[3].dataset.leadingDivider).toBe("light");
      expect(cells[4].dataset.absenceRun).toBeUndefined();
    });

    it("keeps pills while selecting days for removal", () => {
      observedWidth = 1600;
      renderVacation(monToThu, { bulkDeleteMode: true });

      expect(screen.queryByText("Vacation \u00d74")).not.toBeInTheDocument();
      expect(alexCells()[2].dataset.absenceRun).toBeUndefined();
    });

    it("marks a hovered day, hides the label and lights its header, then clears them", () => {
      observedWidth = 1600;
      renderVacation(monToThu);

      const cells = alexCells();
      const bar = cells[1].querySelector("[data-absence-run-bar]") as HTMLElement;
      const header = screen
        .getAllByRole("columnheader")
        .find((element) => element.dataset.dateKey === "2024-01-10") as HTMLElement;

      fireEvent.mouseEnter(cells[3]);
      expect(cells[3].dataset.runHover).toBe("true");
      expect(bar.dataset.runHover).toBe("true");
      expect(header.dataset.runHover).toBe("true");
      expect(cells[2].dataset.runHover).toBeUndefined();

      fireEvent.mouseLeave(cells[3]);
      expect(cells[3].dataset.runHover).toBeUndefined();
      expect(bar.dataset.runHover).toBeUndefined();
      expect(header.dataset.runHover).toBeUndefined();
    });

    it("leaves a day outside a run without hover marks", () => {
      observedWidth = 1600;
      renderVacation(monToThu);

      const cell = alexCells()[6];
      fireEvent.mouseEnter(cell);
      expect(cell.dataset.runHover).toBeUndefined();
    });
  });

  describe("past days (53b)", () => {
    it("washes days before today, still opens them, and takes no drag or menu there", () => {
      observedWidth = 1600;
      const onActivateCell = vi.fn();
      const onOpenCellMenu = vi.fn();
      renderGrid({
        todayKey: formatDateKey(week1[3]),
        canDragShifts: true,
        onActivateCell,
        onOpenCellMenu,
      });

      const cells = (screen.getAllByRole("gridcell") as HTMLElement[]).filter(
        (cell) => cell.dataset.empId === "emp-1",
      );
      expect(cells.slice(0, 5).map((cell) => cell.dataset.past)).toEqual([
        "true",
        "true",
        "true",
        undefined,
        undefined,
      ]);
      const headers = (screen.getAllByRole("columnheader") as HTMLElement[]).filter(
        (header) => header.dataset.dateKey,
      );
      expect(headers[2].dataset.past).toBe("true");
      expect(headers[3].dataset.past).toBeUndefined();

      expect(cells[1].querySelector(".dg-draggable-shift")).toBeNull();
      expect(cells[4].querySelector(".dg-draggable-shift")).not.toBeNull();

      fireEvent.contextMenu(cells[1]);
      expect(onOpenCellMenu).not.toHaveBeenCalled();
      fireEvent.contextMenu(cells[4]);
      expect(onOpenCellMenu).toHaveBeenCalledTimes(1);

      fireEvent.click(cells[1]);
      expect(onActivateCell).toHaveBeenCalledWith(
        expect.objectContaining({
          cellId: expect.objectContaining({ dateKey: formatDateKey(week1[1]) }),
        }),
      );
    });
  });

  describe("a viewer who can't edit", () => {
    const ownCell = (empId: string, date: Date) => empId === "emp-1" && isFirstDay(date);

    it("opens only the cells they can act on and offers no new shift", () => {
      observedWidth = 1600;
      const onActivateCell = vi.fn();
      const onOpenCellMenu = vi.fn();
      renderGrid({
        canOpenCell: ownCell,
        canDragShifts: false,
        shiftForKey: (empId, date) => (ownCell(empId, date) ? "D" : null),
        assignmentIdsForKey: (empId, date) => (ownCell(empId, date) ? [1] : []),
        onActivateCell,
        onOpenCellMenu,
      });

      const cells = screen.getAllByRole("gridcell") as HTMLElement[];
      const own = cells.find(
        (cell) =>
          cell.dataset.empId === "emp-1" && cell.dataset.dateKey === formatDateKey(week1[0]),
      )!;
      const other = cells.find(
        (cell) =>
          cell.dataset.empId === "emp-1" && cell.dataset.dateKey === formatDateKey(week1[1]),
      )!;

      expect(own.dataset.interactive).toBe("true");
      expect(own.tabIndex).toBe(0);
      expect(other.dataset.interactive).toBe("false");
      expect(other.tabIndex).toBe(-1);
      expect(cells.some((cell) => cell.dataset.addable)).toBe(false);

      fireEvent.click(other);
      fireEvent.contextMenu(other);
      expect(onActivateCell).not.toHaveBeenCalled();
      expect(onOpenCellMenu).not.toHaveBeenCalled();

      fireEvent.click(own);
      expect(onActivateCell).toHaveBeenCalledTimes(1);
    });

    it("keeps the new-shift hint for someone who places shifts", () => {
      observedWidth = 1600;
      renderGrid({ canDragShifts: true, shiftForKey: () => null, assignmentIdsForKey: () => [] });

      const cells = screen.getAllByRole("gridcell") as HTMLElement[];
      expect(cells.every((cell) => cell.dataset.interactive === "true")).toBe(true);
      expect(cells.every((cell) => cell.dataset.addable === "true")).toBe(true);
    });
  });

  describe("away all period (54)", () => {
    const gone: Employee = {
      ...employees[0],
      id: "emp-gone-all",
      firstName: "Dana",
      lastName: "Price",
      seniority: 9,
      status: "inactive",
      awayUntil: "2024-02-01",
    };

    afterEach(() => window.localStorage.clear());

    it("lists someone away every day last, under a row that folds and stays folded", () => {
      observedWidth = 1600;
      const people = [gone, employees[0]];
      const view = renderGrid({ filteredEmployees: people, allEmployees: people });

      const rows = (screen.getAllByRole("row") as HTMLElement[]).filter(
        (row) => row.dataset.awayAllPeriodGroup !== undefined || row.querySelector("[data-emp-id]"),
      );
      const order = rows.map((row) =>
        row.dataset.awayAllPeriodGroup !== undefined
          ? "group"
          : (row.querySelector("[data-emp-id]") as HTMLElement).dataset.empId,
      );
      expect(order).toEqual(["emp-1", "group", "emp-gone-all"]);

      const fold = screen.getByRole("button", { name: /Away all period/ });
      expect(fold.getAttribute("aria-expanded")).toBe("true");
      fireEvent.click(fold);
      const folded = screen.getByRole("button", { name: /Away all period/ });
      expect(folded.getAttribute("aria-expanded")).toBe("false");
      expect(folded.textContent).toContain("Dana Price (Away until Feb 1)");
      expect(document.querySelector('[data-emp-id="emp-gone-all"]')).toBeNull();

      view.unmount();
      renderGrid({ filteredEmployees: people, allEmployees: people });
      expect(
        screen.getByRole("button", { name: /Away all period/ }).getAttribute("aria-expanded"),
      ).toBe("false");
    });

    it("shows no group when nobody is away the whole period", () => {
      observedWidth = 1600;
      renderGrid();
      expect(screen.queryByRole("button", { name: /Away all period/ })).toBeNull();
    });
  });

  describe("corrected days (53c)", () => {
    it("marks a corrected past day and names why", () => {
      observedWidth = 1600;
      const corrected = formatDateKey(week1[1]);
      renderGrid({
        todayKey: formatDateKey(week1[3]),
        corrections: new Map([
          [`emp-1_${corrected}`, { reason: "Sent home sick at 10" }],
          [`emp-1_${formatDateKey(week1[2])}`, { reason: null }],
          [`emp-1_${formatDateKey(week1[4])}`, { reason: "Not past" }],
        ]),
      });

      const cells = (screen.getAllByRole("gridcell") as HTMLElement[]).filter(
        (cell) => cell.dataset.empId === "emp-1",
      );
      expect(cells[1].dataset.corrected).toBe("true");
      expect(cells[1].querySelector("[data-correction-mark]")).not.toBeNull();
      expect(cells[1].getAttribute("title")).toBe("Corrected: Sent home sick at 10");
      expect(cells[2].getAttribute("title")).toBe("Corrected");
      expect(cells[0].dataset.corrected).toBeUndefined();
      // A day from today on is never marked, whatever the map holds.
      expect(cells[4].dataset.corrected).toBeUndefined();
    });
  });

  describe("away until a date (51e)", () => {
    const jamie: Employee = {
      ...employees[0],
      id: "emp-away",
      firstName: "Jamie",
      lastName: "Fox",
      seniority: 2,
      status: "inactive",
      awayUntil: "2024-01-17",
    };
    const indefinitelyAway: Employee = {
      ...employees[0],
      id: "emp-gone",
      firstName: "Robin",
      lastName: "Lane",
      seniority: 3,
      status: "inactive",
      awayUntil: null,
    };
    const people = [employees[0], jamie, indefinitelyAway];

    // Today is Tue, Jan 9; Jamie is back on Wed, Jan 17.
    function renderAway(options: RenderGridOptions = {}) {
      return renderGrid({
        filteredEmployees: people,
        allEmployees: people,
        todayKey: "2024-01-09",
        ...options,
      });
    }

    function cellsOf(empId: string): HTMLElement[] {
      return (screen.getAllByRole("gridcell") as HTMLElement[]).filter(
        (cell) => cell.dataset.empId === empId,
      );
    }

    it("draws the away days from today as one Away bar per week, with nothing else in them", () => {
      observedWidth = 1600;
      renderAway();

      const cells = cellsOf("emp-away");
      expect(cells).toHaveLength(14);
      expect(screen.getAllByText("Away")).toHaveLength(2);
      expect(cells.map((cell) => cell.dataset.awayRun)).toEqual([
        undefined,
        undefined,
        "start",
        "middle",
        "middle",
        "middle",
        "end",
        "start",
        "middle",
        "end",
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      expect(cells[2].querySelector("[data-away-run-bar]")).not.toBeNull();
      expect(cells[3].querySelector("[data-away-run-bar]")).toBeNull();
      for (const cell of cells.slice(2, 10)) {
        expect(cell.querySelector("[data-shift-pill]")).toBeNull();
      }
      expect(cells.slice(2, 8).map((cell) => cell.dataset.leadingDivider)).toEqual([
        "light",
        "none",
        "none",
        "none",
        "none",
        "split",
      ]);
      expect(cells[3].getAttribute("aria-label")).toBe("Jamie Fox, Away on Wed, Jan 10");
    });

    it("names the absence their away days hold, and explains a locked day (51f)", () => {
      observedWidth = 1600;
      const sick: AbsenceType = {
        id: 9,
        orgId: "org-1",
        label: "S",
        name: "Sick",
        color: "#FECACA",
        border: "#DC2626",
        text: "#7F1D1D",
        sortOrder: 2,
      };
      const withAbsence = people.map((person) =>
        person.id === "emp-away" ? { ...person, awayAbsenceTypeId: sick.id } : person,
      );
      renderAway({
        filteredEmployees: withAbsence,
        allEmployees: withAbsence,
        absenceTypeMap: new Map([[sick.id, sick]]),
      });

      expect(screen.getAllByText("Away · Sick")).toHaveLength(2);
      expect(cellsOf("emp-away")[3].getAttribute("title")).toBe(
        "Away until Wed, Jan 17. Change the return date on their record to change these days.",
      );
      expect(cellsOf("emp-away")[10].getAttribute("title")).toBeNull();
    });

    it("keeps away days out of editing and the return date on", () => {
      observedWidth = 1600;
      const onActivateCell = vi.fn();
      const onOpenCellMenu = vi.fn();
      renderAway({ onActivateCell, onOpenCellMenu });

      const cells = cellsOf("emp-away");
      // Days before today keep what they held, but can't be changed either.
      for (const cell of [cells[0], cells[3], cells[9]]) {
        expect(cell.dataset.interactive).toBe("false");
        expect(cell.dataset.awayLocked).toBe("true");
        expect(cell.tabIndex).toBe(-1);
        fireEvent.click(cell);
        fireEvent.keyDown(cell, { key: "Enter" });
        fireEvent.contextMenu(cell);
      }
      expect(cells[0].querySelector('[data-shift-pill="single"]')?.textContent).toBe("D");
      expect(onActivateCell).not.toHaveBeenCalled();
      expect(onOpenCellMenu).not.toHaveBeenCalled();

      const back = cells[10];
      expect(back.dataset.awayRun).toBeUndefined();
      expect(back.dataset.awayLocked).toBeUndefined();
      expect(back.dataset.interactive).toBe("true");
      expect(back.querySelector('[data-shift-pill="single"]')?.textContent).toBe("D");
      fireEvent.click(back);
      expect(onActivateCell).toHaveBeenCalledWith(
        expect.objectContaining({
          cellId: { empId: "emp-away", dateKey: "2024-01-17", sectionId: 1 },
          trigger: "click",
        }),
      );
    });

    it("reads a single away day as Away", () => {
      observedWidth = 1600;
      renderAway({
        filteredEmployees: [{ ...jamie, awayUntil: "2024-01-10" }],
        allEmployees: [{ ...jamie, awayUntil: "2024-01-10" }],
      });

      const cells = cellsOf("emp-away");
      expect(screen.getAllByText("Away")).toHaveLength(1);
      expect(cells[2].dataset.awayRun).toBe("start");
      expect(cells[3].dataset.awayRun).toBeUndefined();
      expect(screen.queryByText(/\u00d7/)).not.toBeInTheDocument();
    });

    it("leaves off someone away with no return date, and the away-until row in a past period", () => {
      observedWidth = 1600;
      const { unmount } = renderAway();
      expect(cellsOf("emp-gone")).toHaveLength(0);
      unmount();

      renderAway({ todayKey: "2024-01-21" });
      expect(cellsOf("emp-away")).toHaveLength(0);
      expect(cellsOf("emp-1")).toHaveLength(14);
    });

    // Jamie went away on Thu, Jan 4, before today (Tue, Jan 9).
    const since = { from: null, until: "2024-01-17", since: "2024-01-04" };

    it("draws the bar from the day they went away, the same before and after today", () => {
      observedWidth = 1600;
      renderAway({ awayRanges: new Map([["emp-away", since]]) });

      const cells = cellsOf("emp-away");
      expect(cells.map((cell) => cell.dataset.awayRun)).toEqual([
        "start",
        "middle",
        "middle",
        "middle",
        "middle",
        "middle",
        "end",
        "start",
        "middle",
        "end",
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      expect(screen.getAllByText("Away")).toHaveLength(2);
    });

    it("keeps a past period they went away in, with earlier days shown and locked", () => {
      observedWidth = 1600;
      // Away from Wed, Jan 10 until Feb 1, viewed on Sun, Jan 21.
      const longer = { ...jamie, awayUntil: "2024-02-01" };
      renderAway({
        filteredEmployees: [employees[0], longer],
        allEmployees: [employees[0], longer],
        awayRanges: new Map([
          ["emp-away", { from: null, until: "2024-02-01", since: "2024-01-10" }],
        ]),
        todayKey: "2024-01-21",
      });

      const cells = cellsOf("emp-away");
      expect(cells).toHaveLength(14);
      expect(cells[0].dataset.awayRun).toBeUndefined();
      expect(cells[0].dataset.awayLocked).toBe("true");
      expect(cells[0].querySelector('[data-shift-pill="single"]')?.textContent).toBe("D");
      expect(cells[0].getAttribute("title")).toBe(
        "Away since Wed, Jan 10. Days before they went away can't be changed while they're away.",
      );
      expect(cells[3].dataset.awayRun).toBe("start");
    });
  });

  describe("a rest-of-day absence (item 45)", () => {
    const sick: AbsenceType = {
      id: 9,
      orgId: "org-1",
      label: "SICK",
      name: "Sick",
      color: "#FFE4E6",
      border: "#FDA4AF",
      text: "#9F1239",
      sortOrder: 1,
    };
    const absenceTypeMap = new Map([[sick.id, sick]]);

    it("sits side by side after a single shift in a wide column, with when it starts", () => {
      observedWidth = 1440;

      renderGrid({
        spanWeeks: 1,
        assignments: twoPillAssignmentDefinitions,
        shiftForKey: () => "D",
        assignmentIdsForKey: () => [1],
        absenceTypeMap,
        restOfDayAbsenceTypeIdForKey: () => 9,
        getCustomShiftTimes: () => ({ start: "07:00", end: "11:00" }),
      });

      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      const absencePill = firstCell.querySelector<HTMLElement>(
        '[data-shift-pill="rest-of-day-absence"]',
      )!;
      const pills = Array.from(absencePill.parentElement!.children) as HTMLElement[];

      expect(absencePill.parentElement?.dataset.shiftLayout).toBe("side-by-side");
      expect(absencePill.parentElement?.style.gridTemplateColumns).toBe(
        "repeat(2, minmax(0, 1fr))",
      );
      expect(pills[pills.length - 1]).toBe(absencePill);
      expect(absencePill).toHaveTextContent("SICK");
      expect(absencePill).toHaveTextContent("from 11");
      expect(absencePill.style.background).toContain("repeating-linear-gradient(135deg");
      // Attached: they touch with one dividing line and no rounding where they meet.
      const shiftPill = pills[pills.length - 2];
      expect(shiftPill.style.borderRightStyle).toBe("none");
      expect(shiftPill.style.borderRadius).toBe("8px 0 0 8px");
      expect(absencePill.style.borderLeftStyle).toBe("solid");
      expect(absencePill.style.borderRadius).toBe("0 8px 8px 0");
      expect(absencePill.style.marginLeft).toBe("");
      expect(absencePill.parentElement!.style.gap).toBe("0");
      expectPillTextToFit(firstCell);
    });

    it("names the time it covers (item 50d)", () => {
      observedWidth = 1440;

      renderGrid({
        spanWeeks: 1,
        assignments: twoPillAssignmentDefinitions,
        shiftForKey: () => "D",
        assignmentIdsForKey: () => [1],
        absenceTypeMap,
        restOfDayAbsenceTypeIdForKey: () => 9,
        restOfDayAbsenceLayoutForKey: () => ({
          first: false,
          joinsShift: true,
          shortTime: "11–3",
          time: "11:00 AM - 3:00 PM",
        }),
        getCustomShiftTimes: () => ({ start: "07:00", end: "11:00" }),
      });

      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      const absencePill = firstCell.querySelector<HTMLElement>(
        '[data-shift-pill="rest-of-day-absence"]',
      )!;
      expect(absencePill).toHaveTextContent("11–3");
      expect(absencePill).not.toHaveTextContent("from");
      expect(screen.getAllByLabelText(/then Sick 11:00 AM - 3:00 PM/).length).toBeGreaterThan(0);
    });

    it("puts an arrived-late absence first, joined to the shift it meets (item 50d)", () => {
      observedWidth = 1440;

      renderGrid({
        spanWeeks: 1,
        assignments: twoPillAssignmentDefinitions,
        shiftForKey: () => "D",
        assignmentIdsForKey: () => [1],
        absenceTypeMap,
        restOfDayAbsenceTypeIdForKey: () => 9,
        restOfDayAbsenceLayoutForKey: () => ({
          first: true,
          joinsShift: true,
          shortTime: "7–11",
          time: "7:00 AM - 11:00 AM",
        }),
        getCustomShiftTimes: () => ({ start: "11:00", end: "15:00" }),
      });

      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      const absencePill = firstCell.querySelector<HTMLElement>(
        '[data-shift-pill="rest-of-day-absence"]',
      )!;
      const shiftPill = firstCell.querySelector<HTMLElement>('[data-shift-pill="multi"]')!;
      expect(absencePill.style.order).toBe("0");
      expect(shiftPill.style.order).toBe("1");
      expect(absencePill).toHaveTextContent("7–11");
      // Joined on the absence's right and the shift's left.
      expect(absencePill.style.borderRightStyle).toBe("none");
      expect(absencePill.style.borderRadius).toBe("8px 0 0 8px");
      expect(shiftPill.style.borderRadius).toBe("0 8px 8px 0");
    });

    it("keeps a gap when the absence doesn't meet the shift (item 50d)", () => {
      observedWidth = 1440;

      renderGrid({
        spanWeeks: 1,
        assignments: twoPillAssignmentDefinitions,
        shiftForKey: () => "D",
        assignmentIdsForKey: () => [1],
        absenceTypeMap,
        restOfDayAbsenceTypeIdForKey: () => 9,
        restOfDayAbsenceLayoutForKey: () => ({
          first: false,
          joinsShift: false,
          shortTime: "4–8",
          time: "4:00 PM - 8:00 PM",
        }),
      });

      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      const absencePill = firstCell.querySelector<HTMLElement>(
        '[data-shift-pill="rest-of-day-absence"]',
      )!;
      expect(absencePill.style.borderRadius).toBe("8px");
    });

    it("stacks after two shifts and grows only its row", () => {
      observedWidth = 1440;

      renderGrid({
        spanWeeks: 1,
        assignments: twoPillAssignmentDefinitions,
        shiftForKey: () => "D/N",
        assignmentIdsForKey: () => [1, 2],
        absenceTypeMap,
        restOfDayAbsenceTypeIdForKey: () => 9,
      });

      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      const layout = firstCell.querySelector<HTMLElement>("[data-shift-layout]")!;
      const row = firstCell.closest('[role="row"]') as HTMLElement;

      expect(layout.dataset.shiftLayout).toBe("stacked");
      // One line each, so the three share the height equally.
      expect(layout.style.gridTemplateRows).toBe(
        "minmax(min-content, 1fr) minmax(min-content, 1fr) minmax(min-content, 1fr)",
      );
      expect(layout.lastElementChild?.getAttribute("data-shift-pill")).toBe("rest-of-day-absence");
      expect(row.style.getPropertyValue("--dg-grid-row-cell-height")).toContain(" 3 * (");
      // These shifts have no times, so they never meet and keep their gap;
      // the absence starts where the last shift ends, so it joins that one.
      const [first, second, absence] = Array.from(layout.children) as HTMLElement[];
      expect(first.style.border).toContain("solid");
      expect(first.style.borderRadius).toBe("8px");
      expect(second.style.marginTop).toBe("4px");
      expect(second.style.borderTopStyle).not.toBe("none");
      expect(second.style.borderBottomStyle).toBe("none");
      expect(second.style.borderRadius).toBe("8px 8px 0 0");
      expect(absence.style.borderTopStyle).toBe("solid");
      expect(absence.style.borderRadius).toBe("0 0 8px 8px");
      expect(absence.style.marginTop).toBe("");
    });

    it.each([
      ["joins", "15:00", true],
      ["keeps apart", "16:00", false],
    ])("%s a double shift whose second part starts at %s", (_, secondStart, joined) => {
      observedWidth = 1440;

      renderGrid({
        spanWeeks: 1,
        assignments: twoPillAssignmentDefinitions,
        shiftForKey: () => "D/N",
        assignmentIdsForKey: () => [1, 2],
        getCustomShiftTimes: () => ({
          start: "07:00",
          end: "23:00",
          perPill: [
            { start: "07:00", end: "15:00" },
            { start: secondStart, end: "23:00" },
          ],
        }),
      });

      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      const [first, second] = Array.from(
        firstCell.querySelectorAll<HTMLElement>('[data-shift-pill="multi"]'),
      );
      const seam = first.parentElement!.dataset.shiftLayout === "stacked" ? "Bottom" : "Right";
      expect(first.style.getPropertyValue(`border-${seam.toLowerCase()}-style`) === "none").toBe(
        joined,
      );
      expect(second.style.marginTop === "" && second.style.marginLeft === "").toBe(joined);
    });

    it("joins a shift with no custom time to the next through its default end", () => {
      observedWidth = 1440;

      renderGrid({
        spanWeeks: 1,
        assignments: twoPillAssignmentDefinitions.map((assignment) =>
          assignment.id === 3
            ? { ...assignment, defaultStartTime: "15:30", defaultEndTime: "00:00" }
            : assignment,
        ),
        shiftForKey: () => "E/N",
        assignmentIdsForKey: () => [3, 2],
        // An unset custom time is stored empty, not null.
        getCustomShiftTimes: () => ({
          start: "|00:00",
          end: "|09:00",
          perPill: [
            { start: "", end: "" },
            { start: "00:00", end: "09:00" },
          ],
        }),
      });

      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      const [evening, night] = Array.from(
        firstCell.querySelectorAll<HTMLElement>('[data-shift-pill="multi"]'),
      );
      const stacked = evening.parentElement!.dataset.shiftLayout === "stacked";
      expect(
        evening.style.getPropertyValue(stacked ? "border-bottom-style" : "border-right-style"),
      ).toBe("none");
      expect(night.style.getPropertyValue(stacked ? "border-top-style" : "border-left-style")).toBe(
        "solid",
      );
    });

    it("gives a stacked one-line shift less height than a pill with a time", () => {
      observedWidth = 640;

      renderGrid({
        spanWeeks: 2,
        assignments: twoPillAssignmentDefinitions,
        shiftForKey: () => "E/N",
        assignmentIdsForKey: () => [3, 2],
        getCustomShiftTimes: () => ({
          start: "|00:00",
          end: "|09:00",
          perPill: [
            { start: "", end: "" },
            { start: "00:00", end: "09:00" },
          ],
        }),
      });

      const layout = screen
        .getAllByRole("gridcell")[0]
        .querySelector<HTMLElement>('[data-shift-layout="stacked"]')!;
      expect(layout.style.gridTemplateRows).toBe(
        "minmax(min-content, 1fr) minmax(min-content, 2fr)",
      );
    });

    it("badges the absence pill, not the shift, when only the absence is new", () => {
      observedWidth = 1440;

      renderGrid({
        spanWeeks: 1,
        assignments: twoPillAssignmentDefinitions,
        shiftForKey: () => "D",
        assignmentIdsForKey: () => [1],
        absenceTypeMap,
        restOfDayAbsenceTypeIdForKey: () => 9,
        publishedRestOfDayAbsenceTypeIdForKey: () => null,
        draftKindForKey: () => "modified",
        publishedAssignmentIdsForKey: () => [1],
        publishedLabelForKey: () => "D",
      });

      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      const absencePill = firstCell.querySelector<HTMLElement>(
        '[data-shift-pill="rest-of-day-absence"]',
      )!;
      const shiftPill = firstCell.querySelector<HTMLElement>('[data-shift-pill="multi"]')!;

      // A draft "New" is the dashed border, on the absence pill alone.
      expect(absencePill.style.borderRight).toContain("dashed");
      expect(shiftPill.style.borderLeft).not.toContain("dashed");
      expect(shiftPill.querySelector("[data-draft-badge]")).toBeNull();
    });

    it("badges the absence pill new when a publish added only the absence", () => {
      observedWidth = 1440;
      const worked = (absenceTypeId: number | null) => ({
        kind: "worked" as const,
        segments: [{ shiftId: 10, jobId: 101, position: 0 }],
        absenceTypeId,
        customStartTime: null,
        customEndTime: null,
        seriesId: null,
        fromRecurring: false,
      });

      renderGrid({
        spanWeeks: 1,
        showPublishDiffOverlay: true,
        assignments: twoPillAssignmentDefinitions,
        shiftForKey: () => "D",
        assignmentIdsForKey: () => [1],
        absenceTypeMap,
        restOfDayAbsenceTypeIdForKey: () => 9,
        publishedRestOfDayAbsenceTypeIdForKey: () => 9,
        publishDiffForKey: () => ({
          empId: "emp-1",
          date: "2024-01-07",
          kind: "modified",
          fromState: worked(null),
          toState: worked(9),
          toRestOfDayAbsenceTypeId: 9,
          publishedAt: "2024-01-07T12:00:00.000Z",
          publishedBy: "user-1",
        }),
        resolvePublisherName: () => "Mina",
      });

      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      const absencePill = firstCell.querySelector<HTMLElement>(
        '[data-shift-pill="rest-of-day-absence"]',
      )!;

      expect(absencePill.querySelector('[data-publish-badge="new"]')?.textContent).toBe("New");
    });

    it("names the absence in the cell's accessible label", () => {
      observedWidth = 1440;

      renderGrid({
        spanWeeks: 1,
        assignments: twoPillAssignmentDefinitions,
        shiftForKey: () => "D/N",
        assignmentIdsForKey: () => [1, 2],
        absenceTypeMap,
        restOfDayAbsenceTypeIdForKey: () => 9,
      });

      expect(screen.getAllByRole("gridcell")[0]).toHaveAccessibleName(
        expect.stringMatching(/D\/N, then Sick for the rest of the day$/),
      );
    });

    it("leaves a cell without one as it was", () => {
      observedWidth = 1440;

      renderGrid({
        spanWeeks: 1,
        assignments: twoPillAssignmentDefinitions,
        shiftForKey: () => "D",
        assignmentIdsForKey: () => [1],
        absenceTypeMap,
        restOfDayAbsenceTypeIdForKey: () => null,
      });

      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      expect(firstCell.querySelector('[data-shift-pill="single"]')).not.toBeNull();
      expect(firstCell.querySelector('[data-shift-pill="rest-of-day-absence"]')).toBeNull();
    });
  });

  it("gives a double shift's cell notes to its last pill when segments do not line up", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      segmentsForKey: () => [{ shiftId: 1, jobId: 101, position: 0, isMentored: false }],
      noteMarksForKey: () => [{ indicatorTypeId: 1, state: "published" }],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pills = Array.from(
      firstCell.querySelectorAll('[data-shift-pill="multi"]'),
    ) as HTMLElement[];

    expect(pills).toHaveLength(2);
    expect(pills[0].querySelector("[data-note-mark]")).toBeNull();
    expect(pills[1].querySelectorAll("[data-note-mark]")).toHaveLength(1);
    expectNoteDotsInFlow(firstCell);
  });

  it("draws each pill of a double shift with its own shift's notes, in its own focus area only", () => {
    observedWidth = 1600;
    const lookups: Array<
      [number | undefined, { shiftId: number | null; jobId: number } | undefined]
    > = [];

    renderGrid({
      assignments: [
        { ...assignments[0], jobId: 101 },
        { ...assignments[0], id: 2, label: "E", name: "Evening Shift", jobId: 102, sortOrder: 2 },
        {
          id: 3,
          orgId: "org-1",
          label: "N",
          name: "Night Shift",
          color: "#E0F2FE",
          border: "#0284C7",
          text: "#0C4A6E",
          categoryId: 1,
          focusAreaId: 2,
          jobId: 103,
          sortOrder: 3,
        },
      ],
      indicatorTypes: [
        { id: 1, orgId: "org-1", name: "Readings", color: "#ff2600", sortOrder: 1 },
        { id: 2, orgId: "org-1", name: "Shower", color: "#2563eb", sortOrder: 2 },
      ],
      shiftForKey: () => "D/E",
      assignmentIdsForKey: () => [1, 2],
      segmentsForKey: () => [
        { shiftId: 1, jobId: 101, position: 0, isMentored: false },
        { shiftId: 1, jobId: 102, position: 1, isMentored: false },
      ],
      noteMarksForKey: (_empId, _date, focusAreaId, shift) => {
        lookups.push([focusAreaId, shift]);
        if (!shift) return [{ indicatorTypeId: 1, state: "published" }];
        return shift.jobId === 101
          ? [{ indicatorTypeId: 1, state: "published" as const }]
          : [{ indicatorTypeId: 2, state: "draft_added" as const }];
      },
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pills = Array.from(
      firstCell.querySelectorAll('[data-shift-pill="multi"]'),
    ) as HTMLElement[];

    expect(pills).toHaveLength(2);
    expect(within(pills[0]).getByLabelText("Readings")).toBeInTheDocument();
    expect(within(pills[1]).getByLabelText("Shower · Added, not published")).toBeInTheDocument();
    expect(firstCell.querySelectorAll("[data-note-mark]")).toHaveLength(2);
    expect(lookups).toContainEqual([1, { shiftId: 1, jobId: 101 }]);
    expect(lookups).toContainEqual([1, { shiftId: 1, jobId: 102 }]);
  });

  it("shows no note on a pill whose shift belongs to another focus area", () => {
    observedWidth = 1600;
    const lookups: Array<
      [number | undefined, { shiftId: number | null; jobId: number } | undefined]
    > = [];

    renderGrid({
      assignments: [
        { ...assignments[0], jobId: 101 },
        {
          id: 2,
          orgId: "org-1",
          label: "N",
          name: "Night Shift",
          color: "#E0F2FE",
          border: "#0284C7",
          text: "#0C4A6E",
          categoryId: 1,
          focusAreaId: 2,
          jobId: 102,
          sortOrder: 2,
        },
      ],
      indicatorTypes: [{ id: 1, orgId: "org-1", name: "Readings", color: "#ff2600", sortOrder: 1 }],
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      segmentsForKey: () => [
        { shiftId: 1, jobId: 101, position: 0, isMentored: false },
        { shiftId: 1, jobId: 102, position: 1, isMentored: false },
      ],
      // The Night note is filed under the Night Shift's own focus area (2).
      noteMarksForKey: (_empId, _date, focusAreaId, shift) => {
        lookups.push([focusAreaId, shift]);
        return focusAreaId === 2 && shift?.jobId === 102
          ? [{ indicatorTypeId: 1, state: "published" as const }]
          : [];
      },
    });

    // North (area 1) is the first section; the person's row there shows the
    // Night pill with no note, while South (area 2), its own area, shows it.
    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;

    expect(lookups).toContainEqual([1, { shiftId: 1, jobId: 102 }]);
    expect(firstCell.querySelectorAll("[data-note-mark]")).toHaveLength(0);
    expect(screen.getAllByLabelText("Readings").length).toBeGreaterThan(0);
  });

  it("folds the corner of a shift with an open request", () => {
    observedWidth = 1600;

    renderGrid({
      activeRequestForKey: () => ({ type: "pickup", status: "open" }),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const fold = firstCell.querySelector("[data-request-fold]") as HTMLElement | null;

    expect(fold?.getAttribute("data-request-fold")).toBe("open");
    expect(fold?.getAttribute("aria-label")).toBe("Pickup request open");
    expect(fold?.style.borderTop).toBe(`${REQUEST_FOLD_SIZE}px solid var(--dg-color-danger)`);
  });

  it("tints the fold as a warning while a swap waits on an approver", () => {
    observedWidth = 1600;

    renderGrid({
      activeRequestForKey: () => ({ type: "swap", status: "pending_approval" }),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const fold = firstCell.querySelector("[data-request-fold]") as HTMLElement | null;

    expect(fold?.getAttribute("data-request-fold")).toBe("pending_approval");
    expect(fold?.getAttribute("aria-label")).toBe("Swap request awaiting approval");
    expect(fold?.style.borderTop).toBe(`${REQUEST_FOLD_SIZE}px solid var(--dg-color-warning)`);
  });

  it("leaves a shift with no request unfolded", () => {
    observedWidth = 1600;

    renderGrid({ activeRequestForKey: () => null });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;

    expect(firstCell.querySelector("[data-request-fold]")).toBeNull();
  });

  it("steps a left-anchored pill badge past the request fold", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      activeRequestForKey: () => ({ type: "pickup", status: "open" }),
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [2],
      publishedLabelForKey: () => "N",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector("[data-draft-badge]") as HTMLElement | null;

    expect(badge?.textContent).toBe("Edited");
    expect(badge?.style.left).toBe("4px");
  });

  it("moves the mentored circle clear of the lock avatar holding the cell", () => {
    observedWidth = 1600;

    renderGrid({
      segmentsForKey: () => [{ shiftId: 1, jobId: 101, position: 0, isMentored: true }],
      cellEditors: new Map([[`emp-1_2024-01-07`, { userId: "user-mina", userName: "Mina Ray" }]]),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const mentored = firstCell.querySelector('[data-mentored-badge="true"]') as HTMLElement | null;

    expect(within(firstCell).getByText("MR")).toBeInTheDocument();
    // The avatar is 20px at inset 2, so the "M" has to start past 22.
    expect(Number.parseFloat(mentored?.style.right ?? "0")).toBeGreaterThanOrEqual(22);
  });

  it("keeps the mentored circle in the corner when nothing holds the cell", () => {
    observedWidth = 1600;

    renderGrid({
      segmentsForKey: () => [{ shiftId: 1, jobId: 101, position: 0, isMentored: true }],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const mentored = firstCell.querySelector('[data-mentored-badge="true"]') as HTMLElement | null;

    expect(mentored?.style.right).toBe("0.5px");
  });

  it("keeps the mentored circle at the top while a draft chip marks the pill", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      shiftForKey: () => "D",
      assignmentIdsForKey: () => [1],
      segmentsForKey: () => [{ shiftId: 1, jobId: 101, position: 0, isMentored: true }],
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [2],
      publishedLabelForKey: () => "N",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement;
    const mentored = pill.querySelector('[data-mentored-badge="true"]') as HTMLElement | null;

    expect(pill.querySelector("[data-draft-badge]")).not.toBeNull();
    expect(mentored?.style.top).toBe("0.5px");
  });

  it("keeps the mentored circle at the top while a publish chip marks the pill", () => {
    observedWidth = 1600;
    const workedState = (jobId: number) => ({
      kind: "worked" as const,
      segments: [{ shiftId: 1, jobId, position: 0 }],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    });

    renderGrid({
      showPublishDiffOverlay: true,
      assignments: [
        { ...assignments[0], jobId: 101 },
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
      ],
      segmentsForKey: () => [{ shiftId: 1, jobId: 101, position: 0, isMentored: true }],
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        fromState: workedState(102),
        toState: workedState(101),
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement;
    const mentored = pill.querySelector('[data-mentored-badge="true"]') as HTMLElement | null;

    expect(firstCell.querySelector("[data-publish-badge]")).not.toBeNull();
    expect(mentored?.style.top).toBe("0.5px");
  });

  it("keeps a double shift's mentored circle at the top while a draft chip marks its pill", () => {
    observedWidth = 1600;

    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      shiftForKey: () => "D/N",
      assignmentIdsForKey: () => [1, 2],
      segmentsForKey: () => [
        { shiftId: 1, jobId: 101, position: 0, isMentored: false },
        { shiftId: 1, jobId: 102, position: 1, isMentored: true },
      ],
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [3, 4],
      publishedLabelForKey: () => "E/S",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const mentored = firstCell.querySelector('[data-mentored-badge="true"]') as HTMLElement | null;
    const mentoredPill = mentored?.closest('[data-shift-pill="multi"]') as HTMLElement | null;

    expect(mentoredPill?.querySelector("[data-draft-badge]")).not.toBeNull();
    expect(mentored?.style.top).toBe("0.5px");
  });

  it("keeps mentored and cross-focus context on a draft-deleted shift", () => {
    observedWidth = 1600;

    renderGrid({
      focusAreas: [
        { id: 1, orgId: "org-1", departmentId: 1, name: "North", sortOrder: 1 },
        { id: 2, orgId: "org-1", departmentId: 1, name: "South Wing", sortOrder: 2 },
      ],
      assignments: [{ ...assignments[0], focusAreaId: 2 }],
      shiftForKey: () => null,
      assignmentIdsForKey: () => [],
      draftKindForKey: () => "deleted",
      publishedAssignmentIdsForKey: () => [1],
      publishedSegmentsForKey: () => [{ shiftId: 1, jobId: 101, position: 0, isMentored: true }],
      publishedLabelForKey: () => "D",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const deletedPill = firstCell.querySelector('[data-shift-pill="deleted"]') as HTMLElement;

    expect(deletedPill).not.toBeNull();
    const mentored = deletedPill.querySelector(
      '[data-mentored-badge="true"]',
    ) as HTMLElement | null;
    expect(mentored).not.toBeNull();
    // The "Deleted" chip straddles the top-left edge, so the circle keeps its corner.
    expect(mentored?.style.top).toBe("0.5px");
    const wing = within(deletedPill).getByText("SW") as HTMLElement;
    expect(wing).toHaveStyle({
      top: "0px",
      borderRadius: "6px 0 0 6px",
    });
    expectPillTextToFit(firstCell);
  });

  it("keeps the cross-focus wing curved beneath a left-anchored badge", () => {
    observedWidth = 1600;

    const localFocusAreas: FocusArea[] = [
      { id: 1, orgId: "org-1", departmentId: 1, name: "North", sortOrder: 1 },
      { id: 2, orgId: "org-1", departmentId: 1, name: "South", sortOrder: 2 },
    ];
    const crossAssignments: AssignmentDefinition[] = [
      { ...assignments[0], focusAreaId: 2 },
      {
        id: 2,
        orgId: "org-1",
        label: "N",
        name: "Night Shift",
        color: "#E0F2FE",
        border: "#0284C7",
        text: "#0C4A6E",
        categoryId: 1,
        focusAreaId: 2,
        sortOrder: 2,
      },
    ];

    const withBadge = renderGrid({
      focusAreas: localFocusAreas,
      assignments: crossAssignments,
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [2],
      publishedLabelForKey: () => "N",
    });
    const strip = within(screen.getAllByRole("gridcell")[0] as HTMLElement).getByText(
      "S",
    ) as HTMLElement;

    expect(strip.style.top).toBe("0px");
    expect(strip.style.borderRadius).toBe("6px 0 0 6px");
    withBadge.unmount();

    renderGrid({ focusAreas: localFocusAreas, assignments: crossAssignments });
    const cleanStrip = within(screen.getAllByRole("gridcell")[0] as HTMLElement).getByText(
      "S",
    ) as HTMLElement;

    expect(cleanStrip.style.top).toBe("0px");
    expect(cleanStrip.style.borderRadius).toBe("7px 0 0 7px");
  });

  it("keeps a brand-new shift with custom time badge-free", () => {
    observedWidth = 1600;

    renderGrid({
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
      showPublishDiffOverlay: true,
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "S",
      assignmentIdsForKey: () => [2],
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

    expect(badge?.textContent).toBe("Edited");
    expect(pill?.style.background).toBe("var(--dg-color-surface)");
  });

  it("still shows the publish-diff badge when a concurrent draft has no badge of its own", () => {
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
      draftKindForKey: () => "new",
      showPublishDiffOverlay: true,
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "S",
      assignmentIdsForKey: () => [2],
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
    const draftBadge = firstCell.querySelector("[data-draft-badge]") as HTMLElement | null;
    const publishBadge = firstCell.querySelector(
      '[data-publish-badge="modified"]',
    ) as HTMLElement | null;

    expect(draftBadge).toBeNull();
    expect(publishBadge).not.toBeNull();
  });

  it("prefers the draft badge over a publish-diff badge on the same cell", () => {
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
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [2],
      publishedLabelForKey: () => "N",
      showPublishDiffOverlay: true,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "deleted",
        from: [1],
        to: [],
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const draftBadge = firstCell.querySelector(
      '[data-draft-badge="modified"]',
    ) as HTMLElement | null;
    const publishBadge = firstCell.querySelector("[data-publish-badge]") as HTMLElement | null;

    expect(draftBadge).not.toBeNull();
    expect(publishBadge).toBeNull();
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
      showPublishDiffOverlay: true,
      assignments: localAssignmentDefinitions,
      shiftForKey: () => "E · Supv",
      assignmentIdsForKey: () => [2],
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

    expect(badge?.textContent).toBe("Edited");
    expect(badge?.getAttribute("aria-label")).toContain("Was D · Supv.");
  });

  it("badges a published mentored toggle instead of tinting a cell with no marker", () => {
    observedWidth = 1600;

    renderGrid({
      showPublishDiffOverlay: true,
      shiftForKey: () => "D",
      assignmentIdsForKey: () => [1],
      segmentsForKey: () => [{ shiftId: null, jobId: 101, position: 0, isMentored: true }],
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        from: [1],
        to: [1],
        fromState: {
          kind: "worked",
          segments: [{ shiftId: null, jobId: 101, position: 0, isMentored: false }],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        toState: {
          kind: "worked",
          segments: [{ shiftId: null, jobId: 101, position: 0, isMentored: true }],
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

    // The compact grid marker reads "Edited" for every published edit; the
    // tooltip is what names the mentored change. Before this, the overlay
    // dropped the mentored flags and painted a tinted cell with no badge.
    expect(badge?.textContent).toBe("Edited");
    expect(badge?.getAttribute("aria-label")).toContain("Marked mentored.");
  });

  it("keeps draft new historical cross-focus cells on the white shift surface", () => {
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
          color: "var(--dg-color-bg)",
          border: "var(--dg-color-border)",
          text: "var(--dg-color-text-muted)",
          sortOrder: 999,
        },
      draftKindForKey: () => "new",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;

    expect(pill?.style.background).toBe("var(--dg-color-surface)");
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
      showPublishDiffOverlay: true,
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
          color: "var(--dg-color-bg)",
          border: "var(--dg-color-border)",
          text: "var(--dg-color-text-muted)",
          sortOrder: 999,
        },
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

    expect(badge?.textContent).toBe("Edited");
    expect(pill?.style.background).toBe("var(--dg-color-surface)");
  });

  it("keeps published edited shift rings orange when a modified entry replaces an absence", () => {
    observedWidth = 1600;

    renderGrid({
      showPublishDiffOverlay: true,
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

    expect(badge?.textContent).toBe("Edited");
    expect(pill?.style.borderColor).toBe("rgba(26, 61, 27, 0.35)");
  });

  it("names the published shift an absence replaced", () => {
    observedWidth = 1600;

    renderGrid({
      showPublishDiffOverlay: true,
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
      shiftForKey: () => "VAC",
      assignmentIdsForKey: () => [],
      absenceTypeIdForKey: () => 7,
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "modified",
        from: [1],
        to: [],
        fromAbsenceTypeId: null,
        toAbsenceTypeId: 7,
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-publish-badge="modified"]') as HTMLElement | null;

    expect(badge?.textContent).toBe("Edited");
    expect(badge?.getAttribute("aria-label")).toContain("Was Day Shift.");
    expect(badge?.getAttribute("aria-label")).toContain("by Mina");
  });

  it("stripes an absence pill in its own color and borders it even when the stored border is transparent", () => {
    observedWidth = 1600;

    renderGrid({
      absenceTypeMap: new Map([
        [
          7,
          {
            id: 7,
            orgId: "org-1",
            label: "VAC",
            name: "Vacation",
            color: "#FDE68A",
            border: "transparent",
            text: "#92400E",
            countsTowardAvailability: false,
            sortOrder: 1,
          },
        ],
      ]),
      absenceTypeIdForKey: (_empId: string, date: Date) => (isFirstDay(date) ? 7 : null),
      shiftForKey: (_empId: string, date: Date) => (isFirstDay(date) ? "VAC" : null),
      assignmentIdsForKey: () => [],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement | null;

    const stripes = resolveAbsenceStripes("#FDE68A", false);
    expect(pill?.textContent).toContain("VAC");
    expect(pill?.style.background).toContain("repeating-linear-gradient(135deg");
    expect(pill?.style.borderColor).toBe(stripes.border.replace(/,/g, ", "));
  });

  it("keeps draft time-only changes compact and shows the time badge in-cell", () => {
    observedWidth = 1600;

    renderGrid({
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

    expect(firstCell.style.height).toBe(GRID_CELL_HEIGHT);
    expect(badge?.textContent).toBe("Edited");
    expect(badge).toHaveStyle({
      background: "rgba(217, 119, 6, 0.94)",
    });
    expect(badge?.style.top).toBe("0px");
    expect(badge?.style.transform).toBe("translateY(-50%)");
    expect(badge?.style.left).toBe("4px");
    expect(badge?.getAttribute("aria-label")).toContain("Added custom time 8:00 AM - 4:00 PM.");
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

    expect(badge?.textContent).toBe("Edited");
    expect(badge?.getAttribute("aria-label")).toContain(
      "Changed custom time for D 7:00 AM - 3:00 PM to 8:00 AM - 4:00 PM.",
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
      showPublishDiffOverlay: true,
      assignments: localAssignmentDefinitions,
      shiftForKey: () => null,
      assignmentIdsForKey: () => [],
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
    expect(deletedPill?.style.boxShadow).toMatch(/^0 0 0 2px /);
    expect(
      Number.parseFloat(deletedPill?.style.top ?? "0") + Number.parseFloat(badge?.style.top ?? "0"),
    ).toBeGreaterThanOrEqual(2);

    expect(deletedPill?.getAttribute("aria-label")).toContain("Removed: Night Shift · North");
    expect(badge?.getAttribute("aria-label")).toContain("Removed: Night Shift · North");
  });

  it("marks a hidden removal without naming the shift, with the publisher it was sent (46f)", () => {
    observedWidth = 1600;

    renderGrid({
      showPublishDiffOverlay: true,
      shiftForKey: () => null,
      assignmentIdsForKey: () => [],
      publishDiffForKey: () => ({
        empId: "emp-1",
        date: "2024-01-07",
        kind: "deleted",
        detailsHidden: true,
        fromState: null,
        toState: null,
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const deletedPill = firstCell.querySelector(
      '[data-shift-pill="deleted"]',
    ) as HTMLElement | null;

    expect(deletedPill).not.toBeNull();
    expect(deletedPill?.textContent).toContain("Removed");
    expect(deletedPill?.getAttribute("aria-label")).toContain("Removed since the last publish.");
    expect(deletedPill?.getAttribute("aria-label")).toContain("Mina");
    expect(deletedPill?.getAttribute("aria-label")).not.toMatch(/Day Shift|Night Shift/);
  });

  it("keeps author labels visible for publish diffs when authors are enabled", () => {
    observedWidth = 1600;

    renderGrid({
      showPublishDiffOverlay: true,
      showAudit: true,
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
    expect(firstCell.style.height).toBe(GRID_CELL_HEIGHT);
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
    expect(firstCell.style.height).toBe(GRID_CELL_HEIGHT);
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

  // The mark is applied by the active-cell outline's layout effect (on the
  // next animation frame), not rendered as a prop, so wait for it.
  it("marks the externally active cell for the fill highlight", async () => {
    renderGrid({
      activeCellId: {
        empId: "emp-1",
        dateKey: "2024-01-08",
        sectionId: 1,
      },
    });

    await waitFor(() => {
      const activeCells = (screen.getAllByRole("gridcell") as HTMLElement[]).filter(
        (cell) => cell.dataset.active === "true",
      );
      expect(activeCells).toHaveLength(1);
    });
  });

  // Another editor's marker is informational. Blocking on it is exactly the
  // behaviour that was removed, so this pins that it cannot come back.
  it("still opens a cell another editor has open, and marks it", () => {
    const onActivateCell = vi.fn();
    renderGrid({
      cellEditors: new Map([
        ["emp-1_2024-01-07", { userId: "user-other", userName: "Another user" }],
      ]),
      onActivateCell,
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    fireEvent.click(firstCell);

    expect(firstCell.dataset.peerEditing).toBe("true");
    expect(onActivateCell).toHaveBeenCalledWith(
      expect.objectContaining({
        cellId: { empId: "emp-1", dateKey: "2024-01-07", sectionId: 1 },
        trigger: "click",
      }),
    );
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
    // Row 0 carries no top divider of its own, so the ring insets evenly.
    expect(selectionRing?.style.top).toBe("2px");
    expect(selectionRing?.style.right).toBe("2px");
    expect(selectionRing?.style.bottom).toBe("2px");
    expect(selectionRing?.style.left).toBe("2px");
    expect(selectionRing?.style.borderRadius).toBe("10px");
    expect(emptyCell.dataset.bulkSelectable).toBeUndefined();

    fireEvent.click(emptyCell);

    expect(onActivateCell).not.toHaveBeenCalled();
    expect(onToggleBulkDeleteCell).not.toHaveBeenCalled();
  });

  it("still selects a cell another editor has open in bulk delete mode", () => {
    const onToggleBulkDeleteCell = vi.fn();
    renderGrid({
      bulkDeleteMode: true,
      bulkSelectableCellKeys: new Set(["emp-1_2024-01-07"]),
      cellEditors: new Map([["emp-1_2024-01-07", { userId: "user-sam", userName: "Sam" }]]),
      onToggleBulkDeleteCell,
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    fireEvent.click(firstCell);

    expect(firstCell.dataset.peerEditing).toBe("true");
    expect(onToggleBulkDeleteCell).toHaveBeenCalled();
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

  it("does not show shift detail hover cards when the organization disables them", () => {
    renderGrid({ shiftDisplayMode: "name", showShiftDetailHoverCards: false });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    fireEvent.mouseEnter(firstCell);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    const visibleShiftLabel = within(firstCell).getByText("Day");
    fireEvent.mouseEnter(visibleShiftLabel);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("shows the publication date and author on a regular shift hover card", async () => {
    renderGrid({
      showShiftDetailHoverCards: true,
      publishedMetadataForKey: () => ({
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
      }),
      resolvePublisherName: () => "Mina",
    });

    const pill = screen
      .getAllByRole("gridcell")[0]
      .querySelector('[data-shift-pill="single"]') as HTMLElement;
    fireEvent.mouseEnter(pill);

    await waitFor(() => {
      expect(screen.getByText(/Published .*by Mina\./)).toBeInTheDocument();
    });
  });

  it("shows the organization timezone in published metadata", () => {
    expect(
      formatPublishedMetadata({
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
        resolvePublisherName: () => "Mina",
        timeZone: "UTC",
      }),
    ).toBe("Published Jan 7, 2024, 12:00 PM UTC by Mina.");
  });

  // A viewer who cannot open the publish history is not shown who published
  // either; the time alone says whether the schedule is current.
  it("leaves the publisher out of published metadata when no resolver is given", () => {
    expect(
      formatPublishedMetadata({
        publishedAt: "2024-01-07T12:00:00.000Z",
        publishedBy: "user-1",
        timeZone: "UTC",
      }),
    ).toBe("Published Jan 7, 2024, 12:00 PM UTC.");
  });

  it("uses the change tooltip when shift detail hover cards are disabled", async () => {
    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      showShiftDetailHoverCards: false,
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [2],
      publishedLabelForKey: () => "N",
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const badge = firstCell.querySelector('[data-draft-badge="modified"]') as HTMLElement;

    fireEvent.mouseEnter(badge);
    await waitFor(() => {
      expect(screen.getByRole("tooltip")).toHaveTextContent("Was N.");
    });
  });

  // 42a: an indicator describes the shift, so a change's details no longer hide it.
  it("keeps the indicator line on a changed cell's hover card", async () => {
    renderGrid({
      assignments: twoPillAssignmentDefinitions,
      showShiftDetailHoverCards: true,
      draftKindForKey: () => "modified",
      publishedAssignmentIdsForKey: () => [2],
      publishedLabelForKey: () => "N",
      activeIndicatorIdsForKey: () => [1],
    });

    const pill = screen
      .getAllByRole("gridcell")[0]
      .querySelector("[data-shift-pill]") as HTMLElement;
    fireEvent.mouseEnter(pill);

    await waitFor(() => {
      expect(screen.getByText("Schedule notes: Flag")).toBeInTheDocument();
    });
    expect(screen.getByText("Was N.")).toBeInTheDocument();
  });

  it("says what a new draft cell adds, without a published shift staff still see", async () => {
    renderGrid({
      showShiftDetailHoverCards: true,
      segmentsForKey: () => [{ shiftId: 1, jobId: 101, position: 0, isMentored: false }],
      draftKindForKey: () => "new",
    });

    const pill = screen
      .getAllByRole("gridcell")[0]
      .querySelector("[data-shift-pill]") as HTMLElement;
    fireEvent.mouseEnter(pill);

    await waitFor(() => {
      expect(
        screen.getByText("Not published yet. Staff don't see it until it's published."),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/^Added: /)).toBeInTheDocument();
    expect(screen.queryByText(/Staff still see the published shift/)).not.toBeInTheDocument();
    expect(screen.queryByText("Before")).not.toBeInTheDocument();
  });

  it("keeps the indicator line on a deleted shift's hover card", async () => {
    observedWidth = 1600;
    renderGrid({
      showShiftDetailHoverCards: true,
      shiftForKey: () => null,
      assignmentIdsForKey: () => [],
      activeIndicatorIdsForKey: () => [1],
      draftKindForKey: () => "deleted",
      publishedAssignmentIdsForKey: () => [1],
      publishedLabelForKey: () => "D",
    });

    const pill = screen
      .getAllByRole("gridcell")[0]
      .querySelector('[data-shift-pill="deleted"]') as HTMLElement;
    fireEvent.mouseEnter(pill);

    await waitFor(() => {
      expect(screen.getByText("Schedule notes: Flag")).toBeInTheDocument();
    });
  });

  it("shows full qualifications when hovering a staff role or certification", async () => {
    renderGrid({
      filteredEmployees: [{ ...employees[0], certificationId: 7, roleIds: [8] }],
      allEmployees: [{ ...employees[0], certificationId: 7, roleIds: [8] }],
      certifications: [
        { id: 7, orgId: "org-1", name: "Registered Nurse", abbr: "RN", sortOrder: 0 },
      ],
      orgRoles: [{ id: 8, orgId: "org-1", name: "Charge Nurse", abbr: "CN", sortOrder: 0 }],
    });

    fireEvent.mouseEnter(screen.getByText("CN").parentElement as HTMLElement);

    await waitFor(() => {
      expect(document.querySelector("[data-employee-detail-card]")).toBeInTheDocument();
    });
    const card = document.querySelector("[data-employee-detail-card]") as HTMLElement;
    expect(card.querySelector("[data-employee-detail-header]")).toHaveStyle({
      margin: "2px 2px 0px",
      borderRadius: "var(--dg-radius-sm)",
      border: "",
    });
    expect(within(card).getByText("Registered Nurse")).toBeInTheDocument();
    expect(within(card).getByText("Charge Nurse")).toBeInTheDocument();
  });

  it("shows the general shift name before its type label in the hover card", async () => {
    const generalAssignment: AssignmentDefinition = {
      ...assignments[0],
      label: "O",
      name: "Office",
      categoryId: null,
      focusAreaId: null,
      jobId: 101,
      isGeneral: true,
    };
    const officeJob: JobDefinition = {
      id: 101,
      orgId: "org-1",
      name: "Office",
      abbr: "OFF",
      showOnGrid: true,
      assignmentMode: "shiftless",
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
    };

    renderGrid({
      assignments: [generalAssignment],
      jobs: [officeJob],
      shiftForKey: () => "O",
      assignmentIdsForKey: () => [1],
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement;
    fireEvent.mouseEnter(pill);

    await waitFor(() => {
      expect(screen.getByText("General shift")).toBeInTheDocument();
    });
    expect(screen.getAllByText("Office")).toHaveLength(1);
    const generalShiftType = screen.getByText("General shift");
    const entry = generalShiftType.parentElement;
    expect(entry?.children[0]).toHaveTextContent("Office");
    expect(entry?.children[1]).toHaveTextContent("General shift");
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

  it("describes scheduler open shifts as assignments instead of volunteer actions", () => {
    observedWidth = 1600;

    renderGrid({
      openShifts: [
        {
          id: "open-1",
          source: "coverage_gap",
          focusAreaId: 1,
          date: "2024-01-07",
          assignmentIds: [1],
          assignmentLabel: "D",
          customStartTime: null,
          customEndTime: null,
          needed: 1,
          viewerAction: "assign",
        },
      ],
    });

    expect(screen.getByRole("button", { name: "1 needed, click to assign" })).toBeInTheDocument();
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

  it("renders the 2-week header boundary as a strong divider", () => {
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
      "linear-gradient(var(--dg-color-grid-divider-strong), var(--dg-color-grid-divider-strong))",
    );
    expect(staffHeader.style.backgroundPosition).toBe("0px 100%");
    expect(staffHeader.style.backgroundSize).toBe("100% 1px");
    expect(splitHeader.style.backgroundImage).toBe(
      "linear-gradient(var(--dg-color-grid-divider-strong), var(--dg-color-grid-divider-strong))",
    );
    expect(splitHeader.style.backgroundPosition).toBe("0px 100%");
    expect(splitHeader.style.backgroundSize).toBe("100% 1px");
    expect(secondDayHeader.dataset.leadingDivider).toBe("light");
    expect(splitHeader.dataset.leadingDivider).toBe("split");
    expect(splitHeader.dataset.weekSplitStart).toBe("true");
  });

  it("leaves the first row's top divider to the header, edited or not", () => {
    observedWidth = 1600;
    renderGrid({
      draftKindForKey: (_empId, date) => (formatDateKey(date) === "2024-01-07" ? "modified" : null),
    });

    const [editedCell, nextCell] = screen.getAllByRole("gridcell") as [HTMLElement, HTMLElement];

    // The header cell paints its own bottom stroke inside its own box. A
    // second stroke here would stack on it and make edited cells read
    // thicker than their empty neighbours.
    expect(editedCell.dataset.topDivider).toBeUndefined();
    expect(nextCell.dataset.topDivider).toBeUndefined();
  });

  it("leaves the first row's top divider to the open-shifts row above it", () => {
    observedWidth = 1600;
    renderGrid({
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

    expect(firstCell.dataset.topDivider).toBeUndefined();
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
    expect(firstCell.style.height).toBe(GRID_CELL_HEIGHT);
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
    expect(firstCell.style.height).toBe(GRID_CELL_HEIGHT);
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
    expect(firstCell.style.height).toBe(GRID_CELL_HEIGHT);
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
    expect(firstCell.style.height).toBe(GRID_CELL_HEIGHT);
    expect(multiPills).toHaveLength(2);
    expect(authorPill).not.toBeNull();
    expect(dayLabel.closest('[data-shift-pill="multi"]')).not.toBeNull();
    expect(nightLabel.closest('[data-shift-pill="multi"]')).not.toBeNull();
    // A long name is a fit line: it shrinks to its pill, and is never
    // clamped or broken inside a word.
    expect(dayLabel.hasAttribute("data-pill-fit")).toBe(true);
    expect(dayLabel.style.display).toBe("block");
    expect(dayLabel.style.textAlign).toBe("center");
    expect(dayLabel.style.width).toBe("100%");
    expect(dayLabel.style.overflowWrap).toBe("normal");
    expect(dayLabel.style.overflow).toBe("hidden");
    expect(dayLabel.style.lineHeight).toBe("1.2");
    expect(dayLabel.getAttribute("style")).not.toContain("line-clamp");
    expect(nightLabel.hasAttribute("data-pill-fit")).toBe(true);
    expect(nightLabel.style.overflowWrap).toBe("normal");
    expectPillTextToFit(firstCell);
  });

  // A pill carrying shift, job and a custom time is three lines of type in a
  // 52px cell, which used to overflow and clip the time off the bottom.
  it("puts shift and job on one line with a middot in code mode", () => {
    observedWidth = 1600;

    const jobAssignment: AssignmentDefinition = {
      id: 11,
      orgId: "org-1",
      label: "DS",
      name: "Day Shift Supervisor",
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
        name: "Supervisor",
        abbr: "S",
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
      assignments: [jobAssignment],
      jobs,
      shiftForKey: () => "DS",
      assignmentIdsForKey: () => [11],
      getShiftStyle: getShiftStyleFromCodes([jobAssignment]),
      getCustomShiftTimes: () => ({ start: "09:30", end: "17:45" }),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement;
    const time = Array.from(pill.querySelectorAll("span")).find((span) =>
      span.textContent?.startsWith("9:30"),
    ) as HTMLElement;
    const job = Array.from(pill.querySelectorAll("span")).find(
      (span) => span.textContent === "S",
    ) as HTMLElement;
    const line = job.closest("[data-pill-fit]") as HTMLElement;

    expect(time).toBeTruthy();
    // Code mode: one- or two-character labels share a line, separated by a
    // middot, so the time gets a line of its own without a row each. The
    // line shrinks as one, the job code inline on the shift code's baseline.
    expect(job.parentElement).toBe(line);
    expect(line.textContent).toBe("D·S");
    expect(line.style.fontSize).toBe(FIT_TITLE);
    expect(job.style.fontSize).toBe(FIT_FOOTNOTE);
    expect(job.style.display).toBe("");
    expect(time.closest("[data-pill-fit]")).not.toBe(line);
    expect(time.parentElement).toBe(pill);
    expectPillTextToFit(firstCell);
  });

  it("shrinks an over-wide time line to its pill instead of cutting it", () => {
    observedWidth = 1600;
    // jsdom has no layout: the time line is 100px at full size in 60px of room.
    const fitScaleOf = (el: Element) =>
      Number((el as HTMLElement).style.getPropertyValue("--dg-grid-fit-scale") || 1);
    const natural = vi.spyOn(Element.prototype, "scrollWidth", "get").mockImplementation(function (
      this: Element,
    ) {
      const isTime = this.hasAttribute("data-pill-fit") && this.textContent?.includes("–");
      return isTime ? 100 * fitScaleOf(this) : 0;
    });
    const room = vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(60);
    try {
      renderGrid({ getCustomShiftTimes: () => ({ start: "07:30", end: "15:30" }) });

      const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
      const lines = Array.from(firstCell.querySelectorAll<HTMLElement>("[data-pill-fit]"));
      const time = lines.find((line) => line.textContent?.includes("–")) as HTMLElement;

      expect(fitScaleOf(time)).toBeCloseTo(0.6);
      expect(time.style.textOverflow).toBe("");
      expect(time).toHaveTextContent("7:30–3:30");
      expect(lines.filter((line) => line !== time).every((line) => fitScaleOf(line) === 1)).toBe(
        true,
      );
    } finally {
      natural.mockRestore();
      room.mockRestore();
    }
  });

  it("gives shift, job and custom time a row each in name mode", () => {
    observedWidth = 1600;

    const jobAssignment: AssignmentDefinition = {
      id: 11,
      orgId: "org-1",
      label: "DS",
      name: "Day Shift Supervisor",
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
        name: "Supervisor",
        abbr: "S",
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
      shiftDisplayMode: "name",
      assignments: [jobAssignment],
      jobs,
      shiftForKey: () => "DS",
      assignmentIdsForKey: () => [11],
      getShiftStyle: getShiftStyleFromCodes([jobAssignment]),
      getCustomShiftTimes: () => ({ start: "09:30", end: "17:45" }),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement;
    const spans = Array.from(pill.querySelectorAll("span"));
    const time = spans.find((span) => span.textContent?.startsWith("9:30")) as HTMLElement;
    const job = spans.find((span) => span.textContent === "Supervisor") as HTMLElement;
    const shift = spans.find((span) => span.textContent === "Day") as HTMLElement;

    // Spelled-out labels each earn a row, and no middot joins them.
    expect(shift.parentElement).toBe(job.parentElement);
    expect(shift.parentElement).toHaveStyle({ flexDirection: "column" });
    expect(shift.parentElement?.textContent).toBe("DaySupervisor");
    // Stepped down a size so three rows fit the 52px cell, and each a fit line.
    expect(job.style.fontSize).toBe(FIT_MICRO);
    expect(time.style.fontSize).toBe(FIT_MICRO);
    expect([shift, job, time].every((span) => span.hasAttribute("data-pill-fit"))).toBe(true);
    expectPillTextToFit(firstCell);
  });

  it("keeps shift and job on separate rows in name mode without a custom time", () => {
    observedWidth = 1600;

    const jobAssignment: AssignmentDefinition = {
      id: 11,
      orgId: "org-1",
      label: "DS",
      name: "Day Shift Supervisor",
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
        name: "Supervisor",
        abbr: "S",
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
      shiftDisplayMode: "name",
      assignments: [jobAssignment],
      jobs,
      shiftForKey: () => "DS",
      assignmentIdsForKey: () => [11],
      getShiftStyle: getShiftStyleFromCodes([jobAssignment]),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement;
    const job = Array.from(pill.querySelectorAll("span")).find(
      (span) => span.textContent === "Supervisor",
    ) as HTMLElement;

    expect(job.parentElement).toHaveStyle({ flexDirection: "column" });
    expect(job.parentElement?.textContent).toBe("DaySupervisor");
  });

  it("still shares the line in code mode when a pill has no custom time", () => {
    observedWidth = 1600;

    const jobAssignment: AssignmentDefinition = {
      id: 11,
      orgId: "org-1",
      label: "DS",
      name: "Day Shift Supervisor",
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
        name: "Supervisor",
        abbr: "S",
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
      assignments: [jobAssignment],
      jobs,
      shiftForKey: () => "DS",
      assignmentIdsForKey: () => [11],
      getShiftStyle: getShiftStyleFromCodes([jobAssignment]),
    });

    const firstCell = screen.getAllByRole("gridcell")[0] as HTMLElement;
    const pill = firstCell.querySelector('[data-shift-pill="single"]') as HTMLElement;
    const job = Array.from(pill.querySelectorAll("span")).find(
      (span) => span.textContent === "S",
    ) as HTMLElement;

    // Code mode shares the line whether or not a time follows.
    const line = job.parentElement as HTMLElement;
    expect(line.hasAttribute("data-pill-fit")).toBe(true);
    expect(line.textContent).toBe("D·S");
    expect(line.style.fontSize).toBe(FIT_TITLE);
  });

  describe("pinned date row", () => {
    const makeRoster = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...employees[0],
        id: `emp-${index + 1}`,
        firstName: `Staff${index + 1}`,
        seniority: index + 1,
      }));

    it("marks the fifth-from-last staff row as the release anchor", () => {
      const roster = makeRoster(7);
      const { container } = renderGrid({
        filteredEmployees: roster,
        allEmployees: roster,
      });

      const anchors = container.querySelectorAll('[data-sticky-release="true"]');
      expect(anchors).toHaveLength(1);
      // Seven staff, five kept clear: the anchor is the third row.
      expect(anchors[0].textContent).toContain("Staff3");
    });

    it("anchors a short section on its first row so the date row never pins", () => {
      const roster = makeRoster(3);
      const { container } = renderGrid({
        filteredEmployees: roster,
        allEmployees: roster,
      });

      const anchors = container.querySelectorAll('[data-sticky-release="true"]');
      expect(anchors).toHaveLength(1);
      expect(anchors[0].textContent).toContain("Staff1");
    });

    it("keeps the focus-area label and the date row in one native sticky group", () => {
      const { container } = renderGrid();

      const group = container.querySelector(".dg-grid-sticky-group") as HTMLElement;
      const label = group.querySelector(".dg-grid-section-label") as HTMLElement;
      const headerRow = group.querySelector(".dg-grid-header-row") as HTMLElement;
      expect(label).not.toBeNull();
      expect(headerRow).not.toBeNull();
      expect(headerRow.querySelectorAll('[role="columnheader"]')).toHaveLength(15);
      // Padding, not margin: rows would otherwise scroll through the gap
      // between the label and the date row while the group is stuck.
      expect(label).toHaveStyle({ padding: "2px 0 12px" });
      expect(label.style.marginBottom).toBe("");
      // Nothing is driven by scroll position; layering waits on `data-stuck`.
      expect(group.style.transform).toBe("");
      expect(group.dataset.stuck).toBeUndefined();
    });

    it("scrolls the date row in a mirror of the body scroller", () => {
      const { container } = renderGrid();

      const body = getGridBody("North schedule grid");
      const headerRow = container.querySelector(".dg-grid-header-row") as HTMLElement;
      // The header cannot live inside the body's horizontal scroller, which
      // would become its scrollport and defeat the vertical stick.
      expect(body.contains(headerRow)).toBe(false);
      expect(body.querySelector('[role="columnheader"]')).toBeNull();
    });

    it("keeps the header and body rows under one grid for assistive tech", () => {
      renderGrid();

      const grid = screen.getByRole("grid", { name: "North schedule grid" });
      const rowgroups = within(grid).getAllByRole("rowgroup");
      expect(rowgroups).toHaveLength(2);
      expect(within(rowgroups[0]).getAllByRole("columnheader").length).toBeGreaterThan(0);
      expect(within(rowgroups[1]).getAllByRole("gridcell").length).toBeGreaterThan(0);
    });
  });

  describe("mounts the rows below the first screen after it", () => {
    const manyEmployees: Employee[] = Array.from({ length: 12 }, (_, index) => ({
      ...employees[0],
      id: `emp-many-${index}`,
      firstName: `Person${index}`,
      lastName: "Many",
      focusAreaIds: [index < 6 ? 1 : 2],
    }));
    const southCodes: AssignmentDefinition[] = [
      ...assignments,
      { ...assignments[0], id: 2, label: "E", focusAreaId: 2, sortOrder: 2 },
    ];
    let originalInnerHeight = 0;

    beforeEach(() => {
      originalInnerHeight = window.innerHeight;
      // Room for the first section's chrome and a few rows only.
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 200 });
    });

    afterEach(() => {
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
    });

    const rowCount = (name: string) =>
      within(getGridBody(name))
        .getAllByRole("row")
        .filter((row) => row.querySelector('[role="rowheader"]')).length;

    it("ends with every row of every section mounted", async () => {
      const { container } = renderGrid({
        filteredEmployees: manyEmployees,
        allEmployees: manyEmployees,
        assignments: southCodes,
        // No shifts, so nobody also shows as a guest in the other section.
        shiftForKey: () => null,
        assignmentIdsForKey: () => [],
      });

      // The first screen holds space for the rest of North and all of South.
      expect(rowCount("North schedule grid")).toBe(4);
      expect(container.querySelector("[data-rows-pending]")).not.toBeNull();
      expect(container.querySelector("[data-section-pending]")).not.toBeNull();

      await waitFor(() => expect(container.querySelector("[data-section-pending]")).toBeNull());
      expect(container.querySelector("[data-rows-pending]")).toBeNull();
      expect(rowCount("North schedule grid")).toBe(6);
      expect(rowCount("South schedule grid")).toBe(6);
    });

    it("mounts the searched-for row straight away", () => {
      renderGrid({
        filteredEmployees: manyEmployees,
        allEmployees: manyEmployees,
        assignments: southCodes,
        // No shifts, so nobody also shows as a guest in the other section.
        shiftForKey: () => null,
        assignmentIdsForKey: () => [],
        highlightEmpIds: new Set(["emp-many-11"]),
        highlightScrollKey: "search-1",
      });

      const match = screen.getByText("Person11 Many").closest('[role="row"]');
      expect(match).toHaveAttribute("data-search-highlight", "true");
    });
  });

  describe("re-renders a section only when its cells change", () => {
    const sectionEmployees: Employee[] = [
      employees[0],
      { ...employees[0], id: "emp-south", firstName: "Sam", lastName: "South", focusAreaIds: [2] },
    ];
    const southAssignments: AssignmentDefinition[] = [
      ...assignments,
      { ...assignments[0], id: 2, label: "E", name: "Evening", focusAreaId: 2, sortOrder: 2 },
      { ...assignments[0], id: 3, label: "N", name: "Night", focusAreaId: 2, sortOrder: 3 },
    ];
    const interactionState: ScheduleGridInteractionState = {
      activeCellId: null,
      contextMenuCellId: null,
      hasClipboard: false,
    };
    const handlers: ScheduleGridHandlers = { onActivateCell: vi.fn() };
    const getShiftStyle = getShiftStyleFromCodes(southAssignments);
    // The page keeps these in state, so a rebuilt model hands over the same ones.
    const none: never[] = [];

    function buildModel(labels: Record<string, string>, extra: { showAudit?: boolean } = {}) {
      const labelFor = (empId: string, date: Date) => labels[`${empId}_${formatDateKey(date)}`];
      const shiftForKey = vi.fn((empId: string, date: Date) => labelFor(empId, date) ?? null);
      const model = buildScheduleGridModel({
        filteredEmployees: sectionEmployees,
        allEmployees: sectionEmployees,
        week1,
        week2,
        spanWeeks: 2,
        todayKey: formatDateKey(week1[0]),
        focusAreas,
        departments,
        assignments: southAssignments,
        historicalAssignments: none,
        shiftCategories,
        jobs: none,
        indicatorTypes,
        certifications: none,
        orgRoles: none,
        isCellInteractive: true,
        shiftDisplayMode: "code",
        showAudit: extra.showAudit,
        accessors: {
          shiftForKey,
          assignmentIdsForKey: (empId, date) => {
            const label = labelFor(empId, date);
            return southAssignments.filter((code) => code.label === label).map((code) => code.id);
          },
          getShiftStyle,
        },
      });
      return { model, shiftForKey };
    }

    function renderTwice(
      firstLabels: Record<string, string>,
      secondLabels: Record<string, string>,
      extra?: { showAudit?: boolean },
    ) {
      const first = buildModel(firstLabels);
      const { rerender } = render(
        <ScheduleGrid
          model={first.model}
          interactionState={interactionState}
          handlers={handlers}
        />,
      );
      const firstReadsBefore = first.shiftForKey.mock.calls.length;
      const second = buildModel(secondLabels, extra);
      rerender(
        <ScheduleGrid
          model={second.model}
          interactionState={interactionState}
          handlers={handlers}
        />,
      );
      return {
        // Old accessors are only ever read again to compare; new ones are read
        // to compare and again by every section that re-renders.
        comparedWithOld: first.shiftForKey.mock.calls.length - firstReadsBefore,
        newReads: second.shiftForKey.mock.calls.length,
      };
    }

    const cellText = (gridName: string, index: number) =>
      within(getGridBody(gridName)).getAllByRole("gridcell")[index].textContent;
    const start = formatDateKey(week1[0]);
    const initial = { [`emp-1_${start}`]: "D", [`emp-south_${start}`]: "E" };

    it("skips both sections when new accessors read the same", () => {
      const reads = renderTwice(initial, { ...initial });

      // Each section's 14 cells read once to compare, and none again to render.
      expect(reads).toEqual({ comparedWithOld: 2 * 14, newReads: 2 * 14 });
      expect(cellText("North schedule grid", 0)).toContain("D");
      expect(cellText("South schedule grid", 0)).toContain("E");
    });

    it("re-renders the section whose cell changed, and only that one", () => {
      const reads = renderTwice(initial, { ...initial, [`emp-south_${start}`]: "N" });

      // North compares its 14 cells and holds; South stops at its first and
      // renders all 14.
      expect(reads).toEqual({ comparedWithOld: 14 + 1, newReads: 14 + 1 + 14 });
      expect(cellText("South schedule grid", 0)).toContain("N");
      expect(cellText("South schedule grid", 0)).not.toContain("E");
      expect(cellText("North schedule grid", 0)).toContain("D");
    });

    it("holds through new handlers, and a click reaches the latest one", () => {
      const first = buildModel(initial);
      const { rerender } = render(
        <ScheduleGrid
          model={first.model}
          interactionState={interactionState}
          handlers={handlers}
        />,
      );
      const firstReadsBefore = first.shiftForKey.mock.calls.length;
      const second = buildModel({ ...initial });
      const latest: ScheduleGridHandlers = { onActivateCell: vi.fn() };
      rerender(
        <ScheduleGrid model={second.model} interactionState={interactionState} handlers={latest} />,
      );

      expect(first.shiftForKey.mock.calls.length - firstReadsBefore).toBe(2 * 14);
      expect(second.shiftForKey).toHaveBeenCalledTimes(2 * 14);
      fireEvent.click(within(getGridBody("South schedule grid")).getAllByRole("gridcell")[0]);
      expect(latest.onActivateCell).toHaveBeenCalledWith(
        expect.objectContaining({ emp: expect.objectContaining({ id: "emp-south" }) }),
      );
      expect(handlers.onActivateCell).not.toHaveBeenCalled();
    });

    it("holds through a rebuilt bulk selection set that selects the same cells", () => {
      const selectable = () => new Set(week1.map((date) => `emp-south_${formatDateKey(date)}`));
      const first = buildModel(initial);
      const { rerender } = render(
        <ScheduleGrid
          model={first.model}
          interactionState={{ ...interactionState, bulkSelectableCellKeys: selectable() }}
          handlers={handlers}
        />,
      );
      const firstReadsBefore = first.shiftForKey.mock.calls.length;
      rerender(
        <ScheduleGrid
          model={first.model}
          interactionState={{ ...interactionState, bulkSelectableCellKeys: selectable() }}
          handlers={handlers}
        />,
      );

      // Compared cell by cell (each read once more), and neither section rendered.
      expect(first.shiftForKey.mock.calls.length - firstReadsBefore).toBe(2 * 2 * 14);
    });

    it("re-renders every section when a prop other than the accessors changes", () => {
      const reads = renderTwice(initial, { ...initial }, { showAudit: true });

      expect(reads).toEqual({ comparedWithOld: 0, newReads: 2 * 14 });
    });
  });
});
