"use client";

import React, { memo, useMemo, useRef, useLayoutEffect, useState } from "react";
import { DAY_LABELS, BOX_SHADOW_CARD } from "@/lib/constants";
import { formatDateKey } from "@/lib/utils";
import { resolveRequirement, computeCoverageStatus } from "@/lib/schedule-logic";
import { Employee, ShiftCategory, ShiftCode, FocusArea, IndicatorType, NamedItem, DraftKind, PublishChange, CoverageRequirement, CoverageStatus, AbsenceType } from "@/types";
import { getCertAbbr, getRoleAbbrs, getEmployeeDisplayName } from "@/lib/utils";
import { borderColor, DESIGNATION_COLORS, DEFAULT_DESIG_COLOR, DRAFT_BORDER_COLORS } from "@/lib/colors";
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
function isOvernightTimes(start: string | null | undefined, end: string | null | undefined): boolean {
  if (!start || !end) return false;
  const effectiveEnd = end === "00:00" ? "24:00" : end;
  return start > effectiveEnd;
}

function getDraftBorder(draftKind: DraftKind, fallback: string): string {
  if (!draftKind) return fallback;
  return `2px dashed ${DRAFT_BORDER_COLORS[draftKind]}`;
}

function getPublishDiffBoxShadow(kind: string, fallback: string): string {
  const color = DRAFT_BORDER_COLORS[kind] ?? fallback;
  return `0 0 0 1px var(--color-surface), 0 0 0 2.5px ${color}`;
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
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
  indicatorTypes?: IndicatorType[];
  isCellInteractive?: boolean;
  activeIndicatorIdsForKey?: (empId: string, date: Date, focusAreaId?: number) => number[];
  activeFocusArea?: number | null;
  certifications?: NamedItem[];
  orgRoles?: NamedItem[];
  getCustomShiftTimes?: (empId: string, date: Date) => { start: string; end: string; perPill?: { start: string; end: string }[] } | null;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  showDiffOverlay?: boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedShiftCodeIdsForKey?: (empId: string, date: Date) => number[];
  /** Returns true if the cell's custom times differ from published times. */
  hasTimeChangesForKey?: (empId: string, date: Date) => boolean;
  publishDiffForKey?: (empId: string, date: Date) => PublishChange | null;
  cellLocks?: Map<string, { userName: string }>;
  /** When true, show who created each shift below the cell */
  showAudit?: boolean;
  /** Returns the creator's first name for compact grid display */
  createdByNameForKey?: (empId: string, date: Date) => string | null;
  /** Suppress hover effects during drag */
  isDragging?: boolean;
  /** Called when mouse enters a cell (for copy-paste hover tracking) */
  onCellHover?: (empId: string, date: Date, focusAreaName: string) => void;
  /** Called on right-click of a cell */
  onCellContextMenu?: (e: React.MouseEvent, empId: string, date: Date, focusAreaName: string) => void;
  /** Coverage requirements for inline tally status display */
  coverageRequirements?: CoverageRequirement[];
  /** Map from absence type ID to AbsenceType for color resolution */
  absenceTypeMap?: Map<number, AbsenceType>;
  /** Returns the absence type ID for a given cell, or null/undefined if not an absence */
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
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
  splitAtIndex?: number;
  highlightEmpIds?: Set<string>;
  focusAreas: FocusArea[];
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
  indicatorTypes: IndicatorType[];
  isCellInteractive: boolean;
  activeIndicatorIdsForKey?: (empId: string, date: Date, focusAreaId?: number) => number[];
  onTooltipChange: (tooltip: { content: string; x: number; y: number } | null) => void;
  getCustomShiftTimes?: (empId: string, date: Date) => { start: string; end: string; perPill?: { start: string; end: string }[] } | null;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  showDiffOverlay?: boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedShiftCodeIdsForKey?: (empId: string, date: Date) => number[];
  hasTimeChangesForKey?: (empId: string, date: Date) => boolean;
  publishDiffForKey?: (empId: string, date: Date) => PublishChange | null;
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  cellLocks?: Map<string, { userName: string }>;
  showAudit?: boolean;
  createdByNameForKey?: (empId: string, date: Date) => string | null;
  isDragging?: boolean;
  onCellHover?: (empId: string, date: Date, focusAreaName: string) => void;
  onCellContextMenu?: (e: React.MouseEvent, empId: string, date: Date, focusAreaName: string) => void;
  coverageRequirements?: CoverageRequirement[];
  absenceTypeMap?: Map<number, AbsenceType>;
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
}

