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
import { DAY_LABELS, BOX_SHADOW_CARD } from "@/lib/constants";
import { MaybeHint } from "@/components/ui/hint";
import { formatDateKey } from "@/lib/utils";
import { computeDailyTallies, resolveRequirement } from "@/lib/schedule-logic";
import { getScheduleGridLayout } from "@/lib/schedule-grid-layout";
import {
  Employee,
  ShiftCategory,
  ShiftCode,
  FocusArea,
  Department,
  IndicatorType,
  NamedItem,
  DraftKind,
  PublishChange,
  CoverageRequirement,
  AbsenceType,
  ShiftDisplayMode,
  GridOpenShift,
} from "@/types";
import { getCertAbbr, getRoleAbbrs, getEmployeeDisplayName } from "@/lib/utils";
import {
  borderColor,
  DESIGNATION_COLORS,
  DEFAULT_DESIG_COLOR,
  DRAFT_BORDER_COLORS,
} from "@/lib/colors";
import DroppableCell from "./DroppableCell";
import DraggableShift from "./DraggableShift";
import { useAuth } from "@/components/AuthProvider";

function getFocusAreaInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
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

function cellNeedsStackedLayout(args: {
  draftKind: DraftKind;
  showDiffOverlay: boolean;
  publishDiff: (PublishChange & { publishedAt: string; publishedBy: string }) | null;
  auditName: string | null;
  showAudit: boolean;
}): boolean {
  const { draftKind, showDiffOverlay, publishDiff, auditName, showAudit } = args;
  const hasAuditLabel = !!auditName && (showAudit || !!draftKind);
  const hasDraftOrPublishLabel =
    !!publishDiff || (showDiffOverlay && !!draftKind && draftKind !== "deleted");
  return hasAuditLabel || hasDraftOrPublishLabel;
}

