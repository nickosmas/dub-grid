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
import { UserPen } from "lucide-react";
import { DAY_LABELS, BOX_SHADOW_CARD } from "@/lib/constants";
import { MaybeHint } from "@/components/ui/hint";
import { formatDateKey } from "@/lib/utils";
import { computeDailyTallies, resolveRequirement } from "@/lib/schedule-logic";
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
import { getCertAbbr, getRoleAbbrs, getEmployeeDisplayName } from "@/lib/utils";
import {
  borderColor,
  DESIGNATION_COLORS,
  DEFAULT_DESIG_COLOR,
  DRAFT_BORDER_COLORS,
  getReadableTextOnSurface,
} from "@/lib/colors";
import { buildShiftDisplayParts } from "@/lib/assignable-shifts";
import {
  buildShiftJobPairKey,
  createAssignmentDefinitionIdByPairMap,
  deriveAssignmentDefinitionIdsFromAssignments,
} from "@/lib/shift-job-segments";
import DroppableCell from "./DroppableCell";
import DraggableShift from "./DraggableShift";
import { PublishDiffPill } from "./schedule-grid/publishDiffPill";
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

function getFocusAreaInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
}

function getCrossFocusBadgePalette(
  style?: Pick<AssignmentDefinition, "color" | "text"> | null,
) {
  return {
    background: style?.color ?? "var(--color-bg)",
    color: style?.text ?? "var(--color-text-muted)",
  };
}

function fmt12hShort(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? String(h12) : `${h12}:${String(m).padStart(2, "0")}`;
}

/** Returns true if the given HH:MM times represent an overnight shift (crosses midnight).
 *  An end time of "00:00" means midnight (end of day), not start of next day. */
function isOvernightTimes(
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  if (!start || !end) return false;
  // Normalize to HH:MM — DB TIME columns may include seconds ("00:00:00")
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  const effectiveEnd = e === "00:00" ? "24:00" : e;
  return s > effectiveEnd;
}

function getDraftBorder(draftKind: DraftKind, fallback: string): string {
  if (!draftKind) return fallback;
  return `2px dashed ${DRAFT_BORDER_COLORS[draftKind]}`;
}

function getPublishDiffBoxShadow(kind: string, fallback: string): string {
  const color = DRAFT_BORDER_COLORS[kind] ?? fallback;
  return `0 0 0 1px var(--color-surface), 0 0 0 2.5px ${color}`;
}

function joinBoxShadows(
  ...values: Array<string | undefined>
): string | undefined {
  const shadows = values.filter((value): value is string => !!value);
  return shadows.length > 0 ? shadows.join(", ") : undefined;
}

const SINGLE_SHIFT_PILL_RADIUS = 8;
const MULTI_SHIFT_PILL_RADIUS = 6;
const RAISED_DIFF_BADGE_TOP_INSET = 10;
const SINGLE_CROSS_FOCUS_CONTENT_LEFT_PADDING = 24;
const MULTI_CROSS_FOCUS_CONTENT_LEFT_PADDING = 20;
const BULK_SELECTION_RING_PADDING = 2;

function areGridCellIdsEqual(
  left: GridCellId | null | undefined,
  right: GridCellId | null | undefined,
): boolean {
  if (!left || !right) return false;
  return (
    left.empId === right.empId &&
    left.dateKey === right.dateKey &&
    left.sectionId === right.sectionId
  );
}

function getGridCellKey(cellId: Pick<GridCellId, "empId" | "dateKey">): string {
  return `${cellId.empId}_${cellId.dateKey}`;
}

function getBulkSelectionRingStyle(args: {
  topInset: number;
  rightInset: number;
  bottomInset: number;
  leftInset: number;
  topDividerInset: number;
  leadingDividerInset: number;
  pillRadius: number;
}): React.CSSProperties {
  const padding = BULK_SELECTION_RING_PADDING;
  return {
    top: `${args.topDividerInset + args.topInset - padding}px`,
    right: `${args.rightInset - padding}px`,
    bottom: `${args.bottomInset - padding}px`,
    left: `${args.leadingDividerInset + args.leftInset - padding}px`,
    borderRadius: args.pillRadius + padding,
  };
}

function getInsetDividerShadow(args: {
  color: string;
  side?: "left" | "right";
  width?: number;
}): string {
  const { color, side = "left", width = 1 } = args;
  const horizontalOffset = side === "left" ? width : -width;
  return `inset ${horizontalOffset}px 0 0 0 ${color}`;
}

function cellShowsDraftDiffBadge(args: {
  draftKind: DraftKind;
  showDiffOverlay: boolean;
}): boolean {
  const { draftKind, showDiffOverlay } = args;
  return showDiffOverlay && !!draftKind && draftKind !== "deleted";
}

function formatRelativePublishTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;

  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function buildPublishTooltip(args: {
  publishDiff: PublishChange & { publishedAt: string; publishedBy: string };
  resolvePublisherName?: (userId: string) => string | null;
  detail?: string;
}): string {
  const { publishDiff, resolvePublisherName, detail } = args;
  const publisherName = publishDiff.publishedBy
    ? resolvePublisherName?.(publishDiff.publishedBy)
    : null;
  const summary = `Published ${formatRelativePublishTime(publishDiff.publishedAt)}${publisherName ? ` by ${publisherName}` : ""}.`;

  return detail ? `${summary} ${detail}` : summary;
}

function timeRangesFromCustomTimes(args: {
  customTimes:
    | {
        start: string;
        end: string;
        perPill?: { start: string; end: string }[];
      }
    | null
    | undefined;
  count: number;
}): ShiftDiffTimeRange[] {
  const { customTimes, count } = args;
  if (count === 0) return [];
  if (customTimes?.perPill?.length) {
    return Array.from({ length: count }, (_, index) => ({
      start: customTimes.perPill?.[index]?.start ?? null,
      end: customTimes.perPill?.[index]?.end ?? null,
    }));
  }
  return Array.from({ length: count }, (_, index) => ({
    start: index === 0 ? (customTimes?.start ?? null) : null,
    end: index === 0 ? (customTimes?.end ?? null) : null,
  }));
}