const SectionBlock = memo(function SectionBlock({
  sectionName,
  exclusiveCodeIds,
  employees,
  weekDates,
  todayKey,
  shiftForKey,
  shiftCodeIdsForKey,
  getShiftStyle,
  handleCellClick,
  colWidth,
  splitAtIndex,
  highlightEmpIds,
  focusAreas,
  shiftCodes,
  shiftCategories,
  indicatorTypes,
  isCellInteractive,
  activeIndicatorIdsForKey,
  onTooltipChange,
  getCustomShiftTimes,
  draftKindForKey,
  showDiffOverlay,
  publishedLabelForKey,
  publishedShiftCodeIdsForKey,
  hasTimeChangesForKey,
  publishDiffForKey,
  certifications,
  orgRoles,
  cellLocks,
  showAudit,
  createdByNameForKey,
  isDragging: isDraggingGlobal,
  onCellHover,
  onCellContextMenu,
  coverageRequirements,
  absenceTypeMap,
  absenceTypeIdForKey,
}: SectionBlockProps) {
  const { user: currentUser } = useAuth();
  if (employees.length === 0) return null;

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
    () => (label: string, codeId?: number): ShiftCode => {
      if (codeId != null) {
        const byId = shiftCodeById.get(codeId);
        if (byId) return byId;
      }
      return contextualGetShiftStyle(label);
    },
    [shiftCodeById, contextualGetShiftStyle],
  );

  // Only count home employees (those assigned to this section) in tallies.
  // Guest employees are displayed in the grid but excluded from section counts.
  const sectionFocusArea = focusAreas.find((fa) => fa.name === sectionName);
  const homeEmployees = useMemo(
    () => sectionFocusArea ? employees.filter((e) => e.focusAreaIds.includes(sectionFocusArea.id)) : [],
    [employees, sectionFocusArea],
  );

  // Set of shift code IDs that belong to this section's focus area
  const sectionCodeIds = useMemo(() => {
    if (!sectionFocusArea) return new Set<number>();
    return new Set(
      shiftCodes.filter((sc) => sc.focusAreaId === sectionFocusArea.id).map((sc) => sc.id),
    );
  }, [shiftCodes, sectionFocusArea]);

  const shiftCodeIdsForKeyFn = shiftCodeIdsForKey ?? (() => []);

  // Coverage status per (date, category, shiftCode)
  // Shape: Record<categoryId, Record<shiftCodeLabel, CoverageStatus>>[]
  const dailyCoverageStatus = useMemo(() => {
    if (!coverageRequirements?.length || !sectionFocusArea) return null;
    return weekDates.map((date) => {
      const dow = date.getDay();
      const statusByCategory: Record<number, Record<string, CoverageStatus>> = {};
      for (const req of coverageRequirements) {
        if (req.focusAreaId !== sectionFocusArea.id) continue;
        const code = shiftCodeById.get(req.shiftCodeId);
        if (!code || code.categoryId == null || !sectionCodeIds.has(code.id)) continue;
        const resolved = resolveRequirement(coverageRequirements, sectionFocusArea.id, code.id, dow);
        if (!resolved) continue;
        statusByCategory[code.categoryId] ??= {};
        // Only compute once per code (skip if already computed for this label)
        if (statusByCategory[code.categoryId][code.label]) continue;
        statusByCategory[code.categoryId][code.label] = computeCoverageStatus(
          homeEmployees,
          date,
          shiftCodeIdsForKeyFn,
          sectionCodeIds,
          code.id,
          resolved,
        );
      }
      return statusByCategory;
    });
  }, [weekDates, coverageRequirements, sectionFocusArea, homeEmployees, shiftCodeIdsForKeyFn, shiftCodeById, sectionCodeIds]);

  const renderCoverage = (coverageByLabel?: Record<string, CoverageStatus>) => {
    if (!coverageByLabel) return "-";
    const entries = Object.entries(coverageByLabel).filter(([, c]) => c.hasRequirement);
    if (entries.length === 0) return "-";
    return (
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
        {entries.map(([label, cov], ei) => (
          <span key={label} style={{ whiteSpace: "nowrap" }}>
            {ei > 0 && <span style={{ color: "var(--color-text-faint)", margin: "0 0.3em" }}>|</span>}
            <span style={{ color: cov.isMet ? "var(--color-success-text)" : "var(--color-danger-dark)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3 }}>
              {cov.isMet
                ? <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.78 5.22a.75.75 0 00-1.06 0L7 8.94 5.28 7.22a.75.75 0 10-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25a.75.75 0 000-1.06z"/></svg>
                : <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zm0 3.5a.75.75 0 00-.75.75v4a.75.75 0 001.5 0v-4A.75.75 0 008 3.5zM8 12a1 1 0 100-2 1 1 0 000 2z"/></svg>
              }
              {label}: {cov.actual}/{cov.required}
            </span>
          </span>
        ))}
      </div>
    );
  };

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
        return s.focusAreaId == null || (sectionWing != null && s.focusAreaId === sectionWing.id);
      });
      if (!hasLocalOrGeneral) {
        const homeWing = focusAreas.find((w) => st.focusAreaId === w.id);
        if (homeWing) map.set(st.label, homeWing.name);
      }
    }
    return map;
  }, [shiftCodes, sectionName, focusAreas]);

  // Coverage rows — only show categories that have coverage requirements configured
  const coverageRows = useMemo(() => {
    if (!dailyCoverageStatus) return [];
    const allCatIds = new Set<number>();
    for (const dayCov of dailyCoverageStatus) {
      for (const catId of Object.keys(dayCov).map(Number)) {
        allCatIds.add(catId);
      }
    }
    if (allCatIds.size === 0) return [];
    return shiftCategories
      .filter((cat) => allCatIds.has(cat.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((cat) => ({ id: cat.id, name: cat.name }));
  }, [dailyCoverageStatus, shiftCategories]);

  const gridTemplate = `var(--dg-grid-name-col) repeat(${weekDates.length}, minmax(var(--dg-grid-col-min), 1fr))`;

  const rowGrid: React.CSSProperties = {
    display: "grid",
    gridColumn: "1 / -1",
    gridTemplateColumns: "subgrid",
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Section label */}
      <div
        style={{
          fontSize: "var(--dg-fs-heading)",
          fontWeight: 800,
          color: "var(--color-text-secondary)",
          marginBottom: 10,
          paddingLeft: 4,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ width: 3, height: 18, borderRadius: 2, background: "var(--color-brand)", flexShrink: 0 }} />
        {sectionName}
      </div>

      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: 12,
          border: "1px solid var(--color-border)",
          overflowX: "auto",
          boxShadow: BOX_SHADOW_CARD,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridTemplate,
            minWidth: "max-content",
          }}
        >
          {/* Header row */}
          <div
            style={{ ...rowGrid, borderBottom: "2px solid var(--color-dark)" }}
          >
            <div
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

          {/* Employee rows */}
          {employees.map((emp, ri) => {
            const isHighlighted =
              highlightEmpIds && highlightEmpIds.size > 0
                ? highlightEmpIds.has(emp.id)
                : true;
            const isCurrentUser = !!(emp.userId && currentUser && emp.userId === currentUser.id);
            const rowBg = isCurrentUser ? "var(--color-today-bg)" : "var(--color-surface)";
            const certAbbr = getCertAbbr(emp.certificationId, certifications);
            const dc =
              DESIGNATION_COLORS[certAbbr] ?? DEFAULT_DESIG_COLOR;

            return (
              <div
                key={emp.id}
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
                    borderTop: ri > 0 ? "1px solid var(--color-border-light)" : undefined,
                    borderRight: "1px solid var(--color-border-light)",
                    boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
                  }}
                >
                  <div style={{
                    minWidth: 0, position: "relative", overflow: "hidden",
                    display: "flex", flexDirection: "column", justifyContent: "center",
                  }}>
                    <span
                      title={getEmployeeDisplayName(emp)}
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
                {weekDates.map((date, di) => {
                  const dateKey = formatDateKey(date);
                  const isToday = dateKey === todayKey;
                  const isSplit =
                    splitAtIndex !== undefined && di === splitAtIndex;
                  const shiftCode = shiftForKey(emp.id, date);
                  const cellCodeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
                  const draftKind = draftKindForKey?.(emp.id, date) ?? null;
                  const publishDiff = publishDiffForKey?.(emp.id, date) ?? null;
                  const publishedLabel = publishedLabelForKey?.(emp.id, date) ?? null;
                  const publishedCodeIds = publishedShiftCodeIdsForKey?.(emp.id, date) ?? [];
                  const cellHasTimeEdits = hasTimeChangesForKey?.(emp.id, date) ?? false;
                  const noteTypes = activeIndicatorIdsForKey?.(emp.id, date, sectionFocusArea?.id) ?? [];
                  const customTimes = getCustomShiftTimes?.(emp.id, date) ?? null;
                  const cellLock = cellLocks?.get(`${emp.id}_${dateKey}`);
                  const isLocked = !!cellLock;
                  const auditName = showAudit ? createdByNameForKey?.(emp.id, date) ?? null : null;
                  const cellAbsenceTypeId = absenceTypeIdForKey?.(emp.id, date) ?? null;
                  const cellAbsenceType = cellAbsenceTypeId != null ? absenceTypeMap?.get(cellAbsenceTypeId) ?? null : null;

                  const hasDraggableShift = isCellInteractive && !isLocked && shiftCode && shiftCode !== "OFF" && draftKind !== 'deleted' && !cellAbsenceType;
                  const firstStyle = hasDraggableShift ? getStyleByIdOrLabel(shiftCode.split("/")[0], cellCodeIds[0]) : null;

                  return (
                    <DroppableCell
                      key={dateKey}
                      id={`drop_${emp.id}_${dateKey}_${sectionName}`}
                      data={{ empId: emp.id, date, dateKey, focusAreaName: sectionName }}
                      disabled={!isCellInteractive || isLocked}
                      onClick={() => {
                        if (isCellInteractive && !isLocked) handleCellClick(emp, date, sectionName);
                      }}
                      onContextMenu={(e) => {
                        if (isCellInteractive && onCellContextMenu) {
                          e.preventDefault();
                          onCellContextMenu(e, emp.id, date, sectionName);
                        }
                      }}
                      className="dg-grid-cell"
                      role="gridcell"
                      aria-label={shiftCode && shiftCode !== "OFF" ? `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[date.getDay()]} ${date.getDate()}: ${shiftCode}` : `${getEmployeeDisplayName(emp)}, ${DAY_LABELS[date.getDay()]} ${date.getDate()}: empty`}
                      tabIndex={isCellInteractive ? 0 : -1}
                      data-interactive={isCellInteractive ? "true" : "false"}
                      data-locked={isLocked ? "true" : "false"}
                      data-dragging={isDraggingGlobal ? "true" : "false"}
                      style={{
                        height: showAudit ? "var(--dg-grid-cell-height-audit)" : "var(--dg-grid-cell-height)",
                        borderTop: ri > 0 && !isSplit ? "1px solid var(--color-border-light)" : undefined,
                        borderLeft: isSplit
                          ? "2px solid var(--color-dark)"
                          : "1px solid var(--color-border-light)",
                        boxShadow: isSplit && ri > 0 ? "inset 0 1px 0 var(--color-border-light)" : undefined,
                        background: isLocked
                          ? "rgba(46, 153, 48, 0.08)"
                          : isToday
                            ? "var(--color-today-bg)"
                            : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        onCellHover?.(emp.id, date, sectionName);
                        if (shiftCode && shiftCode !== "OFF") {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const content = cellAbsenceType
                            ? cellAbsenceType.name
                            : shiftCode.split("/").map((l, li) => {
                                const style = getStyleByIdOrLabel(l, cellCodeIds[li]);
                                const codeEntry = cellCodeIds[li] != null ? shiftCodeById.get(cellCodeIds[li]) : undefined;
                                const isForeign = codeEntry?.focusAreaId != null
                                  && sectionFocusArea != null
                                  && codeEntry.focusAreaId !== sectionFocusArea.id;
                                const homeFa = isForeign
                                  ? focusAreas.find(fa => fa.id === codeEntry!.focusAreaId)?.name
                                  : foreignLabelHomeMap.get(l);
                                return homeFa ? `${style.name} (${homeFa})` : style.name;
                              }).join(" / ");
                          onTooltipChange({
                            content,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }
                      }}
                      onMouseLeave={() => {
                        onTooltipChange(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (isCellInteractive && !isLocked) handleCellClick(emp, date, sectionName);
                        }
                        if (e.shiftKey && e.key === "F10" && isCellInteractive && onCellContextMenu) {
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          onCellContextMenu(e as unknown as React.MouseEvent, emp.id, date, sectionName);
                        }
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
                            focusAreaName: sectionName,
                            pillColor: cellAbsenceType?.color ?? firstStyle?.color ?? "var(--color-bg)",
                            pillText: cellAbsenceType?.text ?? firstStyle?.text ?? "var(--color-text-muted)",
                          }}
                          disabled={!hasDraggableShift}
                        >
                        {(() => {
                          const labels = shiftCode.split("/");

                          // Per-pill publish diff: compare from[i] vs to[i] positionally
                          const isPubDiff = !draftKind && publishDiff;
                          const pubFrom = isPubDiff ? publishDiff!.from : [];
                          const pubTo = isPubDiff ? publishDiff!.to : [];

                          // For each pill index, determine if it changed vs the old state
                          function pillPublishStatus(pillIndex: number): 'new' | 'modified' | 'unchanged' | null {
                            if (!isPubDiff) return null;
                            const toId = pubTo[pillIndex];
                            const fromId = pubFrom[pillIndex];
                            if (fromId == null) return 'new';        // no old pill at this index → added
                            if (fromId !== toId) return 'modified';  // old pill differs → changed
                            return 'unchanged';                      // same code at same position
                          }

                          // Cell-level label below the pill(s)
                          const publishBadge = isPubDiff
                            ? publishDiff!.kind === 'new'
                              ? { text: 'New', color: 'var(--color-success-text)' }
                              : publishDiff!.kind === 'modified'
                                ? { text: `was: ${pubFrom.map(id => shiftCodeById.get(id)?.label ?? '?').join('/')}`, color: 'var(--color-primary)' }
                                : null
                            : null;

                          if (labels.length === 1) {
                            const label = labels[0];
                            const isAbsence = cellAbsenceType != null;
                            const style = isAbsence
                              ? { ...getStyleByIdOrLabel(label, cellCodeIds[0]), color: cellAbsenceType!.color, text: cellAbsenceType!.text }
                              : getStyleByIdOrLabel(label, cellCodeIds[0]);
                            const codeEntry0 = cellCodeIds[0] != null ? shiftCodeById.get(cellCodeIds[0]) : undefined;
                            const cat0 = codeEntry0?.categoryId != null ? categoryById.get(codeEntry0.categoryId) : undefined;
                            const isOvernight = !isAbsence && isOvernightTimes(
                              customTimes?.start ?? codeEntry0?.defaultStartTime ?? cat0?.startTime,
                              customTimes?.end ?? codeEntry0?.defaultEndTime ?? cat0?.endTime,
                            );
                            const isCross = !isAbsence && label !== "X" && codeEntry0?.focusAreaId != null
                              && sectionFocusArea != null
                              && codeEntry0.focusAreaId !== sectionFocusArea.id;
                            const crossHomeFa = isCross
                              ? focusAreas.find((fa) => fa.id === codeEntry0!.focusAreaId)
                              : undefined;
                            // Compute effective border: draft indicators use dashed border
                            const absenceBorder = isAbsence ? `1px solid ${cellAbsenceType!.border}` : `1px solid ${borderColor(style.text)}`;
                            const effectiveBorder = draftKind
                              ? getDraftBorder(draftKind, absenceBorder)
                              : absenceBorder;

                             return (
                               <>
                               <div
                                 style={{
                                   position: "absolute",
                                   top: customTimes ? "3px" : "4px",
                                   right: "4px",
                                   bottom: (publishBadge && auditName) ? "28px" : (publishBadge || auditName) ? "16px" : customTimes ? "3px" : "4px",
                                   left: "4px",
                                   background: isCross ? "var(--color-surface)" : style.color,
                                   opacity: draftKind === 'deleted' ? 0.5 : 1,
                                   border: effectiveBorder,
                                   borderRadius: 8,
                                   color: style.text,
                                   boxShadow: pillPublishStatus(0) === 'new' || pillPublishStatus(0) === 'modified'
                                     ? getPublishDiffBoxShadow(pillPublishStatus(0)!, borderColor(style.text))
                                     : "none",
                                   cursor: "pointer",
                                   display: "flex",
                                   flexDirection: "column",
                                   alignItems: "center",
                                   justifyContent: showDiffOverlay && draftKind && draftKind !== 'deleted' ? "flex-start" : "center",
                                   paddingTop: showDiffOverlay && draftKind && draftKind !== 'deleted' ? 4 : 0,
                                   paddingLeft: isCross && crossHomeFa ? 18 : 0,
                                   overflow: "hidden",
                                   textDecoration: draftKind === 'deleted' ? 'line-through' : 'none',
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
                                       background: crossHomeFa.colorBg,
                                       color: crossHomeFa.colorText,
                                       borderRadius: "2px 0 0 2px",
                                       padding: "0 3px",
                                       letterSpacing: "0.02em",
                                       pointerEvents: "none",
                                     }}
                                   >
                                     {getFocusAreaInitials(crossHomeFa.name)}
                                   </span>
                                 )}
                                 <span style={{ fontSize: "var(--dg-fs-title)", fontWeight: 800, lineHeight: 1 }}>
                                   {label}
                                   {!customTimes && isOvernight && (
                                     <sup style={{ fontSize: "0.5em", fontWeight: 700, opacity: 0.5, marginLeft: 1 }}>+1</sup>
                                   )}
                                 </span>
                                 {customTimes && (
                                   <span style={{
                                     fontSize: "var(--dg-fs-footnote)",
                                     fontWeight: 500,
                                     lineHeight: 1,
                                     marginTop: 4,
                                     opacity: 0.7,
                                     letterSpacing: "0.02em",
                                   }}>
                                     {fmt12hShort(customTimes.start)}–{fmt12hShort(customTimes.end)}
                                     {isOvernight && <sup style={{ fontSize: "0.7em", fontWeight: 700, marginLeft: 1, opacity: 1 }}>+1</sup>}
                                   </span>
                                 )}
                                 {showDiffOverlay && draftKind === 'modified' && publishedLabel && shiftCode !== publishedLabel && (
                                   <span style={{
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
                                   }}>
                                     was: {publishedLabel}
                                   </span>
                                 )}
                                 {showDiffOverlay && draftKind === 'new' && (
                                   <span style={{
                                     position: "absolute",
                                     bottom: 2,
                                     left: "50%",
                                     transform: "translateX(-50%)",
                                     fontSize: "var(--dg-fs-label)",
                                     fontWeight: 800,
                                     color: "var(--color-success-text)",
                                     whiteSpace: "nowrap",
                                     pointerEvents: "none",
                                   }}>
                                     new
                                   </span>
                                 )}
                                 {noteTypes.length > 0 && (
                                   <div
                                     style={{
                                       position: "absolute",
                                       bottom: showDiffOverlay && draftKind ? 15 : 3,
                                       right: 4,
                                       display: "flex",
                                       gap: 2,
                                     }}
                                   >
                                     {indicatorTypes.filter(ind => noteTypes.includes(ind.id)).map(ind => (
                                       <div
                                         key={ind.name}
                                         title={ind.name}
                                         style={{
                                           width: 8,
                                           height: 8,
                                           borderRadius: "50%",
                                           background: ind.color,
                                           border: "1.5px solid rgba(255,255,255,0.9)",
                                           flexShrink: 0,
                                         }}
                                       />
                                     ))}
                                   </div>
                                 )}
                               </div>
                               {auditName && (
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
                                     boxShadow: "0 0.5px 1px rgba(0,0,0,0.06)",
                                     zIndex: 2,
                                     textDecoration: "none",
                                   }}
                                 >
                                   {auditName}
                                 </span>
                               )}
                               {publishBadge && (
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
                                     pointerEvents: "none",
                                     whiteSpace: "nowrap",
                                   }}
                                 >
                                   {publishBadge.text}
                                 </span>
                               )}
                             </>
                             );
                          }

                          // Multi-pill: render each shift as a separate vertical pill
                          const hasMultiPillLabel = (showDiffOverlay && draftKind && draftKind !== 'deleted') || publishBadge;
                          const hasBottomLabel = hasMultiPillLabel || auditName;
                          // When cell is 'modified' but all codes match published, it's a metadata-only
                          // change (custom times, notes, etc.) — all pills should show dashed borders.
                          const isMetadataOnlyChange = draftKind === 'modified'
                            && publishedCodeIds.length > 0
                            && cellCodeIds.length === publishedCodeIds.length
                            && cellCodeIds.every((id, i) => id === publishedCodeIds[i]);
                          return (
                            <>
                            <div
                              style={{
                                position: "absolute",
                                top: "3px",
                                right: "3px",
                                bottom: (hasMultiPillLabel && auditName) ? "28px" : hasBottomLabel ? "16px" : "3px",
                                left: "3px",
                                display: "flex",
                                flexDirection: "column",
                                gap: 1,
                                alignItems: "stretch",
                                opacity: draftKind === 'deleted' ? 0.5 : 1,
                              }}
                            >
                              <div style={{ display: "flex", flexDirection: "row", gap: 1, flex: 1, minHeight: 0, alignItems: "stretch" }}>
                              {labels.map((label, li) => {
                                const style = getStyleByIdOrLabel(label, cellCodeIds[li]);
                                const codeEntryLi = cellCodeIds[li] != null ? shiftCodeById.get(cellCodeIds[li]) : undefined;
                                const isCross = label !== "X"
                                  && codeEntryLi?.focusAreaId != null
                                  && sectionFocusArea != null
                                  && codeEntryLi.focusAreaId !== sectionFocusArea.id;
                                const crossHomeFaLi = isCross
                                  ? focusAreas.find((fa) => fa.id === codeEntryLi!.focusAreaId)
                                  : undefined;
                                const isNewPill = draftKind && publishedCodeIds.length > 0
                                  && cellCodeIds[li] != null
                                  && !publishedCodeIds.includes(cellCodeIds[li]);
                                const isExistingPillEdited = draftKind === 'modified'
                                  && publishedCodeIds.includes(cellCodeIds[li])
                                  && cellHasTimeEdits;
                                const pillBorder = (isNewPill || draftKind === 'new' || isMetadataOnlyChange || isExistingPillEdited)
                                  ? `2px dashed ${DRAFT_BORDER_COLORS[draftKind!]}`
                                  : `1px solid ${borderColor(style.text)}`;
                                const pillTime = customTimes?.perPill?.[li] ?? (li === 0 && !customTimes?.perPill ? customTimes : null);
                                const hasTime = pillTime && (pillTime.start || pillTime.end);
                                const catLi = codeEntryLi?.categoryId != null ? categoryById.get(codeEntryLi.categoryId) : undefined;
                                const isPillOvernight = isOvernightTimes(
                                  pillTime?.start ?? codeEntryLi?.defaultStartTime ?? catLi?.startTime,
                                  pillTime?.end ?? codeEntryLi?.defaultEndTime ?? catLi?.endTime,
                                );

                                return (
                                  <div
                                    key={li}
                                    style={{
                                      flex: 1,
                                      background: isCross ? "var(--color-surface)" : style.color,
                                      border: draftKind === 'deleted'
                                        ? getDraftBorder(draftKind, `1px solid ${borderColor(style.text)}`)
                                        : pillBorder,
                                      borderRadius: 6,
                                      color: style.text,
                                      boxShadow: (() => {
                                        const ps = pillPublishStatus(li);
                                        return ps === 'new' || ps === 'modified'
                                          ? getPublishDiffBoxShadow(ps, borderColor(style.text))
                                          : "none";
                                      })(),
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      gap: 1,
                                      fontSize: "var(--dg-fs-caption)",
                                      fontWeight: 800,
                                      position: "relative",
                                      cursor: "pointer",
                                      textDecoration: draftKind === 'deleted' ? 'line-through' : 'none',
                                      lineHeight: 1,
                                      overflow: "hidden",
                                      minWidth: 0,
                                      paddingLeft: isCross && crossHomeFaLi ? 14 : 0,
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
                                          background: crossHomeFaLi.colorBg,
                                          color: crossHomeFaLi.colorText,
                                          borderRadius: "2px 0 0 2px",
                                          padding: "0 2px",
                                          letterSpacing: "0.02em",
                                          pointerEvents: "none",
                                        }}
                                      >
                                        {getFocusAreaInitials(crossHomeFaLi.name)}
                                      </span>
                                    )}
                                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                                      {label}
                                      {!hasTime && isPillOvernight && (
                                        <sup style={{ fontSize: "0.65em", fontWeight: 700, opacity: 0.5, marginLeft: 1 }}>+1</sup>
                                      )}
                                    </span>
                                    {hasTime && (
                                      <span style={{ fontSize: "var(--dg-fs-micro)", fontWeight: 500, opacity: 0.7, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                                        {fmt12hShort(pillTime!.start)}–{fmt12hShort(pillTime!.end)}
                                        {isPillOvernight && <sup style={{ fontSize: "0.65em", fontWeight: 700, marginLeft: 1, opacity: 1 }}>+1</sup>}
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
                                  {indicatorTypes.filter(ind => noteTypes.includes(ind.id)).map(ind => (
                                    <div
                                      key={ind.name}
                                      title={ind.name}
                                      style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: "50%",
                                        background: ind.color,
                                        border: "1.5px solid rgba(255,255,255,0.9)",
                                        flexShrink: 0,
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                            {auditName && (
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
                            {showDiffOverlay && draftKind === 'modified' && publishedLabel && shiftCode !== publishedLabel && (
                              <span style={{
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
                              }}>
                                was: {publishedLabel}
                              </span>
                            )}
                            {showDiffOverlay && draftKind === 'new' && (
                              <span style={{
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
                              }}>
                                new
                              </span>
                            )}
                            {publishBadge && (
                              <span style={{
                                position: "absolute",
                                bottom: 2,
                                left: "50%",
                                transform: "translateX(-50%)",
                                fontSize: "var(--dg-fs-footnote)",
                                fontWeight: 700,
                                color: publishBadge.color,
                                whiteSpace: "nowrap",
                                pointerEvents: "none",
                                lineHeight: 1,
                                zIndex: 1,
                              }}>
                                {publishBadge.text}
                              </span>
                            )}
                            </>
                          );
                        })()}
                        </DraggableShift>
                      ) : (showDiffOverlay && draftKind === 'deleted' && publishedLabel) || (publishDiff?.kind === 'deleted' && publishDiff.from.length > 0) ? (
                        (() => {
                          const isDraftDelete = draftKind === 'deleted';
                          const deletedLabel = isDraftDelete
                            ? publishedLabel!
                            : publishDiff!.from.map(id => shiftCodeById.get(id)?.label ?? '?').join('/');
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
                                border: isDraftDelete ? "2px dashed var(--color-danger-dark)" : "1px solid var(--color-danger-border)",
                                borderRadius: 8,
                                ...(isDraftDelete ? {} : { boxShadow: "0 0 0 1px var(--color-surface), 0 0 0 2.5px var(--color-danger-dark)" }),
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "var(--color-danger-dark)",
                                overflow: "hidden",
                              }}
                            >
                              <span style={{
                                fontSize: "var(--dg-fs-title)",
                                fontWeight: 800,
                                lineHeight: 1,
                              }}>
                                {deletedLabel}
                              </span>
                              <span style={{
                                fontSize: "var(--dg-fs-badge)",
                                fontWeight: 700,
                                lineHeight: 1,
                                color: "var(--color-danger-dark)",
                                pointerEvents: "none",
                                whiteSpace: "nowrap",
                                marginTop: 2,
                              }}>
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
                          <div
                            style={{
                              width: 16,
                              height: 2,
                              background:
                                shiftCode === "OFF"
                                  ? "var(--color-border)"
                                  : "var(--color-border-light)",
                              borderRadius: 2,
                            }}
                          />
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
                              {indicatorTypes.filter(ind => noteTypes.includes(ind.id)).map(ind => (
                                <div
                                  key={ind.name}
                                  title={ind.name}
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    background: ind.color,
                                    border: "1.5px solid rgba(255,255,255,0.85)",
                                    flexShrink: 0,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      {isLocked && cellLock && (
                        <span
                          title={`Being edited by ${cellLock.userName}`}
                          style={{
                            position: "absolute",
                            top: 2,
                            right: 2,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            background: "var(--color-primary)",
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
                          {cellLock.userName.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                        </span>
                      )}
                    </DroppableCell>
                  );
                })}
              </div>
            );
          })}

          {/* Coverage rows — one per category with configured requirements */}
          {coverageRows.map((row, ci) => {
            const isLastRow = ci === coverageRows.length - 1;
            return (
            <div
              key={row.id}
              style={{
                ...rowGrid,
                borderTop: ci === 0 ? "2px solid var(--color-dark)" : undefined,
                background: "var(--color-surface)",
              }}
            >
              <div
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                  background: "var(--color-surface)",
                  padding: "6px 14px",
                  fontSize: "var(--dg-fs-badge)",
                  fontWeight: 700,
                  color: "var(--color-text-secondary)",
                  letterSpacing: "0.05em",
                  display: "flex",
                  alignItems: "center",
                  borderRight: "1px solid var(--color-border)",
                  borderBottom: isLastRow ? undefined : "1px solid var(--color-border)",
                  boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
                }}
              >
                {row.name}
              </div>
              {weekDates.map((_, i) => {
                const coverageByLabel = dailyCoverageStatus?.[i]?.[row.id];
                const coverageValues = coverageByLabel ? Object.values(coverageByLabel) : [];
                const allMet = coverageValues.every((c) => !c.hasRequirement || c.isMet);
                const cellBg = allMet ? "rgba(22, 163, 74, 0.10)" : "rgba(220, 38, 38, 0.10)";
                return (
                  <div
                    key={i}
                    style={{
                      textAlign: "center",
                      padding: "8px 4px",
                      borderLeft:
                        splitAtIndex !== undefined && i === splitAtIndex
                          ? "2px solid var(--color-dark)"
                          : "1px solid var(--color-border)",
                      borderBottom: isLastRow ? undefined : (splitAtIndex !== undefined && i === splitAtIndex ? undefined : "1px solid var(--color-border)"),
                      boxShadow: isLastRow ? undefined : (splitAtIndex !== undefined && i === splitAtIndex ? "inset 0 -1px 0 var(--color-border)" : undefined),
                      fontSize: "var(--dg-fs-badge)",
                      lineHeight: 1.3,
                      fontWeight: 700,
                      background: cellBg,
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {renderCoverage(coverageByLabel)}
                  </div>
                );
              })}
            </div>
          )})}
        </div>
      </div>
    </div>
  );
});

export default function ScheduleGrid({
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
  shiftCodes,
  shiftCategories,
  indicatorTypes = [],
  isCellInteractive = true,
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
  cellLocks,
  showAudit,
  createdByNameForKey,
  isDragging,
  onCellHover,
  onCellContextMenu,
  coverageRequirements,
  absenceTypeMap,
  absenceTypeIdForKey,
}: ScheduleGridProps) {
  const { user: currentUser } = useAuth();
  const [tooltip, setTooltip] = useState<{ content: string; x: number; y: number } | null>(null);
  const todayKey = useMemo(() => formatDateKey(today), [today]);

  const sections = useMemo(() => {
    const allNames = focusAreas.map((w) => w.name);
    if (activeFocusArea == null) return allNames;
    const activeFA = focusAreas.find((fa) => fa.id === activeFocusArea);
    return activeFA ? allNames.filter((name) => name === activeFA.name) : allNames;
  }, [focusAreas, activeFocusArea]);

  const allDates = spanWeeks === 2 ? [...week1, ...week2] : week1;
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

  const numDays = allDates.length;
  const colWidth =
    containerWidth > 0
      ? Math.max(50, Math.floor((containerWidth - 220) / numDays))
      : spanWeeks === 2
        ? 72
        : 84;

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
            .filter((st) => focusAreaId != null && st.focusAreaId === focusAreaId)
            .map((st) => st.id)
        );
        return [section, ids];
      }),
    );
  }, [sections, shiftCodes, focusAreaIdByName]);

  // Shift labels that are "general" — not focus-area-specific
  const generalShiftLabels = useMemo(
    () =>
      new Set(
        shiftCodes
          .filter((st) => st.isGeneral || st.focusAreaId == null)
          .map((st) => st.label),
      ),
    [shiftCodes],
  );

  const renderedSections = sections.filter(section => {
    const exclusiveCodeIds = exclusiveCodeIdsPerSection[section] ?? new Set<number>();
    const sectionId = focusAreaIdByName[section];
    const rawHomeEmps = filteredEmployees.filter((e) => sectionId != null && e.focusAreaIds.includes(sectionId));
    const homeEmps = isCellInteractive
      ? rawHomeEmps
      : rawHomeEmps.filter((emp) =>
          allDates.some((date) => {
            const codeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
            return codeIds.some(id => exclusiveCodeIds.has(id) || (shiftCodes.find(sc => sc.id === id)?.focusAreaId === null));
          }),
        );
    const guestEmps = allEmployees.filter(
      (e) =>
        e.focusAreaIds.length > 0 &&
        (sectionId == null || !e.focusAreaIds.includes(sectionId)) &&
        allDates.some((date) => {
          const codeIds = shiftCodeIdsForKey?.(e.id, date) ?? [];
          return codeIds.some(id => exclusiveCodeIds.has(id));
        }),
    );
    return [...homeEmps, ...guestEmps].length > 0;
  });

  return (
    <div ref={containerRef} style={{ width: "100%", maxWidth: "100%", position: "relative" }}>
      {renderedSections.length === 0 ? (
        <div
          style={{
            padding: "48px 20px",
            textAlign: "center",
            background: "var(--color-surface)",
            borderRadius: 12,
            border: "1px dashed var(--color-border)",
            color: "var(--color-text-muted)",
            marginTop: 34,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ color: "var(--color-text-faint)", background: "var(--color-bg)", padding: "12px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          </div>
          <div>
            <div style={{ fontSize: "var(--dg-fs-title)", fontWeight: 600, marginBottom: 4 }}>
              No shifts found for this period
            </div>
            <div style={{ fontSize: "var(--dg-fs-body)", color: "var(--color-text-faint)" }}>
              {isCellInteractive
                ? "No employees are assigned to this focus area. Add employees in the Staff view."
                : "No shifts have been published for this period yet."}
            </div>
          </div>
        </div>
      ) : (
        <>
          {tooltip && (
            <div
              style={{
                position: "fixed",
                left: tooltip.x,
                top: tooltip.y - 8,
                transform: "translate(-50%, -100%)",
                background: "var(--color-surface)",
                padding: "8px 14px",
                borderRadius: "10px",
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
                animation: "tooltipFadeIn 0.15s cubic-bezier(0, 0, 0.2, 1)",
              }}
            >
              {tooltip.content}
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
          )}
          {renderedSections.map((section) => {
        const exclusiveCodeIds = exclusiveCodeIdsPerSection[section] ?? new Set<number>();
        const sectionId = focusAreaIdByName[section];
        const rawHomeEmps = filteredEmployees.filter((e) =>
          sectionId != null && e.focusAreaIds.includes(sectionId),
        );
        const homeEmps = isCellInteractive
          ? rawHomeEmps
          : rawHomeEmps.filter((emp) =>
              allDates.some((date) => {
                const codeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
                return codeIds.some(id => exclusiveCodeIds.has(id) || (shiftCodes.find(sc => sc.id === id)?.focusAreaId === null));
              }),
            );
        const guestEmps = allEmployees.filter(
          (e) =>
            e.focusAreaIds.length > 0 &&
            (sectionId == null || !e.focusAreaIds.includes(sectionId)) &&
            allDates.some((date) => {
              const codeIds = shiftCodeIdsForKey?.(e.id, date) ?? [];
              return codeIds.some(id => exclusiveCodeIds.has(id));
            }),
        );
        const sectionEmps = [...homeEmps, ...guestEmps];
        return (
          <SectionBlock
            key={section}
            sectionName={section}
            exclusiveCodeIds={exclusiveCodeIds}
            employees={sectionEmps}
            weekDates={allDates}
            todayKey={todayKey}
            shiftForKey={shiftForKey}
            shiftCodeIdsForKey={shiftCodeIdsForKey}
            getShiftStyle={getShiftStyle}
            handleCellClick={handleCellClick}
            colWidth={colWidth}
            splitAtIndex={splitAtIndex}
            highlightEmpIds={highlightEmpIds}
            focusAreas={focusAreas}
            shiftCodes={shiftCodes}
            shiftCategories={shiftCategories}
            indicatorTypes={indicatorTypes}
            isCellInteractive={isCellInteractive}
            activeIndicatorIdsForKey={activeIndicatorIdsForKey}
            onTooltipChange={setTooltip}
            getCustomShiftTimes={getCustomShiftTimes}
            draftKindForKey={draftKindForKey}
            showDiffOverlay={showDiffOverlay}
            publishedLabelForKey={publishedLabelForKey}
            publishedShiftCodeIdsForKey={publishedShiftCodeIdsForKey}
            hasTimeChangesForKey={hasTimeChangesForKey}
            publishDiffForKey={publishDiffForKey}
            certifications={certifications}
            orgRoles={orgRoles}
            cellLocks={cellLocks}
            showAudit={showAudit}
            createdByNameForKey={createdByNameForKey}
            isDragging={isDragging}
            onCellHover={onCellHover}
            onCellContextMenu={onCellContextMenu}
            coverageRequirements={coverageRequirements}
            absenceTypeMap={absenceTypeMap}
            absenceTypeIdForKey={absenceTypeIdForKey}
          />
        );
      })}
        </>
      )}
    </div>
  );
}
