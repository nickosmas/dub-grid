"use client";

import React, {
  memo,
  useMemo,
  useRef,
  useLayoutEffect,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, UserPen, Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/Button";
import { DAY_LABELS, BOX_SHADOW_CARD } from "@/lib/constants";
import { MaybeHint } from "@/components/ui/hint";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { formatDateKey } from "@/lib/utils";
import {
  computeDailyTallies,
  resolveRequirementByAssignment,
  resolveRequirementByJobShift,
} from "@/lib/schedule-logic";
import { getScheduleGridLayout } from "@/lib/schedule-grid-layout";
import {
  Employee,
  GridCellId,
  ShiftCategory,
  AssignmentDefinition,
  FocusArea,
  Department,
  IndicatorType,
  JobDefinition,
  NamedItem,
  DraftKind,
  PublishChange,
  CoverageRequirement,
  AbsenceType,
  ActiveShiftRequestSummary,
  ShiftDisplayMode,
  GridOpenShift,
  ScheduleCellState,
  ShiftJobSegment,
} from "@/types";
import { buildScheduleGridModel } from "./schedule-grid/model";
import type {
  ScheduleGridHandlers,
  ScheduleGridInteractionState,
  ScheduleGridModel,
} from "./schedule-grid/model";
import {
  getCertAbbr,
  getCertName,
  getRoleAbbrs,
  getEmployeeDisplayName,
  getAvatarInitials,
  fmt12h,
  fmt12hShort,
} from "@/lib/utils";
import {
  borderColor,
  DESIGNATION_COLORS,
  DEFAULT_DESIG_COLOR,
  DRAFT_BORDER_COLORS,
  getReadableTextOnSurface,
  resolveShiftPillColors,
  toDarkPillColors,
  visiblePillBorder,
} from "@/lib/colors";
import { useTheme } from "next-themes";
import {
  getAvatarTypography,
  lightColorTokens,
  darkColorTokens,
  getAvatarTone,
} from "@dubgrid/design-tokens";
import { buildShiftDisplayParts } from "@/lib/assignable-shifts";
import {
  buildShiftJobPairKey,
  createAssignmentDefinitionIdByPairMap,
  deriveAssignmentDefinitionIdsFromAssignments,
} from "@/lib/shift-job-segments";
import DroppableCell from "./DroppableCell";
import DraggableShift from "./DraggableShift";
import { PublishDiffPill } from "./schedule-grid/publishDiffPill";
import {
  shouldUseShiftColorForDiffState,
  GridDiffBadge,
  MentoredShiftBadge,
  LOCK_CORNER_CLEARANCE,
  RequestCornerFold,
  NOTE_DOT_GAP,
  NOTE_DOT_SIZE,
  AuthorBadge,
  type GridDiffBadgeConfig,
} from "./schedule-grid/badges";
import {
  getFocusAreaInitials,
  getCrossFocusBadgePalette,
  isOvernightTimes,
  getDraftBorder,
  getPublishDiffRing,
  joinBoxShadows,
  areGridCellIdsEqual,
  getGridCellKey,
  getBulkSelectionRingStyle,
  cellLevelDiffBadge,
  cellShowsDraftDiffBadge,
  formatActiveRequestLabel,
  buildPublishTooltip,
  formatPublishedMetadata,
  timeRangesFromCustomTimes,
  splitShiftLabelParts,
  assignmentIdsFromPublishState,
  absenceTypeIdFromPublishState,
  timeRangesFromPublishState,
  SINGLE_SHIFT_PILL_RADIUS,
  MULTI_SHIFT_PILL_RADIUS,
  SINGLE_CROSS_FOCUS_CONTENT_LEFT_PADDING,
  MULTI_CROSS_FOCUS_CONTENT_LEFT_PADDING,
} from "./schedule-grid/gridHelpers";

import type { ShiftDragData } from "./DraggableShift";
import type { CellDropData } from "./DroppableCell";
import { useAuth } from "@/components/AuthProvider";
import {
  buildShiftDiffDescriptors,
  expandDelimitedTimeRanges,
  type ShiftDiffBadgeDescriptor,
  type ShiftDiffBorderKind,
  type ShiftDiffTimeRange,
} from "@/lib/shift-diff-badges";

interface LegacyScheduleGridProps {
  filteredEmployees: Employee[];
  allEmployees: Employee[];
  week1: Date[];
  week2: Date[];
  spanWeeks: 1 | 2;
  shiftForKey: (empId: string, date: Date) => string | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  segmentsForKey?: (empId: string, date: Date) => ScheduleCellState["segments"];
  publishedSegmentsForKey?: (
    empId: string,
    date: Date,
  ) => Array<Pick<ShiftJobSegment, "shiftId" | "jobId" | "position" | "isMentored">>;
  /** Pass focusAreaId for context-aware label resolution */
  getShiftStyle: (type: string, focusAreaName?: string) => AssignmentDefinition;
  handleCellClick: (
    emp: Employee,
    date: Date,
    focusAreaName?: string,
    trigger?: "click" | "keyboard",
  ) => void;
  todayKey: string;
  highlightEmpIds?: Set<string>;
  highlightScrollKey?: string;
  focusAreas: FocusArea[];
  departments: Department[];
  assignments: AssignmentDefinition[];
  historicalAssignments?: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs?: JobDefinition[];
  indicatorTypes?: IndicatorType[];
  isCellInteractive?: boolean;
  /** Whether shifts can be dragged (editor-only). Defaults to isCellInteractive. */
  canDragShifts?: boolean;
  activeIndicatorIdsForKey?: (empId: string, date: Date, focusAreaId?: number) => number[];
  activeFocusArea?: number | null;
  certifications?: NamedItem[];
  orgRoles?: NamedItem[];
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
  fromRecurringForKey?: (empId: string, date: Date) => boolean;
  showPublishDiffOverlay?: boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedAssignmentIdsForKey?: (empId: string, date: Date) => number[];
  publishedAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  /** Returns true if the cell's custom times differ from published times. */
  publishDiffForKey?: (
    empId: string,
    date: Date,
  ) => (PublishChange & { publishedAt: string; publishedBy: string }) | null;
  publishedMetadataForKey?: (
    empId: string,
    date: Date,
  ) => { publishedAt: string; publishedBy: string; timeZone?: string | null } | null;
  /** Set of cell keys (empId_date) that were recently published since user's last view */
  /** Purely informational: who else currently has each cell open. Never blocks. */
  cellEditors?: Map<string, { userId: string; userName: string }>;
  /** When true, show who created each shift below the cell */
  showAudit?: boolean;
  /** Returns the creator's first name for compact grid display */
  createdByNameForKey?: (empId: string, date: Date) => string | null;
  /** Called when mouse enters a cell (for copy-paste hover tracking) */
  onCellHover?: (cellId: GridCellId) => void;
  /** Called on right-click or Shift+F10 of a cell */
  onCellContextMenu?: (
    e: React.MouseEvent | React.KeyboardEvent,
    anchorEl: HTMLElement,
    cellId: GridCellId,
    emp: Employee,
    date: Date,
  ) => void;
  /** Retained for compatibility; detailed coverage remains in the separate coverage panel. */
  coverageRequirements?: CoverageRequirement[];
  /** Map from absence type ID to AbsenceType for color resolution */
  absenceTypeMap?: Map<number, AbsenceType>;
  /** Returns the absence type ID for a given cell, or null/undefined if not an absence */
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  activeRequestForKey?: (empId: string, date: Date) => ActiveShiftRequestSummary | null;
  /** Controls shift display: 'code' shows short labels, 'name' shows full names. */
  shiftDisplayMode?: ShiftDisplayMode;
  /** Whether roles and certifications use their saved compact labels. */
  useCompactRoleCertificationLabels?: boolean;
  /** Whether shift pills reveal full cell details on hover. */
  showShiftDetailHoverCards?: boolean;
  /** Resolves a user UUID to a display name for publish tooltips */
  resolvePublisherName?: (userId: string) => string | null;
  /** Open shifts grouped by focus area, displayed above employee rows */
  openShifts?: GridOpenShift[];
  /** Callback when a user clicks to claim an open shift */
  onClaimOpenShift?: (openShift: GridOpenShift) => void;
  onCellFocus?: (cellId: GridCellId) => void;
  activeCellId?: GridCellId | null;
  bulkDeleteMode?: boolean;
  bulkSelectedCellKeys?: Set<string>;
  bulkSelectableCellKeys?: Set<string>;
  onToggleBulkDeleteCell?: (cellId: GridCellId) => void;
}

interface SectionBlockProps {
  sectionId: number;
  sectionName: string;
  exclusiveCodeIds: Set<number>;
  employees: Employee[];
  weekDates: Date[];
  todayKey: string;
  shiftForKey: (empId: string, date: Date) => string | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  segmentsForKey?: (empId: string, date: Date) => ScheduleCellState["segments"];
  publishedSegmentsForKey?: (
    empId: string,
    date: Date,
  ) => Array<Pick<ShiftJobSegment, "shiftId" | "jobId" | "position" | "isMentored">>;
  /** Pass focusAreaId for context-aware label resolution */
  getShiftStyle: (type: string, focusAreaName?: string) => AssignmentDefinition;
  handleCellClick: (
    emp: Employee,
    date: Date,
    focusAreaName?: string,
    trigger?: "click" | "keyboard",
  ) => void;
  nameColWidth: number;
  colWidth: number;
  fitToContainer?: boolean;
  highlightEmpIds?: Set<string>;
  focusAreas: FocusArea[];
  assignments: AssignmentDefinition[];
  historicalAssignments?: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs?: JobDefinition[];
  indicatorTypes: IndicatorType[];
  isCellInteractive: boolean;
  canDragShifts?: boolean;
  activeIndicatorIdsForKey?: (empId: string, date: Date, focusAreaId?: number) => number[];
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
  fromRecurringForKey?: (empId: string, date: Date) => boolean;
  showPublishDiffOverlay?: boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedAssignmentIdsForKey?: (empId: string, date: Date) => number[];
  publishedAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  publishDiffForKey?: (
    empId: string,
    date: Date,
  ) => (PublishChange & { publishedAt: string; publishedBy: string }) | null;
  publishedMetadataForKey?: (
    empId: string,
    date: Date,
  ) => { publishedAt: string; publishedBy: string; timeZone?: string | null } | null;
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  /** Purely informational: who else currently has each cell open. Never blocks. */
  cellEditors?: Map<string, { userId: string; userName: string }>;
  showAudit?: boolean;
  createdByNameForKey?: (empId: string, date: Date) => string | null;
  onCellHover?: (cellId: GridCellId) => void;
  onCellContextMenu?: (
    e: React.MouseEvent | React.KeyboardEvent,
    anchorEl: HTMLElement,
    cellId: GridCellId,
    emp: Employee,
    date: Date,
  ) => void;
  onCellFocus?: (cellId: GridCellId) => void;
  coverageRequirements?: CoverageRequirement[];
  absenceTypeMap?: Map<number, AbsenceType>;
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  activeRequestForKey?: (empId: string, date: Date) => ActiveShiftRequestSummary | null;
  shiftDisplayMode?: ShiftDisplayMode;
  useCompactRoleCertificationLabels?: boolean;
  showShiftDetailHoverCards?: boolean;
  resolvePublisherName?: (userId: string) => string | null;
  openShifts?: GridOpenShift[];
  onClaimOpenShift?: (openShift: GridOpenShift) => void;
  activeCellId?: GridCellId | null;
  bulkDeleteMode?: boolean;
  bulkSelectedCellKeys?: Set<string>;
  bulkSelectableCellKeys?: Set<string>;
  onToggleBulkDeleteCell?: (cellId: GridCellId) => void;
}

interface ActiveOutlineRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type ShiftDetailEntry = {
  label: string;
  jobName: string | null;
  focusAreaName: string | null;
  timeLabel: string | null;
  isCustomTime: boolean;
  isMentored: boolean;
};

function EmployeeDetailHoverCard({
  employeeName,
  certificationName,
  roleNames,
  children,
}: {
  employeeName: string;
  certificationName: string;
  roleNames: string[];
  children: React.ReactElement<
    React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
  >;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  const trigger = React.cloneElement(children, {
    ref: (node: HTMLDivElement | null) => {
      triggerRef.current = node;
    },
    onMouseEnter: (event: React.MouseEvent<HTMLDivElement>) => {
      children.props.onMouseEnter?.(event);
      setIsOpen(true);
    },
    onMouseLeave: (event: React.MouseEvent<HTMLDivElement>) => {
      children.props.onMouseLeave?.(event);
      setIsOpen(false);
    },
  });

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      {trigger}
      {isOpen && triggerRef.current ? (
        <PopoverContent
          anchor={triggerRef}
          collisionPadding={12}
          positionMethod="fixed"
          side="right"
          sideOffset={10}
          showArrow
          data-employee-detail-card
          style={{
            display: "block",
            width: 300,
            maxWidth: "calc(100vw - 32px)",
            padding: 0,
            border: "1px solid var(--dg-color-border)",
            borderRadius: "var(--dg-radius-md)",
            background: "var(--dg-color-surface)",
            color: "var(--dg-color-text-primary)",
            boxShadow: "var(--tooltip-shadow)",
            overflow: "visible",
          }}
        >
          <div
            style={{
              overflow: "hidden",
              borderRadius: "var(--dg-radius-md)",
            }}
          >
            <div
              data-employee-detail-header
              style={{
                margin: "2px 2px 0",
                padding: "10px 12px",
                background: "var(--dg-color-bg-secondary)",
                borderRadius: "var(--dg-radius-sm)",
              }}
            >
              <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700 }}>{employeeName}</div>
            </div>
            <dl style={{ display: "grid", gap: 10, margin: 0, padding: 12 }}>
              <div>
                <dt
                  style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}
                >
                  Certification
                </dt>
                <dd style={{ margin: "2px 0 0", fontSize: "var(--dg-fs-label)" }}>
                  {certificationName || "None"}
                </dd>
              </div>
              <div>
                <dt
                  style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}
                >
                  Roles
                </dt>
                <dd style={{ margin: "2px 0 0", fontSize: "var(--dg-fs-label)" }}>
                  {roleNames.length > 0 ? roleNames.join(", ") : "None"}
                </dd>
              </div>
            </dl>
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

function ShiftDetailHoverCard({
  enabled,
  employeeName,
  date,
  entries,
  indicators,
  requestLabel,
  status,
  changeDetails,
  publicationLabel,
  children,
}: {
  enabled: boolean;
  employeeName: string;
  date: Date;
  entries: ShiftDetailEntry[];
  indicators: string[];
  requestLabel: string | null;
  status: string | null;
  /** Per-cell change explanations, already scoped to the affected segment(s). */
  changeDetails: string[];
  publicationLabel: string | null;
  children: React.ReactElement<
    React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
  >;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  if (!enabled) return children;

  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const trigger = React.cloneElement(children, {
    ref: (node: HTMLDivElement | null) => {
      triggerRef.current = node;
    },
    onMouseEnter: (event: React.MouseEvent<HTMLDivElement>) => {
      children.props.onMouseEnter?.(event);
      setIsOpen(true);
    },
    onMouseLeave: (event: React.MouseEvent<HTMLDivElement>) => {
      children.props.onMouseLeave?.(event);
      setIsOpen(false);
    },
  });

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      {trigger}
      {isOpen && triggerRef.current ? (
        <PopoverContent
          anchor={triggerRef}
          collisionPadding={12}
          positionMethod="fixed"
          side="top"
          sideOffset={10}
          showArrow
          style={{
            display: "block",
            width: 300,
            maxWidth: "calc(100vw - 32px)",
            padding: 0,
            border: "1px solid var(--dg-color-border)",
            borderRadius: "var(--dg-radius-md)",
            background: "var(--dg-color-surface)",
            color: "var(--dg-color-text-primary)",
            boxShadow: "var(--tooltip-shadow)",
            overflow: "visible",
          }}
        >
          <div
            data-shift-detail-header
            style={{
              overflow: "hidden",
              borderRadius: "var(--dg-radius-md)",
            }}
          >
            <div
              style={{
                margin: "2px 2px 0",
                padding: "10px 12px",
                background: "var(--dg-color-bg-secondary)",
                borderRadius: "var(--dg-radius-sm)",
              }}
            >
              <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700 }}>{employeeName}</div>
              <div
                style={{
                  marginTop: 2,
                  fontSize: "var(--dg-fs-caption)",
                  color: "var(--dg-color-text-muted)",
                }}
              >
                {dateLabel}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
              {entries.map((entry, index) => (
                <div
                  key={`${entry.label}-${index}`}
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <div
                    style={{
                      fontSize: "var(--dg-fs-label)",
                      fontWeight: 700,
                    }}
                  >
                    {entry.label}
                  </div>
                  {entry.jobName ? (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-secondary)",
                      }}
                    >
                      {entry.jobName}
                    </div>
                  ) : null}
                  {entry.timeLabel ? (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      {entry.timeLabel}
                      {entry.isCustomTime ? " · Custom time" : ""}
                    </div>
                  ) : null}
                  {entry.focusAreaName ? (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-muted)",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {entry.focusAreaName}
                    </div>
                  ) : null}
                  {entry.isMentored ? (
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      Mentored shift
                    </div>
                  ) : null}
                </div>
              ))}
              {(indicators.length > 0 ||
                requestLabel ||
                status ||
                changeDetails.length > 0 ||
                publicationLabel) && (
                <div
                  style={{
                    paddingTop: 10,
                    borderTop: "1px solid var(--dg-color-border-light)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-text-muted)",
                  }}
                >
                  {changeDetails.length === 0 && indicators.length > 0 ? (
                    <div>Indicators: {indicators.join(", ")}</div>
                  ) : null}
                  {changeDetails.length === 0 && requestLabel ? (
                    <div>Request: {requestLabel}</div>
                  ) : null}
                  {changeDetails.length === 0 && status ? <div>Status: {status}</div> : null}
                  {changeDetails.map((detail) => (
                    <div key={detail} style={{ whiteSpace: "pre-line" }}>
                      {detail}
                    </div>
                  ))}
                  {changeDetails.length === 0 && publicationLabel ? (
                    <div>{publicationLabel}</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

const SectionBlock = memo(function SectionBlock({
  sectionId,
  sectionName,
  employees,
  weekDates,
  todayKey,
  shiftForKey,
  assignmentIdsForKey,
  segmentsForKey,
  publishedSegmentsForKey,
  getShiftStyle,
  handleCellClick,
  nameColWidth,
  colWidth,
  fitToContainer = false,
  highlightEmpIds,
  focusAreas,
  assignments,
  historicalAssignments = [],
  shiftCategories,
  jobs = [],
  indicatorTypes,
  isCellInteractive,
  canDragShifts = isCellInteractive,
  activeIndicatorIdsForKey,
  getCustomShiftTimes,
  getPublishedCustomShiftTimes,
  draftKindForKey,
  fromRecurringForKey,
  showPublishDiffOverlay,
  publishedLabelForKey,
  publishedAssignmentIdsForKey,
  publishedAbsenceTypeIdForKey,
  publishDiffForKey,
  publishedMetadataForKey,
  certifications,
  orgRoles,
  cellEditors,
  showAudit,
  createdByNameForKey,
  onCellHover,
  onCellContextMenu,
  onCellFocus,
  coverageRequirements,
  absenceTypeMap,
  absenceTypeIdForKey,
  activeRequestForKey,
  shiftDisplayMode = "code",
  useCompactRoleCertificationLabels = false,
  showShiftDetailHoverCards = true,
  resolvePublisherName,
  openShifts,
  onClaimOpenShift,
  activeCellId = null,
  bulkDeleteMode = false,
  bulkSelectedCellKeys,
  bulkSelectableCellKeys,
  onToggleBulkDeleteCell,
}: SectionBlockProps) {
  const isNameMode = shiftDisplayMode === "name";
  const { user: currentUser } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const themeSurface = isDarkTheme ? darkColorTokens.surface : lightColorTokens.surface;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeOutlineRect, setActiveOutlineRect] = useState<ActiveOutlineRect | null>(null);

  const updateScrollButtons = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || fitToContainer) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(maxScrollLeft - el.scrollLeft > 8);
  }, [fitToContainer]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      updateScrollButtons();
    });
    const el = scrollContainerRef.current;
    if (!el || fitToContainer) {
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    el.addEventListener("scroll", updateScrollButtons, { passive: true });
    const ro = new ResizeObserver(() => updateScrollButtons());
    ro.observe(el);
    return () => {
      window.cancelAnimationFrame(frame);
      el.removeEventListener("scroll", updateScrollButtons);
      ro.disconnect();
    };
  }, [fitToContainer, updateScrollButtons, weekDates.length, employees.length]);

  useLayoutEffect(() => {
    const gridEl = gridRef.current;
    if (!gridEl || !activeCellId || activeCellId.sectionId !== sectionId) {
      setActiveOutlineRect(null);
      return;
    }

    const selector =
      `[data-slot="cell"]` +
      `[data-emp-id="${activeCellId.empId}"]` +
      `[data-date-key="${activeCellId.dateKey}"]` +
      `[data-section-id="${activeCellId.sectionId}"]`;

    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const measure = () => {
      const cellEl = gridEl.querySelector<HTMLElement>(selector);
      if (!cellEl) {
        setActiveOutlineRect(null);
        return;
      }

      const gridRect = gridEl.getBoundingClientRect();
      const cellRect = cellEl.getBoundingClientRect();
      const nextRect = {
        left: cellRect.left - gridRect.left,
        top: cellRect.top - gridRect.top,
        width: cellRect.width + 1,
        height: cellRect.height + 1,
      };

      setActiveOutlineRect((prev) => {
        if (
          prev &&
          prev.left === nextRect.left &&
          prev.top === nextRect.top &&
          prev.width === nextRect.width &&
          prev.height === nextRect.height
        ) {
          return prev;
        }
        return nextRect;
      });

      if (!resizeObserver) {
        resizeObserver = new ResizeObserver(() => {
          window.requestAnimationFrame(measure);
        });
        resizeObserver.observe(gridEl);
        resizeObserver.observe(cellEl);
      }
    };

    frame = window.requestAnimationFrame(measure);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [
    activeCellId,
    sectionId,
    fitToContainer,
    colWidth,
    nameColWidth,
    shiftDisplayMode,
    weekDates,
    employees.length,
  ]);

  const scrollDays = useCallback(
    (direction: "left" | "right") => {
      const el = scrollContainerRef.current;
      if (!el) return;
      el.scrollBy({
        left: (direction === "right" ? 1 : -1) * Math.max(colWidth * 4, 280),
        behavior: "smooth",
      });
    },
    [colWidth],
  );

  // Bind focus-area context so all label lookups within this section
  // resolve the focus-area-specific shift definition first, falling back
  // to the general definition.
  const contextualGetShiftStyle = useMemo(
    () => (label: string) => getShiftStyle(label, sectionName),
    [getShiftStyle, sectionName],
  );

  // Look up assignments by ID so cross-focus-area shifts render in their own color
  const assignmentById = useMemo(() => {
    const map = new Map<number, AssignmentDefinition>();
    for (const sc of historicalAssignments) map.set(sc.id, sc);
    for (const sc of assignments) map.set(sc.id, sc);
    return map;
  }, [historicalAssignments, assignments]);
  const assignmentIdByPair = useMemo(
    () => createAssignmentDefinitionIdByPairMap([...historicalAssignments, ...assignments]),
    [historicalAssignments, assignments],
  );
  // A published snapshot may refer to an assignment that has since been
  // archived. Current scheduling must ignore it, but history must still be
  // able to name it in a `Was …` explanation.
  const publishedAssignmentIdByPair = useMemo(
    () =>
      createAssignmentDefinitionIdByPairMap([...historicalAssignments, ...assignments], {
        includeArchived: true,
      }),
    [historicalAssignments, assignments],
  );

  const categoryById = useMemo(() => {
    const map = new Map<number, ShiftCategory>();
    for (const cat of shiftCategories) map.set(cat.id, cat);
    return map;
  }, [shiftCategories]);
  const jobById = useMemo(() => {
    const map = new Map<number, JobDefinition>();
    for (const job of jobs) map.set(job.id, job);
    return map;
  }, [jobs]);

  const getStyleByIdOrLabel = useMemo(
    () =>
      (label: string, codeId?: number): AssignmentDefinition => {
        if (codeId != null) {
          const byId = assignmentById.get(codeId);
          if (byId) return byId;
        }
        return contextualGetShiftStyle(label);
      },
    [assignmentById, contextualGetShiftStyle],
  );

  const getDisplayPartsByIdOrLabel = useCallback(
    (label: string, codeId?: number) => {
      const assignment = getStyleByIdOrLabel(label, codeId);
      const shiftId = assignment.shiftId ?? assignment.categoryId ?? null;
      const shift = shiftId != null ? (categoryById.get(shiftId) ?? null) : null;
      const job = assignment.jobId != null ? (jobById.get(assignment.jobId) ?? null) : null;

      return buildShiftDisplayParts({
        shift,
        job,
        assignment: assignment,
        shiftDisplayMode,
      });
    },
    [categoryById, getStyleByIdOrLabel, jobById, shiftDisplayMode],
  );

  const sectionFocusArea =
    focusAreas.find((fa) => fa.id === sectionId) ??
    focusAreas.find((fa) => fa.name === sectionName);

  const countableAssignmentDefinitions = useMemo(() => {
    if (!sectionFocusArea) return [];
    return assignments.filter(
      (sc) => sc.focusAreaId === sectionFocusArea.id || sc.focusAreaId == null,
    );
  }, [assignments, sectionFocusArea]);

  const countableSectionCodeIds = useMemo(
    () => new Set(countableAssignmentDefinitions.map((sc) => sc.id)),
    [countableAssignmentDefinitions],
  );

  const dailyTotals = useMemo(() => {
    const fn = assignmentIdsForKey ?? (() => []);
    return weekDates.map((date) =>
      computeDailyTallies(employees, date, fn, assignmentById, countableSectionCodeIds),
    );
  }, [weekDates, employees, assignmentIdsForKey, assignmentById, countableSectionCodeIds]);

  const totalRows = useMemo(() => {
    const countsByCategory = new Map<number, number[]>();

    for (const [dayIndex, dayTotals] of dailyTotals.entries()) {
      for (const [categoryIdValue, categoryTotals] of Object.entries(dayTotals)) {
        const categoryId = Number(categoryIdValue);
        const counts = countsByCategory.get(categoryId) ?? Array(weekDates.length).fill(0);
        counts[dayIndex] = Object.values(categoryTotals).reduce((sum, count) => sum + count, 0);
        countsByCategory.set(categoryId, counts);
      }
    }

    return Array.from(countsByCategory.entries())
      .sort(([leftCategoryId], [rightCategoryId]) => {
        const leftOrder = categoryById.get(leftCategoryId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = categoryById.get(rightCategoryId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        const leftLabel = categoryById.get(leftCategoryId)?.name ?? `Category ${leftCategoryId}`;
        const rightLabel = categoryById.get(rightCategoryId)?.name ?? `Category ${rightCategoryId}`;
        return leftLabel.localeCompare(rightLabel);
      })
      .map(([categoryId, counts]) => ({
        categoryId,
        label: categoryById.get(categoryId)?.name ?? `Category ${categoryId}`,
        counts,
      }));
  }, [dailyTotals, categoryById, weekDates.length]);

  const hasAnyTotals = totalRows.length > 0;

  const categoryRequirementsByDay = useMemo(() => {
    if (!coverageRequirements?.length || !sectionFocusArea) {
      return weekDates.map(() => ({}) as Record<number, number>);
    }

    return weekDates.map((date) => {
      const dayOfWeek = date.getDay();
      const requirementsByCategory: Record<number, number> = {};

      for (const code of countableAssignmentDefinitions) {
        if (code.categoryId == null) continue;
        const resolved =
          code.jobId != null
            ? (resolveRequirementByJobShift(
                coverageRequirements,
                sectionFocusArea.id,
                code.jobId,
                code.shiftId ?? code.categoryId ?? null,
                dayOfWeek,
              ) ??
              resolveRequirementByAssignment(
                coverageRequirements,
                sectionFocusArea.id,
                code.id,
                dayOfWeek,
              ))
            : resolveRequirementByAssignment(
                coverageRequirements,
                sectionFocusArea.id,
                code.id,
                dayOfWeek,
              );
        if (!resolved || resolved.minStaff <= 0) continue;

        requirementsByCategory[code.categoryId] =
          (requirementsByCategory[code.categoryId] ?? 0) + resolved.minStaff;
      }

      return requirementsByCategory;
    });
  }, [coverageRequirements, sectionFocusArea, weekDates, countableAssignmentDefinitions]);

  // For cross-focus-area pill detection: map label → home focus area name for
  // labels that belong to another area but NOT this one (or globally).
  const foreignLabelHomeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const st of assignments) {
      if (st.focusAreaId == null) continue; // global — never foreign
      const sectionWing = focusAreas.find((w) => w.name === sectionName);
      if (sectionWing && st.focusAreaId === sectionWing.id) continue; // belongs here
      // Belongs to another area — check if there's a local or global definition
      const hasLocalOrGeneral = assignments.some((s) => {
        if (s.label !== st.label) return false;
        return s.focusAreaId == null || (sectionWing != null && s.focusAreaId === sectionWing.id);
      });
      if (!hasLocalOrGeneral) {
        const homeWing = focusAreas.find((w) => st.focusAreaId === w.id);
        const displayKey = isNameMode ? st.name || st.label : st.label;
        if (homeWing) map.set(displayKey, homeWing.name);
      }
    }
    return map;
  }, [assignments, sectionName, focusAreas, isNameMode]);

  const buildCellId = useCallback(
    (empId: string, dateKey: string): GridCellId => ({
      empId,
      dateKey,
      sectionId,
    }),
    [sectionId],
  );

  const triggerCellActivation = useCallback(
    (emp: Employee, date: Date, trigger: "click" | "keyboard") => {
      const dateKey = formatDateKey(date);
      const cellId = buildCellId(emp.id, dateKey);
      const cellKey = getGridCellKey(cellId);
      if (bulkDeleteMode) {
        if (bulkSelectableCellKeys?.has(cellKey) && onToggleBulkDeleteCell) {
          onToggleBulkDeleteCell(cellId);
        }
        return;
      }

      if (isCellInteractive) {
        handleCellClick(emp, date, sectionName, trigger);
      }
    },
    [
      buildCellId,
      bulkDeleteMode,
      bulkSelectableCellKeys,
      handleCellClick,
      isCellInteractive,
      onToggleBulkDeleteCell,
      sectionName,
    ],
  );

  const triggerCellContextMenu = useCallback(
    (
      event: React.MouseEvent | React.KeyboardEvent,
      anchorEl: HTMLElement,
      cellId: GridCellId,
      emp: Employee,
      date: Date,
    ) => {
      if (bulkDeleteMode) {
        event.preventDefault();
        return;
      }
      if (!onCellContextMenu || !isCellInteractive) return;
      event.preventDefault();
      onCellContextMenu(event, anchorEl, cellId, emp, date);
    },
    [bulkDeleteMode, isCellInteractive, onCellContextMenu],
  );

  if (employees.length === 0 && (!openShifts || openShifts.length === 0)) {
    return (
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: "var(--dg-fs-section-title)",
            fontWeight: 700,
            color: "var(--dg-color-text-primary)",
            padding: "10px 0 8px",
          }}
        >
          {sectionName}
        </div>
        <EmptyState size="inline" title="No staff assigned to this area." />
      </div>
    );
  }

  const gridTemplate = `var(--dg-grid-name-col-current, var(--dg-grid-name-col)) repeat(${weekDates.length}, minmax(var(--dg-grid-col-min-current, var(--dg-grid-col-min)), 1fr))`;
  const splitAtIndex = weekDates.length > 7 ? 7 : undefined;
  const isSplitDayDivider = (index: number) => splitAtIndex !== undefined && index === splitAtIndex;
  const getDayDividerColor = (index: number) =>
    isSplitDayDivider(index) ? "var(--dg-color-dark)" : "var(--dg-color-border-light)";

  const rowGrid: React.CSSProperties = {
    display: "grid",
    gridColumn: "1 / -1",
    gridTemplateColumns: "subgrid",
  };

  return (
    <div style={{ marginBottom: 24, marginTop: 8 }}>
      {/* Section label */}
      <div
        style={{
          fontSize: "var(--dg-fs-section-title)",
          fontWeight: 600,
          color: "var(--dg-color-text-primary)",
          marginBottom: 10,
          padding: "2px 0",
        }}
      >
        {sectionName}
      </div>

      <div
        style={{
          position: "relative",
          background: "var(--dg-color-surface)",
          borderRadius: "var(--dg-radius-md)",
          border: "1px solid var(--dg-color-border)",
          // Change chips intentionally cross the top edge of a shift pill.
          // The card cannot clip that layer; horizontal clipping belongs only
          // to the scrollable narrow-grid path below.
          overflow: fitToContainer ? "visible" : "hidden",
          boxShadow: BOX_SHADOW_CARD,
        }}
      >
        {!fitToContainer && canScrollRight && (
          <Button
            type="button"
            onClick={() => scrollDays("right")}
            aria-label={`Scroll ${sectionName} schedule right`}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              zIndex: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid var(--dg-color-brand)",
              background: "var(--dg-color-brand)",
              color: "var(--dg-color-text-inverse)",
              boxShadow: "0 8px 18px rgba(37, 99, 235, 0.32)",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            More days
            <ChevronRight size={12} strokeWidth={2.5} aria-hidden="true" />
          </Button>
        )}
        {!fitToContainer && canScrollLeft && (
          <Button
            type="button"
            onClick={() => scrollDays("left")}
            aria-label={`Scroll ${sectionName} schedule left`}
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid var(--dg-color-brand)",
              background: "var(--dg-color-brand)",
              color: "var(--dg-color-text-inverse)",
              boxShadow: "0 8px 18px rgba(37, 99, 235, 0.32)",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <ChevronLeft size={12} strokeWidth={2.5} aria-hidden="true" />
            Earlier days
          </Button>
        )}
        <div
          ref={scrollContainerRef}
          style={{
            // `overflow-x: hidden` also creates a vertical clipping context in
            // Chromium. At the fitted desktop width there is nothing to scroll,
            // so leave both axes visible and let the edge-overlaid chips paint
            // above the preceding row. The narrow scrollable grid still clips
            // horizontally as before.
            overflow: fitToContainer ? "visible" : "auto",
          }}
        >
          <div
            ref={gridRef}
            role="grid"
            aria-label={`${sectionName} schedule grid`}
            style={{
              position: "relative",
              // Own stacking context so cell z-indexes (incl. diff tint) stay
              // contained and never paint over the floating scroll buttons.
              zIndex: 0,
              display: "grid",
              gridTemplateColumns: gridTemplate,
              minWidth: fitToContainer ? undefined : "max-content",
              width: fitToContainer ? "100%" : undefined,
            }}
          >
            {/* Header row */}
            <div role="row" style={rowGrid}>
              <div
                role="columnheader"
                style={{
                  position: "sticky",
                  left: 0,
                  // Frozen name column: above all scrolling day cells (max 8).
                  zIndex: 10,
                  background: "var(--dg-color-bg)",
                  padding: "10px var(--dg-space-md)",
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 600,
                  color: "var(--dg-color-text-subtle)",
                  letterSpacing: "0.04em",
                  // The bottom divider is a background-image, not a box-shadow
                  // line, because Chromium clips box-shadow/border decorations
                  // on position:sticky elements at sub-100% browser zoom (see
                  // the same fix on the Open Shifts label cell below).
                  backgroundImage:
                    "linear-gradient(var(--dg-color-grid-divider-strong), var(--dg-color-grid-divider-strong))",
                  backgroundPosition: "0 100%",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "100% 1px",
                  boxShadow: joinBoxShadows(
                    "1px 0 0 0 var(--dg-color-border-light)",
                    "2px 0 4px rgba(0,0,0,0.02)",
                  ),
                }}
              >
                Staff
              </div>
              {weekDates.map((date, index) => {
                const key = formatDateKey(date);
                const isToday = key === todayKey;
                return (
                  <div
                    key={key}
                    role="columnheader"
                    className="dg-grid-slot dg-grid-slot--header"
                    data-leading-divider={
                      index === 0 ? "none" : isSplitDayDivider(index) ? "split" : "light"
                    }
                    data-week-split-start={isSplitDayDivider(index) ? "true" : undefined}
                    data-today={isToday ? "true" : undefined}
                    style={{
                      position: "relative",
                      zIndex: 2,
                      textAlign: "center",
                      padding: "8px 0",
                      // background-image (not box-shadow) so this lines up
                      // exactly with the Staff cell's bottom divider — a
                      // "0 1px 0 0" box-shadow draws 1px below the box's own
                      // edge, while this draws flush at it, so mixing the two
                      // techniques put them a pixel apart vertically.
                      backgroundImage:
                        "linear-gradient(var(--dg-color-grid-divider-strong), var(--dg-color-grid-divider-strong))",
                      backgroundPosition: "0 100%",
                      backgroundRepeat: "no-repeat",
                      backgroundSize: "100% 1px",
                    }}
                  >
                    <div className="dg-grid-slot__chrome" aria-hidden="true" />
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        color: isToday
                          ? "var(--dg-color-today-text)"
                          : "var(--dg-color-text-subtle)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {DAY_LABELS[date.getDay()]}
                    </div>
                    <div
                      style={{
                        fontSize: "var(--dg-fs-title)",
                        fontWeight: 700,
                        color: isToday
                          ? "var(--dg-color-today-text)"
                          : "var(--dg-color-text-secondary)",
                        lineHeight: "var(--dg-lh-tight)",
                        marginTop: 1,
                      }}
                    >
                      {date.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Open shifts row */}
            {openShifts && openShifts.length > 0 && (
              <div
                role="row"
                style={{
                  ...rowGrid,
                  background: "var(--dg-color-warning-bg, #FFF8E1)",
                  alignItems: "stretch",
                }}
              >
                {/* Label cell */}
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 10,
                    background: "var(--dg-color-warning-bg, #FFF8E1)",
                    display: "flex",
                    alignItems: "center",
                    alignSelf: "stretch",
                    padding: "6px 10px",
                    fontWeight: 700,
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--dg-color-warning-text, #92400E)",
                    gap: 6,
                    whiteSpace: "nowrap",
                    // A real border-bottom on this sticky cell gets clipped by
                    // Chromium at fractional browser zoom (90%, 110%, etc.) —
                    // match the day cells' background-image divider technique
                    // instead, which renders correctly at every zoom level.
                    backgroundImage:
                      "repeating-linear-gradient(to right, var(--dg-color-warning-border, #F59E0B) 0 6px, transparent 6px 10px)",
                    backgroundPosition: "0 100%",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "100% 2px",
                    boxShadow: "1px 0 0 0 var(--dg-color-border)",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                  Open Shifts
                  <span
                    style={{
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      background: "var(--dg-color-warning)",
                      color: "var(--dg-color-text-inverse)",
                      fontSize: "var(--dg-fs-badge)",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "0 5px",
                      lineHeight: 1,
                    }}
                  >
                    {openShifts.length}
                  </span>
                </div>
                {/* Date cells */}
                {weekDates.map((date, index) => {
                  const dateKey = formatDateKey(date);
                  const isToday = dateKey === todayKey;
                  const cellOpenShifts = openShifts.filter((os) => os.date === dateKey);
                  return (
                    <div
                      key={dateKey}
                      className="dg-grid-slot dg-grid-slot--open"
                      data-leading-divider={
                        index === 0 ? "none" : isSplitDayDivider(index) ? "split" : "light"
                      }
                      data-week-split-start={isSplitDayDivider(index) ? "true" : undefined}
                      data-today={isToday ? "true" : undefined}
                      data-bottom-divider="warning"
                      style={{
                        position: "relative",
                        padding: "6px",
                        display: "flex",
                        flexWrap: "wrap",
                        alignContent: "flex-start",
                        alignItems: "flex-start",
                        gap: 6,
                      }}
                    >
                      <div className="dg-grid-slot__chrome" aria-hidden="true" />
                      {cellOpenShifts.map((os) => {
                        const sc =
                          os.assignmentIds[0] != null
                            ? assignmentById.get(os.assignmentIds[0])
                            : undefined;
                        const scPill = sc
                          ? resolveShiftPillColors(
                              { color: sc.color, text: sc.text, border: sc.border },
                              isDarkTheme,
                            )
                          : null;
                        const displayParts = getDisplayPartsByIdOrLabel(
                          os.assignmentLabel,
                          os.assignmentIds[0],
                        );
                        const hasSecondaryLabel =
                          displayParts.secondaryLabel != null &&
                          displayParts.secondaryLabel.trim().length > 0;
                        const isMentoredOpenShift =
                          os.segments?.some((segment) => segment.isMentored === true) ?? false;
                        const needed = os.needed ?? 1;
                        // Viewers who see every open shift (schedulers/admins) but
                        // aren't personally eligible for this one get routed to a
                        // read-only details view on click, not the claim flow.
                        const openShiftHint = os.calledOffBy
                          ? `Called off by ${os.calledOffBy}`
                          : os.viewerEligible === false
                            ? `${needed} needed, click for details`
                            : `${needed} needed, click to volunteer`;
                        return (
                          <MaybeHint key={os.id} content={openShiftHint} side="top">
                            <Button
                              className="dg-open-shift-btn"
                              onClick={() => onClaimOpenShift?.(os)}
                              aria-label={openShiftHint}
                              style={{
                                position: "relative",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                                flex: colWidth < 92 ? "1 1 100%" : "1 1 72px",
                                width: colWidth < 92 ? "100%" : undefined,
                                maxWidth: "100%",
                                padding: hasSecondaryLabel ? "4px 8px" : "5px 8px",
                                minWidth: 0,
                                borderRadius: "var(--dg-radius-sm)",
                                border: `1.5px dashed ${scPill?.border ?? "var(--dg-color-warning-border, #F59E0B)"}`,
                                background: scPill?.color ?? "var(--dg-color-surface)",
                                color: scPill?.text ?? "var(--dg-color-warning-text, #92400E)",
                                fontSize: "var(--dg-fs-caption)",
                                fontWeight: 600,
                                cursor: "pointer",
                                lineHeight: 1.3,
                                overflow: "hidden",
                              }}
                            >
                              {isMentoredOpenShift ? <MentoredShiftBadge compact /> : null}
                              <span
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  gap: hasSecondaryLabel ? 1 : 0,
                                  minWidth: 0,
                                  maxWidth: "100%",
                                  overflow: "hidden",
                                }}
                              >
                                <span
                                  style={{
                                    maxWidth: "100%",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    fontWeight: 600,
                                    lineHeight: 1.1,
                                  }}
                                >
                                  {displayParts.primaryLabel}
                                </span>
                                {hasSecondaryLabel ? (
                                  <span
                                    style={{
                                      maxWidth: "100%",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      fontSize: "var(--dg-fs-footnote)",
                                      fontWeight: 700,
                                      lineHeight: 1.3,
                                      opacity: 0.78,
                                    }}
                                  >
                                    {displayParts.secondaryLabel}
                                  </span>
                                ) : null}
                              </span>
                              <span
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: "50%",
                                  background: scPill?.text ?? "var(--dg-color-warning)",
                                  color: scPill?.color ?? "var(--dg-color-text-inverse)",
                                  fontSize: "var(--dg-type-badge-size)",
                                  fontWeight: 600,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  lineHeight: 1,
                                  flexShrink: 0,
                                }}
                              >
                                {needed}
                              </span>
                            </Button>
                          </MaybeHint>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Employee rows */}
            {employees.map((emp, ri) => {
              const hasHighlightedSearch = !!(highlightEmpIds && highlightEmpIds.size > 0);
              const isHighlighted = hasHighlightedSearch
                ? (highlightEmpIds?.has(emp.id) ?? false)
                : true;
              const isCurrentUser = !!(emp.userId && currentUser && emp.userId === currentUser.id);
              const baseRowBg = isCurrentUser
                ? "var(--dg-color-today-bg)"
                : "var(--dg-color-surface)";
              const rowBg =
                hasHighlightedSearch && isHighlighted
                  ? isCurrentUser
                    ? "linear-gradient(90deg, var(--dg-color-brand-bg) 0%, var(--dg-color-today-bg) 100%)"
                    : "var(--dg-color-brand-bg)"
                  : baseRowBg;
              const certAbbr = getCertAbbr(emp.certificationId, certifications, true);
              const certificationName = getCertName(emp.certificationId, certifications);
              const roleAbbrs = getRoleAbbrs(emp.roleIds, orgRoles, true);
              const roleNames = getRoleAbbrs(emp.roleIds, orgRoles, false);
              const dc = DESIGNATION_COLORS[certAbbr] ?? DEFAULT_DESIG_COLOR;

              return (
                <div
                  key={emp.id}
                  role="row"
                  className="dg-row-enter"
                  data-search-highlight={hasHighlightedSearch && isHighlighted ? "true" : undefined}
                  style={{
                    ...rowGrid,
                    // A chip deliberately hangs into the row above its shift
                    // card. Give the whole staff row a layer above header and
                    // open-shift cells; a child z-index cannot escape a lower
                    // grid-item stacking context on its own.
                    position: "relative",
                    zIndex: 4,
                    background: rowBg,
                    opacity: isHighlighted ? 1 : 0.35,
                    transition: "opacity 150ms ease, background 150ms ease",
                    alignItems: "stretch",
                  }}
                >
                  {/* Name cell */}
                  <div
                    role="rowheader"
                    style={{
                      position: "sticky",
                      left: 0,
                      zIndex: 10,
                      background: rowBg,
                      padding: "7px var(--dg-space-md)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      minWidth: 0,
                      borderTop: ri > 0 ? "1px solid var(--dg-color-border-light)" : undefined,
                      boxShadow: joinBoxShadows(
                        hasHighlightedSearch && isHighlighted
                          ? "inset 4px 0 0 0 var(--dg-color-brand)"
                          : undefined,
                        "1px 0 0 0 var(--dg-color-border-light)",
                        "2px 0 4px rgba(0,0,0,0.02)",
                      ),
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        position: "relative",
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                      }}
                    >
                      <MaybeHint content={getEmployeeDisplayName(emp)} side="top">
                        <span
                          style={{
                            fontSize: "var(--dg-fs-body-sm)",
                            fontWeight: 600,
                            color:
                              hasHighlightedSearch && isHighlighted
                                ? "var(--dg-color-brand)"
                                : "var(--dg-color-text-secondary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            lineHeight: "var(--dg-lh-tight)",
                          }}
                        >
                          {getEmployeeDisplayName(emp)}
                        </span>
                      </MaybeHint>
                      {emp.roleIds.length > 0 && (
                        <EmployeeDetailHoverCard
                          employeeName={getEmployeeDisplayName(emp)}
                          certificationName={certificationName}
                          roleNames={roleNames}
                        >
                          <div style={{ minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: "var(--dg-fs-badge)",
                                color: "var(--dg-color-text-subtle)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                lineHeight: "var(--dg-lh-tight)",
                              }}
                            >
                              {roleAbbrs.join(", ")}
                            </span>
                          </div>
                        </EmployeeDetailHoverCard>
                      )}
                    </div>
                    {emp.certificationId != null && (
                      <EmployeeDetailHoverCard
                        employeeName={getEmployeeDisplayName(emp)}
                        certificationName={certificationName}
                        roleNames={roleNames}
                      >
                        <div style={{ flexShrink: 0 }}>
                          <span
                            style={{
                              fontSize: "var(--dg-fs-caption)",
                              fontWeight: 700,
                              background: dc.bg,
                              color: dc.text,
                              padding: "2px 7px",
                              borderRadius: 20,
                              whiteSpace: "nowrap",
                              letterSpacing: "0.01em",
                            }}
                          >
                            {certAbbr}
                          </span>
                        </div>
                      </EmployeeDetailHoverCard>
                    )}
                  </div>

                  {/* Shift cells */}
                  {(() => {
                    return weekDates.map((date, index) => {
                      const dateKey = formatDateKey(date);
                      const cellKey = `${emp.id}_${dateKey}`;
                      const isToday = dateKey === todayKey;
                      const shiftLabel = shiftForKey(emp.id, date);
                      const cellCodeIds = assignmentIdsForKey?.(emp.id, date) ?? [];
                      const cellSegments = segmentsForKey?.(emp.id, date) ?? [];
                      const draftKind = draftKindForKey?.(emp.id, date) ?? null;
                      const fromRecurring = fromRecurringForKey?.(emp.id, date) ?? false;
                      const publishDiff = publishDiffForKey?.(emp.id, date) ?? null;
                      const publishedMetadata =
                        publishedMetadataForKey?.(emp.id, date) ??
                        (publishDiff
                          ? {
                              publishedAt: publishDiff.publishedAt,
                              publishedBy: publishDiff.publishedBy,
                            }
                          : null);
                      const publicationLabel = publishedMetadata
                        ? formatPublishedMetadata({
                            ...publishedMetadata,
                            resolvePublisherName,
                          })
                        : null;
                      const publicationTimeZone = publishedMetadata?.timeZone ?? null;
                      const showsPublishDiff = !!(showPublishDiffOverlay && publishDiff);
                      const publishedLabel = publishedLabelForKey?.(emp.id, date) ?? null;
                      const publishedCodeIds = publishedAssignmentIdsForKey?.(emp.id, date) ?? [];
                      const publishedSegments = publishedSegmentsForKey?.(emp.id, date) ?? [];
                      const publishedCustomTimes =
                        getPublishedCustomShiftTimes?.(emp.id, date) ?? null;
                      const noteTypes =
                        activeIndicatorIdsForKey?.(emp.id, date, sectionFocusArea?.id) ?? [];
                      const customTimes = getCustomShiftTimes?.(emp.id, date) ?? null;
                      const cellEditor = cellEditors?.get(cellKey);
                      const hasPeerEditor = !!cellEditor;
                      const cellEditorTone = cellEditor
                        ? getAvatarTone(cellEditor.userId, isDarkTheme)
                        : null;
                      const auditName = createdByNameForKey?.(emp.id, date) ?? null;
                      const shouldShowAuthorName = !!auditName && (showAudit || !!draftKind);
                      const shouldComputeDraftDiff = !!draftKind && draftKind !== "deleted";
                      const showsDraftBadge = cellShowsDraftDiffBadge({ draftKind });
                      const currentAbsenceTypeId = absenceTypeIdForKey?.(emp.id, date) ?? null;
                      const publishedAbsenceTypeId =
                        publishedAbsenceTypeIdForKey?.(emp.id, date) ?? null;
                      const cellAbsenceType =
                        currentAbsenceTypeId != null
                          ? (absenceTypeMap?.get(currentAbsenceTypeId) ?? null)
                          : null;
                      const activeRequest = activeRequestForKey?.(emp.id, date) ?? null;
                      const activeRequestLabel = activeRequest
                        ? formatActiveRequestLabel(activeRequest)
                        : null;
                      const hoverDetailEntries: ShiftDetailEntry[] = cellAbsenceType
                        ? [
                            {
                              label: cellAbsenceType.name || cellAbsenceType.label,
                              jobName: null,
                              focusAreaName: sectionFocusArea?.name ?? null,
                              timeLabel: null,
                              isCustomTime: false,
                              isMentored: false,
                            },
                          ]
                        : cellCodeIds.map((assignmentId, entryIndex) => {
                            const assignment = assignmentById.get(assignmentId);
                            const category =
                              assignment?.categoryId != null
                                ? categoryById.get(assignment.categoryId)
                                : null;
                            const job =
                              assignment?.jobId != null ? jobById.get(assignment.jobId) : null;
                            const customTime =
                              customTimes?.perPill?.[entryIndex] ??
                              (entryIndex === 0 && !customTimes?.perPill ? customTimes : null);
                            const start =
                              customTime?.start ??
                              assignment?.defaultStartTime ??
                              category?.startTime ??
                              null;
                            const end =
                              customTime?.end ??
                              assignment?.defaultEndTime ??
                              category?.endTime ??
                              null;
                            const focusArea =
                              assignment?.focusAreaId != null
                                ? (focusAreas.find((area) => area.id === assignment.focusAreaId)
                                    ?.name ?? null)
                                : (sectionFocusArea?.name ?? null);
                            const isGeneralShift =
                              assignment?.isGeneral === true ||
                              (assignment?.focusAreaId == null &&
                                assignment?.shiftId == null &&
                                assignment?.categoryId == null);
                            const generalShiftName =
                              job?.name ??
                              assignment?.name ??
                              assignment?.label ??
                              shiftLabel?.split("/")[entryIndex] ??
                              "Shift";

                            return {
                              label:
                                (isGeneralShift ? generalShiftName : null) ??
                                category?.name ??
                                assignment?.name ??
                                assignment?.label ??
                                shiftLabel?.split("/")[entryIndex] ??
                                "Shift",
                              jobName: isGeneralShift ? "General shift" : (job?.name ?? null),
                              focusAreaName: focusArea,
                              timeLabel: start && end ? `${fmt12h(start)} - ${fmt12h(end)}` : null,
                              isCustomTime: !!customTime,
                              isMentored: cellSegments[entryIndex]?.isMentored ?? false,
                            };
                          });
                      const hoverIndicatorNames = indicatorTypes
                        .filter((indicator) => noteTypes.includes(indicator.id))
                        .map((indicator) => indicator.name);
                      const hoverStatus = draftKind
                        ? draftKind === "new"
                          ? "Draft new"
                          : draftKind === "modified"
                            ? "Draft changes"
                            : "Marked for deletion"
                        : showsPublishDiff
                          ? "Recently published change"
                          : null;
                      // The lock avatar outranks everything else in the top-right
                      // corner: it is the only mark that explains why a cell will
                      // not open. Everything else there starts past it.
                      const cornerLockClearance = hasPeerEditor ? LOCK_CORNER_CLEARANCE : 0;

                      const showDiffCellTint = !!draftKind || showsPublishDiff;
                      // The row above paints its own bottom stroke inside its
                      // own box — the header cells and the open-shifts row both
                      // do it with a background-image at their bottom edge. Row
                      // 0 must not repaint that stroke or the two stack and
                      // content cells read thicker than their empty neighbours.
                      const topDivider = ri > 0 ? "light" : undefined;
                      const cellId = buildCellId(emp.id, dateKey);
                      const bulkCellKey = getGridCellKey(cellId);
                      const isBulkSelectable =
                        bulkDeleteMode && !!bulkSelectableCellKeys?.has(bulkCellKey);
                      const isBulkSelected =
                        bulkDeleteMode && !!bulkSelectedCellKeys?.has(bulkCellKey);
                      const isActiveCell = areGridCellIdsEqual(activeCellId, cellId);
                      const hasDraggableEntry =
                        canDragShifts &&
                        !bulkDeleteMode &&
                        !!shiftLabel &&
                        shiftLabel !== "OFF" &&
                        draftKind !== "deleted";
                      const firstStyle = hasDraggableEntry
                        ? getStyleByIdOrLabel(shiftLabel.split("/")[0], cellCodeIds[0])
                        : null;
                      const leadingDividerInset = index === 0 ? 0 : 1;
                      // Only the cell's own top divider eats into its box. The
                      // header/open-shifts stroke above row 0 lives in that
                      // row's box, so row 0 needs no inset and its pills line up
                      // with every other row's.
                      const topDividerInset = ri > 0 ? 1 : 0;
                      const insetFromVisibleCellLeft = (base: number) =>
                        `${base + leadingDividerInset}px`;
                      const insetFromVisibleCellTop = (base: number) =>
                        `${base + topDividerInset}px`;

                      return (
                        <DroppableCell
                          key={dateKey}
                          id={`drop_${emp.id}_${dateKey}_${sectionName}`}
                          data={{
                            cellId,
                          }}
                          disabled={!isCellInteractive || bulkDeleteMode}
                          className="dg-grid-cell"
                          role="gridcell"
                          aria-label={
                            shiftLabel && shiftLabel !== "OFF"
                              ? `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[date.getDay()]} ${date.getDate()}: ${shiftLabel}${isBulkSelected ? ", selected for removal" : ""}`
                              : `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[date.getDay()]} ${date.getDate()}: empty`
                          }
                          aria-selected={bulkDeleteMode ? isBulkSelected : undefined}
                          tabIndex={isCellInteractive || isBulkSelectable ? 0 : -1}
                          data-emp-id={emp.id}
                          data-date-key={dateKey}
                          data-section-id={sectionId}
                          data-interactive={isCellInteractive ? "true" : "false"}
                          data-peer-editing={hasPeerEditor ? "true" : "false"}
                          data-empty={!shiftLabel || shiftLabel === "OFF" ? "true" : "false"}
                          data-slot="cell"
                          data-leading-divider={
                            index === 0 ? "none" : isSplitDayDivider(index) ? "split" : "light"
                          }
                          data-week-split-start={isSplitDayDivider(index) ? "true" : undefined}
                          data-today={isToday ? "true" : undefined}
                          data-top-divider={topDivider}
                          data-active={isActiveCell ? "true" : undefined}
                          data-bulk-mode={bulkDeleteMode ? "true" : undefined}
                          data-bulk-selectable={isBulkSelectable ? "true" : undefined}
                          data-bulk-selected={isBulkSelected ? "true" : undefined}
                          style={{
                            height: "var(--dg-grid-cell-height)",
                            background: isBulkSelected
                              ? "var(--dg-color-brand-bg)"
                              : showDiffCellTint
                                ? rowBg
                                : undefined,
                            zIndex: showDiffCellTint ? 8 : ri === 0 ? 5 : undefined,
                          }}
                          onFocus={() => onCellFocus?.(cellId)}
                          onMouseEnter={() => onCellHover?.(cellId)}
                          onClick={() => triggerCellActivation(emp, date, "click")}
                          onContextMenu={(event) =>
                            triggerCellContextMenu(event, event.currentTarget, cellId, emp, date)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              triggerCellActivation(emp, date, "keyboard");
                            }
                            if (event.shiftKey && event.key === "F10") {
                              triggerCellContextMenu(event, event.currentTarget, cellId, emp, date);
                            }
                          }}
                        >
                          <div
                            className="dg-grid-cell__content"
                            style={{
                              zIndex: showDiffCellTint ? 4 : undefined,
                              overflow: "visible",
                            }}
                          >
                            {isBulkSelected && (
                              <span
                                className="dg-grid-cell__bulk-selected-indicator"
                                data-bulk-selection-indicator="true"
                                aria-hidden="true"
                              >
                                -
                              </span>
                            )}
                            {shiftLabel && shiftLabel !== "OFF" ? (
                              <DraggableShift
                                id={`drag_${emp.id}_${dateKey}_${sectionName}`}
                                data={{
                                  cellId,
                                  label: shiftLabel,
                                  payload: {
                                    kind: currentAbsenceTypeId != null ? "absence" : "worked",
                                    segments:
                                      currentAbsenceTypeId != null
                                        ? []
                                        : (cellSegments.length > 0
                                            ? cellSegments
                                            : cellCodeIds.map((assignmentId, position) => {
                                                const assignment = assignmentById.get(assignmentId);
                                                if (assignment?.jobId == null) {
                                                  return null;
                                                }
                                                return {
                                                  shiftId:
                                                    assignment.shiftId ??
                                                    assignment.categoryId ??
                                                    null,
                                                  jobId: assignment.jobId,
                                                  position,
                                                  isMentored: false,
                                                };
                                              })
                                          )
                                            .map((segment, position) => {
                                              if (!segment) return null;
                                              const assignmentId = assignmentIdByPair.get(
                                                buildShiftJobPairKey(
                                                  segment.shiftId ?? null,
                                                  segment.jobId,
                                                ),
                                              );
                                              const assignment =
                                                assignmentId == null
                                                  ? null
                                                  : assignmentById.get(assignmentId);
                                              return {
                                                shiftId:
                                                  segment.shiftId ??
                                                  assignment?.shiftId ??
                                                  assignment?.categoryId ??
                                                  null,
                                                jobId: segment.jobId,
                                                position: segment.position ?? position,
                                                isMentored: segment.isMentored ?? false,
                                              };
                                            })
                                            .filter(
                                              (
                                                segment,
                                              ): segment is {
                                                shiftId: number | null;
                                                jobId: number;
                                                position: number;
                                                isMentored: boolean;
                                              } => segment != null,
                                            ),
                                    absenceTypeId: currentAbsenceTypeId,
                                    customStartTime: customTimes?.start ?? null,
                                    customEndTime: customTimes?.end ?? null,
                                    seriesId: null,
                                    fromRecurring: false,
                                  },
                                  pillColor:
                                    cellAbsenceType?.color ??
                                    firstStyle?.color ??
                                    "var(--dg-color-bg)",
                                  pillText:
                                    cellAbsenceType?.text ??
                                    firstStyle?.text ??
                                    "var(--dg-color-text-muted)",
                                }}
                                disabled={!hasDraggableEntry}
                              >
                                {(() => {
                                  // "/" joins the segments of a worked cell,
                                  // so it is what splits that cell into pills.
                                  // An absence is a single pill whose label is
                                  // whatever the org named it — splitting one
                                  // called "PTO/Flex" tore it into two pills
                                  // that then resolved against the assignment
                                  // list and rendered someone else's label.
                                  const labels = cellAbsenceType
                                    ? [shiftLabel]
                                    : shiftLabel.split("/");
                                  // A first publication is the baseline. The
                                  // page client normally filters it already,
                                  // but keep the grid safe for direct callers
                                  // and historical test fixtures as well.
                                  const isMeaningfulPublishNew =
                                    publishDiff?.kind !== "new" ||
                                    publishDiff.isNewAddition !== false;
                                  const isPubDiff =
                                    showsPublishDiff && isMeaningfulPublishNew ? publishDiff : null;
                                  const publishFrom =
                                    publishDiff?.from ??
                                    assignmentIdsFromPublishState(
                                      publishDiff?.fromState,
                                      publishedAssignmentIdByPair,
                                    );
                                  const publishTo =
                                    publishDiff?.to ??
                                    assignmentIdsFromPublishState(
                                      publishDiff?.toState,
                                      publishedAssignmentIdByPair,
                                    );
                                  const currentShiftLabels = splitShiftLabelParts(shiftLabel);
                                  const publishedShiftLabels = splitShiftLabelParts(publishedLabel);
                                  // Persisted segment snapshots carry stable IDs, not presentation
                                  // labels. Treat an absent label as absent — passing `?` here masks
                                  // the current/published label fallback and produced `Added ?`.
                                  const snapshotLabels = (
                                    segments: PublishChange["fromSegments"],
                                  ): Array<string | null> | undefined => {
                                    const labels = segments?.map((segment) => {
                                      const label = (segment as { label?: unknown }).label;
                                      return typeof label === "string" && label.trim()
                                        ? label
                                        : null;
                                    });
                                    return labels?.some((label) => label != null)
                                      ? labels
                                      : undefined;
                                  };
                                  const resolveGridShiftLabel = (assignmentId: number) => {
                                    const assignmentEntry = assignmentById.get(assignmentId);
                                    if (!assignmentEntry) return "?";
                                    return isNameMode
                                      ? assignmentEntry.name || assignmentEntry.label
                                      : assignmentEntry.label;
                                  };
                                  const resolveGridAbsenceLabel = (absenceTypeId: number) => {
                                    const absenceType = absenceTypeMap?.get(absenceTypeId);
                                    if (!absenceType) return "?";
                                    return isNameMode
                                      ? absenceType.name || absenceType.label
                                      : absenceType.label;
                                  };
                                  // History is explanatory, not compact grid chrome. Always spell
                                  // out both the shift and job so `Was …` remains meaningful when
                                  // the grid is configured to show short codes.
                                  const resolveHistoryShiftLabel = (assignmentId: number) => {
                                    const assignmentEntry = assignmentById.get(assignmentId);
                                    if (!assignmentEntry) return "?";
                                    const category =
                                      assignmentEntry.categoryId != null
                                        ? categoryById.get(assignmentEntry.categoryId)
                                        : null;
                                    const job =
                                      assignmentEntry.jobId != null
                                        ? jobById.get(assignmentEntry.jobId)
                                        : null;
                                    const isGeneral =
                                      assignmentEntry.isGeneral === true ||
                                      (assignmentEntry.focusAreaId == null &&
                                        assignmentEntry.shiftId == null &&
                                        assignmentEntry.categoryId == null);
                                    const shiftName = isGeneral
                                      ? (job?.name ?? assignmentEntry.name ?? assignmentEntry.label)
                                      : (assignmentEntry.name ??
                                        category?.name ??
                                        assignmentEntry.label);
                                    const shiftNameAlreadyIncludesJob =
                                      !!job?.name &&
                                      shiftName
                                        .toLocaleLowerCase()
                                        .includes(job.name.toLocaleLowerCase());
                                    return !isGeneral && job?.name && !shiftNameAlreadyIncludesJob
                                      ? `${shiftName} · ${job.name}`
                                      : shiftName;
                                  };
                                  const currentHistoryLabels =
                                    cellCodeIds.map(resolveHistoryShiftLabel);
                                  const publishedHistoryLabels =
                                    publishFrom.map(resolveHistoryShiftLabel);
                                  const draftDiff = shouldComputeDraftDiff
                                    ? buildShiftDiffDescriptors({
                                        before: {
                                          assignmentIds: publishedCodeIds,
                                          absenceTypeId: publishedAbsenceTypeId,
                                          isMentoredFlags: publishedSegments.map(
                                            (segment) => segment.isMentored ?? false,
                                          ),
                                          timeRanges: timeRangesFromCustomTimes({
                                            customTimes: publishedCustomTimes,
                                            count: publishedCodeIds.length,
                                          }),
                                        },
                                        after: {
                                          assignmentIds: cellCodeIds,
                                          absenceTypeId: currentAbsenceTypeId,
                                          isMentoredFlags: cellSegments.map(
                                            (segment) => segment.isMentored ?? false,
                                          ),
                                          timeRanges: timeRangesFromCustomTimes({
                                            customTimes,
                                            count: cellCodeIds.length,
                                          }),
                                        },
                                        beforeShiftLabels: publishedShiftLabels,
                                        afterShiftLabels: currentShiftLabels,
                                        resolveAssignmentDefinitionLabel: resolveGridShiftLabel,
                                        resolveAbsenceLabel: resolveGridAbsenceLabel,
                                      })
                                    : null;
                                  const publishDiffSummary = isPubDiff
                                    ? buildShiftDiffDescriptors({
                                        before: {
                                          assignmentIds: publishFrom,
                                          absenceTypeId:
                                            publishDiff!.fromAbsenceTypeId ??
                                            absenceTypeIdFromPublishState(publishDiff?.fromState),
                                          timeRanges: timeRangesFromPublishState(
                                            publishDiff?.fromState,
                                            publishDiff?.fromCustomStart,
                                            publishDiff?.fromCustomEnd,
                                            publishFrom.length,
                                          ),
                                        },
                                        after: {
                                          assignmentIds: publishTo,
                                          absenceTypeId:
                                            publishDiff!.toAbsenceTypeId ??
                                            absenceTypeIdFromPublishState(publishDiff?.toState),
                                          timeRanges: timeRangesFromPublishState(
                                            publishDiff?.toState,
                                            publishDiff?.toCustomStart,
                                            publishDiff?.toCustomEnd,
                                            publishTo.length,
                                          ),
                                        },
                                        beforeShiftLabels:
                                          snapshotLabels(publishDiff?.fromSegments) ??
                                          publishedHistoryLabels ??
                                          publishedShiftLabels,
                                        afterShiftLabels:
                                          snapshotLabels(publishDiff?.toSegments) ??
                                          currentHistoryLabels ??
                                          currentShiftLabels,
                                        resolveAssignmentDefinitionLabel: resolveHistoryShiftLabel,
                                        resolveAbsenceLabel: (absenceTypeId) =>
                                          absenceTypeMap?.get(absenceTypeId)?.name ?? "?",
                                      })
                                    : null;

                                  const publishCellBadge = isPubDiff
                                    ? (cellLevelDiffBadge(publishDiffSummary) ??
                                      (publishDiffSummary?.cellBadge?.kind === "new" &&
                                      publishDiff?.isNewAddition !== false
                                        ? publishDiffSummary.cellBadge
                                        : null))
                                    : null;
                                  const publishBadge: GridDiffBadgeConfig | null = publishCellBadge
                                    ? {
                                        source: "publish",
                                        kind: publishCellBadge.kind,
                                        text: publishCellBadge.text,
                                        tooltip: buildPublishTooltip({
                                          publishDiff: publishDiff!,
                                          resolvePublisherName,
                                          detail: publishCellBadge.detail,
                                          timeZone: publicationTimeZone,
                                        }),
                                      }
                                    : null;
                                  // An absence produces no pill diffs — pills
                                  // are keyed off after-side assignment ids,
                                  // which an absence has none of — so its ring
                                  // has to come from the cell-level diff. The
                                  // badge above already carries the text for
                                  // that case; this only fills in a ring the
                                  // badge itself doesn't imply (a plain "New").
                                  const publishRingKind: ShiftDiffBorderKind =
                                    publishBadge?.kind === "new" ||
                                    publishBadge?.kind === "modified"
                                      ? publishBadge.kind
                                      : isPubDiff &&
                                          publishDiffSummary &&
                                          publishDiffSummary.pillDiffs.length === 0 &&
                                          (publishDiffSummary.cellBadge?.kind === "new" ||
                                            publishDiffSummary.cellBadge?.kind === "modified")
                                        ? publishDiffSummary.cellBadge.kind
                                        : null;

                                  const draftCellBadge = showsDraftBadge
                                    ? cellLevelDiffBadge(draftDiff)
                                    : null;
                                  const draftBadge: GridDiffBadgeConfig | null = draftCellBadge
                                    ? {
                                        source: "draft",
                                        kind: draftCellBadge.kind,
                                        text: draftCellBadge.text,
                                        tooltip: draftCellBadge.detail,
                                      }
                                    : null;

                                  const buildPillBadge = (args: {
                                    source: "publish" | "draft";
                                    descriptor: ShiftDiffBadgeDescriptor | null | undefined;
                                  }): GridDiffBadgeConfig | null => {
                                    const { source, descriptor } = args;
                                    if (
                                      !descriptor ||
                                      (descriptor.kind === "new" &&
                                        (source === "draft" ||
                                          publishDiff?.isNewAddition === false))
                                    ) {
                                      return null;
                                    }

                                    return {
                                      source,
                                      kind: descriptor.kind,
                                      text: descriptor.text,
                                      tooltip:
                                        source === "publish" && publishDiff
                                          ? buildPublishTooltip({
                                              publishDiff,
                                              resolvePublisherName,
                                              detail: descriptor.detail,
                                              timeZone: publicationTimeZone,
                                            })
                                          : descriptor.detail,
                                    };
                                  };

                                  if (labels.length === 1) {
                                    const label = labels[0];
                                    const isAbsence = cellAbsenceType != null;
                                    const style = isAbsence
                                      ? {
                                          ...getStyleByIdOrLabel(label, cellCodeIds[0]),
                                          color: cellAbsenceType!.color,
                                          text: cellAbsenceType!.text,
                                        }
                                      : getStyleByIdOrLabel(label, cellCodeIds[0]);
                                    const darkPillStyle = isDarkTheme
                                      ? toDarkPillColors(style.color)
                                      : null;
                                    const effectiveColor = darkPillStyle?.bg ?? style.color;
                                    const effectiveText = darkPillStyle?.text ?? style.text;
                                    const codeEntry0 =
                                      cellCodeIds[0] != null
                                        ? assignmentById.get(cellCodeIds[0])
                                        : undefined;
                                    const cat0 =
                                      codeEntry0?.categoryId != null
                                        ? categoryById.get(codeEntry0.categoryId)
                                        : undefined;
                                    const isOvernight =
                                      !isAbsence &&
                                      isOvernightTimes(
                                        customTimes?.start ??
                                          codeEntry0?.defaultStartTime ??
                                          cat0?.startTime,
                                        customTimes?.end ??
                                          codeEntry0?.defaultEndTime ??
                                          cat0?.endTime,
                                      );
                                    const isCross =
                                      !isAbsence &&
                                      label !== "X" &&
                                      codeEntry0?.focusAreaId != null &&
                                      sectionFocusArea != null &&
                                      codeEntry0.focusAreaId !== sectionFocusArea.id;
                                    const displayParts = isAbsence
                                      ? {
                                          primaryLabel: label,
                                          secondaryLabel: null,
                                        }
                                      : getDisplayPartsByIdOrLabel(label, cellCodeIds[0]);
                                    const crossHomeFa = isCross
                                      ? focusAreas.find((fa) => fa.id === codeEntry0!.focusAreaId)
                                      : undefined;
                                    const singleDraftDiffBorderKind: ShiftDiffBorderKind =
                                      draftDiff?.pillDiffs[0]?.borderKind ??
                                      (draftKind === "new" || draftKind === "modified"
                                        ? draftKind
                                        : null);
                                    const singleDraftBorderKind: DraftKind =
                                      singleDraftDiffBorderKind ?? draftKind;
                                    const singlePublishRingKind =
                                      publishDiffSummary?.pillDiffs[0]?.borderKind ??
                                      publishRingKind;
                                    const singleAuthorLeftInset = 5 + leadingDividerInset;
                                    const singleAuthorBottomInset = (customTimes ? 3 : 4) + 1;
                                    const singleUsesShiftColor = shouldUseShiftColorForDiffState({
                                      isCross,
                                    });
                                    const singleForegroundColor = singleUsesShiftColor
                                      ? effectiveText
                                      : getReadableTextOnSurface(
                                          effectiveColor,
                                          effectiveText,
                                          themeSurface,
                                        );
                                    // Compute effective border: draft indicators use dashed border.
                                    // Absence pills derive theirs from the resolved text like every
                                    // other pill — their stored border is the "transparent"
                                    // sentinel, which would render as no border at all in light mode.
                                    const absenceBorder = isAbsence
                                      ? `1px solid ${isDarkTheme ? borderColor(effectiveText) : visiblePillBorder(cellAbsenceType!.border, singleForegroundColor)}`
                                      : `1px solid ${borderColor(singleForegroundColor)}`;
                                    const effectiveBorder = singleDraftBorderKind
                                      ? getDraftBorder(singleDraftBorderKind, absenceBorder)
                                      : absenceBorder;
                                    const singlePillBadge =
                                      (showsDraftBadge &&
                                      (draftBadge == null || draftBadge.text === "Changed")
                                        ? buildPillBadge({
                                            source: "draft",
                                            descriptor: draftDiff?.pillDiffs[0]?.badge,
                                          })
                                        : null) ??
                                      (publishBadge == null || publishBadge.text === "Changed"
                                        ? buildPillBadge({
                                            source: "publish",
                                            descriptor: publishDiffSummary?.pillDiffs[0]?.badge,
                                          })
                                        : null);
                                    // A cell-level badge is still rendered inside this card (for
                                    // example, when the second segment of a former double shift
                                    // was removed). It must be treated as a foreground overlay too;
                                    // otherwise the card's own `overflow: hidden` cuts the chip in
                                    // half at exactly the top edge it is meant to straddle.
                                    const singleHasChangeBadge = !!(
                                      singlePillBadge ||
                                      draftBadge ||
                                      publishBadge
                                    );
                                    const singleHoverChangeDetails = Array.from(
                                      new Set(
                                        [
                                          singlePillBadge?.tooltip,
                                          draftBadge?.tooltip,
                                          publishBadge?.tooltip,
                                        ].filter((detail): detail is string => !!detail),
                                      ),
                                    );
                                    // A change chip is an overlay, never a
                                    // layout reservation: active pills keep
                                    // their normal height and vertical origin.
                                    const singleTopInset = customTimes ? 3 : 4;
                                    const singleSideInset = 4;
                                    const singleBottomInset = customTimes ? 3 : 4;
                                    const singleCrossFocusPill =
                                      isCross && crossHomeFa ? crossHomeFa : null;
                                    // The focus wing sits inside the pill's border, so its curve
                                    // uses the inner radius. Matching the outer radius left a
                                    // hairline wedge of the pill showing at each corner.
                                    const singleCrossFocusWingRadius =
                                      SINGLE_SHIFT_PILL_RADIUS - (singleDraftBorderKind ? 2 : 1);
                                    const singleCrossFocusPalette = getCrossFocusBadgePalette({
                                      color: effectiveColor,
                                      text: effectiveText,
                                    });
                                    const showSingleSecondaryLine = !!displayParts.secondaryLabel;
                                    // Name mode spells shift and job out, so each item earns its
                                    // own row; when a custom time joins them the stack steps down
                                    // a size to fit three rows in the 52px cell. Code mode's
                                    // labels are a character or two, so a row each would waste
                                    // the pill: shift and job always share a line there,
                                    // separated by a middot, at their full size.
                                    const singleIsThreeRow =
                                      showSingleSecondaryLine && !!customTimes && isNameMode;
                                    const singleInlinesSecondary =
                                      showSingleSecondaryLine && !isNameMode;
                                    const singleDisplayLabel = displayParts.primaryLabel;
                                    const singleIsMentored =
                                      !isAbsence && (cellSegments[0]?.isMentored ?? false);
                                    return (
                                      <>
                                        {isBulkSelected && (
                                          <span
                                            className="dg-grid-cell__bulk-selection-ring"
                                            data-bulk-selection-ring="true"
                                            aria-hidden="true"
                                            style={getBulkSelectionRingStyle({
                                              topInset: singleTopInset,
                                              rightInset: singleSideInset,
                                              bottomInset: singleBottomInset,
                                              leftInset: singleSideInset,
                                              topDividerInset,
                                              leadingDividerInset,
                                              pillRadius: SINGLE_SHIFT_PILL_RADIUS,
                                            })}
                                          />
                                        )}
                                        <ShiftDetailHoverCard
                                          enabled={showShiftDetailHoverCards}
                                          employeeName={getEmployeeDisplayName(emp)}
                                          date={date}
                                          entries={hoverDetailEntries}
                                          indicators={hoverIndicatorNames}
                                          requestLabel={activeRequestLabel}
                                          status={hoverStatus}
                                          changeDetails={singleHoverChangeDetails}
                                          publicationLabel={publicationLabel}
                                        >
                                          <div
                                            data-shift-pill="single"
                                            style={{
                                              position: "absolute",
                                              top: insetFromVisibleCellTop(singleTopInset),
                                              right: `${singleSideInset}px`,
                                              bottom: `${singleBottomInset}px`,
                                              left: insetFromVisibleCellLeft(singleSideInset),
                                              background: singleUsesShiftColor
                                                ? effectiveColor
                                                : "var(--dg-color-surface)",
                                              opacity: draftKind === "deleted" ? 0.5 : 1,
                                              border: effectiveBorder,
                                              borderRadius: SINGLE_SHIFT_PILL_RADIUS,
                                              color: singleForegroundColor,
                                              zIndex: singleHasChangeBadge ? 2 : 1,
                                              boxShadow:
                                                singlePublishRingKind === "new" ||
                                                singlePublishRingKind === "modified"
                                                  ? getPublishDiffRing(
                                                      singlePublishRingKind,
                                                      borderColor(singleForegroundColor),
                                                    )
                                                  : "none",
                                              cursor: "pointer",
                                              display: "flex",
                                              flexDirection: "column",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              padding: isNameMode ? "2px 6px" : "2px 3px",
                                              paddingTop: 2,
                                              paddingLeft: singleCrossFocusPill
                                                ? SINGLE_CROSS_FOCUS_CONTENT_LEFT_PADDING
                                                : isNameMode
                                                  ? 6
                                                  : 3,
                                              paddingRight: isNameMode ? 6 : 3,
                                              overflow: singleHasChangeBadge ? "visible" : "hidden",
                                              textDecoration:
                                                draftKind === "deleted" ? "line-through" : "none",
                                            }}
                                          >
                                            {activeRequest && activeRequestLabel && (
                                              <RequestCornerFold
                                                status={activeRequest.status}
                                                label={activeRequestLabel}
                                              />
                                            )}
                                            {singlePillBadge && (
                                              <GridDiffBadge
                                                badge={{
                                                  ...singlePillBadge,
                                                  // Every status chip overlaps the same top-left
                                                  // pill edge. It is a paint-only overlay: the
                                                  // active pill remains in its normal grid slot.
                                                  topOffset: 0,
                                                  leftOffset: 4,
                                                  overlapPillEdge: true,
                                                  showChangeTooltip: !showShiftDetailHoverCards,
                                                }}
                                              />
                                            )}
                                            {singleCrossFocusPill && (
                                              <span
                                                style={{
                                                  position: "absolute",
                                                  // The focus wing is part of the
                                                  // pill, not a smaller chip. It
                                                  // keeps the parent corner curve
                                                  // while a change badge overlaps it.
                                                  top: 0,
                                                  bottom: 0,
                                                  left: 0,
                                                  display: "flex",
                                                  alignItems: "center",
                                                  fontSize: "var(--dg-fs-footnote)",
                                                  fontWeight: 600,
                                                  lineHeight: 1,
                                                  background: singleCrossFocusPalette.background,
                                                  color: singleCrossFocusPalette.color,
                                                  borderRadius: `${singleCrossFocusWingRadius}px 0 0 ${singleCrossFocusWingRadius}px`,
                                                  padding: "0 3px",
                                                  letterSpacing: "0.02em",
                                                  pointerEvents: "none",
                                                }}
                                              >
                                                {getFocusAreaInitials(singleCrossFocusPill.name)}
                                              </span>
                                            )}
                                            {singleIsMentored && (
                                              <MentoredShiftBadge
                                                rightInset={cornerLockClearance || undefined}
                                                topInset={singlePillBadge ? 19 : undefined}
                                              />
                                            )}
                                            <div
                                              style={{
                                                display: "flex",
                                                flexDirection: singleInlinesSecondary
                                                  ? "row"
                                                  : "column",
                                                // Inline, the job code sits on the shift code's
                                                // baseline rather than floating at its optical
                                                // centre, which reads as one label instead of two.
                                                alignItems: singleInlinesSecondary
                                                  ? "baseline"
                                                  : "center",
                                                justifyContent: "center",
                                                flexWrap: "nowrap",
                                                gap: singleInlinesSecondary
                                                  ? 2
                                                  : showSingleSecondaryLine
                                                    ? 1
                                                    : 0,
                                                maxWidth: "100%",
                                                minWidth: 0,
                                                overflow: "hidden",
                                              }}
                                            >
                                              <span
                                                style={
                                                  isNameMode
                                                    ? {
                                                        fontSize: "var(--dg-fs-caption)",
                                                        fontWeight: 600,
                                                        lineHeight: singleIsThreeRow ? 1.15 : 1.2,
                                                        textAlign: "center" as const,
                                                        maxWidth: "100%",
                                                        overflowWrap: "break-word" as const,
                                                        display: "-webkit-box",
                                                        WebkitBoxOrient: "vertical" as const,
                                                        WebkitLineClamp: showSingleSecondaryLine
                                                          ? 1
                                                          : customTimes
                                                            ? 1
                                                            : 2,
                                                        overflow: "hidden",
                                                      }
                                                    : {
                                                        fontSize: "var(--dg-fs-title)",
                                                        fontWeight: 600,
                                                        lineHeight: 1.2,
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        maxWidth: "100%",
                                                        minWidth: 0,
                                                      }
                                                }
                                              >
                                                {singleDisplayLabel}
                                                {!customTimes && isOvernight && (
                                                  <sup
                                                    style={{
                                                      fontSize: "0.5em",
                                                      fontWeight: 700,
                                                      opacity: 0.5,
                                                      marginLeft: 1,
                                                    }}
                                                  >
                                                    +1
                                                  </sup>
                                                )}
                                              </span>
                                              {singleInlinesSecondary && (
                                                <span
                                                  aria-hidden="true"
                                                  style={{
                                                    fontSize: "var(--dg-fs-footnote)",
                                                    fontWeight: 700,
                                                    lineHeight: 1.3,
                                                    opacity: 0.5,
                                                    flexShrink: 0,
                                                  }}
                                                >
                                                  ·
                                                </span>
                                              )}
                                              {showSingleSecondaryLine ? (
                                                <span
                                                  style={{
                                                    fontSize: singleIsThreeRow
                                                      ? "var(--dg-fs-micro)"
                                                      : "var(--dg-fs-footnote)",
                                                    fontWeight: 700,
                                                    lineHeight: singleIsThreeRow ? 1.2 : 1.3,
                                                    opacity: 0.78,
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    maxWidth: "100%",
                                                    minWidth: 0,
                                                  }}
                                                >
                                                  {displayParts.secondaryLabel}
                                                </span>
                                              ) : null}
                                            </div>
                                            {customTimes && (
                                              <span
                                                style={{
                                                  fontSize: singleIsThreeRow
                                                    ? "var(--dg-fs-micro)"
                                                    : "var(--dg-fs-footnote)",
                                                  fontWeight: 500,
                                                  lineHeight: 1,
                                                  marginTop: singleIsThreeRow ? 2 : 4,
                                                  opacity: 0.7,
                                                  letterSpacing: "0.02em",
                                                }}
                                              >
                                                {fmt12hShort(customTimes.start)}–
                                                {fmt12hShort(customTimes.end)}
                                                {isOvernight && (
                                                  <sup
                                                    style={{
                                                      fontSize: "0.7em",
                                                      fontWeight: 700,
                                                      marginLeft: 1,
                                                      opacity: 1,
                                                    }}
                                                  >
                                                    +1
                                                  </sup>
                                                )}
                                              </span>
                                            )}
                                            {noteTypes.length > 0 && (
                                              <div
                                                style={{
                                                  position: "absolute",
                                                  bottom: shouldShowAuthorName ? 18 : 3,
                                                  right: 4,
                                                  display: "flex",
                                                  gap: 2,
                                                }}
                                              >
                                                {indicatorTypes
                                                  .filter((ind) => noteTypes.includes(ind.id))
                                                  .map((ind) => (
                                                    <MaybeHint
                                                      key={ind.name}
                                                      content={ind.name}
                                                      side="top"
                                                    >
                                                      <div
                                                        style={{
                                                          width: 10,
                                                          height: 10,
                                                          borderRadius: "50%",
                                                          background: ind.color,
                                                          border:
                                                            "1.5px solid rgba(255,255,255,0.9)",
                                                          flexShrink: 0,
                                                        }}
                                                      />
                                                    </MaybeHint>
                                                  ))}
                                              </div>
                                            )}
                                            {(draftBadge || publishBadge) && (
                                              <GridDiffBadge
                                                badge={{
                                                  ...(draftBadge ?? publishBadge!),
                                                  topOffset: 0,
                                                  leftOffset: 4,
                                                  overlapPillEdge: true,
                                                  showChangeTooltip: !showShiftDetailHoverCards,
                                                }}
                                              />
                                            )}
                                          </div>
                                        </ShiftDetailHoverCard>
                                        {shouldShowAuthorName && auditName && (
                                          <AuthorBadge
                                            name={auditName}
                                            leftInset={singleAuthorLeftInset}
                                            rightInset={noteTypes.length > 0 ? 21 : 5}
                                            bottomInset={singleAuthorBottomInset}
                                          />
                                        )}
                                      </>
                                    );
                                  }

                                  // Multi-pill: render each shift as a separate vertical pill.
                                  // Every raised badge needs real room above the pills. Letting it
                                  // hang from the standard 3px inset pushed its top 5px outside
                                  // the cell, where neighbouring rows could cover it.
                                  const multiPillBadges = labels.map(
                                    (_, labelIndex) =>
                                      (showsDraftBadge &&
                                      (draftBadge == null || draftBadge.text === "Changed")
                                        ? buildPillBadge({
                                            source: "draft",
                                            descriptor: draftDiff?.pillDiffs[labelIndex]?.badge,
                                          })
                                        : null) ??
                                      (publishBadge == null || publishBadge.text === "Changed"
                                        ? buildPillBadge({
                                            source: "publish",
                                            descriptor:
                                              publishDiffSummary?.pillDiffs[labelIndex]?.badge,
                                          })
                                        : null),
                                  );
                                  const multiTopInset = 3;
                                  const multiSideInset = 3;
                                  const multiBottomInset = 3;
                                  const multiAuthorLeftInset = 4 + leadingDividerInset;
                                  // Status chips own the top-right corner. Keep
                                  // note dots on the bottom edge instead.
                                  const multiNotesRightOffset = 2;
                                  const multiHoverChangeDetails = Array.from(
                                    new Set(
                                      [
                                        draftBadge?.tooltip,
                                        publishBadge?.tooltip,
                                        ...multiPillBadges.map((badge) => badge?.tooltip),
                                      ].filter((detail): detail is string => !!detail),
                                    ),
                                  );
                                  return (
                                    <>
                                      {isBulkSelected && (
                                        <span
                                          className="dg-grid-cell__bulk-selection-ring"
                                          data-bulk-selection-ring="true"
                                          aria-hidden="true"
                                          style={getBulkSelectionRingStyle({
                                            topInset: multiTopInset,
                                            rightInset: multiSideInset,
                                            bottomInset: multiBottomInset,
                                            leftInset: multiSideInset,
                                            topDividerInset,
                                            leadingDividerInset,
                                            pillRadius: MULTI_SHIFT_PILL_RADIUS,
                                          })}
                                        />
                                      )}
                                      <ShiftDetailHoverCard
                                        enabled={showShiftDetailHoverCards}
                                        employeeName={getEmployeeDisplayName(emp)}
                                        date={date}
                                        entries={hoverDetailEntries}
                                        indicators={hoverIndicatorNames}
                                        requestLabel={activeRequestLabel}
                                        status={hoverStatus}
                                        changeDetails={multiHoverChangeDetails}
                                        publicationLabel={publicationLabel}
                                      >
                                        <div
                                          style={{
                                            position: "absolute",
                                            top: insetFromVisibleCellTop(multiTopInset),
                                            right: `${multiSideInset}px`,
                                            bottom: `${multiBottomInset}px`,
                                            left: insetFromVisibleCellLeft(multiSideInset),
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 1,
                                            alignItems: "stretch",
                                            opacity: draftKind === "deleted" ? 0.5 : 1,
                                          }}
                                        >
                                          {activeRequest && activeRequestLabel && (
                                            <RequestCornerFold
                                              status={activeRequest.status}
                                              label={activeRequestLabel}
                                            />
                                          )}
                                          <div
                                            style={{
                                              display: "flex",
                                              flexDirection: "row",
                                              // Two hairlines butted together read
                                              // as one thick rule; 2px keeps the
                                              // pills legibly separate.
                                              gap: 2,
                                              flex: 1,
                                              minHeight: 0,
                                              alignItems: "stretch",
                                            }}
                                          >
                                            {labels.map((label, li) => {
                                              const style = getStyleByIdOrLabel(
                                                label,
                                                cellCodeIds[li],
                                              );
                                              const darkPillStyleLi = isDarkTheme
                                                ? toDarkPillColors(style.color)
                                                : null;
                                              const effectiveColorLi =
                                                darkPillStyleLi?.bg ?? style.color;
                                              const effectiveTextLi =
                                                darkPillStyleLi?.text ?? style.text;
                                              const codeEntryLi =
                                                cellCodeIds[li] != null
                                                  ? assignmentById.get(cellCodeIds[li])
                                                  : undefined;
                                              const isCross =
                                                label !== "X" &&
                                                codeEntryLi?.focusAreaId != null &&
                                                sectionFocusArea != null &&
                                                codeEntryLi.focusAreaId !== sectionFocusArea.id;
                                              const displayParts = getDisplayPartsByIdOrLabel(
                                                label,
                                                cellCodeIds[li],
                                              );
                                              const crossHomeFaLi = isCross
                                                ? focusAreas.find(
                                                    (fa) => fa.id === codeEntryLi!.focusAreaId,
                                                  )
                                                : undefined;
                                              const draftPillDiff = draftDiff?.pillDiffs[li] ?? {
                                                borderKind:
                                                  draftKind === "new" || draftKind === "modified"
                                                    ? draftKind
                                                    : null,
                                                badge: null,
                                              };
                                              const draftPillBorderKind: DraftKind = draftDiff
                                                ? draftPillDiff.borderKind
                                                : (draftPillDiff.borderKind ?? draftKind);
                                              const publishRingStatus =
                                                publishDiffSummary?.pillDiffs[li]?.borderKind ??
                                                null;
                                              const multiUsesShiftColor =
                                                shouldUseShiftColorForDiffState({
                                                  isCross,
                                                });
                                              const multiForegroundColor = multiUsesShiftColor
                                                ? effectiveTextLi
                                                : getReadableTextOnSurface(
                                                    effectiveColorLi,
                                                    effectiveTextLi,
                                                    themeSurface,
                                                  );
                                              const pillBadge = multiPillBadges[li];
                                              const pillBorder = draftPillBorderKind
                                                ? getDraftBorder(
                                                    draftPillBorderKind,
                                                    `1px solid ${borderColor(multiForegroundColor)}`,
                                                  )
                                                : `1px solid ${borderColor(multiForegroundColor)}`;
                                              const pillTime =
                                                customTimes?.perPill?.[li] ??
                                                (li === 0 && !customTimes?.perPill
                                                  ? customTimes
                                                  : null);
                                              const hasTime =
                                                pillTime && (pillTime.start || pillTime.end);
                                              const catLi =
                                                codeEntryLi?.categoryId != null
                                                  ? categoryById.get(codeEntryLi.categoryId)
                                                  : undefined;
                                              const isPillOvernight = isOvernightTimes(
                                                pillTime?.start ??
                                                  codeEntryLi?.defaultStartTime ??
                                                  catLi?.startTime,
                                                pillTime?.end ??
                                                  codeEntryLi?.defaultEndTime ??
                                                  catLi?.endTime,
                                              );
                                              const multiCrossFocusPill =
                                                isCross && crossHomeFaLi ? crossHomeFaLi : null;
                                              const multiCrossFocusWingRadius =
                                                MULTI_SHIFT_PILL_RADIUS -
                                                (draftPillBorderKind ? 2 : 1);
                                              const multiCrossFocusPalette =
                                                getCrossFocusBadgePalette({
                                                  color: effectiveColorLi,
                                                  text: effectiveTextLi,
                                                });
                                              const showMultiSecondaryLine =
                                                !!displayParts.secondaryLabel;
                                              // Same split as the single pill: a row per item in
                                              // name mode, shift · job on one line in code mode.
                                              const multiIsThreeRow =
                                                showMultiSecondaryLine && !!hasTime && isNameMode;
                                              const multiInlinesSecondary =
                                                showMultiSecondaryLine && !isNameMode;
                                              const multiDisplayLabel = displayParts.primaryLabel;
                                              const isMentoredPill =
                                                cellSegments[li]?.isMentored ?? false;

                                              return (
                                                <div
                                                  key={li}
                                                  data-shift-pill="multi"
                                                  style={{
                                                    flex: 1,
                                                    background: multiUsesShiftColor
                                                      ? effectiveColorLi
                                                      : "var(--dg-color-surface)",
                                                    border: pillBorder,
                                                    borderRadius: MULTI_SHIFT_PILL_RADIUS,
                                                    color: multiForegroundColor,
                                                    boxShadow:
                                                      publishRingStatus === "new" ||
                                                      publishRingStatus === "modified"
                                                        ? getPublishDiffRing(
                                                            publishRingStatus,
                                                            borderColor(multiForegroundColor),
                                                          )
                                                        : "none",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    gap: 1,
                                                    fontSize: isNameMode
                                                      ? "var(--dg-fs-micro)"
                                                      : "var(--dg-fs-caption)",
                                                    fontWeight: 600,
                                                    position: "relative",
                                                    // A sibling pill otherwise paints over the
                                                    // raised chip at their shared edge.
                                                    zIndex: pillBadge ? 2 : 1,
                                                    cursor: "pointer",
                                                    textDecoration:
                                                      draftKind === "deleted"
                                                        ? "line-through"
                                                        : "none",
                                                    lineHeight: 1.2,
                                                    overflow: pillBadge ? "visible" : "hidden",
                                                    minWidth: 0,
                                                    padding: isNameMode ? "2px 4px" : "2px 3px",
                                                    paddingTop: 2,
                                                    paddingLeft: multiCrossFocusPill
                                                      ? MULTI_CROSS_FOCUS_CONTENT_LEFT_PADDING
                                                      : isNameMode
                                                        ? 4
                                                        : 3,
                                                    paddingRight: isNameMode ? 4 : 3,
                                                  }}
                                                >
                                                  {pillBadge && (
                                                    <GridDiffBadge
                                                      badge={{
                                                        ...pillBadge,
                                                        topOffset: 0,
                                                        leftOffset: 4,
                                                        overlapPillEdge: true,
                                                        showChangeTooltip:
                                                          !showShiftDetailHoverCards,
                                                      }}
                                                    />
                                                  )}
                                                  {multiCrossFocusPill && (
                                                    <span
                                                      style={{
                                                        position: "absolute",
                                                        top: 0,
                                                        bottom: 0,
                                                        left: 0,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        fontSize: "var(--dg-fs-micro)",
                                                        fontWeight: 600,
                                                        lineHeight: 1,
                                                        background:
                                                          multiCrossFocusPalette.background,
                                                        color: multiCrossFocusPalette.color,
                                                        borderRadius: `${multiCrossFocusWingRadius}px 0 0 ${multiCrossFocusWingRadius}px`,
                                                        padding: "0 2px",
                                                        letterSpacing: "0.02em",
                                                        pointerEvents: "none",
                                                      }}
                                                    >
                                                      {getFocusAreaInitials(
                                                        multiCrossFocusPill.name,
                                                      )}
                                                    </span>
                                                  )}
                                                  {isMentoredPill && (
                                                    <MentoredShiftBadge
                                                      compact
                                                      rightInset={
                                                        // Only the last pill shares
                                                        // the cell's corner with
                                                        // the lock avatar.
                                                        li === labels.length - 1
                                                          ? cornerLockClearance || undefined
                                                          : undefined
                                                      }
                                                      topInset={pillBadge ? 19 : undefined}
                                                    />
                                                  )}
                                                  <div
                                                    style={{
                                                      display: "flex",
                                                      flexDirection: multiInlinesSecondary
                                                        ? "row"
                                                        : "column",
                                                      alignItems: multiInlinesSecondary
                                                        ? "baseline"
                                                        : "center",
                                                      justifyContent: "center",
                                                      flexWrap: "nowrap",
                                                      gap: multiInlinesSecondary
                                                        ? 2
                                                        : showMultiSecondaryLine
                                                          ? 1
                                                          : 0,
                                                      maxWidth: "100%",
                                                      minWidth: 0,
                                                      overflow: "hidden",
                                                    }}
                                                  >
                                                    <span
                                                      style={
                                                        isNameMode
                                                          ? {
                                                              textAlign: "center" as const,
                                                              maxWidth: "100%",
                                                              overflowWrap: "break-word" as const,
                                                              display: "-webkit-box",
                                                              WebkitBoxOrient: "vertical" as const,
                                                              WebkitLineClamp:
                                                                showMultiSecondaryLine
                                                                  ? 1
                                                                  : hasTime
                                                                    ? 1
                                                                    : 2,
                                                              overflow: "hidden",
                                                              lineHeight: 1.2,
                                                            }
                                                          : {
                                                              whiteSpace: "nowrap",
                                                              overflow: "hidden",
                                                              textOverflow: "ellipsis",
                                                              maxWidth: "100%",
                                                              minWidth: 0,
                                                            }
                                                      }
                                                    >
                                                      {multiDisplayLabel}
                                                      {!hasTime && isPillOvernight && (
                                                        <sup
                                                          style={{
                                                            fontSize: "0.65em",
                                                            fontWeight: 700,
                                                            opacity: 0.5,
                                                            marginLeft: 1,
                                                          }}
                                                        >
                                                          +1
                                                        </sup>
                                                      )}
                                                    </span>
                                                    {multiInlinesSecondary && (
                                                      <span
                                                        aria-hidden="true"
                                                        style={{
                                                          fontSize: "var(--dg-fs-micro)",
                                                          fontWeight: 700,
                                                          opacity: 0.5,
                                                          lineHeight: 1.3,
                                                          flexShrink: 0,
                                                        }}
                                                      >
                                                        ·
                                                      </span>
                                                    )}
                                                    {showMultiSecondaryLine ? (
                                                      <span
                                                        style={{
                                                          fontSize: "var(--dg-fs-micro)",
                                                          fontWeight: 700,
                                                          opacity: 0.78,
                                                          // A split shift is half the width but the
                                                          // full cell height, so three rows fit on
                                                          // the same budget as the single pill.
                                                          lineHeight: multiIsThreeRow ? 1.2 : 1.3,
                                                          whiteSpace: "nowrap",
                                                          overflow: "hidden",
                                                          textOverflow: "ellipsis",
                                                          maxWidth: "100%",
                                                        }}
                                                      >
                                                        {displayParts.secondaryLabel}
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                  {hasTime && (
                                                    <span
                                                      style={{
                                                        fontSize: "var(--dg-fs-micro)",
                                                        fontWeight: 500,
                                                        opacity: 0.7,
                                                        lineHeight: 1,
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        maxWidth: "100%",
                                                      }}
                                                    >
                                                      {fmt12hShort(pillTime!.start)}–
                                                      {fmt12hShort(pillTime!.end)}
                                                      {isPillOvernight && (
                                                        <sup
                                                          style={{
                                                            fontSize: "0.65em",
                                                            fontWeight: 700,
                                                            marginLeft: 1,
                                                            opacity: 1,
                                                          }}
                                                        >
                                                          +1
                                                        </sup>
                                                      )}
                                                    </span>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                          {noteTypes.length > 0 && (
                                            <div
                                              style={{
                                                position: "absolute",
                                                bottom: 2,
                                                right: multiNotesRightOffset,
                                                display: "flex",
                                                gap: NOTE_DOT_GAP,
                                                zIndex: 1,
                                              }}
                                            >
                                              {indicatorTypes
                                                .filter((ind) => noteTypes.includes(ind.id))
                                                .map((ind) => (
                                                  <MaybeHint
                                                    key={ind.name}
                                                    content={ind.name}
                                                    side="top"
                                                  >
                                                    <div
                                                      style={{
                                                        width: 10,
                                                        height: 10,
                                                        borderRadius: "50%",
                                                        background: ind.color,
                                                        border: "1.5px solid rgba(255,255,255,0.9)",
                                                        flexShrink: 0,
                                                      }}
                                                    />
                                                  </MaybeHint>
                                                ))}
                                            </div>
                                          )}
                                          {(draftBadge || publishBadge) && (
                                            <GridDiffBadge
                                              badge={{
                                                ...(draftBadge ?? publishBadge!),
                                                topOffset: 0,
                                                leftOffset: 4,
                                                overlapPillEdge: true,
                                                showChangeTooltip: !showShiftDetailHoverCards,
                                              }}
                                            />
                                          )}
                                        </div>
                                      </ShiftDetailHoverCard>
                                      {shouldShowAuthorName && auditName && (
                                        <AuthorBadge
                                          name={auditName}
                                          leftInset={multiAuthorLeftInset}
                                          rightInset={4}
                                          bottomInset={4}
                                        />
                                      )}
                                    </>
                                  );
                                })()}
                              </DraggableShift>
                            ) : (draftKind === "deleted" && publishedLabel) ||
                              (showsPublishDiff &&
                                publishDiff?.kind === "deleted" &&
                                ((publishDiff.from ?? []).length > 0 ||
                                  publishDiff.fromAbsenceTypeId != null ||
                                  publishDiff.fromState?.kind === "worked" ||
                                  publishDiff.fromState?.kind === "absence")) ? (
                              (() => {
                                const isDraftDelete = draftKind === "deleted";
                                const publishDeletedFromIds =
                                  publishDiff?.from ??
                                  assignmentIdsFromPublishState(
                                    publishDiff?.fromState,
                                    publishedAssignmentIdByPair,
                                  );
                                const publishDeletedAbsenceTypeId =
                                  publishDiff?.fromAbsenceTypeId ??
                                  absenceTypeIdFromPublishState(publishDiff?.fromState);
                                const deletedLabel = isDraftDelete
                                  ? publishedLabel!
                                  : publishDeletedAbsenceTypeId != null
                                    ? (() => {
                                        const at = absenceTypeMap?.get(
                                          Number(publishDeletedAbsenceTypeId),
                                        );
                                        return at ? (isNameMode ? at.name : at.label) : "?";
                                      })()
                                    : publishDeletedFromIds
                                        .map((id) => {
                                          const sc = assignmentById.get(id);
                                          return sc
                                            ? isNameMode
                                              ? sc.name || sc.label
                                              : sc.label
                                            : "?";
                                        })
                                        .join("/");
                                const deletedTooltip =
                                  !isDraftDelete && publishDiff
                                    ? buildPublishTooltip({
                                        publishDiff,
                                        resolvePublisherName,
                                        detail: `Deleted ${deletedLabel}.`,
                                        timeZone: publicationTimeZone,
                                      })
                                    : undefined;
                                // A reviewer checking a delete before publishing
                                // needs the same two facts the live pill carries:
                                // whether it was mentored, and whether it was
                                // someone else's focus area. This branch used to
                                // drop both, leaving only the struck-through
                                // label. One pill stands for a joined label, so
                                // "any segment" is the right rule for mentored.
                                const deletedSegments = isDraftDelete
                                  ? publishedSegments
                                  : (publishDiff?.fromState?.segments ?? []);
                                const deletedWasMentored = deletedSegments.some(
                                  (segment) => segment.isMentored ?? false,
                                );
                                const deletedAssignmentDefinitionId = isDraftDelete
                                  ? publishedCodeIds[0]
                                  : publishDeletedFromIds[0];
                                const deletedAssignment =
                                  deletedAssignmentDefinitionId != null
                                    ? assignmentById.get(deletedAssignmentDefinitionId)
                                    : undefined;
                                const deletedCrossFocusArea =
                                  publishDeletedAbsenceTypeId == null &&
                                  deletedAssignment?.focusAreaId != null &&
                                  sectionFocusArea != null &&
                                  deletedAssignment.focusAreaId !== sectionFocusArea.id
                                    ? focusAreas.find(
                                        (fa) => fa.id === deletedAssignment.focusAreaId,
                                      )
                                    : undefined;
                                const deletedCrossFocusPalette = getCrossFocusBadgePalette({
                                  color: "var(--dg-color-danger-bg)",
                                  text: "var(--dg-color-danger-dark)",
                                });
                                const deletedCrossFocusWingRadius =
                                  SINGLE_SHIFT_PILL_RADIUS - (isDraftDelete ? 2 : 1);
                                const deletedPill = (
                                  <div
                                    data-shift-pill="deleted"
                                    aria-label={deletedTooltip ?? "Deleted shift"}
                                    style={{
                                      position: "absolute",
                                      top: insetFromVisibleCellTop(4),
                                      right: "4px",
                                      bottom: "4px",
                                      left: insetFromVisibleCellLeft(4),
                                      background: "var(--dg-color-danger-bg)",
                                      border: isDraftDelete
                                        ? "2px dashed var(--dg-color-danger-dark)"
                                        : "1px solid var(--dg-color-danger-border)",
                                      borderRadius: "var(--dg-radius-md)",
                                      ...(isDraftDelete
                                        ? {}
                                        : {
                                            boxShadow: getPublishDiffRing(
                                              "deleted",
                                              "var(--dg-color-danger-dark)",
                                            ),
                                          }),
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      color: "var(--dg-color-danger-dark)",
                                      overflow: "visible",
                                    }}
                                  >
                                    <GridDiffBadge
                                      badge={{
                                        source: isDraftDelete ? "draft" : "publish",
                                        kind: "deleted",
                                        text: "Deleted",
                                        tooltip: deletedTooltip,
                                        topOffset: 0,
                                        leftOffset: 4,
                                        overlapPillEdge: true,
                                        showChangeTooltip: !showShiftDetailHoverCards,
                                      }}
                                    />
                                    {deletedCrossFocusArea && (
                                      <span
                                        style={{
                                          position: "absolute",
                                          top: 0,
                                          bottom: 0,
                                          left: 0,
                                          display: "flex",
                                          alignItems: "center",
                                          fontSize: "var(--dg-fs-footnote)",
                                          fontWeight: 600,
                                          lineHeight: 1,
                                          background: deletedCrossFocusPalette.background,
                                          color: deletedCrossFocusPalette.color,
                                          borderRadius: `${deletedCrossFocusWingRadius}px 0 0 ${deletedCrossFocusWingRadius}px`,
                                          padding: "0 3px",
                                          letterSpacing: "0.02em",
                                          pointerEvents: "none",
                                        }}
                                      >
                                        {getFocusAreaInitials(deletedCrossFocusArea.name)}
                                      </span>
                                    )}
                                    {deletedWasMentored && (
                                      <MentoredShiftBadge
                                        rightInset={cornerLockClearance || undefined}
                                        topInset={19}
                                      />
                                    )}
                                    <span
                                      style={{
                                        fontSize: "var(--dg-fs-title)",
                                        fontWeight: 600,
                                        lineHeight: 1,
                                      }}
                                    >
                                      {deletedLabel}
                                    </span>
                                  </div>
                                );
                                const deletedHoverEntries: ShiftDetailEntry[] = [
                                  {
                                    label: deletedLabel,
                                    jobName: null,
                                    focusAreaName: deletedCrossFocusArea?.name ?? null,
                                    timeLabel: null,
                                    isCustomTime: false,
                                    isMentored: deletedWasMentored,
                                  },
                                ];
                                const deletedShiftContent = (
                                  <ShiftDetailHoverCard
                                    enabled={showShiftDetailHoverCards}
                                    employeeName={getEmployeeDisplayName(emp)}
                                    date={date}
                                    entries={deletedHoverEntries}
                                    indicators={hoverIndicatorNames}
                                    requestLabel={null}
                                    status="Deleted"
                                    changeDetails={[deletedTooltip ?? `Deleted ${deletedLabel}.`]}
                                    publicationLabel={publicationLabel}
                                  >
                                    {deletedPill}
                                  </ShiftDetailHoverCard>
                                );
                                return (
                                  <>
                                    {deletedShiftContent}
                                    {/* Deleting the shift does not delete the
                                        cell's notes — they outlive the draft and
                                        come back the moment it publishes. This
                                        branch used to drop them, so a note went
                                        invisible for exactly as long as the
                                        delete sat unpublished. */}
                                    {noteTypes.length > 0 && (
                                      <div
                                        style={{
                                          position: "absolute",
                                          top: 5,
                                          right: 5,
                                          display: "flex",
                                          gap: NOTE_DOT_GAP,
                                          zIndex: 7,
                                        }}
                                      >
                                        {indicatorTypes
                                          .filter((ind) => noteTypes.includes(ind.id))
                                          .map((ind) => (
                                            <MaybeHint key={ind.name} content={ind.name} side="top">
                                              <div
                                                style={{
                                                  width: NOTE_DOT_SIZE,
                                                  height: NOTE_DOT_SIZE,
                                                  borderRadius: "50%",
                                                  background: ind.color,
                                                  border: "1.5px solid rgba(255,255,255,0.9)",
                                                  flexShrink: 0,
                                                }}
                                              />
                                            </MaybeHint>
                                          ))}
                                      </div>
                                    )}
                                    {shouldShowAuthorName && auditName && (
                                      <AuthorBadge
                                        name={auditName}
                                        leftInset={5 + leadingDividerInset}
                                        rightInset={5}
                                        bottomInset={5}
                                      />
                                    )}
                                  </>
                                );
                              })()
                            ) : (
                              <>
                                {shiftLabel === "OFF" && (
                                  <span
                                    style={{
                                      fontSize: "var(--dg-fs-micro)",
                                      fontWeight: 600,
                                      color: "var(--dg-color-text-faint)",
                                      letterSpacing: "0.06em",
                                      userSelect: "none",
                                    }}
                                  >
                                    OFF
                                  </span>
                                )}
                                {noteTypes.length > 0 && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: 5,
                                      right: 5,
                                      display: "flex",
                                      gap: 2,
                                    }}
                                  >
                                    {indicatorTypes
                                      .filter((ind) => noteTypes.includes(ind.id))
                                      .map((ind) => (
                                        <MaybeHint key={ind.name} content={ind.name} side="top">
                                          <div
                                            style={{
                                              width: 10,
                                              height: 10,
                                              borderRadius: "50%",
                                              background: ind.color,
                                              border: "1.5px solid rgba(255,255,255,0.85)",
                                              flexShrink: 0,
                                            }}
                                          />
                                        </MaybeHint>
                                      ))}
                                  </div>
                                )}
                              </>
                            )}
                            {cellEditor && (
                              <MaybeHint
                                content={`Being edited by ${cellEditor.userName}`}
                                side="top"
                              >
                                <span
                                  style={{
                                    ...getAvatarTypography(20),
                                    position: "absolute",
                                    top: 2,
                                    right: 2,
                                    width: 20,
                                    height: 20,
                                    boxSizing: "border-box",
                                    borderRadius: "50%",
                                    // The person's own chip, the same one the
                                    // roster and the people table draw, so the
                                    // marker reads as the same someone.
                                    background: cellEditorTone?.backgroundColor,
                                    border: `1px solid ${cellEditorTone?.borderColor}`,
                                    color: cellEditorTone?.textColor,
                                    // Two initials at the badge size run wider
                                    // than this 20px circle, so the marker
                                    // sizes its own text off the ring instead.
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    zIndex: 2,
                                    pointerEvents: "none",
                                  }}
                                >
                                  {getAvatarInitials(cellEditor.userName)}
                                </span>
                              </MaybeHint>
                            )}
                            {fromRecurring && shiftLabel && shiftLabel !== "OFF" && (
                              <MaybeHint content="From recurring schedule" side="top">
                                <span
                                  aria-label="From recurring schedule"
                                  style={{
                                    position: "absolute",
                                    bottom: 1,
                                    right: 2,
                                    fontSize: "var(--dg-type-badge-size)",
                                    lineHeight: 1,
                                    color: "var(--dg-color-text-muted)",
                                    zIndex: 2,
                                    pointerEvents: "auto",
                                  }}
                                >
                                  ↻
                                </span>
                              </MaybeHint>
                            )}
                          </div>
                          <div className="dg-grid-cell__chrome" aria-hidden="true" />
                        </DroppableCell>
                      );
                    });
                  })()}
                </div>
              );
            })}

            {hasAnyTotals &&
              totalRows.map((row, rowIndex) => {
                const isLastRow = rowIndex === totalRows.length - 1;
                return (
                  <div
                    key={`total-row-${row.label}`}
                    className="dg-row-enter"
                    data-tally-row={`category-${row.categoryId}`}
                    style={{
                      ...rowGrid,
                      borderTop: rowIndex === 0 ? "1px solid var(--dg-color-border)" : undefined,
                      background: "var(--dg-color-surface)",
                    }}
                  >
                    <div
                      data-tally-label={row.label}
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 10,
                        background: "var(--dg-color-surface)",
                        padding: "6px 14px",
                        fontSize: "var(--dg-fs-badge)",
                        fontWeight: 700,
                        color: "var(--dg-color-text-muted)",
                        letterSpacing: "0.04em",
                        display: "flex",
                        alignItems: "center",
                        borderBottom: isLastRow
                          ? undefined
                          : "1px solid var(--dg-color-border-light)",
                        boxShadow: joinBoxShadows(
                          "1px 0 0 0 var(--dg-color-border-light)",
                          "2px 0 4px rgba(0,0,0,0.02)",
                        ),
                      }}
                    >
                      <MaybeHint content={isNameMode ? row.label : undefined} side="top">
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {row.label}
                        </span>
                      </MaybeHint>
                    </div>
                    {weekDates.map((date, index) => {
                      const count = row.counts[index] ?? 0;
                      const required = categoryRequirementsByDay[index]?.[row.categoryId] ?? 0;
                      const hasRequirement = required > 0;
                      const isMet = count >= required;
                      const displayValue = count > 0 || hasRequirement ? String(count) : "-";
                      const hintContent = hasRequirement
                        ? `${row.label}: ${count}/${required}`
                        : count > 0
                          ? `${row.label}: ${count}`
                          : undefined;
                      return (
                        <div
                          key={`${row.label}-${date.toISOString()}`}
                          className="dg-grid-slot dg-grid-slot--tally"
                          data-tally-count={`${row.categoryId}-${index}`}
                          data-tally-status={
                            hasRequirement ? (isMet ? "covered" : "short") : "none"
                          }
                          data-leading-divider={
                            index === 0 ? "none" : isSplitDayDivider(index) ? "split" : "light"
                          }
                          data-week-split-start={isSplitDayDivider(index) ? "true" : undefined}
                          data-bottom-divider={isLastRow ? undefined : "light"}
                          style={{
                            position: "relative",
                            textAlign: "center",
                            padding: "8px 6px",
                            fontSize: "var(--dg-fs-badge)",
                            lineHeight: 1.4,
                            color: hasRequirement
                              ? isMet
                                ? "var(--dg-color-success-text)"
                                : "var(--dg-color-danger-dark)"
                              : "var(--dg-color-text-muted)",
                            background: hasRequirement
                              ? isMet
                                ? "rgba(22, 163, 74, 0.12)"
                                : "rgba(220, 38, 38, 0.12)"
                              : "var(--dg-color-surface)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 600,
                            fontFamily: "var(--font-dm-mono), 'DM Mono', monospace",
                          }}
                        >
                          <div className="dg-grid-slot__chrome" aria-hidden="true" />
                          {hintContent ? (
                            <MaybeHint content={hintContent} side="top">
                              <span>{displayValue}</span>
                            </MaybeHint>
                          ) : (
                            displayValue
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            {activeOutlineRect ? (
              <div
                className="dg-grid-active-outline"
                aria-hidden="true"
                style={{
                  left: activeOutlineRect.left,
                  top: activeOutlineRect.top,
                  width: activeOutlineRect.width,
                  height: activeOutlineRect.height,
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});

const LegacyScheduleGrid = memo(function LegacyScheduleGrid({
  filteredEmployees,
  allEmployees,
  week1,
  week2,
  spanWeeks,
  shiftForKey,
  assignmentIdsForKey,
  segmentsForKey,
  publishedSegmentsForKey,
  getShiftStyle,
  handleCellClick,
  todayKey,
  highlightEmpIds,
  highlightScrollKey,
  focusAreas,
  departments,
  assignments,
  historicalAssignments = [],
  shiftCategories,
  jobs = [],
  indicatorTypes = [],
  isCellInteractive = true,
  canDragShifts,
  activeIndicatorIdsForKey,
  activeFocusArea = null,
  certifications = [],
  orgRoles = [],
  getCustomShiftTimes,
  getPublishedCustomShiftTimes,
  draftKindForKey,
  fromRecurringForKey,
  showPublishDiffOverlay,
  publishedLabelForKey,
  publishedAssignmentIdsForKey,
  publishedAbsenceTypeIdForKey,
  publishDiffForKey,
  publishedMetadataForKey,
  cellEditors,
  showAudit,
  createdByNameForKey,
  onCellHover,
  onCellContextMenu,
  onCellFocus,
  coverageRequirements,
  absenceTypeMap,
  absenceTypeIdForKey,
  activeRequestForKey,
  shiftDisplayMode = "code",
  useCompactRoleCertificationLabels = false,
  showShiftDetailHoverCards = true,
  resolvePublisherName,
  openShifts,
  onClaimOpenShift,
  activeCellId = null,
  bulkDeleteMode = false,
  bulkSelectedCellKeys,
  bulkSelectableCellKeys,
  onToggleBulkDeleteCell,
}: LegacyScheduleGridProps) {
  const departmentSections = useMemo(() => {
    // Get scheduled departments, sorted
    const scheduledDepts = departments
      .filter((d) => d.type === "scheduled")
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // Group focus areas by department
    const result = scheduledDepts.map((dept) => ({
      department: dept,
      focusAreas: focusAreas
        .filter((fa) => fa.departmentId === dept.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));

    // Handle orphaned focus areas (no department)
    const orphaned = focusAreas.filter((fa) => !fa.departmentId);
    if (orphaned.length > 0) {
      result.push({
        department: {
          id: -1,
          orgId: "",
          name: "Ungrouped",
          abbr: "",
          type: "scheduled" as const,
          sortOrder: 999,
        },
        focusAreas: orphaned.sort((a, b) => a.sortOrder - b.sortOrder),
      });
    }

    // If activeFocusArea is set, filter to only the selected focus area
    if (activeFocusArea != null) {
      return result
        .map(({ department, focusAreas: fas }) => ({
          department,
          focusAreas: fas.filter((fa) => fa.id === activeFocusArea),
        }))
        .filter(({ focusAreas: fas }) => fas.length > 0);
    }

    return result;
  }, [departments, focusAreas, activeFocusArea]);

  // Flat list of all visible FA names (for exclusiveCodeIdsPerSection compatibility)
  const sections = useMemo(
    () => departmentSections.flatMap(({ focusAreas: fas }) => fas.map((fa) => fa.name)),
    [departmentSections],
  );

  const allDates = useMemo(
    () => (spanWeeks === 2 ? [...week1, ...week2] : week1),
    [spanWeeks, week1, week2],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build a name→id map for fast focus area lookups
  const focusAreaIdByName = useMemo(
    () => Object.fromEntries(focusAreas.map((w) => [w.name, w.id])),
    [focusAreas],
  );

  const assignmentLookupById = useMemo(() => {
    const map = new Map<number, AssignmentDefinition>();
    for (const assignment of historicalAssignments) {
      map.set(assignment.id, assignment);
    }
    for (const assignment of assignments) {
      map.set(assignment.id, assignment);
    }
    return map;
  }, [historicalAssignments, assignments]);

  // For each section, compute which shift code IDs belong to it
  const exclusiveCodeIdsPerSection = useMemo(() => {
    return Object.fromEntries(
      sections.map((section) => {
        const focusAreaId = focusAreaIdByName[section];
        const ids = new Set(
          assignments
            .filter((st) => focusAreaId != null && st.focusAreaId === focusAreaId)
            .map((st) => st.id),
        );
        return [section, ids];
      }),
    );
  }, [sections, assignments, focusAreaIdByName]);

  const openShiftSectionIds = useMemo(
    () => new Set((openShifts ?? []).map((shift) => shift.focusAreaId)),
    [openShifts],
  );

  // Keep sections visible when they have employee rows or open shifts to claim.
  const sectionHasVisibleContent = useCallback(
    (section: string) => {
      const sectionId = focusAreaIdByName[section];
      if (sectionId != null && openShiftSectionIds.has(sectionId)) {
        return true;
      }

      const exclusiveCodeIds = exclusiveCodeIdsPerSection[section] ?? new Set<number>();
      const rawHomeEmps = filteredEmployees.filter(
        (e) => sectionId != null && e.focusAreaIds.includes(sectionId),
      );
      const homeEmps = isCellInteractive
        ? rawHomeEmps
        : rawHomeEmps.filter((emp) =>
            allDates.some((date) => {
              const codeIds = assignmentIdsForKey?.(emp.id, date) ?? [];
              return codeIds.some(
                (id) =>
                  exclusiveCodeIds.has(id) || assignmentLookupById.get(id)?.focusAreaId === null,
              );
            }),
          );
      const guestEmps = allEmployees.filter(
        (e) =>
          e.focusAreaIds.length > 0 &&
          (sectionId == null || !e.focusAreaIds.includes(sectionId)) &&
          allDates.some((date) => {
            const codeIds = assignmentIdsForKey?.(e.id, date) ?? [];
            return codeIds.some((id) => exclusiveCodeIds.has(id));
          }),
      );
      return homeEmps.length > 0 || guestEmps.length > 0;
    },
    [
      exclusiveCodeIdsPerSection,
      focusAreaIdByName,
      openShiftSectionIds,
      filteredEmployees,
      allEmployees,
      isCellInteractive,
      allDates,
      assignmentIdsForKey,
      assignmentLookupById,
    ],
  );

  // Filter department sections to only those with visible FAs
  const renderedDepartmentSections = useMemo(
    () =>
      departmentSections
        .map(({ department, focusAreas: fas }) => ({
          department,
          focusAreas: fas.filter((fa) => sectionHasVisibleContent(fa.name)),
        }))
        .filter(({ focusAreas: fas }) => fas.length > 0),
    [departmentSections, sectionHasVisibleContent],
  );

  const hasOpenShifts = (openShifts?.length ?? 0) > 0;
  const gridLayout = getScheduleGridLayout({
    spanWeeks,
    shiftDisplayMode,
    containerWidth,
    hasOpenShifts,
    hasStackedCellContent: false,
  });
  const { nameColWidth, colWidth, fitToContainer } = gridLayout;
  const hasAnySections = renderedDepartmentSections.length > 0;
  const hasHighlightedSearch = (highlightEmpIds?.size ?? 0) > 0;

  useEffect(() => {
    if (!highlightScrollKey || !hasHighlightedSearch) return;

    const frame = window.requestAnimationFrame(() => {
      const firstHighlightedRow = containerRef.current?.querySelector<HTMLElement>(
        '[data-search-highlight="true"]',
      );
      firstHighlightedRow?.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [highlightScrollKey, hasHighlightedSearch]);

  return (
    <div
      ref={containerRef}
      data-shift-display={shiftDisplayMode}
      data-grid-fit={fitToContainer ? "true" : "false"}
      style={
        {
          width: "100%",
          maxWidth: "100%",
          position: "relative",
          "--dg-grid-name-col-current": `${nameColWidth}px`,
          "--dg-grid-col-min-current": `${colWidth}px`,
        } as React.CSSProperties
      }
    >
      {!hasAnySections ? (
        <EmptyState
          icon={<Users size={24} />}
          title={
            allEmployees.length === 0
              ? "No staff added yet"
              : filteredEmployees.length === 0
                ? "No matching employees"
                : "No shifts found for this period"
          }
          description={
            allEmployees.length === 0
              ? "Add employees on the Staff page to start building your schedule."
              : filteredEmployees.length === 0
                ? "Try clearing your search or focus area filter."
                : isCellInteractive
                  ? "No employees are assigned to this focus area. Add employees in the Staff view."
                  : "No shifts have been published for this period yet."
          }
          style={{ marginTop: 34 }}
        />
      ) : (
        <>
          {/* Flat FA sections — departments provide ordering but don't appear visually */}
          {renderedDepartmentSections.map(({ department: dept, focusAreas: deptFAs }) => (
            <div key={dept.id}>
              {deptFAs.map((fa) => {
                const sectionName = fa.name;
                const sectionId = focusAreaIdByName[fa.name] ?? fa.id;
                const exclusiveCodeIds = exclusiveCodeIdsPerSection[fa.name] ?? new Set<number>();

                const rawHomeEmps = filteredEmployees.filter(
                  (e) => sectionId != null && e.focusAreaIds.includes(sectionId),
                );
                const homeEmps = isCellInteractive
                  ? rawHomeEmps
                  : rawHomeEmps.filter((emp) =>
                      allDates.some((date) => {
                        const codeIds = assignmentIdsForKey?.(emp.id, date) ?? [];
                        return codeIds.some(
                          (id) =>
                            exclusiveCodeIds.has(id) ||
                            assignments.find((sc) => sc.id === id)?.focusAreaId === null,
                        );
                      }),
                    );
                const guestEmps = allEmployees.filter(
                  (e) =>
                    e.focusAreaIds.length > 0 &&
                    (sectionId == null || !e.focusAreaIds.includes(sectionId)) &&
                    allDates.some((date) => {
                      const codeIds = assignmentIdsForKey?.(e.id, date) ?? [];
                      return codeIds.some((id) => exclusiveCodeIds.has(id));
                    }),
                );
                const sectionEmps = [...homeEmps, ...guestEmps];

                return (
                  <SectionBlock
                    key={fa.id}
                    sectionId={sectionId}
                    sectionName={sectionName}
                    exclusiveCodeIds={exclusiveCodeIds}
                    employees={sectionEmps}
                    weekDates={allDates}
                    todayKey={todayKey}
                    shiftForKey={shiftForKey}
                    assignmentIdsForKey={assignmentIdsForKey}
                    segmentsForKey={segmentsForKey}
                    publishedSegmentsForKey={publishedSegmentsForKey}
                    getShiftStyle={getShiftStyle}
                    handleCellClick={handleCellClick}
                    nameColWidth={nameColWidth}
                    colWidth={colWidth}
                    fitToContainer={fitToContainer}
                    highlightEmpIds={highlightEmpIds}
                    focusAreas={focusAreas}
                    assignments={assignments}
                    historicalAssignments={historicalAssignments}
                    shiftCategories={shiftCategories}
                    jobs={jobs}
                    indicatorTypes={indicatorTypes}
                    isCellInteractive={isCellInteractive}
                    canDragShifts={canDragShifts ?? isCellInteractive}
                    activeIndicatorIdsForKey={activeIndicatorIdsForKey}
                    getCustomShiftTimes={getCustomShiftTimes}
                    getPublishedCustomShiftTimes={getPublishedCustomShiftTimes}
                    draftKindForKey={draftKindForKey}
                    fromRecurringForKey={fromRecurringForKey}
                    showPublishDiffOverlay={showPublishDiffOverlay}
                    publishedLabelForKey={publishedLabelForKey}
                    publishedAssignmentIdsForKey={publishedAssignmentIdsForKey}
                    publishedAbsenceTypeIdForKey={publishedAbsenceTypeIdForKey}
                    publishDiffForKey={publishDiffForKey}
                    publishedMetadataForKey={publishedMetadataForKey}
                    certifications={certifications}
                    orgRoles={orgRoles}
                    cellEditors={cellEditors}
                    showAudit={showAudit}
                    createdByNameForKey={createdByNameForKey}
                    onCellHover={onCellHover}
                    onCellContextMenu={onCellContextMenu}
                    onCellFocus={onCellFocus}
                    coverageRequirements={coverageRequirements}
                    absenceTypeMap={absenceTypeMap}
                    absenceTypeIdForKey={absenceTypeIdForKey}
                    activeRequestForKey={activeRequestForKey}
                    shiftDisplayMode={shiftDisplayMode}
                    useCompactRoleCertificationLabels={useCompactRoleCertificationLabels}
                    showShiftDetailHoverCards={showShiftDetailHoverCards}
                    resolvePublisherName={resolvePublisherName}
                    openShifts={openShifts?.filter(
                      (os) => sectionId != null && os.focusAreaId === sectionId,
                    )}
                    onClaimOpenShift={onClaimOpenShift}
                    activeCellId={activeCellId}
                    bulkDeleteMode={bulkDeleteMode}
                    bulkSelectedCellKeys={bulkSelectedCellKeys}
                    bulkSelectableCellKeys={bulkSelectableCellKeys}
                    onToggleBulkDeleteCell={onToggleBulkDeleteCell}
                  />
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
});

export interface ScheduleGridProps {
  model: ScheduleGridModel;
  interactionState: ScheduleGridInteractionState;
  handlers: ScheduleGridHandlers;
}

const ScheduleGrid = memo(function ScheduleGrid({
  model,
  interactionState,
  handlers,
}: ScheduleGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor),
  );
  const [activeDrag, setActiveDrag] = useState<ShiftDragData | null>(null);
  const activeDragModeRef = useRef<"move" | "copy">("move");
  const focusedCellIdRef = useRef<GridCellId | null>(null);
  const hoveredCellIdRef = useRef<GridCellId | null>(null);

  const sectionIdByName = useMemo(
    () => new Map(model.focusAreas.map((focusArea) => [focusArea.name, focusArea.id])),
    [model.focusAreas],
  );

  const handleLegacyCellClick = useCallback<LegacyScheduleGridProps["handleCellClick"]>(
    (emp, date, focusAreaName, trigger = "click") => {
      const fallbackSectionId = emp.focusAreaIds[0] ?? null;
      const sectionId =
        (focusAreaName ? sectionIdByName.get(focusAreaName) : null) ?? fallbackSectionId;
      if (sectionId == null) return;
      const cellId = {
        empId: emp.id,
        dateKey: formatDateKey(date),
        sectionId,
      };
      handlers.onActivateCell({
        cellId,
        emp,
        date,
        trigger,
      });
    },
    [handlers, sectionIdByName],
  );

  const handleLegacyContextMenu = useCallback<
    NonNullable<LegacyScheduleGridProps["onCellContextMenu"]>
  >(
    (event, anchorEl, cellId, emp, date) => {
      handlers.onOpenCellMenu?.({
        event,
        anchorEl,
        cellId,
        emp,
        date,
        trigger: event.type === "contextmenu" ? "contextmenu" : "keyboard",
      });
    },
    [handlers],
  );

  const handleCellFocus = useCallback((cellId: GridCellId) => {
    focusedCellIdRef.current = cellId;
  }, []);

  const handleCellHover = useCallback((cellId: GridCellId) => {
    hoveredCellIdRef.current = cellId;
  }, []);

  const resolveKeyboardTarget = useCallback(() => {
    return (
      interactionState.contextMenuCellId ?? focusedCellIdRef.current ?? hoveredCellIdRef.current
    );
  }, [interactionState.contextMenuCellId]);
  const activeCellId = interactionState.activeCellId;
  const bulkDeleteMode = !!interactionState.bulkDeleteMode;

  useEffect(() => {
    if (bulkDeleteMode || (!handlers.onCopyCell && !handlers.onPasteCell)) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;

      const targetCell = resolveKeyboardTarget();
      if (!targetCell) return;

      if (event.key === "c") {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        event.preventDefault();
        handlers.onCopyCell?.(targetCell);
      } else if (event.key === "v") {
        event.preventDefault();
        handlers.onPasteCell?.(targetCell);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bulkDeleteMode, handlers, resolveKeyboardTarget]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as ShiftDragData | undefined;
    if (!data) return;

    const activatorEvent = event.activatorEvent;
    const wantsCopy =
      (activatorEvent instanceof MouseEvent || activatorEvent instanceof KeyboardEvent) &&
      activatorEvent.shiftKey;
    setActiveDrag(data);
    activeDragModeRef.current = wantsCopy ? "copy" : "move";
    document.documentElement.dataset.dragging = "true";
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      delete document.documentElement.dataset.dragging;
      const dragMode = activeDragModeRef.current;
      activeDragModeRef.current = "move";

      const dragData = event.active.data.current as ShiftDragData | undefined;
      const dropData = event.over?.data.current as CellDropData | undefined;
      if (!dragData || !dropData) return;
      if (
        dragData.cellId.empId === dropData.cellId.empId &&
        dragData.cellId.dateKey === dropData.cellId.dateKey &&
        dragData.cellId.sectionId === dropData.cellId.sectionId
      ) {
        return;
      }

      handlers.onMoveEntry?.({
        sourceCellId: dragData.cellId,
        targetCellId: dropData.cellId,
        payload: dragData.payload,
        mode: dragMode,
      });
    },
    [handlers],
  );

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <LegacyScheduleGrid
        filteredEmployees={model.filteredEmployees}
        allEmployees={model.allEmployees}
        week1={model.week1}
        week2={model.week2}
        spanWeeks={model.spanWeeks}
        shiftForKey={model.accessors.shiftForKey}
        assignmentIdsForKey={model.accessors.assignmentIdsForKey}
        segmentsForKey={model.accessors.segmentsForKey}
        publishedSegmentsForKey={model.accessors.publishedSegmentsForKey}
        getShiftStyle={model.accessors.getShiftStyle}
        handleCellClick={handleLegacyCellClick}
        todayKey={model.todayKey}
        highlightEmpIds={model.options.highlightEmpIds}
        highlightScrollKey={model.options.highlightScrollKey}
        focusAreas={model.focusAreas}
        departments={Array.from(model.departmentsById.values())}
        assignments={model.assignments}
        historicalAssignments={model.historicalAssignments}
        shiftCategories={model.shiftCategories}
        jobs={model.jobs}
        indicatorTypes={model.indicatorTypes}
        isCellInteractive={model.options.isCellInteractive}
        canDragShifts={bulkDeleteMode ? false : model.options.canDragShifts}
        activeIndicatorIdsForKey={model.accessors.activeIndicatorIdsForKey}
        activeFocusArea={model.activeFocusArea}
        certifications={model.certifications}
        orgRoles={model.orgRoles}
        useCompactRoleCertificationLabels={model.useCompactRoleCertificationLabels}
        getCustomShiftTimes={model.accessors.getCustomShiftTimes}
        getPublishedCustomShiftTimes={model.accessors.getPublishedCustomShiftTimes}
        draftKindForKey={model.accessors.draftKindForKey}
        fromRecurringForKey={model.accessors.fromRecurringForKey}
        showPublishDiffOverlay={model.options.showPublishDiffOverlay}
        publishedLabelForKey={model.accessors.publishedLabelForKey}
        publishedAssignmentIdsForKey={model.accessors.publishedAssignmentIdsForKey}
        publishedAbsenceTypeIdForKey={model.accessors.publishedAbsenceTypeIdForKey}
        publishDiffForKey={model.accessors.publishDiffForKey}
        publishedMetadataForKey={model.accessors.publishedMetadataForKey}
        cellEditors={model.cellEditors}
        showAudit={model.options.showAudit}
        createdByNameForKey={model.accessors.createdByNameForKey}
        onCellHover={handleCellHover}
        onCellContextMenu={handleLegacyContextMenu}
        onCellFocus={handleCellFocus}
        coverageRequirements={model.coverageRequirements}
        absenceTypeMap={model.absenceTypeMap}
        absenceTypeIdForKey={model.accessors.absenceTypeIdForKey}
        activeRequestForKey={model.accessors.activeRequestForKey}
        shiftDisplayMode={model.options.shiftDisplayMode}
        showShiftDetailHoverCards={model.options.showShiftDetailHoverCards}
        resolvePublisherName={model.resolvePublisherName}
        openShifts={model.openShifts}
        onClaimOpenShift={handlers.onClaimOpenShift}
        activeCellId={activeCellId}
        bulkDeleteMode={bulkDeleteMode}
        bulkSelectedCellKeys={interactionState.bulkSelectedCellKeys}
        bulkSelectableCellKeys={interactionState.bulkSelectableCellKeys}
        onToggleBulkDeleteCell={handlers.onToggleBulkDeleteCell}
      />
      <DragOverlay dropAnimation={null}>
        {activeDrag && (
          <div
            style={{
              background: activeDrag.pillColor,
              color: activeDrag.pillText,
              border: `1px solid ${activeDrag.pillText}20`,
              borderRadius: "var(--dg-radius-md)",
              padding: "6px 16px",
              fontSize: "var(--dg-fs-title)",
              fontWeight: 600,
              boxShadow: "var(--shadow-drag)",
              cursor: "grabbing",
              whiteSpace: "nowrap",
            }}
          >
            {activeDrag.label}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
});

export { buildScheduleGridModel } from "./schedule-grid/model";
export type {
  ScheduleGridHandlers,
  ScheduleGridInteractionState,
  ScheduleGridModel,
} from "./schedule-grid/model";

export default ScheduleGrid;