function splitShiftLabelParts(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function assignmentIdsFromPublishState(
  state: ScheduleCellState | null | undefined,
  assignmentIdByPair: Map<string, number>,
): number[] {
  if (state?.kind !== "worked") return [];
  const orderedSegments = [...state.segments].sort(
    (left, right) => left.position - right.position,
  );
  return deriveAssignmentDefinitionIdsFromAssignments(
    {
      shiftIds: orderedSegments.map((segment) => segment.shiftId),
      jobIds: orderedSegments.map((segment) => segment.jobId),
    },
    assignmentIdByPair,
  );
}

function absenceTypeIdFromPublishState(
  state: ScheduleCellState | null | undefined,
): number | null {
  return state?.kind === "absence" ? state.absenceTypeId : null;
}

function timeRangesFromPublishState(
  state: ScheduleCellState | null | undefined,
  fallbackStart: string | null | undefined,
  fallbackEnd: string | null | undefined,
  count: number,
): ShiftDiffTimeRange[] {
  if (count === 0) return [];
  return expandDelimitedTimeRanges(
    state?.customStartTime ?? fallbackStart,
    state?.customEndTime ?? fallbackEnd,
    count,
  );
}

type GridDiffBadgeConfig = {
  source: "publish" | "draft";
  kind: "new" | "modified" | "time" | "deleted";
  text: string;
  tooltip?: string;
  topOffset?: number;
  rightOffset?: number;
  leftOffset?: number;
};

function shouldUseShiftColorForDiffState(args: {
  isCross: boolean;
}): boolean {
  return !args.isCross;
}

function GridDiffBadge({ badge }: { badge: GridDiffBadgeConfig }) {
  const topOffset = badge.topOffset ?? 1;
  const rightOffset = badge.rightOffset ?? 1;
  const leftOffset = badge.leftOffset;
  const dataAttributes =
    badge.source === "publish"
      ? { "data-publish-badge": badge.kind }
      : { "data-draft-badge": badge.kind };
  const badgeNode = (
    <PublishDiffPill
      kind={badge.kind}
      {...dataAttributes}
      aria-label={badge.tooltip ?? badge.text}
      style={{
        position: "absolute",
        top: topOffset,
        ...(leftOffset != null
          ? {
              left: leftOffset,
              maxWidth: `calc(100% - ${leftOffset + 4}px)`,
            }
          : {
              right: rightOffset,
              maxWidth: "calc(100% - 4px)",
            }),
        borderRadius: 3,
        pointerEvents: badge.tooltip ? "auto" : "none",
        zIndex: 6,
      }}
    >
      {badge.text}
    </PublishDiffPill>
  );

  if (!badge.tooltip) {
    return badgeNode;
  }

  return (
    <MaybeHint content={badge.tooltip} side="top">
      {badgeNode}
    </MaybeHint>
  );
}

function MentoredShiftBadge({ compact = false }: { compact?: boolean }) {
  const size = compact ? 15 : 16;
  const badge = (
    <span
      data-mentored-badge="true"
      aria-label="Mentored assignment"
      style={{
        position: "absolute",
        top: 0.5,
        right: 0.5,
        width: size,
        height: size,
        borderRadius: 999,
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(51,65,85,0.22)",
        color: "#334155",
        boxShadow: "0 1px 2px rgba(15,23,42,0.12)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: compact ? 8 : 9,
        fontWeight: 800,
        lineHeight: 1,
        pointerEvents: "auto",
        zIndex: 5,
      }}
    >
      M
    </span>
  );

  return (
    <MaybeHint content="Mentored assignment" side="top">
      {badge}
    </MaybeHint>
  );
}

function AuthorBadge({
  name,
  leftInset = 5,
  rightInset = 5,
  bottomInset = 5,
}: {
  name: string;
  leftInset?: number;
  rightInset?: number;
  bottomInset?: number;
}) {
  return (
    <div
      data-author-pill="true"
      style={{
        position: "absolute",
        left: leftInset,
        right: rightInset,
        bottom: bottomInset,
        display: "flex",
        justifyContent: "flex-start",
        pointerEvents: "none",
        zIndex: 4,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 4,
          minWidth: 0,
          maxWidth: "100%",
          fontSize: "var(--dg-fs-micro)",
          fontWeight: 600,
          lineHeight: 1,
          textAlign: "left",
          color: "var(--color-text-muted)",
          padding: "2px 7px",
          background: "var(--color-surface)",
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 0.5px 1px rgba(0,0,0,0.06)",
          textDecoration: "none",
        }}
      >
        <span
          aria-hidden="true"
          data-author-pill-icon="true"
          style={{
            flexShrink: 0,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <UserPen size={10} strokeWidth={2.2} />
        </span>
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
      </span>
    </div>
  );
}

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
  ) => Array<
    Pick<ShiftJobSegment, "shiftId" | "jobId" | "position" | "isMentored">
  >;
  /** Pass focusAreaId for context-aware label resolution */
  getShiftStyle: (type: string, focusAreaName?: string) => AssignmentDefinition;
  handleCellClick: (
    emp: Employee,
    date: Date,
    focusAreaName?: string,
    trigger?: "click" | "keyboard",
  ) => void;
  today: Date;
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
  activeIndicatorIdsForKey?: (
    empId: string,
    date: Date,
    focusAreaId?: number,
  ) => number[];
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
  showDiffOverlay?: boolean;
  showPublishDiffOverlay?: boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedAssignmentIdsForKey?: (empId: string, date: Date) => number[];
  publishedAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  /** Returns true if the cell's custom times differ from published times. */
  hasTimeChangesForKey?: (empId: string, date: Date) => boolean;
  publishDiffForKey?: (
    empId: string,
    date: Date,
  ) => (PublishChange & { publishedAt: string; publishedBy: string }) | null;
  /** Set of cell keys (empId_date) that were recently published since user's last view */
  recentlyPublishedKeys?: Set<string>;
  cellLocks?: Map<string, { userName: string }>;
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
  /** Controls shift display: 'code' shows short labels, 'name' shows full names. */
  shiftDisplayMode?: ShiftDisplayMode;
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
  ) => Array<
    Pick<ShiftJobSegment, "shiftId" | "jobId" | "position" | "isMentored">
  >;
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
  activeIndicatorIdsForKey?: (
    empId: string,
    date: Date,
    focusAreaId?: number,
  ) => number[];
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
  ) => (PublishChange & { publishedAt: string; publishedBy: string }) | null;
  recentlyPublishedKeys?: Set<string>;
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  cellLocks?: Map<string, { userName: string }>;
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
  shiftDisplayMode?: ShiftDisplayMode;
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
  showDiffOverlay,
  showPublishDiffOverlay,
  publishedLabelForKey,
  publishedAssignmentIdsForKey,
  publishedAbsenceTypeIdForKey,
  publishDiffForKey,
  recentlyPublishedKeys,
  certifications,
  orgRoles,
  cellLocks,
  showAudit,
  createdByNameForKey,
  onCellHover,
  onCellContextMenu,
  onCellFocus,
  coverageRequirements,
  absenceTypeMap,
  absenceTypeIdForKey,
  shiftDisplayMode = "code",
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [activeOutlineRect, setActiveOutlineRect] =
    useState<ActiveOutlineRect | null>(null);

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
    showDiffOverlay,
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
    () =>
      createAssignmentDefinitionIdByPairMap([
        ...historicalAssignments,
        ...assignments,
      ]),
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
      const shiftId =
        assignment.shiftId ?? assignment.categoryId ?? null;
      const shift =
        shiftId != null ? (categoryById.get(shiftId) ?? null) : null;
      const job =
        assignment.jobId != null
          ? (jobById.get(assignment.jobId) ?? null)
          : null;

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
      computeDailyTallies(
        employees,
        date,
        fn,
        assignmentById,
        countableSectionCodeIds,
      ),
    );
  }, [
    weekDates,
    employees,
    assignmentIdsForKey,
    assignmentById,
    countableSectionCodeIds,
  ]);

  const totalRows = useMemo(() => {
    const countsByCategory = new Map<number, number[]>();

    for (const [dayIndex, dayTotals] of dailyTotals.entries()) {
      for (const [categoryIdValue, categoryTotals] of Object.entries(
        dayTotals,
      )) {
        const categoryId = Number(categoryIdValue);
        const counts =
          countsByCategory.get(categoryId) ?? Array(weekDates.length).fill(0);
        counts[dayIndex] = Object.values(categoryTotals).reduce(
          (sum, count) => sum + count,
          0,
        );
        countsByCategory.set(categoryId, counts);
      }
    }

    return Array.from(countsByCategory.entries())
      .sort(([leftCategoryId], [rightCategoryId]) => {
        const leftOrder =
          categoryById.get(leftCategoryId)?.sortOrder ??
          Number.MAX_SAFE_INTEGER;
        const rightOrder =
          categoryById.get(rightCategoryId)?.sortOrder ??
          Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        const leftLabel =
          categoryById.get(leftCategoryId)?.name ??
          `Category ${leftCategoryId}`;
        const rightLabel =
          categoryById.get(rightCategoryId)?.name ??
          `Category ${rightCategoryId}`;
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
            ? (resolveRequirement(
                coverageRequirements,
                sectionFocusArea.id,
                code.jobId,
                code.shiftId ?? code.categoryId ?? null,
                dayOfWeek,
              ) ??
              resolveRequirement(
                coverageRequirements,
                sectionFocusArea.id,
                code.id,
                dayOfWeek,
              ))
            : resolveRequirement(
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
        return (
          s.focusAreaId == null ||
          (sectionWing != null && s.focusAreaId === sectionWing.id)
        );
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
    (
      emp: Employee,
      date: Date,
      isLocked: boolean,
      trigger: "click" | "keyboard",
    ) => {
      const dateKey = formatDateKey(date);
      const cellId = buildCellId(emp.id, dateKey);
      const cellKey = getGridCellKey(cellId);
      if (bulkDeleteMode) {
        if (
          !isLocked &&
          bulkSelectableCellKeys?.has(cellKey) &&
          onToggleBulkDeleteCell
        ) {
          onToggleBulkDeleteCell(cellId);
        }
        return;
      }

      if (isCellInteractive && !isLocked) {
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
            fontSize: "var(--dg-fs-heading)",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            padding: "10px 0 8px",
          }}
        >
          {sectionName}
        </div>
        <div
          style={{
            padding: "24px 16px",
            textAlign: "center",
            border: "1px dashed var(--color-border)",
            borderRadius: "var(--dg-radius-md)",
            color: "var(--color-text-muted)",
            fontSize: "var(--dg-fs-body-sm)",
          }}
        >
          No staff assigned to this area.
        </div>
      </div>
    );
  }

  const gridTemplate = `var(--dg-grid-name-col-current, var(--dg-grid-name-col)) repeat(${weekDates.length}, minmax(var(--dg-grid-col-min-current, var(--dg-grid-col-min)), 1fr))`;
  const splitAtIndex = weekDates.length > 7 ? 7 : undefined;
  const isSplitDayDivider = (index: number) =>
    splitAtIndex !== undefined && index === splitAtIndex;
  const getDayDividerColor = (index: number) =>
    isSplitDayDivider(index)
      ? "var(--color-dark)"
      : "var(--color-border-light)";

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
          fontSize: "var(--dg-fs-heading)",
          fontWeight: 800,
          color: "var(--color-text-secondary)",
          marginBottom: 10,
          padding: "6px 10px 6px 8px",
          background: "var(--color-bg-secondary)",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 3,
            height: 18,
            borderRadius: 2,
            background: "var(--color-brand)",
            flexShrink: 0,
          }}
        />
        {sectionName}
      </div>

      <div
        style={{
          position: "relative",
          background: "var(--color-surface)",
          borderRadius: "var(--dg-radius-md)",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
          boxShadow: BOX_SHADOW_CARD,
        }}
      >
        {!fitToContainer && canScrollRight && (
          <button
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
              border: "1px solid rgba(15, 23, 42, 0.12)",
              background: "rgba(255, 255, 255, 0.96)",
              color: "var(--color-text-primary)",
              boxShadow: "0 8px 18px rgba(15, 23, 42, 0.14)",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(6px)",
            }}
          >
            More days
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
        {!fitToContainer && canScrollLeft && (
          <button
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
              border: "1px solid rgba(15, 23, 42, 0.12)",
              background: "rgba(255, 255, 255, 0.96)",
              color: "var(--color-text-primary)",
              boxShadow: "0 8px 18px rgba(15, 23, 42, 0.14)",
              fontSize: "var(--dg-fs-caption)",
              fontWeight: 700,
              cursor: "pointer",
              backdropFilter: "blur(6px)",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Earlier days
          </button>
        )}
        <div
          ref={scrollContainerRef}
          style={{
            overflowX: fitToContainer ? "hidden" : "auto",
          }}
        >
          <div
            ref={gridRef}
            role="grid"
            aria-label={`${sectionName} schedule grid`}
            style={{
              position: "relative",
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
                  zIndex: 4,
                  background: "var(--color-bg)",
                  padding: "10px var(--dg-space-md)",
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 600,
                  color: "var(--color-text-subtle)",
                  letterSpacing: "0.04em",
                  boxShadow: joinBoxShadows(
                    "1px 0 0 0 var(--color-border-light)",
                    "0 1px 0 0 var(--color-dark)",
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
                      index === 0
                        ? "none"
                        : isSplitDayDivider(index)
                          ? "split"
                          : "light"
                    }
                    data-week-split-start={
                      isSplitDayDivider(index) ? "true" : undefined
                    }
                    data-today={isToday ? "true" : undefined}
                    style={{
                      position: "relative",
                      zIndex: 2,
                      textAlign: "center",
                      padding: "8px 0",
                      boxShadow: "0 1px 0 0 var(--color-dark)",
                    }}
                  >
                    <div className="dg-grid-slot__chrome" aria-hidden="true" />
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        color: isToday
                          ? "var(--color-today-text)"
                          : "var(--color-text-subtle)",
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
                          ? "var(--color-today-text)"
                          : "var(--color-text-secondary)",
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
                  background: "var(--color-warning-bg, #FFF8E1)",
                  alignItems: "stretch",
                }}
              >
                {/* Label cell */}
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 3,
                    background: "var(--color-warning-bg, #FFF8E1)",
                    display: "flex",
                    alignItems: "center",
                    alignSelf: "stretch",
                    padding: "6px 10px",
                    fontWeight: 700,
                    fontSize: "var(--dg-fs-caption)",
                    color: "var(--color-warning-text, #92400E)",
                    gap: 6,
                    whiteSpace: "nowrap",
                    borderBottom:
                      "2px dashed var(--color-warning-border, #F59E0B)",
                    boxShadow: "1px 0 0 0 var(--color-border)",
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
                      background: "var(--color-warning)",
                      color: "#fff",
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
                  const cellOpenShifts = openShifts.filter(
                    (os) => os.date === dateKey,
                  );
                  return (
                    <div
                      key={dateKey}
                      className="dg-grid-slot dg-grid-slot--open"
                      data-leading-divider={
                        index === 0
                          ? "none"
                          : isSplitDayDivider(index)
                            ? "split"
                            : "light"
                      }
                      data-week-split-start={
                        isSplitDayDivider(index) ? "true" : undefined
                      }
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
                      <div
                        className="dg-grid-slot__chrome"
                        aria-hidden="true"
                      />
                      {cellOpenShifts.map((os) => {
                        const sc =
                          os.assignmentIds[0] != null
                            ? assignmentById.get(os.assignmentIds[0])
                            : undefined;
                        const displayParts = getDisplayPartsByIdOrLabel(
                          os.assignmentLabel,
                          os.assignmentIds[0],
                        );
                        const hasSecondaryLabel =
                          displayParts.secondaryLabel != null &&
                          displayParts.secondaryLabel.trim().length > 0;
                        const isMentoredOpenShift =
                          os.segments?.some(
                            (segment) => segment.isMentored === true,
                          ) ?? false;
                        const needed = os.needed ?? 1;
                        return (
                          <MaybeHint
                            key={os.id}
                            content={
                              os.calledOffBy
                                ? `Called off by ${os.calledOffBy}`
                                : `${needed} needed — click to volunteer`
                            }
                            side="top"
                          >
                            <button
                              className="dg-open-shift-btn"
                              onClick={() => onClaimOpenShift?.(os)}
                              aria-label={
                                os.calledOffBy
                                  ? `Called off by ${os.calledOffBy}`
                                  : `${needed} needed — click to volunteer`
                              }
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
                                borderRadius: 6,
                                border: `1.5px dashed ${sc?.border ?? "var(--color-warning-border, #F59E0B)"}`,
                                background: sc?.color ?? "var(--color-surface)",
                                color:
                                  sc?.text ??
                                  "var(--color-warning-text, #92400E)",
                                fontSize: "var(--dg-fs-caption)",
                                fontWeight: 600,
                                cursor: "pointer",
                                lineHeight: 1.3,
                                overflow: "hidden",
                              }}
                            >
                              {isMentoredOpenShift ? (
                                <MentoredShiftBadge compact />
                              ) : null}
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
                                    fontWeight: 800,
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
                                      lineHeight: 1,
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
                                  background:
                                    sc?.text ?? "var(--color-warning)",
                                  color: sc?.color ?? "#fff",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  lineHeight: 1,
                                  flexShrink: 0,
                                }}
                              >
                                {needed}
                              </span>
                            </button>
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
              const hasHighlightedSearch = !!(
                highlightEmpIds && highlightEmpIds.size > 0
              );
              const isHighlighted = hasHighlightedSearch
                ? highlightEmpIds?.has(emp.id) ?? false
                : true;
              const isCurrentUser = !!(
                emp.userId &&
                currentUser &&
                emp.userId === currentUser.id
              );
              const baseRowBg = isCurrentUser
                ? "var(--color-today-bg)"
                : "var(--color-surface)";
              const rowBg =
                hasHighlightedSearch && isHighlighted
                  ? isCurrentUser
                    ? "linear-gradient(90deg, var(--color-brand-bg) 0%, var(--color-today-bg) 100%)"
                    : "var(--color-brand-bg)"
                  : baseRowBg;
              const certAbbr = getCertAbbr(emp.certificationId, certifications);
              const dc = DESIGNATION_COLORS[certAbbr] ?? DEFAULT_DESIG_COLOR;

              return (
                <div
                  key={emp.id}
                  role="row"
                  className="dg-row-enter"
                  data-search-highlight={
                    hasHighlightedSearch && isHighlighted ? "true" : undefined
                  }
                  style={{
                    ...rowGrid,
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
                      zIndex: 3,
                      background: rowBg,
                      padding: "7px var(--dg-space-md)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      minWidth: 0,
                      borderTop:
                        ri > 0
                          ? "1px solid var(--color-border-light)"
                          : undefined,
                      boxShadow: joinBoxShadows(
                        hasHighlightedSearch && isHighlighted
                          ? "inset 4px 0 0 0 var(--color-brand)"
                          : undefined,
                        "1px 0 0 0 var(--color-border-light)",
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
                      <MaybeHint
                        content={getEmployeeDisplayName(emp)}
                        side="top"
                      >
                        <span
                          style={{
                            fontSize: "var(--dg-fs-label)",
                            fontWeight: 600,
                            color:
                              hasHighlightedSearch && isHighlighted
                                ? "var(--color-brand)"
                                : "var(--color-text-secondary)",
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
                        <span
                          style={{
                            fontSize: "var(--dg-fs-badge)",
                            color: "var(--color-text-subtle)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            lineHeight: "var(--dg-lh-tight)",
                          }}
                        >
                          {getRoleAbbrs(emp.roleIds, orgRoles).join(", ")}
                        </span>
                      )}
                    </div>
                    {emp.certificationId != null && (
                      <span
                        style={{
                          fontSize: "var(--dg-fs-caption)",
                          fontWeight: 700,
                          background: dc.bg,
                          color: dc.text,
                          padding: "2px 7px",
                          borderRadius: 20,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                          letterSpacing: "0.01em",
                        }}
                      >
                        {certAbbr}
                      </span>
                    )}
                  </div>

                  {/* Shift cells */}
                  {(() => {
                    return weekDates.map((date, index) => {
                      const dateKey = formatDateKey(date);
                      const cellKey = `${emp.id}_${dateKey}`;
                      const isToday = dateKey === todayKey;
                      const shiftLabel = shiftForKey(emp.id, date);
                      const cellCodeIds =
                        assignmentIdsForKey?.(emp.id, date) ?? [];
                      const cellSegments =
                        segmentsForKey?.(emp.id, date) ?? [];
                      const draftKind = draftKindForKey?.(emp.id, date) ?? null;
                      const publishDiff =
                        publishDiffForKey?.(emp.id, date) ?? null;
                      const showsPublishDiff = !!(
                        (showPublishDiffOverlay ?? showDiffOverlay) &&
                        publishDiff
                      );
                      const publishedLabel =
                        publishedLabelForKey?.(emp.id, date) ?? null;
                      const publishedCodeIds =
                        publishedAssignmentIdsForKey?.(emp.id, date) ?? [];
                      const publishedSegments =
                        publishedSegmentsForKey?.(emp.id, date) ?? [];
                      const publishedCustomTimes =
                        getPublishedCustomShiftTimes?.(emp.id, date) ?? null;
                      const noteTypes =
                        activeIndicatorIdsForKey?.(
                          emp.id,
                          date,
                          sectionFocusArea?.id,
                        ) ?? [];
                      const customTimes =
                        getCustomShiftTimes?.(emp.id, date) ?? null;
                      const cellLock = cellLocks?.get(cellKey);
                      const isLocked = !!cellLock;
                      const auditName =
                        createdByNameForKey?.(emp.id, date) ?? null;
                      const shouldShowAuthorName =
                        !!auditName && (showAudit || !!draftKind);
                      const shouldComputeDraftDiff =
                        !!draftKind && draftKind !== "deleted";
                      const showsDraftBadge = cellShowsDraftDiffBadge({
                        draftKind,
                        showDiffOverlay: !!showDiffOverlay,
                      });
                      const currentAbsenceTypeId =
                        absenceTypeIdForKey?.(emp.id, date) ?? null;
                      const publishedAbsenceTypeId =
                        publishedAbsenceTypeIdForKey?.(emp.id, date) ?? null;
                      const cellAbsenceType =
                        currentAbsenceTypeId != null
                          ? (absenceTypeMap?.get(currentAbsenceTypeId) ?? null)
                          : null;

                      const showDiffCellTint =
                        (!!showDiffOverlay && !!draftKind) ||
                        showsPublishDiff;
                      const topDivider =
                        ri > 0
                          ? "light"
                          : showDiffCellTint
                            ? (openShifts?.length ?? 0) > 0
                              ? "warning"
                              : "dark"
                            : undefined;
                      const cellId = buildCellId(emp.id, dateKey);
                      const bulkCellKey = getGridCellKey(cellId);
                      const isBulkSelectable =
                        bulkDeleteMode &&
                        !isLocked &&
                        !!bulkSelectableCellKeys?.has(bulkCellKey);
                      const isBulkSelected =
                        bulkDeleteMode &&
                        !!bulkSelectedCellKeys?.has(bulkCellKey);
                      const isActiveCell = areGridCellIdsEqual(
                        activeCellId,
                        cellId,
                      );
                      const hasDraggableEntry =
                        canDragShifts &&
                        !bulkDeleteMode &&
                        !isLocked &&
                        !!shiftLabel &&
                        shiftLabel !== "OFF" &&
                        draftKind !== "deleted";
                      const firstStyle = hasDraggableEntry
                        ? getStyleByIdOrLabel(
                            shiftLabel.split("/")[0],
                            cellCodeIds[0],
                          )
                        : null;
                      const leadingDividerInset = index === 0 ? 0 : 1;
                      // The first employee row still sits under a painted divider
                      // from the header or open-shifts row, so account for that
                      // visible stroke when placing inset pills.
                      const topDividerInset =
                        ri > 0 ? 1 : (openShifts?.length ?? 0) > 0 ? 2 : 1;
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
                          disabled={!isCellInteractive || isLocked || bulkDeleteMode}
                          className="dg-grid-cell"
                          role="gridcell"
                          aria-label={
                            shiftLabel && shiftLabel !== "OFF"
                              ? `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[date.getDay()]} ${date.getDate()}: ${shiftLabel}${isBulkSelected ? ", selected for removal" : ""}`
                              : `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[date.getDay()]} ${date.getDate()}: empty`
                          }
                          aria-selected={
                            bulkDeleteMode ? isBulkSelected : undefined
                          }
                          tabIndex={
                            isCellInteractive || isBulkSelectable ? 0 : -1
                          }
                          data-emp-id={emp.id}
                          data-date-key={dateKey}
                          data-section-id={sectionId}
                          data-interactive={
                            isCellInteractive ? "true" : "false"
                          }
                          data-locked={isLocked ? "true" : "false"}
                          data-empty={
                            !shiftLabel || shiftLabel === "OFF"
                              ? "true"
                              : "false"
                          }
                          data-slot="cell"
                          data-leading-divider={
                            index === 0
                              ? "none"
                              : isSplitDayDivider(index)
                                ? "split"
                                : "light"
                          }
                          data-week-split-start={
                            isSplitDayDivider(index) ? "true" : undefined
                          }
                          data-today={isToday ? "true" : undefined}
                          data-top-divider={topDivider}
                          data-active={isActiveCell ? "true" : undefined}
                          data-bulk-mode={
                            bulkDeleteMode ? "true" : undefined
                          }
                          data-bulk-selectable={
                            isBulkSelectable ? "true" : undefined
                          }
                          data-bulk-selected={
                            isBulkSelected ? "true" : undefined
                          }
                          style={{
                            height: "var(--dg-grid-cell-height)",
                            background: isBulkSelected
                              ? "var(--color-brand-bg)"
                              : showDiffCellTint
                                ? rowBg
                                : undefined,
                            zIndex: showDiffCellTint
                              ? 8
                              : ri === 0
                                ? 5
                                : undefined,
                          }}
                          onFocus={() => onCellFocus?.(cellId)}
                          onMouseEnter={() => onCellHover?.(cellId)}
                          onClick={() =>
                            triggerCellActivation(
                              emp,
                              date,
                              isLocked || !isCellInteractive,
                              "click",
                            )
                          }
                          onContextMenu={(event) =>
                            triggerCellContextMenu(
                              event,
                              event.currentTarget,
                              cellId,
                              emp,
                              date,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              triggerCellActivation(
                                emp,
                                date,
                                isLocked || !isCellInteractive,
                                "keyboard",
                              );
                            }
                            if (event.shiftKey && event.key === "F10") {
                              triggerCellContextMenu(
                                event,
                                event.currentTarget,
                                cellId,
                                emp,
                                date,
                              );
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
                                            : cellCodeIds.map(
                                                (assignmentId, position) => {
                                                  const assignment =
                                                    assignmentById.get(
                                                      assignmentId,
                                                    );
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
                                                },
                                              )
                                          )
                                            .map((segment, position) => {
                                              if (!segment) return null;
                                              const assignmentId =
                                                assignmentIdByPair.get(
                                                  buildShiftJobPairKey(
                                                    segment.shiftId ?? null,
                                                    segment.jobId,
                                                  ),
                                                );
                                              const assignment =
                                                assignmentId == null
                                                  ? null
                                                  : assignmentById.get(
                                                      assignmentId,
                                                    );
                                              return {
                                                shiftId:
                                                  segment.shiftId ??
                                                  assignment?.shiftId ??
                                                  assignment?.categoryId ??
                                                  null,
                                                jobId: segment.jobId,
                                                position:
                                                  segment.position ?? position,
                                                isMentored:
                                                  segment.isMentored ?? false,
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
                                    "var(--color-bg)",
                                  pillText:
                                    cellAbsenceType?.text ??
                                    firstStyle?.text ??
                                    "var(--color-text-muted)",
                                }}
                                disabled={!hasDraggableEntry}
                              >
                                {(() => {
                                  const labels = shiftLabel.split("/");
                                  const isPubDiff =
                                    !draftKind && showsPublishDiff
                                      ? publishDiff
                                      : null;
                                  const publishFrom =
                                    publishDiff?.from ??
                                    assignmentIdsFromPublishState(
                                      publishDiff?.fromState,
                                      assignmentIdByPair,
                                    );
                                  const publishTo =
                                    publishDiff?.to ??
                                    assignmentIdsFromPublishState(
                                      publishDiff?.toState,
                                      assignmentIdByPair,
                                    );
                                  const currentShiftLabels =
                                    splitShiftLabelParts(shiftLabel);
                                  const publishedShiftLabels =
                                    splitShiftLabelParts(publishedLabel);
                                  const resolveGridShiftLabel = (
                                    assignmentId: number,
                                  ) => {
                                    const assignmentEntry =
                                      assignmentById.get(assignmentId);
                                    if (!assignmentEntry) return "?";
                                    return isNameMode
                                      ? assignmentEntry.name ||
                                          assignmentEntry.label
                                      : assignmentEntry.label;
                                  };
                                  const resolveGridAbsenceLabel = (
                                    absenceTypeId: number,
                                  ) => {
                                    const absenceType =
                                      absenceTypeMap?.get(absenceTypeId);
                                    if (!absenceType) return "?";
                                    return isNameMode
                                      ? absenceType.name || absenceType.label
                                      : absenceType.label;
                                  };
                                  const draftDiff = shouldComputeDraftDiff
                                    ? buildShiftDiffDescriptors({
                                        before: {
                                          assignmentIds: publishedCodeIds,
                                          absenceTypeId: publishedAbsenceTypeId,
                                          isMentoredFlags:
                                            publishedSegments.map(
                                              (segment) =>
                                                segment.isMentored ?? false,
                                            ),
                                          timeRanges: timeRangesFromCustomTimes(
                                            {
                                              customTimes: publishedCustomTimes,
                                              count: publishedCodeIds.length,
                                            },
                                          ),
                                        },
                                        after: {
                                          assignmentIds: cellCodeIds,
                                          absenceTypeId: currentAbsenceTypeId,
                                          isMentoredFlags: cellSegments.map(
                                            (segment) =>
                                              segment.isMentored ?? false,
                                          ),
                                          timeRanges: timeRangesFromCustomTimes(
                                            {
                                              customTimes,
                                              count: cellCodeIds.length,
                                            },
                                          ),
                                        },
                                        beforeShiftLabels: publishedShiftLabels,
                                        afterShiftLabels: currentShiftLabels,
                                        resolveAssignmentDefinitionLabel:
                                          resolveGridShiftLabel,
                                        resolveAbsenceLabel:
                                          resolveGridAbsenceLabel,
                                      })
                                    : null;
                                  const publishDiffSummary = isPubDiff
                                    ? buildShiftDiffDescriptors({
                                        before: {
                                          assignmentIds: publishFrom,
                                          absenceTypeId:
                                            publishDiff!.fromAbsenceTypeId ??
                                            absenceTypeIdFromPublishState(
                                              publishDiff?.fromState,
                                            ),
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
                                            absenceTypeIdFromPublishState(
                                              publishDiff?.toState,
                                            ),
                                          timeRanges: timeRangesFromPublishState(
                                            publishDiff?.toState,
                                            publishDiff?.toCustomStart,
                                            publishDiff?.toCustomEnd,
                                            publishTo.length,
                                          ),
                                        },
                                        beforeShiftLabels:
                                          publishDiff?.fromSegments?.map(
                                            (segment) => segment.label ?? "?",
                                          ),
                                        afterShiftLabels:
                                          publishDiff?.toSegments?.map(
                                            (segment) => segment.label ?? "?",
                                          ) ?? currentShiftLabels,
                                        resolveAssignmentDefinitionLabel:
                                          resolveGridShiftLabel,
                                        resolveAbsenceLabel:
                                          resolveGridAbsenceLabel,
                                      })
                                    : null;

                                  let publishBadge: GridDiffBadgeConfig | null =
                                    null;
                                  if (
                                    isPubDiff &&
                                    publishDiffSummary?.cellBadge &&
                                    publishDiffSummary.cellBadge.text ===
                                      "Changed"
                                  ) {
                                    publishBadge = {
                                      source: "publish",
                                      kind: publishDiffSummary.cellBadge.kind,
                                      text: publishDiffSummary.cellBadge.text,
                                      tooltip: buildPublishTooltip({
                                        publishDiff: publishDiff!,
                                        resolvePublisherName,
                                        detail:
                                          publishDiffSummary.cellBadge.detail,
                                      }),
                                    };
                                  }
                                  // Absence cells produce no pill diffs (pills
                                  // are keyed off after-side assignment ids,
                                  // which absences don't have), so the ring
                                  // kind has to come from the cell-level diff
                                  // directly. We never promote that change to a
                                  // text badge — the banner legend explains the
                                  // ring colors instead.
                                  const publishRingKind: ShiftDiffBorderKind =
                                    publishBadge?.kind === "new" ||
                                    publishBadge?.kind === "modified"
                                      ? publishBadge.kind
                                      : isPubDiff &&
                                          publishDiffSummary &&
                                          publishDiffSummary.pillDiffs
                                            .length === 0 &&
                                          (publishDiffSummary.cellBadge
                                            ?.kind === "new" ||
                                            publishDiffSummary.cellBadge
                                              ?.kind === "modified")
                                        ? publishDiffSummary.cellBadge.kind
                                        : null;

                                  let draftBadge: GridDiffBadgeConfig | null =
                                    null;
                                  if (
                                    showsDraftBadge &&
                                    draftDiff?.cellBadge &&
                                    draftDiff.cellBadge.text === "Changed"
                                  ) {
                                    draftBadge = {
                                      source: "draft",
                                      kind: draftDiff.cellBadge.kind,
                                      text: draftDiff.cellBadge.text,
                                      tooltip: draftDiff.cellBadge.detail,
                                    };
                                  }

                                  const buildPillBadge = (args: {
                                    source: "publish" | "draft";
                                    descriptor:
                                      | ShiftDiffBadgeDescriptor
                                      | null
                                      | undefined;
                                  }): GridDiffBadgeConfig | null => {
                                    const { source, descriptor } = args;
                                    if (
                                      !descriptor ||
                                      (descriptor.kind === "new" &&
                                        descriptor.text === "New")
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
                                            })
                                          : descriptor.detail,
                                    };
                                  };

                                  if (labels.length === 1) {
                                    const label = labels[0];
                                    const isAbsence = cellAbsenceType != null;
                                    const style = isAbsence
                                      ? {
                                          ...getStyleByIdOrLabel(
                                            label,
                                            cellCodeIds[0],
                                          ),
                                          color: cellAbsenceType!.color,
                                          text: cellAbsenceType!.text,
                                        }
                                      : getStyleByIdOrLabel(
                                          label,
                                          cellCodeIds[0],
                                        );
                                    const codeEntry0 =
                                      cellCodeIds[0] != null
                                        ? assignmentById.get(cellCodeIds[0])
                                        : undefined;
                                    const cat0 =
                                      codeEntry0?.categoryId != null
                                        ? categoryById.get(
                                            codeEntry0.categoryId,
                                          )
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
                                      codeEntry0.focusAreaId !==
                                        sectionFocusArea.id;
                                    const displayParts = isAbsence
                                      ? {
                                          primaryLabel: label,
                                          secondaryLabel: null,
                                        }
                                      : getDisplayPartsByIdOrLabel(
                                          label,
                                          cellCodeIds[0],
                                        );
                                    const crossHomeFa = isCross
                                      ? focusAreas.find(
                                          (fa) =>
                                            fa.id === codeEntry0!.focusAreaId,
                                        )
                                      : undefined;
                                    const singleDraftDiffBorderKind: ShiftDiffBorderKind =
                                      draftDiff?.pillDiffs[0]?.borderKind ??
                                      (draftKind === "new" ||
                                      draftKind === "modified"
                                        ? draftKind
                                        : null);
                                    const singleDraftBorderKind: DraftKind =
                                      singleDraftDiffBorderKind ?? draftKind;
                                    const singlePublishRingKind =
                                      publishDiffSummary?.pillDiffs[0]
                                        ?.borderKind ?? publishRingKind;
                                    const singleAuthorLeftInset =
                                      5 + leadingDividerInset;
                                    const singleAuthorBottomInset =
                                      (customTimes ? 3 : 4) + 1;
                                    const singleUsesShiftColor =
                                      shouldUseShiftColorForDiffState({
                                        isCross,
                                      });
                                    const singleForegroundColor =
                                      singleUsesShiftColor
                                        ? style.text
                                        : getReadableTextOnSurface(
                                            style.color,
                                            style.text,
                                          );
                                    // Compute effective border: draft indicators use dashed border
                                    const absenceBorder = isAbsence
                                      ? `1px solid ${cellAbsenceType!.border}`
                                      : `1px solid ${borderColor(singleForegroundColor)}`;
                                    const effectiveBorder =
                                      singleDraftBorderKind
                                        ? getDraftBorder(
                                            singleDraftBorderKind,
                                            absenceBorder,
                                          )
                                        : absenceBorder;
                                    const singlePillBadge =
                                      (showsDraftBadge && draftBadge == null
                                        ? buildPillBadge({
                                            source: "draft",
                                            descriptor:
                                              draftDiff?.pillDiffs[0]?.badge,
                                          })
                                        : null) ??
                                      (publishBadge == null
                                        ? buildPillBadge({
                                            source: "publish",
                                            descriptor:
                                              publishDiffSummary?.pillDiffs[0]
                                                ?.badge,
                                          })
                                        : null);
                                    const singleHasRaisedDiffBadge = !!(
                                      singlePillBadge ||
                                      draftBadge ||
                                      publishBadge
                                    );
                                    const singleTopInset =
                                      singleHasRaisedDiffBadge
                                        ? RAISED_DIFF_BADGE_TOP_INSET
                                        : customTimes
                                          ? 3
                                          : 4;
                                    const singleSideInset = 4;
                                    const singleBottomInset = customTimes
                                      ? 3
                                      : 4;
                                    const singleCrossFocusPill =
                                      isCross && crossHomeFa
                                        ? crossHomeFa
                                        : null;
                                    const singleCrossFocusPalette =
                                      getCrossFocusBadgePalette(style);
                                    const showSingleSecondaryLine =
                                      !!displayParts.secondaryLabel;
                                    const singleDisplayLabel =
                                      displayParts.primaryLabel;
                                    const singleIsMentored =
                                      !isAbsence &&
                                      (cellSegments[0]?.isMentored ?? false);
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
                                              pillRadius:
                                                SINGLE_SHIFT_PILL_RADIUS,
                                            })}
                                          />
                                        )}
                                        <div
                                          data-shift-pill="single"
                                          style={{
                                            position: "absolute",
                                            top: insetFromVisibleCellTop(
                                              singleTopInset,
                                            ),
                                            right: `${singleSideInset}px`,
                                            bottom: `${singleBottomInset}px`,
                                            left: insetFromVisibleCellLeft(
                                              singleSideInset,
                                            ),
                                            background: singleUsesShiftColor
                                              ? style.color
                                              : "var(--color-surface)",
                                            opacity:
                                              draftKind === "deleted" ? 0.5 : 1,
                                            border: effectiveBorder,
                                            borderRadius:
                                              SINGLE_SHIFT_PILL_RADIUS,
                                            color: singleForegroundColor,
                                            boxShadow:
                                              singlePublishRingKind === "new" ||
                                              singlePublishRingKind ===
                                                "modified"
                                                ? getPublishDiffBoxShadow(
                                                    singlePublishRingKind,
                                                    borderColor(
                                                      singleForegroundColor,
                                                    ),
                                                  )
                                                : "none",
                                            cursor: "pointer",
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            padding: isNameMode
                                              ? "2px 6px"
                                              : "2px 3px",
                                            paddingTop: 2,
                                            paddingLeft:
                                              singleCrossFocusPill
                                                ? SINGLE_CROSS_FOCUS_CONTENT_LEFT_PADDING
                                                : isNameMode
                                                  ? 6
                                                  : 3,
                                            paddingRight: isNameMode ? 6 : 3,
                                            overflow: singlePillBadge
                                              ? "visible"
                                              : "hidden",
                                            textDecoration:
                                              draftKind === "deleted"
                                                ? "line-through"
                                                : "none",
                                          }}
                                        >
                                          {singlePillBadge && (
                                            <GridDiffBadge
                                              badge={{
                                                ...singlePillBadge,
                                                topOffset: -8,
                                                leftOffset: 4,
                                              }}
                                            />
                                          )}
                                          {singleCrossFocusPill && (
                                            <span
                                              style={{
                                                position: "absolute",
                                                top: 0,
                                                bottom: 0,
                                                left: 0,
                                                display: "flex",
                                                alignItems: "center",
                                                fontSize:
                                                  "var(--dg-fs-footnote)",
                                                fontWeight: 800,
                                                lineHeight: 1,
                                                background:
                                                  singleCrossFocusPalette.background,
                                                color:
                                                  singleCrossFocusPalette.color,
                                                borderRadius: "2px 0 0 2px",
                                                padding: "0 3px",
                                                letterSpacing: "0.02em",
                                                pointerEvents: "none",
                                              }}
                                            >
                                              {getFocusAreaInitials(
                                                singleCrossFocusPill.name,
                                              )}
                                            </span>
                                          )}
                                          {singleIsMentored && (
                                            <MentoredShiftBadge />
                                          )}
                                          <div
                                            style={{
                                              display: "flex",
                                              flexDirection: "column",
                                              alignItems: "center",
                                              gap: showSingleSecondaryLine
                                                ? 1
                                                : 0,
                                              maxWidth: "100%",
                                              minWidth: 0,
                                            }}
                                          >
                                            <span
                                              style={
                                                isNameMode
                                                  ? {
                                                      fontSize:
                                                        "var(--dg-fs-caption)",
                                                      fontWeight: 800,
                                                      lineHeight: 1.2,
                                                      textAlign:
                                                        "center" as const,
                                                      maxWidth: "100%",
                                                      overflowWrap:
                                                        "break-word" as const,
                                                      display: "-webkit-box",
                                                      WebkitBoxOrient:
                                                        "vertical" as const,
                                                      WebkitLineClamp:
                                                        showSingleSecondaryLine
                                                          ? 1
                                                          : customTimes
                                                            ? 1
                                                            : 2,
                                                      overflow: "hidden",
                                                    }
                                                  : {
                                                      fontSize:
                                                        "var(--dg-fs-title)",
                                                      fontWeight: 800,
                                                      lineHeight: 1,
                                                      whiteSpace: "nowrap",
                                                      overflow: "hidden",
                                                      textOverflow: "ellipsis",
                                                      maxWidth: "100%",
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
                                            {showSingleSecondaryLine ? (
                                              <span
                                                style={{
                                                  fontSize:
                                                    "var(--dg-fs-footnote)",
                                                  fontWeight: 700,
                                                  lineHeight: 1,
                                                  opacity: 0.78,
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
                                          {customTimes && (
                                            <span
                                              style={{
                                                fontSize:
                                                  "var(--dg-fs-footnote)",
                                                fontWeight: 500,
                                                lineHeight: 1,
                                                marginTop: 4,
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
                                                bottom: shouldShowAuthorName
                                                  ? 18
                                                  : 3,
                                                right: 4,
                                                display: "flex",
                                                gap: 2,
                                              }}
                                            >
                                              {indicatorTypes
                                                .filter((ind) =>
                                                  noteTypes.includes(ind.id),
                                                )
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
                                                ...(draftBadge ??
                                                  publishBadge!),
                                                topOffset: -8,
                                                rightOffset: 4,
                                              }}
                                            />
                                          )}
                                        </div>
                                        {shouldShowAuthorName && auditName && (
                                          <AuthorBadge
                                            name={auditName}
                                            leftInset={singleAuthorLeftInset}
                                            rightInset={
                                              noteTypes.length > 0 ? 21 : 5
                                            }
                                            bottomInset={
                                              singleAuthorBottomInset
                                            }
                                          />
                                        )}
                                      </>
                                    );
                                  }

                                  // Multi-pill: render each shift as a separate vertical pill
                                  const multiTopInset =
                                    showsDraftBadge || showsPublishDiff
                                      ? RAISED_DIFF_BADGE_TOP_INSET
                                      : 3;
                                  const multiSideInset = 3;
                                  const multiBottomInset = 3;
                                  const multiAuthorLeftInset =
                                    4 + leadingDividerInset;
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
                                            pillRadius:
                                              MULTI_SHIFT_PILL_RADIUS,
                                          })}
                                        />
                                      )}
                                      <div
                                        style={{
                                          position: "absolute",
                                          top: insetFromVisibleCellTop(
                                            multiTopInset,
                                          ),
                                          right: `${multiSideInset}px`,
                                          bottom: `${multiBottomInset}px`,
                                          left: insetFromVisibleCellLeft(
                                            multiSideInset,
                                          ),
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 1,
                                          alignItems: "stretch",
                                          opacity:
                                            draftKind === "deleted" ? 0.5 : 1,
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "flex",
                                            flexDirection: "row",
                                            gap: 1,
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
                                            const codeEntryLi =
                                              cellCodeIds[li] != null
                                                ? assignmentById.get(
                                                    cellCodeIds[li],
                                                  )
                                                : undefined;
                                            const isCross =
                                              label !== "X" &&
                                              codeEntryLi?.focusAreaId !=
                                                null &&
                                              sectionFocusArea != null &&
                                              codeEntryLi.focusAreaId !==
                                                sectionFocusArea.id;
                                            const displayParts =
                                              getDisplayPartsByIdOrLabel(
                                                label,
                                                cellCodeIds[li],
                                              );
                                            const crossHomeFaLi = isCross
                                              ? focusAreas.find(
                                                  (fa) =>
                                                    fa.id ===
                                                    codeEntryLi!.focusAreaId,
                                                )
                                              : undefined;
                                            const draftPillDiff = draftDiff
                                              ?.pillDiffs[li] ?? {
                                              borderKind:
                                                draftKind === "new" ||
                                                draftKind === "modified"
                                                  ? draftKind
                                                  : null,
                                              badge: null,
                                            };
                                            const draftPillBorderKind: DraftKind =
                                              draftDiff
                                                ? draftPillDiff.borderKind
                                                : draftPillDiff.borderKind ??
                                                  draftKind;
                                            const publishRingStatus =
                                              publishDiffSummary?.pillDiffs[li]
                                                ?.borderKind ?? null;
                                            const multiUsesShiftColor =
                                              shouldUseShiftColorForDiffState({
                                                isCross,
                                              });
                                            const multiForegroundColor =
                                              multiUsesShiftColor
                                                ? style.text
                                                : getReadableTextOnSurface(
                                                    style.color,
                                                    style.text,
                                                  );
                                            const pillBadge =
                                              (showsDraftBadge &&
                                              draftBadge == null
                                                ? buildPillBadge({
                                                    source: "draft",
                                                    descriptor:
                                                      draftDiff?.pillDiffs[li]
                                                        ?.badge,
                                                  })
                                                : null) ??
                                              (publishBadge == null
                                                ? buildPillBadge({
                                                    source: "publish",
                                                    descriptor:
                                                      publishDiffSummary
                                                        ?.pillDiffs[li]?.badge,
                                                  })
                                                : null);
                                            const pillBorder =
                                              draftPillBorderKind
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
                                              pillTime &&
                                              (pillTime.start || pillTime.end);
                                            const catLi =
                                              codeEntryLi?.categoryId != null
                                                ? categoryById.get(
                                                    codeEntryLi.categoryId,
                                                  )
                                                : undefined;
                                            const isPillOvernight =
                                              isOvernightTimes(
                                                pillTime?.start ??
                                                  codeEntryLi?.defaultStartTime ??
                                                  catLi?.startTime,
                                                pillTime?.end ??
                                                  codeEntryLi?.defaultEndTime ??
                                                  catLi?.endTime,
                                              );
                                            const multiCrossFocusPill =
                                              isCross && crossHomeFaLi
                                                ? crossHomeFaLi
                                                : null;
                                            const multiCrossFocusPalette =
                                              getCrossFocusBadgePalette(style);
                                            const showMultiSecondaryLine =
                                              !!displayParts.secondaryLabel;
                                            const multiDisplayLabel =
                                              displayParts.primaryLabel;
                                            const isMentoredPill =
                                              cellSegments[li]?.isMentored ??
                                              false;

                                            return (
                                              <div
                                                key={li}
                                                data-shift-pill="multi"
                                                style={{
                                                  flex: 1,
                                                  background:
                                                    multiUsesShiftColor
                                                      ? style.color
                                                      : "var(--color-surface)",
                                                  border: pillBorder,
                                                  borderRadius:
                                                    MULTI_SHIFT_PILL_RADIUS,
                                                  color: multiForegroundColor,
                                                  boxShadow: (() => {
                                                    return publishRingStatus ===
                                                      "new" ||
                                                      publishRingStatus ===
                                                        "modified"
                                                      ? getPublishDiffBoxShadow(
                                                          publishRingStatus,
                                                          borderColor(
                                                            multiForegroundColor,
                                                          ),
                                                        )
                                                      : "none";
                                                  })(),
                                                  display: "flex",
                                                  flexDirection: "column",
                                                  alignItems: "center",
                                                  justifyContent: "center",
                                                  gap: 1,
                                                  fontSize: isNameMode
                                                    ? "var(--dg-fs-micro)"
                                                    : "var(--dg-fs-caption)",
                                                  fontWeight: 800,
                                                  position: "relative",
                                                  cursor: "pointer",
                                                  textDecoration:
                                                    draftKind === "deleted"
                                                      ? "line-through"
                                                      : "none",
                                                  lineHeight: isNameMode
                                                    ? 1.2
                                                    : 1,
                                                  overflow: pillBadge
                                                    ? "visible"
                                                    : "hidden",
                                                  minWidth: 0,
                                                  padding: isNameMode
                                                    ? "2px 4px"
                                                    : "2px 3px",
                                                  paddingTop: 2,
                                                  paddingLeft:
                                                    multiCrossFocusPill
                                                      ? MULTI_CROSS_FOCUS_CONTENT_LEFT_PADDING
                                                      : isNameMode
                                                        ? 4
                                                        : 3,
                                                  paddingRight: isNameMode
                                                    ? 4
                                                    : 3,
                                                }}
                                              >
                                                {pillBadge && (
                                                  <GridDiffBadge
                                                    badge={{
                                                      ...pillBadge,
                                                      topOffset: -8,
                                                      leftOffset: 4,
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
                                                      fontSize:
                                                        "var(--dg-fs-micro)",
                                                      fontWeight: 800,
                                                      lineHeight: 1,
                                                      background:
                                                        multiCrossFocusPalette.background,
                                                      color:
                                                        multiCrossFocusPalette.color,
                                                      borderRadius:
                                                        "2px 0 0 2px",
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
                                                  <MentoredShiftBadge compact />
                                                )}
                                                <div
                                                  style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "center",
                                                    gap: showMultiSecondaryLine
                                                      ? 1
                                                      : 0,
                                                    maxWidth: "100%",
                                                    minWidth: 0,
                                                  }}
                                                >
                                                  <span
                                                    style={
                                                      isNameMode
                                                        ? {
                                                            textAlign:
                                                              "center" as const,
                                                            maxWidth: "100%",
                                                            overflowWrap:
                                                              "break-word" as const,
                                                            display:
                                                              "-webkit-box",
                                                            WebkitBoxOrient:
                                                              "vertical" as const,
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
                                                            whiteSpace:
                                                              "nowrap",
                                                            overflow: "hidden",
                                                            textOverflow:
                                                              "ellipsis",
                                                            maxWidth: "100%",
                                                          }
                                                    }
                                                  >
                                                    {multiDisplayLabel}
                                                    {!hasTime &&
                                                      isPillOvernight && (
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
                                                  {showMultiSecondaryLine ? (
                                                    <span
                                                      style={{
                                                        fontSize:
                                                          "var(--dg-fs-micro)",
                                                        fontWeight: 700,
                                                        opacity: 0.78,
                                                        lineHeight: 1,
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow:
                                                          "ellipsis",
                                                        maxWidth: "100%",
                                                      }}
                                                    >
                                                      {
                                                        displayParts.secondaryLabel
                                                      }
                                                    </span>
                                                  ) : null}
                                                </div>
                                                {hasTime && (
                                                  <span
                                                    style={{
                                                      fontSize:
                                                        "var(--dg-fs-micro)",
                                                      fontWeight: 500,
                                                      opacity: 0.7,
                                                      lineHeight: 1,
                                                      whiteSpace: "nowrap",
                                                      overflow: "hidden",
                                                      textOverflow: "ellipsis",
                                                      maxWidth: "100%",
                                                    }}
                                                  >
                                                    {fmt12hShort(
                                                      pillTime!.start,
                                                    )}
                                                    –
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
                                              top: 2,
                                              right: 2,
                                              display: "flex",
                                              gap: 2,
                                              zIndex: 1,
                                            }}
                                          >
                                            {indicatorTypes
                                              .filter((ind) =>
                                                noteTypes.includes(ind.id),
                                              )
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
                                              topOffset:
                                                noteTypes.length > 0 ? 8 : -8,
                                              rightOffset:
                                                noteTypes.length > 0 ? 14 : 3,
                                            }}
                                          />
                                        )}
                                      </div>
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
                            ) : (showDiffOverlay &&
                                draftKind === "deleted" &&
                                publishedLabel) ||
                              (showsPublishDiff &&
                                publishDiff?.kind === "deleted" &&
                                ((publishDiff.from ?? []).length > 0 ||
                                  publishDiff.fromAbsenceTypeId != null ||
                                  publishDiff.fromState?.kind === "worked" ||
                                  publishDiff.fromState?.kind ===
                                    "absence")) ? (
                              (() => {
                                const isDraftDelete = draftKind === "deleted";
                                const publishDeletedFromIds =
                                  publishDiff?.from ??
                                  assignmentIdsFromPublishState(
                                    publishDiff?.fromState,
                                    assignmentIdByPair,
                                  );
                                const publishDeletedAbsenceTypeId =
                                  publishDiff?.fromAbsenceTypeId ??
                                  absenceTypeIdFromPublishState(
                                    publishDiff?.fromState,
                                  );
                                const deletedLabel = isDraftDelete
                                  ? publishedLabel!
                                  : publishDeletedAbsenceTypeId != null
                                    ? (() => {
                                        const at = absenceTypeMap?.get(
                                          Number(publishDeletedAbsenceTypeId),
                                        );
                                        return at
                                          ? isNameMode
                                            ? at.name
                                            : at.label
                                          : "?";
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
                                      })
                                    : undefined;
                                const deletedPill = (
                                  <div
                                    data-shift-pill="deleted"
                                    aria-label={
                                      deletedTooltip ?? "Deleted shift"
                                    }
                                    style={{
                                      position: "absolute",
                                      top: insetFromVisibleCellTop(
                                        RAISED_DIFF_BADGE_TOP_INSET,
                                      ),
                                      right: "4px",
                                      bottom: "4px",
                                      left: insetFromVisibleCellLeft(4),
                                      background: "var(--color-danger-bg)",
                                      border: isDraftDelete
                                        ? "2px dashed var(--color-danger-dark)"
                                        : "1px solid var(--color-danger-border)",
                                      borderRadius: 8,
                                      ...(isDraftDelete
                                        ? {}
                                        : {
                                            boxShadow:
                                              "0 0 0 1px var(--color-surface), 0 0 0 2.5px var(--color-danger-dark)",
                                          }),
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      color: "var(--color-danger-dark)",
                                      overflow: "visible",
                                    }}
                                  >
                                    <GridDiffBadge
                                      badge={{
                                        source: isDraftDelete
                                          ? "draft"
                                          : "publish",
                                        kind: "deleted",
                                        text: "Deleted",
                                        tooltip: deletedTooltip,
                                        topOffset: -8,
                                        leftOffset: 4,
                                      }}
                                    />
                                    <span
                                      style={{
                                        fontSize: "var(--dg-fs-title)",
                                        fontWeight: 800,
                                        lineHeight: 1,
                                      }}
                                    >
                                      {deletedLabel}
                                    </span>
                                  </div>
                                );
                                return (
                                  <>
                                    {deletedPill}
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
                                      color: "var(--color-text-faint)",
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
                                      .filter((ind) =>
                                        noteTypes.includes(ind.id),
                                      )
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
                                                "1.5px solid rgba(255,255,255,0.85)",
                                              flexShrink: 0,
                                            }}
                                          />
                                        </MaybeHint>
                                      ))}
                                  </div>
                                )}
                              </>
                            )}
                            {isLocked && cellLock && (
                              <MaybeHint
                                content={`Being edited by ${cellLock.userName}`}
                                side="top"
                              >
                                <span
                                  style={{
                                    position: "absolute",
                                    top: 2,
                                    right: 2,
                                    width: 20,
                                    height: 20,
                                    borderRadius: "50%",
                                    background: "var(--color-brand)",
                                    color: "var(--color-text-inverse)",
                                    fontSize: 9,
                                    fontWeight: 700,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    lineHeight: 1,
                                    zIndex: 2,
                                    pointerEvents: "none",
                                  }}
                                >
                                  {cellLock.userName
                                    .split(/\s+/)
                                    .map((w) => w[0])
                                    .join("")
                                    .toUpperCase()
                                    .slice(0, 2)}
                                </span>
                              </MaybeHint>
                            )}
                          </div>
                          <div
                            className="dg-grid-cell__chrome"
                            aria-hidden="true"
                          />
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
                      borderTop:
                        rowIndex === 0
                          ? "1px solid var(--color-border)"
                          : undefined,
                      background: "var(--color-surface)",
                    }}
                  >
                    <div
                      data-tally-label={row.label}
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                        background: "var(--color-surface)",
                        padding: "6px 14px",
                        fontSize: "var(--dg-fs-badge)",
                        fontWeight: 700,
                        color: "var(--color-text-muted)",
                        letterSpacing: "0.04em",
                        display: "flex",
                        alignItems: "center",
                        borderBottom: isLastRow
                          ? undefined
                          : "1px solid var(--color-border-light)",
                        boxShadow: joinBoxShadows(
                          "1px 0 0 0 var(--color-border-light)",
                          "2px 0 4px rgba(0,0,0,0.02)",
                        ),
                      }}
                    >
                      <MaybeHint
                        content={isNameMode ? row.label : undefined}
                        side="top"
                      >
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
                      const required =
                        categoryRequirementsByDay[index]?.[row.categoryId] ?? 0;
                      const hasRequirement = required > 0;
                      const isMet = count >= required;
                      const displayValue =
                        count > 0 || hasRequirement ? String(count) : "-";
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
                            hasRequirement
                              ? isMet
                                ? "covered"
                                : "short"
                              : "none"
                          }
                          data-leading-divider={
                            index === 0
                              ? "none"
                              : isSplitDayDivider(index)
                                ? "split"
                                : "light"
                          }
                          data-week-split-start={
                            isSplitDayDivider(index) ? "true" : undefined
                          }
                          data-bottom-divider={isLastRow ? undefined : "light"}
                          style={{
                            position: "relative",
                            textAlign: "center",
                            padding: "8px 6px",
                            fontSize: "var(--dg-fs-badge)",
                            lineHeight: 1.4,
                            color: hasRequirement
                              ? isMet
                                ? "var(--color-success-text)"
                                : "var(--color-danger-dark)"
                              : "var(--color-text-muted)",
                            background: hasRequirement
                              ? isMet
                                ? "rgba(22, 163, 74, 0.12)"
                                : "rgba(220, 38, 38, 0.12)"
                              : "var(--color-surface)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 600,
                            fontFamily:
                              "var(--font-dm-mono), 'DM Mono', monospace",
                          }}
                        >
                          <div
                            className="dg-grid-slot__chrome"
                            aria-hidden="true"
                          />
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
  today,
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
  showDiffOverlay,
  showPublishDiffOverlay,
  publishedLabelForKey,
  publishedAssignmentIdsForKey,
  publishedAbsenceTypeIdForKey,
  hasTimeChangesForKey,
  publishDiffForKey,
  recentlyPublishedKeys,
  cellLocks,
  showAudit,
  createdByNameForKey,
  onCellHover,
  onCellContextMenu,
  onCellFocus,
  coverageRequirements,
  absenceTypeMap,
  absenceTypeIdForKey,
  shiftDisplayMode = "code",
  resolvePublisherName,
  openShifts,
  onClaimOpenShift,
  activeCellId = null,
  bulkDeleteMode = false,
  bulkSelectedCellKeys,
  bulkSelectableCellKeys,
  onToggleBulkDeleteCell,
}: LegacyScheduleGridProps) {
  const todayKey = useMemo(() => formatDateKey(today), [today]);

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
    () =>
      departmentSections.flatMap(({ focusAreas: fas }) =>
        fas.map((fa) => fa.name),
      ),
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
            .filter(
              (st) => focusAreaId != null && st.focusAreaId === focusAreaId,
            )
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

      const exclusiveCodeIds =
        exclusiveCodeIdsPerSection[section] ?? new Set<number>();
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
                  assignmentLookupById.get(id)?.focusAreaId === null,
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
      const firstHighlightedRow =
        containerRef.current?.querySelector<HTMLElement>(
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
        <div
          style={{
            padding: "48px 20px",
            textAlign: "center",
            background: "var(--color-surface)",
            borderRadius: "var(--dg-radius-md)",
            border: "1px dashed var(--color-border)",
            color: "var(--color-text-muted)",
            marginTop: 34,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              color: "var(--color-text-faint)",
              background: "var(--color-bg)",
              padding: "12px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {allEmployees.length === 0 ? (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            ) : (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </div>
          <div>
            <div
              style={{
                fontSize: "var(--dg-fs-title)",
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {allEmployees.length === 0
                ? "No staff added yet"
                : filteredEmployees.length === 0
                  ? "No matching employees"
                  : "No shifts found for this period"}
            </div>
            <div
              style={{
                fontSize: "var(--dg-fs-body)",
                color: "var(--color-text-faint)",
              }}
            >
              {allEmployees.length === 0
                ? "Add employees on the Staff page to start building your schedule."
                : filteredEmployees.length === 0
                  ? "Try clearing your search or focus area filter."
                  : isCellInteractive
                    ? "No employees are assigned to this focus area. Add employees in the Staff view."
                    : "No shifts have been published for this period yet."}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Flat FA sections — departments provide ordering but don't appear visually */}
          {renderedDepartmentSections.map(
            ({ department: dept, focusAreas: deptFAs }) => (
              <div key={dept.id}>
                {deptFAs.map((fa) => {
                  const sectionName = fa.name;
                  const sectionId = focusAreaIdByName[fa.name] ?? fa.id;
                  const exclusiveCodeIds =
                    exclusiveCodeIdsPerSection[fa.name] ?? new Set<number>();

                  const rawHomeEmps = filteredEmployees.filter(
                    (e) =>
                      sectionId != null && e.focusAreaIds.includes(sectionId),
                  );
                  const homeEmps = isCellInteractive
                    ? rawHomeEmps
                    : rawHomeEmps.filter((emp) =>
                        allDates.some((date) => {
                          const codeIds =
                            assignmentIdsForKey?.(emp.id, date) ?? [];
                          return codeIds.some(
                            (id) =>
                              exclusiveCodeIds.has(id) ||
                              assignments.find((sc) => sc.id === id)
                                ?.focusAreaId === null,
                          );
                        }),
                      );
                  const guestEmps = allEmployees.filter(
                    (e) =>
                      e.focusAreaIds.length > 0 &&
                      (sectionId == null ||
                        !e.focusAreaIds.includes(sectionId)) &&
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
                      getPublishedCustomShiftTimes={
                        getPublishedCustomShiftTimes
                      }
                      draftKindForKey={draftKindForKey}
                      showDiffOverlay={showDiffOverlay}
                      showPublishDiffOverlay={showPublishDiffOverlay}
                      publishedLabelForKey={publishedLabelForKey}
                      publishedAssignmentIdsForKey={publishedAssignmentIdsForKey}
                      publishedAbsenceTypeIdForKey={
                        publishedAbsenceTypeIdForKey
                      }
                      hasTimeChangesForKey={hasTimeChangesForKey}
                      publishDiffForKey={publishDiffForKey}
                      recentlyPublishedKeys={recentlyPublishedKeys}
                      certifications={certifications}
                      orgRoles={orgRoles}
                      cellLocks={cellLocks}
                      showAudit={showAudit}
                      createdByNameForKey={createdByNameForKey}
                      onCellHover={onCellHover}
                      onCellContextMenu={onCellContextMenu}
                      onCellFocus={onCellFocus}
                      coverageRequirements={coverageRequirements}
                      absenceTypeMap={absenceTypeMap}
                      absenceTypeIdForKey={absenceTypeIdForKey}
                      shiftDisplayMode={shiftDisplayMode}
                      resolvePublisherName={resolvePublisherName}
                      openShifts={openShifts?.filter(
                        (os) =>
                          sectionId != null && os.focusAreaId === sectionId,
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
            ),
          )}
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
    () =>
      new Map(
        model.focusAreas.map((focusArea) => [focusArea.name, focusArea.id]),
      ),
    [model.focusAreas],
  );

  const handleLegacyCellClick = useCallback<
    LegacyScheduleGridProps["handleCellClick"]
  >(
    (emp, date, focusAreaName, trigger = "click") => {
      const fallbackSectionId = emp.focusAreaIds[0] ?? null;
      const sectionId =
        (focusAreaName ? sectionIdByName.get(focusAreaName) : null) ??
        fallbackSectionId;
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
      interactionState.contextMenuCellId ??
      focusedCellIdRef.current ??
      hoveredCellIdRef.current
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
      (activatorEvent instanceof MouseEvent ||
        activatorEvent instanceof KeyboardEvent) &&
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
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
        today={model.today}
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
        getCustomShiftTimes={model.accessors.getCustomShiftTimes}
        getPublishedCustomShiftTimes={
          model.accessors.getPublishedCustomShiftTimes
        }
        draftKindForKey={model.accessors.draftKindForKey}
        showDiffOverlay={model.options.showDiffOverlay}
        showPublishDiffOverlay={model.options.showPublishDiffOverlay}
        publishedLabelForKey={model.accessors.publishedLabelForKey}
        publishedAssignmentIdsForKey={
          model.accessors.publishedAssignmentIdsForKey
        }
        publishedAbsenceTypeIdForKey={
          model.accessors.publishedAbsenceTypeIdForKey
        }
        hasTimeChangesForKey={model.accessors.hasTimeChangesForKey}
        publishDiffForKey={model.accessors.publishDiffForKey}
        recentlyPublishedKeys={model.recentlyPublishedKeys}
        cellLocks={model.cellLocks}
        showAudit={model.options.showAudit}
        createdByNameForKey={model.accessors.createdByNameForKey}
        onCellHover={handleCellHover}
        onCellContextMenu={handleLegacyContextMenu}
        onCellFocus={handleCellFocus}
        coverageRequirements={model.coverageRequirements}
        absenceTypeMap={model.absenceTypeMap}
        absenceTypeIdForKey={model.accessors.absenceTypeIdForKey}
        shiftDisplayMode={model.options.shiftDisplayMode}
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
              borderRadius: 8,
              padding: "6px 16px",
              fontSize: "var(--dg-fs-title)",
              fontWeight: 800,
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