interface ScheduleGridProps {
  filteredEmployees: Employee[];
  allEmployees: Employee[];
  week1: Date[];
  week2: Date[];
  spanWeeks: 1 | 2;
  shiftForKey: (empId: string, date: Date) => string | null;
  shiftCodeIdsForKey?: (empId: string, date: Date) => number[];
  /** Pass focusAreaId for context-aware label resolution */
  getShiftStyle: (type: string, focusAreaName?: string) => ShiftCode;
  handleCellClick: (emp: Employee, date: Date, focusAreaName?: string) => void;
  today: Date;
  highlightEmpIds?: Set<string>;
  focusAreas: FocusArea[];
  departments: Department[];
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
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
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  showDiffOverlay?: boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedShiftCodeIdsForKey?: (empId: string, date: Date) => number[];
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
  onCellHover?: (empId: string, date: Date, focusAreaName: string) => void;
  /** Called on right-click or Shift+F10 of a cell */
  onCellContextMenu?: (
    e: React.MouseEvent | React.KeyboardEvent,
    empId: string,
    date: Date,
    focusAreaName: string,
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
  /** Cell key for the schedule cell currently open in the shift editor. */
  selectedCellKey?: string | null;
}

interface SectionBlockProps {
  sectionName: string;
  exclusiveCodeIds: Set<number>;
  employees: Employee[];
  weekDates: Date[];
  todayKey: string;
  shiftForKey: (empId: string, date: Date) => string | null;
  shiftCodeIdsForKey?: (empId: string, date: Date) => number[];
  /** Pass focusAreaId for context-aware label resolution */
  getShiftStyle: (type: string, focusAreaName?: string) => ShiftCode;
  handleCellClick: (emp: Employee, date: Date, focusAreaName?: string) => void;
  colWidth: number;
  fitToContainer?: boolean;
  splitAtIndex?: number;
  highlightEmpIds?: Set<string>;
  focusAreas: FocusArea[];
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
  indicatorTypes: IndicatorType[];
  isCellInteractive: boolean;
  canDragShifts?: boolean;
  activeIndicatorIdsForKey?: (
    empId: string,
    date: Date,
    focusAreaId?: number,
  ) => number[];
  showTooltip: (content: string, x: number, y: number) => void;
  hideTooltip: () => void;
  getCustomShiftTimes?: (
    empId: string,
    date: Date,
  ) => {
    start: string;
    end: string;
    perPill?: { start: string; end: string }[];
  } | null;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  showDiffOverlay?: boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedShiftCodeIdsForKey?: (empId: string, date: Date) => number[];
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
  onCellHover?: (empId: string, date: Date, focusAreaName: string) => void;
  onCellContextMenu?: (
    e: React.MouseEvent | React.KeyboardEvent,
    empId: string,
    date: Date,
    focusAreaName: string,
  ) => void;
  coverageRequirements?: CoverageRequirement[];
  absenceTypeMap?: Map<number, AbsenceType>;
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  shiftDisplayMode?: ShiftDisplayMode;
  resolvePublisherName?: (userId: string) => string | null;
  openShifts?: GridOpenShift[];
  onClaimOpenShift?: (openShift: GridOpenShift) => void;
  selectedCellKey?: string | null;
}

const SectionBlock = memo(function SectionBlock({
  sectionName,
  employees,
  weekDates,
  todayKey,
  shiftForKey,
  shiftCodeIdsForKey,
  getShiftStyle,
  handleCellClick,
  colWidth,
  splitAtIndex,
  fitToContainer = false,
  highlightEmpIds,
  focusAreas,
  shiftCodes,
  shiftCategories,
  indicatorTypes,
  isCellInteractive,
  canDragShifts = isCellInteractive,
  activeIndicatorIdsForKey,
  showTooltip,
  hideTooltip,
  getCustomShiftTimes,
  draftKindForKey,
  showDiffOverlay,
  publishedLabelForKey,
  publishedShiftCodeIdsForKey,
  hasTimeChangesForKey,
  publishDiffForKey,
  recentlyPublishedKeys,
  certifications,
  orgRoles,
  cellLocks,
  showAudit,
  createdByNameForKey,
  onCellHover,
  onCellContextMenu,
  coverageRequirements,
  absenceTypeMap,
  absenceTypeIdForKey,
  shiftDisplayMode = "code",
  resolvePublisherName,
  openShifts,
  onClaimOpenShift,
  selectedCellKey,
}: SectionBlockProps) {
  const isNameMode = shiftDisplayMode === "name";
  const { user: currentUser } = useAuth();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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

  // Look up shift codes by ID so cross-focus-area shifts render in their own color
  const shiftCodeById = useMemo(() => {
    const map = new Map<number, ShiftCode>();
    for (const sc of shiftCodes) map.set(sc.id, sc);
    return map;
  }, [shiftCodes]);

  const categoryById = useMemo(() => {
    const map = new Map<number, ShiftCategory>();
    for (const cat of shiftCategories) map.set(cat.id, cat);
    return map;
  }, [shiftCategories]);

  const getStyleByIdOrLabel = useMemo(
    () =>
      (label: string, codeId?: number): ShiftCode => {
        if (codeId != null) {
          const byId = shiftCodeById.get(codeId);
          if (byId) return byId;
        }
        return contextualGetShiftStyle(label);
      },
    [shiftCodeById, contextualGetShiftStyle],
  );

  // ── Event delegation helpers ──────────────────────────────────────
  // Parse cell data-attributes from a delegated event
  const findCellFromEvent = useCallback(
    (target: EventTarget | null): { empId: string; dateKey: string } | null => {
      const el = (target as HTMLElement)?.closest?.(
        "[data-emp-id]",
      ) as HTMLElement | null;
      if (!el) return null;
      const empId = el.dataset.empId;
      const dateKey = el.dataset.dateKey;
      return empId && dateKey ? { empId, dateKey } : null;
    },
    [],
  );

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employees) map.set(e.id, e);
    return map;
  }, [employees]);

  const handleGridClick = useCallback(
    (e: React.MouseEvent) => {
      const cell = findCellFromEvent(e.target);
      if (!cell) return;
      const emp = employeeById.get(cell.empId);
      if (!emp) return;
      const date = new Date(cell.dateKey + "T00:00:00");
      const isLocked = !!cellLocks?.get(`${cell.empId}_${cell.dateKey}`);
      if (isCellInteractive && !isLocked)
        handleCellClick(emp, date, sectionName);
    },
    [
      findCellFromEvent,
      employeeById,
      cellLocks,
      isCellInteractive,
      handleCellClick,
      sectionName,
    ],
  );

  const handleGridContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!onCellContextMenu) return;
      const cell = findCellFromEvent(e.target);
      if (!cell) return;
      if (isCellInteractive) {
        e.preventDefault();
        const date = new Date(cell.dateKey + "T00:00:00");
        onCellContextMenu(e, cell.empId, date, sectionName);
      }
    },
    [findCellFromEvent, isCellInteractive, onCellContextMenu, sectionName],
  );

  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const cell = findCellFromEvent(e.target);
      if (!cell) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const emp = employeeById.get(cell.empId);
        if (!emp) return;
        const date = new Date(cell.dateKey + "T00:00:00");
        const isLocked = !!cellLocks?.get(`${cell.empId}_${cell.dateKey}`);
        if (isCellInteractive && !isLocked)
          handleCellClick(emp, date, sectionName);
      }
      if (
        e.shiftKey &&
        e.key === "F10" &&
        isCellInteractive &&
        onCellContextMenu
      ) {
        e.preventDefault();
        const date = new Date(cell.dateKey + "T00:00:00");
        onCellContextMenu(e, cell.empId, date, sectionName);
      }
    },
    [
      findCellFromEvent,
      employeeById,
      cellLocks,
      isCellInteractive,
      handleCellClick,
      onCellContextMenu,
      sectionName,
    ],
  );

  const sectionFocusArea = focusAreas.find((fa) => fa.name === sectionName);

  const countableShiftCodes = useMemo(() => {
    if (!sectionFocusArea) return [];
    return shiftCodes.filter(
      (sc) => sc.focusAreaId === sectionFocusArea.id || sc.focusAreaId == null,
    );
  }, [shiftCodes, sectionFocusArea]);

  const countableSectionCodeIds = useMemo(
    () => new Set(countableShiftCodes.map((sc) => sc.id)),
    [countableShiftCodes],
  );

  const dailyTotals = useMemo(() => {
    const fn = shiftCodeIdsForKey ?? (() => []);
    return weekDates.map((date) =>
      computeDailyTallies(
        employees,
        date,
        fn,
        shiftCodeById,
        countableSectionCodeIds,
      ),
    );
  }, [
    weekDates,
    employees,
    shiftCodeIdsForKey,
    shiftCodeById,
    countableSectionCodeIds,
  ]);

  const totalRows = useMemo(() => {
    const countsByCategory = new Map<number, number[]>();

    for (const [dayIndex, dayTotals] of dailyTotals.entries()) {
      for (const [categoryIdValue, categoryTotals] of Object.entries(dayTotals)) {
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
          categoryById.get(leftCategoryId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder =
          categoryById.get(rightCategoryId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        const leftLabel =
          categoryById.get(leftCategoryId)?.name ?? `Category ${leftCategoryId}`;
        const rightLabel =
          categoryById.get(rightCategoryId)?.name ?? `Category ${rightCategoryId}`;
        return leftLabel.localeCompare(rightLabel);
      })
      .map(([categoryId, counts]) => ({
        categoryId,
        label:
          categoryById.get(categoryId)?.name ?? `Category ${categoryId}`,
        counts,
      }));
  }, [dailyTotals, categoryById, weekDates.length]);

  const hasAnyTotals = totalRows.length > 0;

  const categoryRequirementsByDay = useMemo(() => {
    if (!coverageRequirements?.length || !sectionFocusArea) {
      return weekDates.map(() => ({} as Record<number, number>));
    }

    return weekDates.map((date) => {
      const dayOfWeek = date.getDay();
      const requirementsByCategory: Record<number, number> = {};

      for (const code of countableShiftCodes) {
        if (code.categoryId == null) continue;
        const resolved = resolveRequirement(
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
  }, [
    coverageRequirements,
    sectionFocusArea,
    weekDates,
    countableShiftCodes,
  ]);

  // For cross-focus-area pill detection: map label → home focus area name for
  // labels that belong to another area but NOT this one (or globally).
  const foreignLabelHomeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const st of shiftCodes) {
      if (st.focusAreaId == null) continue; // global — never foreign
      const sectionWing = focusAreas.find((w) => w.name === sectionName);
      if (sectionWing && st.focusAreaId === sectionWing.id) continue; // belongs here
      // Belongs to another area — check if there's a local or global definition
      const hasLocalOrGeneral = shiftCodes.some((s) => {
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
  }, [shiftCodes, sectionName, focusAreas, isNameMode]);

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
          role="grid"
          aria-label={`${sectionName} schedule grid`}
          onClick={handleGridClick}
          onContextMenu={handleGridContextMenu}
          onKeyDown={handleGridKeyDown}
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplate,
            minWidth: fitToContainer ? undefined : "max-content",
            width: fitToContainer ? "100%" : undefined,
          }}
        >
          {/* Header row */}
          <div
            role="row"
            style={{ ...rowGrid, borderBottom: "2px solid var(--color-dark)" }}
          >
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
                borderRight: "1px solid var(--color-border-light)",
                boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
              }}
            >
              Staff
            </div>
            {weekDates.map((date, i) => {
              const key = formatDateKey(date);
              const isToday = key === todayKey;
              const isSplit = splitAtIndex !== undefined && i === splitAtIndex;
              return (
                <div
                  key={key}
                  role="columnheader"
                  style={{
                    textAlign: "center",
                    padding: "8px 0",
                    background: isToday
                      ? "var(--color-today-bg)"
                      : "transparent",
                    borderLeft: isSplit
                      ? "2px solid var(--color-dark)"
                      : "1px solid var(--color-border-light)",
                  }}
                >
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
                borderBottom: "2px dashed var(--color-warning-border, #F59E0B)",
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
                  borderRight: "1px solid var(--color-border)",
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
              {weekDates.map((date, ci) => {
                const dateKey = formatDateKey(date);
                const isToday = dateKey === todayKey;
                const isSplit = splitAtIndex != null && ci === splitAtIndex;
                const cellOpenShifts = openShifts.filter(
                  (os) => os.date === dateKey,
                );
                return (
                  <div
                    key={dateKey}
                    style={{
                      padding: "6px",
                      display: "flex",
                      flexWrap: "wrap",
                      alignContent: "flex-start",
                      alignItems: "flex-start",
                      gap: 6,
                      background: isToday ? "var(--color-today-bg)" : undefined,
                      borderLeft: isSplit
                        ? "2px solid var(--color-dark)"
                        : "1px solid var(--color-border-light)",
                    }}
                  >
                    {cellOpenShifts.map((os) => {
                      const sc =
                        os.shiftCodeIds[0] != null
                          ? shiftCodeById.get(os.shiftCodeIds[0])
                          : undefined;
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
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                            flex: colWidth < 92 ? "1 1 100%" : "1 1 72px",
                            width: colWidth < 92 ? "100%" : undefined,
                            maxWidth: "100%",
                            padding: "5px 8px",
                            minWidth: 0,
                            borderRadius: 6,
                            border: `1.5px dashed ${sc?.border ?? "var(--color-warning-border, #F59E0B)"}`,
                            background: sc?.color ?? "var(--color-surface)",
                            color:
                              sc?.text ?? "var(--color-warning-text, #92400E)",
                            fontSize: "var(--dg-fs-caption)",
                            fontWeight: 600,
                            cursor: "pointer",
                            lineHeight: 1.3,
                            overflow: "hidden",
                          }}
                            >
                          <span
                            style={{
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {os.shiftCodeLabel}
                          </span>
                          <span
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              background: sc?.text ?? "var(--color-warning)",
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
            const isHighlighted =
              highlightEmpIds && highlightEmpIds.size > 0
                ? highlightEmpIds.has(emp.id)
                : true;
            const isCurrentUser = !!(
              emp.userId &&
              currentUser &&
              emp.userId === currentUser.id
            );
            const rowBg = isCurrentUser
              ? "var(--color-today-bg)"
              : "var(--color-surface)";
            const certAbbr = getCertAbbr(emp.certificationId, certifications);
            const dc = DESIGNATION_COLORS[certAbbr] ?? DEFAULT_DESIG_COLOR;

            return (
              <div
                key={emp.id}
                role="row"
                className="dg-row-enter"
                style={{
                  ...rowGrid,
                  background: rowBg,
                  opacity: isHighlighted ? 1 : 0.35,
                  transition: "opacity 150ms ease",
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
                    borderRight: "1px solid var(--color-border-light)",
                    boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
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
                          color: "var(--color-text-secondary)",
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
                  const rowUsesTallCells = weekDates.some((date) => {
                    const rowDraftKind = draftKindForKey?.(emp.id, date) ?? null;
                    const rowPublishDiff =
                      publishDiffForKey?.(emp.id, date) ?? null;
                    const rowAuthorName =
                      createdByNameForKey?.(emp.id, date) ?? null;
                    return cellNeedsStackedLayout({
                      draftKind: rowDraftKind,
                      showDiffOverlay: !!showDiffOverlay,
                      publishDiff: rowPublishDiff,
                      auditName: rowAuthorName,
                      showAudit: !!showAudit,
                    });
                  });

                  return weekDates.map((date, di) => {
                  const dateKey = formatDateKey(date);
                  const cellKey = `${emp.id}_${dateKey}`;
                  const isToday = dateKey === todayKey;
                  const isSplit =
                    splitAtIndex !== undefined && di === splitAtIndex;
                  const shiftCode = shiftForKey(emp.id, date);
                  const cellCodeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
                  const draftKind = draftKindForKey?.(emp.id, date) ?? null;
                  const publishDiff = publishDiffForKey?.(emp.id, date) ?? null;
                  const publishedLabel =
                    publishedLabelForKey?.(emp.id, date) ?? null;
                  const publishedCodeIds =
                    publishedShiftCodeIdsForKey?.(emp.id, date) ?? [];
                  const cellHasTimeEdits =
                    hasTimeChangesForKey?.(emp.id, date) ?? false;
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
                  const isSelectedPreview = selectedCellKey === cellKey;
                  const auditName = createdByNameForKey?.(emp.id, date) ?? null;
                  const shouldShowAuthorName = !!auditName && (showAudit || !!draftKind);
                  const hasStackedLayout = cellNeedsStackedLayout({
                    draftKind,
                    showDiffOverlay: !!showDiffOverlay,
                    publishDiff,
                    auditName,
                    showAudit: !!showAudit,
                  });
                  const cellAbsenceTypeId =
                    absenceTypeIdForKey?.(emp.id, date) ?? null;
                  const cellAbsenceType =
                    cellAbsenceTypeId != null
                      ? (absenceTypeMap?.get(cellAbsenceTypeId) ?? null)
                      : null;

                  const isRecentlyPublished =
                    !draftKind &&
                    recentlyPublishedKeys?.has(`${emp.id}_${dateKey}`);
                  const hasDraggableEntry =
                    canDragShifts &&
                    !isLocked &&
                    !!shiftCode &&
                    shiftCode !== "OFF" &&
                    draftKind !== "deleted";
                  const firstStyle = hasDraggableEntry
                    ? getStyleByIdOrLabel(
                        shiftCode.split("/")[0],
                        cellCodeIds[0],
                      )
                    : null;
                  const baseBoxShadow =
                    isSplit && ri > 0
                      ? "inset 0 1px 0 var(--color-border-light)"
                      : undefined;
                  const selectedPreviewBoxShadow = isSelectedPreview
                    ? "inset 0 0 0 2px var(--color-border-focus), 0 0 0 1px rgba(37, 99, 235, 0.32)"
                    : undefined;
                  const cellBoxShadow = [
                    selectedPreviewBoxShadow,
                    baseBoxShadow,
                  ]
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <DroppableCell
                      key={dateKey}
                      id={`drop_${emp.id}_${dateKey}_${sectionName}`}
                      data={{
                        empId: emp.id,
                        date,
                        dateKey,
                        focusAreaName: sectionName,
                      }}
                      disabled={!isCellInteractive || isLocked}
                      className="dg-grid-cell"
                      role="gridcell"
                      aria-label={
                        shiftCode && shiftCode !== "OFF"
                          ? `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[date.getDay()]} ${date.getDate()}: ${shiftCode}`
                          : `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[date.getDay()]} ${date.getDate()}: empty`
                      }
                      tabIndex={isCellInteractive ? 0 : -1}
                      data-emp-id={emp.id}
                      data-date-key={dateKey}
                      data-interactive={isCellInteractive ? "true" : "false"}
                      data-locked={isLocked ? "true" : "false"}
                      data-selected-preview={isSelectedPreview ? "true" : "false"}
                      data-empty={
                        !shiftCode || shiftCode === "OFF" ? "true" : "false"
                      }
                      style={{
                        height: rowUsesTallCells
                          ? weekDates.length > 7
                            ? "72px"
                            : "var(--dg-grid-cell-height-audit)"
                          : "var(--dg-grid-cell-height)",
                        borderTop:
                          ri > 0 && !isSplit
                            ? "1px solid var(--color-border-light)"
                            : undefined,
                        borderLeft: isSplit
                          ? "2px solid var(--color-dark)"
                          : "1px solid var(--color-border-light)",
                        boxShadow: cellBoxShadow || undefined,
                        background: isLocked
                          ? "rgba(37, 99, 235, 0.08)"
                          : isToday
                            ? "var(--color-today-bg)"
                            : isRecentlyPublished
                              ? "rgba(59, 130, 246, 0.06)"
                              : "transparent",
                        zIndex: isSelectedPreview ? 2 : undefined,
                      }}
                      onMouseEnter={(e) => {
                        onCellHover?.(emp.id, date, sectionName);
                        if (shiftCode && shiftCode !== "OFF") {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const content = cellAbsenceType
                            ? isNameMode
                              ? cellAbsenceType.name
                              : cellAbsenceType.label
                            : shiftCode
                                .split("/")
                                .map((l, li) => {
                                  const style = getStyleByIdOrLabel(
                                    l,
                                    cellCodeIds[li],
                                  );
                                  const codeEntry =
                                    cellCodeIds[li] != null
                                      ? shiftCodeById.get(cellCodeIds[li])
                                      : undefined;
                                  const isForeign =
                                    codeEntry?.focusAreaId != null &&
                                    sectionFocusArea != null &&
                                    codeEntry.focusAreaId !==
                                      sectionFocusArea.id;
                                  const homeFa = isForeign
                                    ? focusAreas.find(
                                        (fa) =>
                                          fa.id === codeEntry!.focusAreaId,
                                      )?.name
                                    : foreignLabelHomeMap.get(l);
                                  return homeFa
                                    ? `${style.name} (${homeFa})`
                                    : style.name;
                                })
                                .join(" / ");
                          showTooltip(
                            content,
                            rect.left + rect.width / 2,
                            rect.top,
                          );
                        }
                      }}
                      onMouseLeave={() => {
                        hideTooltip();
                      }}
                    >
                      {shiftCode && shiftCode !== "OFF" ? (
                        <DraggableShift
                          id={`drag_${emp.id}_${dateKey}_${sectionName}`}
                          data={{
                            empId: emp.id,
                            date,
                            dateKey,
                            label: shiftCode,
                            shiftCodeIds: cellCodeIds,
                            absenceTypeId: cellAbsenceTypeId,
                            customStartTime: customTimes?.start ?? null,
                            customEndTime: customTimes?.end ?? null,
                            focusAreaName: sectionName,
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
                            const labels = shiftCode.split("/");

                            // Per-pill publish diff: compare from[i] vs to[i] positionally
                            const isPubDiff = !draftKind && publishDiff;
                            const pubFrom = isPubDiff ? publishDiff!.from : [];
                            const pubTo = isPubDiff ? publishDiff!.to : [];

                            // For each pill index, determine if it changed vs the old state
                            function pillPublishStatus(
                              pillIndex: number,
                            ): "new" | "modified" | "unchanged" | null {
                              if (!isPubDiff) return null;
                              const toId = pubTo[pillIndex];
                              const fromId = pubFrom[pillIndex];
                              if (fromId == null) return "new"; // no old pill at this index → added
                              if (fromId !== toId) return "modified"; // old pill differs → changed
                              return "unchanged"; // same code at same position
                            }

                            // Cell-level label below the pill(s) with temporal tooltip
                            const publishTooltip =
                              isPubDiff && publishDiff
                                ? (() => {
                                    const diff =
                                      Date.now() -
                                      new Date(
                                        publishDiff.publishedAt,
                                      ).getTime();
                                    const mins = Math.floor(diff / 60000);
                                    let timeAgo: string;
                                    if (mins < 1) timeAgo = "just now";
                                    else if (mins < 60)
                                      timeAgo = `${mins} min ago`;
                                    else {
                                      const hrs = Math.floor(mins / 60);
                                      if (hrs < 24) timeAgo = `${hrs} hr ago`;
                                      else {
                                        const days = Math.floor(hrs / 24);
                                        timeAgo = `${days} day${days !== 1 ? "s" : ""} ago`;
                                      }
                                    }
                                    const name = publishDiff.publishedBy
                                      ? resolvePublisherName?.(
                                          publishDiff.publishedBy,
                                        )
                                      : null;
                                    return `Published ${timeAgo}${name ? ` by ${name}` : ""}`;
                                  })()
                                : undefined;

                            const resolveOldLabel = (): string => {
                              if (publishDiff?.fromAbsenceTypeId != null) {
                                const at = absenceTypeMap?.get(
                                  Number(publishDiff.fromAbsenceTypeId),
                                );
                                return at
                                  ? isNameMode
                                    ? at.name
                                    : at.label
                                  : "?";
                              }
                              return pubFrom
                                .map((id) => {
                                  const sc = shiftCodeById.get(id);
                                  return sc
                                    ? isNameMode
                                      ? sc.name || sc.label
                                      : sc.label
                                    : "?";
                                })
                                .join("/");
                            };

                            // Detect time-only changes (same shift/absence, only custom times differ)
                            const sameContent =
                              isPubDiff &&
                              publishDiff &&
                              (publishDiff.fromAbsenceTypeId ?? null) ===
                                (publishDiff.toAbsenceTypeId ?? null) &&
                              publishDiff.from.length ===
                                publishDiff.to.length &&
                              publishDiff.from.every(
                                (id, idx) => id === publishDiff.to[idx],
                              );
                            const hadTime =
                              publishDiff?.fromCustomStart ||
                              publishDiff?.fromCustomEnd;
                            const hasTime =
                              publishDiff?.toCustomStart ||
                              publishDiff?.toCustomEnd;
                            const timeAdded = !hadTime && hasTime;
                            const timeEdited =
                              hadTime &&
                              hasTime &&
                              (publishDiff?.fromCustomStart !==
                                publishDiff?.toCustomStart ||
                                publishDiff?.fromCustomEnd !==
                                  publishDiff?.toCustomEnd);
                            const timeRemoved = hadTime && !hasTime;

                            let publishBadge: {
                              text: string;
                              color: string;
                              tooltip?: string;
                            } | null = null;
                            if (isPubDiff) {
                              if (publishDiff!.kind === "new") {
                                publishBadge = {
                                  text: "New",
                                  color: "var(--color-success-text)",
                                  tooltip: publishTooltip,
                                };
                              } else if (publishDiff!.kind === "modified") {
                                if (sameContent) {
                                  // Only times changed — show time-specific badge
                                  const timeBadge = timeAdded
                                    ? "Added time"
                                    : timeEdited
                                      ? "Edited time"
                                      : timeRemoved
                                        ? "Time removed"
                                        : "Updated";
                                  publishBadge = {
                                    text: timeBadge,
                                    color: "var(--color-primary)",
                                    tooltip: publishTooltip,
                                  };
                                } else {
                                  publishBadge = {
                                    text: `was: ${resolveOldLabel()}`,
                                    color: "var(--color-primary)",
                                    tooltip: publishTooltip,
                                  };
                                }
                              }
                            }

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
                                : getStyleByIdOrLabel(label, cellCodeIds[0]);
                              const codeEntry0 =
                                cellCodeIds[0] != null
                                  ? shiftCodeById.get(cellCodeIds[0])
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
                              const crossHomeFa = isCross
                                ? focusAreas.find(
                                    (fa) => fa.id === codeEntry0!.focusAreaId,
                                  )
                                : undefined;
                              // Compute effective border: draft indicators use dashed border
                              const absenceBorder = isAbsence
                                ? `1px solid ${cellAbsenceType!.border}`
                                : `1px solid ${borderColor(style.text)}`;
                              const effectiveBorder = draftKind
                                ? getDraftBorder(draftKind, absenceBorder)
                                : absenceBorder;
                              const singleBottomInset = hasStackedLayout
                                ? shouldShowAuthorName && publishBadge
                                  ? "32px"
                                  : "20px"
                                : customTimes
                                  ? "3px"
                                  : "4px";

                              return (
                                <>
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: customTimes ? "3px" : "4px",
                                      right: "4px",
                                      bottom: singleBottomInset,
                                      left: "4px",
                                      background: isCross
                                        ? "var(--color-surface)"
                                        : style.color,
                                      opacity:
                                        draftKind === "deleted" ? 0.5 : 1,
                                      border: effectiveBorder,
                                      borderRadius: 8,
                                      color: style.text,
                                      boxShadow:
                                        pillPublishStatus(0) === "new" ||
                                        pillPublishStatus(0) === "modified"
                                          ? getPublishDiffBoxShadow(
                                              pillPublishStatus(0)!,
                                              borderColor(style.text),
                                            )
                                          : "none",
                                      cursor: "pointer",
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "center",
                                      justifyContent:
                                        showDiffOverlay &&
                                        draftKind &&
                                        draftKind !== "deleted"
                                          ? "flex-start"
                                          : "center",
                                      padding: isNameMode
                                        ? "2px 6px"
                                        : "2px 3px",
                                      paddingTop:
                                        showDiffOverlay &&
                                        draftKind &&
                                        draftKind !== "deleted"
                                          ? 4
                                          : 2,
                                      paddingLeft:
                                        isCross && crossHomeFa
                                          ? 20
                                          : isNameMode
                                            ? 6
                                            : 3,
                                      overflow: "hidden",
                                      textDecoration:
                                        draftKind === "deleted"
                                          ? "line-through"
                                          : "none",
                                    }}
                                  >
                                    {isCross && crossHomeFa && (
                                      <span
                                        style={{
                                          position: "absolute",
                                          top: 0,
                                          bottom: 0,
                                          left: 0,
                                          display: "flex",
                                          alignItems: "center",
                                          fontSize: "var(--dg-fs-footnote)",
                                          fontWeight: 800,
                                          lineHeight: 1,
                                          background:
                                            "var(--color-bg-secondary)",
                                          color: "var(--color-text-secondary)",
                                          borderRadius: "2px 0 0 2px",
                                          padding: "0 3px",
                                          letterSpacing: "0.02em",
                                          pointerEvents: "none",
                                        }}
                                      >
                                        {getFocusAreaInitials(crossHomeFa.name)}
                                      </span>
                                    )}
                                    <MaybeHint
                                      content={isNameMode ? label : undefined}
                                      side="top"
                                    >
                                      <span
                                        style={
                                        isNameMode
                                          ? {
                                              fontSize: "var(--dg-fs-caption)",
                                              fontWeight: 800,
                                              lineHeight: 1.2,
                                              textAlign: "center" as const,
                                              maxWidth: "100%",
                                              overflowWrap:
                                                "break-word" as const,
                                              display: "-webkit-box",
                                              WebkitBoxOrient:
                                                "vertical" as const,
                                              WebkitLineClamp: customTimes
                                                ? 1
                                                : 2,
                                              overflow: "hidden",
                                            }
                                          : {
                                              fontSize: "var(--dg-fs-title)",
                                              fontWeight: 800,
                                              lineHeight: 1,
                                            }
                                        }
                                      >
                                        {label}
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
                                    </MaybeHint>
                                    {customTimes && (
                                      <span
                                        style={{
                                          fontSize: "var(--dg-fs-footnote)",
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
                                    {showDiffOverlay &&
                                      draftKind === "modified" &&
                                      publishedLabel &&
                                      shiftCode !== publishedLabel && (
                                        <MaybeHint
                                          content={
                                            isNameMode
                                              ? `was: ${publishedLabel}`
                                              : undefined
                                          }
                                          side="top"
                                        >
                                          <span
                                            style={{
                                            position: "absolute",
                                            bottom: 2,
                                            left: "50%",
                                            transform: "translateX(-50%)",
                                            fontSize: "var(--dg-fs-label)",
                                            fontWeight: 700,
                                            color: "var(--color-warning)",
                                            whiteSpace: "nowrap",
                                            pointerEvents: "none",
                                            lineHeight: 1,
                                            maxWidth: "calc(100% - 8px)",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            }}
                                          >
                                            was: {publishedLabel}
                                          </span>
                                        </MaybeHint>
                                      )}
                                    {showDiffOverlay && draftKind === "new" && (
                                      <span
                                        style={{
                                          position: "absolute",
                                          bottom: 2,
                                          left: "50%",
                                          transform: "translateX(-50%)",
                                          fontSize: "var(--dg-fs-label)",
                                          fontWeight: 800,
                                          color: "var(--color-success-text)",
                                          whiteSpace: "nowrap",
                                          pointerEvents: "none",
                                        }}
                                      >
                                        new
                                      </span>
                                    )}
                                    {noteTypes.length > 0 && (
                                      <div
                                        style={{
                                          position: "absolute",
                                          bottom:
                                            showDiffOverlay && draftKind
                                              ? 15
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
                                  </div>
                                  {shouldShowAuthorName && auditName && (
                                    <span
                                      style={{
                                        position: "absolute",
                                        bottom: publishBadge ? 16 : 2,
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        maxWidth: "calc(100% - 12px)",
                                        fontSize: "var(--dg-fs-micro)",
                                        fontWeight: 600,
                                        lineHeight: 1,
                                        textAlign: "center",
                                        color: "var(--color-text-muted)",
                                        pointerEvents: "none",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        padding: "1px 5px",
                                        background: "var(--color-surface)",
                                        borderRadius: 4,
                                        border: "1px solid rgba(0,0,0,0.08)",
                                        boxShadow:
                                          "0 0.5px 1px rgba(0,0,0,0.06)",
                                        zIndex: 2,
                                        textDecoration: "none",
                                      }}
                                    >
                                      {auditName}
                                    </span>
                                  )}
                                  {publishBadge && (
                                    <MaybeHint
                                      content={publishBadge.tooltip}
                                      side="top"
                                    >
                                      <span
                                        style={{
                                        position: "absolute",
                                        bottom: 2,
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        fontSize: "var(--dg-fs-footnote)",
                                        fontWeight: 700,
                                        lineHeight: 1,
                                        color: publishBadge.color,
                                        pointerEvents: publishBadge.tooltip
                                          ? "auto"
                                          : "none",
                                        whiteSpace: "nowrap",
                                        }}
                                      >
                                        {publishBadge.text}
                                      </span>
                                    </MaybeHint>
                                  )}
                                </>
                              );
                            }

                            // Multi-pill: render each shift as a separate vertical pill
                            const hasMultiPillLabel =
                              (showDiffOverlay &&
                                draftKind &&
                                draftKind !== "deleted") ||
                              publishBadge;
                            const hasBottomLabel =
                              hasMultiPillLabel || shouldShowAuthorName;
                            const multiBottomInset = hasStackedLayout
                              ? hasMultiPillLabel && shouldShowAuthorName
                                ? "32px"
                                : "20px"
                              : hasBottomLabel
                                ? "16px"
                                : "3px";
                            // When cell is 'modified' but all codes match published, it's a metadata-only
                            // change (custom times, notes, etc.) — all pills should show dashed borders.
                            const isMetadataOnlyChange =
                              draftKind === "modified" &&
                              publishedCodeIds.length > 0 &&
                              cellCodeIds.length === publishedCodeIds.length &&
                              cellCodeIds.every(
                                (id, i) => id === publishedCodeIds[i],
                              );
                            return (
                              <>
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "3px",
                                    right: "3px",
                                    bottom: multiBottomInset,
                                    left: "3px",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                    alignItems: "stretch",
                                    opacity: draftKind === "deleted" ? 0.5 : 1,
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
                                          ? shiftCodeById.get(cellCodeIds[li])
                                          : undefined;
                                      const isCross =
                                        label !== "X" &&
                                        codeEntryLi?.focusAreaId != null &&
                                        sectionFocusArea != null &&
                                        codeEntryLi.focusAreaId !==
                                          sectionFocusArea.id;
                                      const crossHomeFaLi = isCross
                                        ? focusAreas.find(
                                            (fa) =>
                                              fa.id ===
                                              codeEntryLi!.focusAreaId,
                                          )
                                        : undefined;
                                      const isNewPill =
                                        draftKind &&
                                        publishedCodeIds.length > 0 &&
                                        cellCodeIds[li] != null &&
                                        !publishedCodeIds.includes(
                                          cellCodeIds[li],
                                        );
                                      const isExistingPillEdited =
                                        draftKind === "modified" &&
                                        publishedCodeIds.includes(
                                          cellCodeIds[li],
                                        ) &&
                                        cellHasTimeEdits;
                                      const pillBorder =
                                        isNewPill ||
                                        draftKind === "new" ||
                                        isMetadataOnlyChange ||
                                        isExistingPillEdited
                                          ? `2px dashed ${DRAFT_BORDER_COLORS[draftKind!]}`
                                          : `1px solid ${borderColor(style.text)}`;
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
                                      const isPillOvernight = isOvernightTimes(
                                        pillTime?.start ??
                                          codeEntryLi?.defaultStartTime ??
                                          catLi?.startTime,
                                        pillTime?.end ??
                                          codeEntryLi?.defaultEndTime ??
                                          catLi?.endTime,
                                      );

                                      return (
                                        <div
                                          key={li}
                                          style={{
                                            flex: 1,
                                            background: isCross
                                              ? "var(--color-surface)"
                                              : style.color,
                                            border:
                                              draftKind === "deleted"
                                                ? getDraftBorder(
                                                    draftKind,
                                                    `1px solid ${borderColor(style.text)}`,
                                                  )
                                                : pillBorder,
                                            borderRadius: 6,
                                            color: style.text,
                                            boxShadow: (() => {
                                              const ps = pillPublishStatus(li);
                                              return ps === "new" ||
                                                ps === "modified"
                                                ? getPublishDiffBoxShadow(
                                                    ps,
                                                    borderColor(style.text),
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
                                            lineHeight: isNameMode ? 1.2 : 1,
                                            overflow: "hidden",
                                            minWidth: 0,
                                            padding: isNameMode
                                              ? "2px 4px"
                                              : "2px 3px",
                                            paddingLeft:
                                              isCross && crossHomeFaLi
                                                ? 18
                                                : isNameMode
                                                  ? 4
                                                  : 3,
                                          }}
                                        >
                                          {isCross && crossHomeFaLi && (
                                            <span
                                              style={{
                                                position: "absolute",
                                                top: 0,
                                                bottom: 0,
                                                left: 0,
                                                display: "flex",
                                                alignItems: "center",
                                                fontSize: "var(--dg-fs-micro)",
                                                fontWeight: 800,
                                                lineHeight: 1,
                                                background:
                                                  "var(--color-bg-secondary)",
                                                color:
                                                  "var(--color-text-secondary)",
                                                borderRadius: "2px 0 0 2px",
                                                padding: "0 2px",
                                                letterSpacing: "0.02em",
                                                pointerEvents: "none",
                                              }}
                                            >
                                              {getFocusAreaInitials(
                                                crossHomeFaLi.name,
                                              )}
                                            </span>
                                          )}
                                          <MaybeHint
                                            content={
                                              isNameMode ? label : undefined
                                            }
                                            side="top"
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
                                                    display: "-webkit-box",
                                                    WebkitBoxOrient:
                                                      "vertical" as const,
                                                    WebkitLineClamp: hasTime
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
                                                  }
                                              }
                                            >
                                              {label}
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
                                          </MaybeHint>
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
                                </div>
                                {shouldShowAuthorName && auditName && (
                                  <span
                                    style={{
                                      position: "absolute",
                                      bottom: hasMultiPillLabel ? 16 : 2,
                                      left: "50%",
                                      transform: "translateX(-50%)",
                                      maxWidth: "calc(100% - 12px)",
                                      fontSize: "var(--dg-fs-micro)",
                                      fontWeight: 600,
                                      lineHeight: 1,
                                      textAlign: "center",
                                      color: "var(--color-text-muted)",
                                      pointerEvents: "none",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      padding: "1px 5px",
                                      background: "var(--color-surface)",
                                      borderRadius: 4,
                                      border: "1px solid rgba(0,0,0,0.08)",
                                      boxShadow: "0 0.5px 1px rgba(0,0,0,0.06)",
                                      zIndex: 2,
                                      textDecoration: "none",
                                    }}
                                  >
                                    {auditName}
                                  </span>
                                )}
                                {showDiffOverlay &&
                                  draftKind === "modified" &&
                                  publishedLabel &&
                                  shiftCode !== publishedLabel && (
                                    <MaybeHint
                                      content={
                                        isNameMode
                                          ? `was: ${publishedLabel}`
                                          : undefined
                                      }
                                      side="top"
                                    >
                                      <span
                                        style={{
                                        position: "absolute",
                                        bottom: 2,
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        fontSize: "var(--dg-fs-footnote)",
                                        fontWeight: 700,
                                        color: "var(--color-warning)",
                                        whiteSpace: "nowrap",
                                        pointerEvents: "none",
                                        lineHeight: 1,
                                        zIndex: 1,
                                        maxWidth: "calc(100% - 8px)",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        }}
                                      >
                                        was: {publishedLabel}
                                      </span>
                                    </MaybeHint>
                                  )}
                                {showDiffOverlay && draftKind === "new" && (
                                  <span
                                    style={{
                                      position: "absolute",
                                      bottom: 2,
                                      left: "50%",
                                      transform: "translateX(-50%)",
                                      fontSize: "var(--dg-fs-footnote)",
                                      fontWeight: 800,
                                      color: "var(--color-success-text)",
                                      whiteSpace: "nowrap",
                                      pointerEvents: "none",
                                      zIndex: 1,
                                    }}
                                  >
                                    new
                                  </span>
                                )}
                                {publishBadge && (
                                  <MaybeHint
                                    content={publishBadge.tooltip}
                                    side="top"
                                  >
                                    <span
                                      style={{
                                      position: "absolute",
                                      bottom: 2,
                                      left: "50%",
                                      transform: "translateX(-50%)",
                                      fontSize: "var(--dg-fs-footnote)",
                                      fontWeight: 700,
                                      color: publishBadge.color,
                                      whiteSpace: "nowrap",
                                      pointerEvents: publishBadge.tooltip
                                        ? "auto"
                                        : "none",
                                      lineHeight: 1,
                                      zIndex: 1,
                                      }}
                                    >
                                      {publishBadge.text}
                                    </span>
                                  </MaybeHint>
                                )}
                              </>
                            );
                          })()}
                        </DraggableShift>
                      ) : (showDiffOverlay &&
                          draftKind === "deleted" &&
                          publishedLabel) ||
                        (publishDiff?.kind === "deleted" &&
                          (publishDiff.from.length > 0 ||
                            publishDiff.fromAbsenceTypeId != null)) ? (
                        (() => {
                          const isDraftDelete = draftKind === "deleted";
                          const deletedLabel = isDraftDelete
                            ? publishedLabel!
                            : publishDiff!.fromAbsenceTypeId != null
                              ? (() => {
                                  const at = absenceTypeMap?.get(
                                    Number(publishDiff!.fromAbsenceTypeId),
                                  );
                                  return at
                                    ? isNameMode
                                      ? at.name
                                      : at.label
                                    : "?";
                                })()
                              : publishDiff!.from
                                  .map((id) => {
                                    const sc = shiftCodeById.get(id);
                                    return sc
                                      ? isNameMode
                                        ? sc.name || sc.label
                                        : sc.label
                                      : "?";
                                  })
                                  .join("/");
                          return (
                            <>
                              <div
                                style={{
                                  position: "absolute",
                                  top: "4px",
                                  right: "4px",
                                  bottom: auditName ? "16px" : "4px",
                                  left: "4px",
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
                                  overflow: "hidden",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "var(--dg-fs-title)",
                                    fontWeight: 800,
                                    lineHeight: 1,
                                  }}
                                >
                                  {deletedLabel}
                                </span>
                                <span
                                  style={{
                                    fontSize: "var(--dg-fs-badge)",
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    color: "var(--color-danger-dark)",
                                    pointerEvents: "none",
                                    whiteSpace: "nowrap",
                                    marginTop: 2,
                                  }}
                                >
                                  Deleted
                                </span>
                              </div>
                              {auditName && (
                                <span
                                  style={{
                                    position: "absolute",
                                    bottom: 2,
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    maxWidth: "calc(100% - 12px)",
                                    fontSize: "var(--dg-fs-micro)",
                                    fontWeight: 600,
                                    lineHeight: 1,
                                    textAlign: "center",
                                    color: "var(--color-text-muted)",
                                    pointerEvents: "none",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    padding: "1px 5px",
                                    background: "var(--color-surface)",
                                    borderRadius: 4,
                                    border: "1px solid rgba(0,0,0,0.08)",
                                    boxShadow: "0 0.5px 1px rgba(0,0,0,0.06)",
                                    zIndex: 2,
                                    textDecoration: "none",
                                  }}
                                >
                                  {auditName}
                                </span>
                              )}
                            </>
                          );
                        })()
                      ) : (
                        <>
                          {shiftCode === "OFF" && (
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
                      rowIndex === 0 ? "1px solid var(--color-border)" : undefined,
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
                      borderRight: "1px solid var(--color-border-light)",
                      borderBottom: isLastRow
                        ? undefined
                        : "1px solid var(--color-border-light)",
                      boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
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
                        data-tally-count={`${row.categoryId}-${index}`}
                        data-tally-status={
                          hasRequirement ? (isMet ? "covered" : "short") : "none"
                        }
                        style={{
                          textAlign: "center",
                          padding: "8px 6px",
                          borderLeft:
                            splitAtIndex !== undefined && index === splitAtIndex
                              ? "2px solid var(--color-dark)"
                              : "1px solid var(--color-border-light)",
                          borderBottom: isLastRow
                            ? undefined
                            : "1px solid var(--color-border-light)",
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
                          fontFamily: "var(--font-dm-mono), 'DM Mono', monospace",
                        }}
                      >
                        {hintContent ? (
                          <MaybeHint
                            content={hintContent}
                            side="top"
                          >
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
        </div>
        </div>
      </div>
    </div>
  );
});

const ScheduleGrid = memo(function ScheduleGrid({
  filteredEmployees,
  allEmployees,
  week1,
  week2,
  spanWeeks,
  shiftForKey,
  shiftCodeIdsForKey,
  getShiftStyle,
  handleCellClick,
  today,
  highlightEmpIds,
  focusAreas,
  departments,
  shiftCodes,
  shiftCategories,
  indicatorTypes = [],
  isCellInteractive = true,
  canDragShifts,
  activeIndicatorIdsForKey,
  activeFocusArea = null,
  certifications = [],
  orgRoles = [],
  getCustomShiftTimes,
  draftKindForKey,
  showDiffOverlay,
  publishedLabelForKey,
  publishedShiftCodeIdsForKey,
  hasTimeChangesForKey,
  publishDiffForKey,
  recentlyPublishedKeys,
  cellLocks,
  showAudit,
  createdByNameForKey,
  onCellHover,
  onCellContextMenu,
  coverageRequirements,
  absenceTypeMap,
  absenceTypeIdForKey,
  shiftDisplayMode = "code",
  resolvePublisherName,
  openShifts,
  onClaimOpenShift,
  selectedCellKey,
}: ScheduleGridProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipTextRef = useRef<HTMLSpanElement>(null);
  const tooltipVisibleRef = useRef(false);
  const todayKey = useMemo(() => formatDateKey(today), [today]);

  const showTooltipFn = useCallback((content: string, x: number, y: number) => {
    const el = tooltipRef.current;
    const textEl = tooltipTextRef.current;
    if (!el || !textEl) return;
    textEl.textContent = content;
    el.style.left = `${x}px`;
    el.style.top = `${y - 8}px`;
    el.style.display = "block";
    tooltipVisibleRef.current = true;
  }, []);

  const hideTooltipFn = useCallback(() => {
    const el = tooltipRef.current;
    if (!el) return;
    el.style.display = "none";
    tooltipVisibleRef.current = false;
  }, []);

  // Dismiss tooltip on scroll/resize so it doesn't float detached
  useEffect(() => {
    const dismiss = () => {
      if (tooltipVisibleRef.current) hideTooltipFn();
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [hideTooltipFn]);

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
  const splitAtIndex = spanWeeks === 2 ? 7 : undefined;

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

  // For each section, compute which shift code IDs belong to it
  const exclusiveCodeIdsPerSection = useMemo(() => {
    return Object.fromEntries(
      sections.map((section) => {
        const focusAreaId = focusAreaIdByName[section];
        const ids = new Set(
          shiftCodes
            .filter(
              (st) => focusAreaId != null && st.focusAreaId === focusAreaId,
            )
            .map((st) => st.id),
        );
        return [section, ids];
      }),
    );
  }, [sections, shiftCodes, focusAreaIdByName]);

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
              const codeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
              return codeIds.some(
                (id) =>
                  exclusiveCodeIds.has(id) ||
                  shiftCodes.find((sc) => sc.id === id)?.focusAreaId === null,
              );
            }),
          );
      const guestEmps = allEmployees.filter(
        (e) =>
          e.focusAreaIds.length > 0 &&
          (sectionId == null || !e.focusAreaIds.includes(sectionId)) &&
          allDates.some((date) => {
            const codeIds = shiftCodeIdsForKey?.(e.id, date) ?? [];
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
      shiftCodeIdsForKey,
      shiftCodes,
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
  const hasStackedCellContent = useMemo(() => {
    if (spanWeeks !== 2) return false;
    if (showAudit || showDiffOverlay) return true;
    if (!draftKindForKey && !publishDiffForKey && !createdByNameForKey) {
      return false;
    }

    return renderedDepartmentSections.some(({ focusAreas: deptFAs }) =>
      deptFAs.some((fa) => {
        const sectionId = focusAreaIdByName[fa.name] ?? fa.id;
        const exclusiveCodeIds =
          exclusiveCodeIdsPerSection[fa.name] ?? new Set<number>();
        const rawHomeEmps = filteredEmployees.filter(
          (e) => sectionId != null && e.focusAreaIds.includes(sectionId),
        );
        const homeEmps = isCellInteractive
          ? rawHomeEmps
          : rawHomeEmps.filter((emp) =>
              allDates.some((date) => {
                const codeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
                return codeIds.some(
                  (id) =>
                    exclusiveCodeIds.has(id) ||
                    shiftCodes.find((sc) => sc.id === id)?.focusAreaId === null,
                );
              }),
            );
        const guestEmps = allEmployees.filter(
          (e) =>
            e.focusAreaIds.length > 0 &&
            (sectionId == null || !e.focusAreaIds.includes(sectionId)) &&
            allDates.some((date) => {
              const codeIds = shiftCodeIdsForKey?.(e.id, date) ?? [];
              return codeIds.some((id) => exclusiveCodeIds.has(id));
            }),
        );
        const sectionEmps = [...homeEmps, ...guestEmps];

        return sectionEmps.some((emp) =>
          allDates.some((date) =>
            cellNeedsStackedLayout({
              draftKind: draftKindForKey?.(emp.id, date) ?? null,
              showDiffOverlay: !!showDiffOverlay,
              publishDiff: publishDiffForKey?.(emp.id, date) ?? null,
              auditName: createdByNameForKey?.(emp.id, date) ?? null,
              showAudit: !!showAudit,
            }),
          ),
        );
      }),
    );
  }, [
    spanWeeks,
    showAudit,
    showDiffOverlay,
    draftKindForKey,
    publishDiffForKey,
    createdByNameForKey,
    renderedDepartmentSections,
    focusAreaIdByName,
    exclusiveCodeIdsPerSection,
    filteredEmployees,
    isCellInteractive,
    allDates,
    shiftCodeIdsForKey,
    shiftCodes,
    allEmployees,
  ]);
  const gridLayout = getScheduleGridLayout({
    spanWeeks,
    shiftDisplayMode,
    containerWidth,
    hasOpenShifts,
    hasStackedCellContent,
  });
  const { nameColWidth, colWidth, fitToContainer } = gridLayout;
  const hasAnySections = renderedDepartmentSections.length > 0;

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
          <div
            ref={tooltipRef}
            style={{
              display: "none",
              position: "fixed",
              transform: "translate(-50%, -100%)",
              background: "var(--color-surface)",
              padding: "8px 14px",
              borderRadius: "var(--dg-radius-lg)",
              boxShadow: `
                0 10px 25px -5px rgba(0, 0, 0, 0.1),
                0 8px 10px -6px rgba(0, 0, 0, 0.1),
                0 0 0 1px rgba(0,0,0,0.05)
              `,
              zIndex: 1000,
              fontSize: "var(--dg-fs-body)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            <span ref={tooltipTextRef} />
            <div
              style={{
                position: "absolute",
                bottom: -4,
                left: "50%",
                transform: "translateX(-50%) rotate(45deg)",
                width: 10,
                height: 10,
                background: "var(--color-surface)",
                boxShadow: "2px 2px 2px rgba(0,0,0,0.02)",
              }}
            />
          </div>
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
                            shiftCodeIdsForKey?.(emp.id, date) ?? [];
                          return codeIds.some(
                            (id) =>
                              exclusiveCodeIds.has(id) ||
                              shiftCodes.find((sc) => sc.id === id)
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
                        const codeIds = shiftCodeIdsForKey?.(e.id, date) ?? [];
                        return codeIds.some((id) => exclusiveCodeIds.has(id));
                      }),
                  );
                  const sectionEmps = [...homeEmps, ...guestEmps];

                  return (
                    <SectionBlock
                      key={fa.id}
                      sectionName={sectionName}
                      exclusiveCodeIds={exclusiveCodeIds}
                      employees={sectionEmps}
                      weekDates={allDates}
                      todayKey={todayKey}
                      shiftForKey={shiftForKey}
                      shiftCodeIdsForKey={shiftCodeIdsForKey}
                      getShiftStyle={getShiftStyle}
                      handleCellClick={handleCellClick}
                      colWidth={colWidth}
                      fitToContainer={fitToContainer}
                      splitAtIndex={splitAtIndex}
                      highlightEmpIds={highlightEmpIds}
                      focusAreas={focusAreas}
                      shiftCodes={shiftCodes}
                      shiftCategories={shiftCategories}
                      indicatorTypes={indicatorTypes}
                      isCellInteractive={isCellInteractive}
                      canDragShifts={canDragShifts ?? isCellInteractive}
                      activeIndicatorIdsForKey={activeIndicatorIdsForKey}
                      showTooltip={showTooltipFn}
                      hideTooltip={hideTooltipFn}
                      getCustomShiftTimes={getCustomShiftTimes}
                      draftKindForKey={draftKindForKey}
                      showDiffOverlay={showDiffOverlay}
                      publishedLabelForKey={publishedLabelForKey}
                      publishedShiftCodeIdsForKey={publishedShiftCodeIdsForKey}
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
                      coverageRequirements={coverageRequirements}
                      absenceTypeMap={absenceTypeMap}
                      absenceTypeIdForKey={absenceTypeIdForKey}
                      shiftDisplayMode={shiftDisplayMode}
                      resolvePublisherName={resolvePublisherName}
                      selectedCellKey={selectedCellKey}
                      openShifts={openShifts?.filter(
                        (os) =>
                          sectionId != null && os.focusAreaId === sectionId,
                      )}
                      onClaimOpenShift={onClaimOpenShift}
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

export default ScheduleGrid;
