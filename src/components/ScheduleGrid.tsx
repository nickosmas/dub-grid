"use client";

import React, { memo, useMemo, useRef, useLayoutEffect, useState } from "react";
import { DAY_LABELS } from "@/lib/constants";
import { formatDateKey } from "@/lib/utils";
import { computeDailyTallies, DailyTallies, Tally } from "@/lib/schedule-logic";
import { Employee, ShiftCategory, ShiftCode, FocusArea, NoteType, IndicatorType, NamedItem, DraftKind } from "@/types";
import { getCertAbbr, getRoleAbbrs } from "@/lib/utils";
import { borderColor } from "@/lib/colors";

const DESIGNATION_COLORS: Record<string, { bg: string; text: string }> = {
  JLCSN: { bg: "#EDE9FE", text: "#6D28D9" },      // Purple
  "CSN III": { bg: "#DBEAFE", text: "#1D4ED8" },  // Blue
  "CSN II": { bg: "#CCFBF1", text: "#0E7490" },   // Teal
  STAFF: { bg: "#F1F5F9", text: "#475569" },     // Slate
};
const DEFAULT_DESIG_COLOR = { bg: "#F1F5F9", text: "#475569" };

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

const DRAFT_BORDER_COLORS: Record<string, string> = {
  new: '#16A34A',
  modified: '#D97706',
  deleted: '#DC2626',
};

function getDraftBorder(draftKind: DraftKind, fallback: string): string {
  if (!draftKind) return fallback;
  return `2px dashed ${DRAFT_BORDER_COLORS[draftKind]}`;
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
  noteTypesForKey?: (empId: string, date: Date, focusAreaId?: number) => NoteType[];
  activeFocusArea?: number | null;
  certifications?: NamedItem[];
  orgRoles?: NamedItem[];
  isEditMode?: boolean;
  getCustomShiftTimes?: (empId: string, date: Date) => { start: string; end: string; perPill?: { start: string; end: string }[] } | null;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  showDiffOverlay?: boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedShiftCodeIdsForKey?: (empId: string, date: Date) => number[];
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
  noteTypesForKey?: (empId: string, date: Date, focusAreaId?: number) => NoteType[];
  onTooltipChange: (tooltip: { content: string; x: number; y: number } | null) => void;
  getCustomShiftTimes?: (empId: string, date: Date) => { start: string; end: string; perPill?: { start: string; end: string }[] } | null;
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  showDiffOverlay?: boolean;
  publishedLabelForKey?: (empId: string, date: Date) => string | null;
  publishedShiftCodeIdsForKey?: (empId: string, date: Date) => number[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  isEditMode?: boolean;
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
  noteTypesForKey,
  onTooltipChange,
  getCustomShiftTimes,
  draftKindForKey,
  showDiffOverlay,
  publishedLabelForKey,
  publishedShiftCodeIdsForKey,
  certifications,
  orgRoles,
  isEditMode,
}: SectionBlockProps) {
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

  const dailyTallies = useMemo(() => {
    return weekDates.map((date) =>
      computeDailyTallies(
        homeEmployees,
        date,
        shiftCodeIdsForKeyFn,
        shiftCodeById,
        sectionCodeIds,
      ),
    );
  }, [weekDates, homeEmployees, shiftCodeIdsForKeyFn, shiftCodeById, sectionCodeIds]);

  const renderTally = (tally: Tally) => {
    const entries = Object.entries(tally);
    if (entries.length === 0) return "-";
    return (
      <div style={{ display: "flex", flexDirection: "row", alignItems: "center" }}>
        {entries.map(([label, count], ei) => (
          <span key={label} style={{ whiteSpace: "nowrap" }}>
            {ei > 0 && <span style={{ color: "var(--color-text-faint)", margin: "0 0.3em" }}>|</span>}
            {label}: {count}
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

  // Determine which tally rows to render from the actual dailyTallies data.
  // This ensures tallies always show when categorized shifts exist.
  const tallyRows = useMemo(() => {
    const allCatIds = new Set<number>();
    for (const dayTally of dailyTallies) {
      for (const catId of Object.keys(dayTally).map(Number)) {
        allCatIds.add(catId);
      }
    }
    if (allCatIds.size === 0) return [];

    return shiftCategories
      .filter((cat) => allCatIds.has(cat.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((cat) => ({ id: cat.id, name: cat.name }));
  }, [dailyTallies, shiftCategories]);

  const gridTemplate = `220px repeat(${weekDates.length}, minmax(${colWidth}px, 1fr))`;

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
          fontSize: 16,
          fontWeight: 700,
          color: "var(--color-text-secondary)",
          marginBottom: 10,
          paddingLeft: 4,
        }}
      >
        {sectionName}
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid var(--color-border)",
          overflowX: "auto",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
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
                zIndex: 2,
                background: "var(--color-bg)",
                padding: "10px 14px",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--color-text-subtle)",
                letterSpacing: "0.08em",
                borderRight: "1px solid var(--color-border-light)",
                boxShadow: "2px 0 4px rgba(0,0,0,0.02)",
              }}
            >
              STAFF NAME
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
                      fontSize: 12,
                      fontWeight: 600,
                      color: isToday
                        ? "var(--color-today-text)"
                        : "var(--color-text-faint)",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {DAY_LABELS[date.getDay()]}
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: isToday
                        ? "var(--color-today-text)"
                        : "var(--color-text-secondary)",
                      lineHeight: 1.2,
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
            const rowBg = "#fff";
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
                  transition: "opacity 0.15s",
                  alignItems: "stretch",
                }}
              >
                {/* Name cell */}
                <div
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                    background: rowBg,
                    padding: "7px 12px 7px 14px",
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
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 5 }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--color-text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {emp.name}
                      </span>
                    </div>
                    {emp.roleIds.length > 0 && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--color-text-subtle)",
                          marginTop: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {getRoleAbbrs(emp.roleIds, orgRoles).join(", ")}
                      </div>
                    )}
                  </div>
                  {emp.certificationId != null && (
                    <span
                      style={{
                        fontSize: 12,
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
                  const publishedLabel = publishedLabelForKey?.(emp.id, date) ?? null;
                  const publishedCodeIds = publishedShiftCodeIdsForKey?.(emp.id, date) ?? [];
                  const noteTypes = noteTypesForKey?.(emp.id, date, sectionFocusArea?.id) ?? [];
                  const customTimes = getCustomShiftTimes?.(emp.id, date) ?? null;

                  return (
                    <div
                      key={dateKey}
                      onClick={() => {
                        if (isCellInteractive) handleCellClick(emp, date, sectionName);
                      }}
                      style={{
                        height: 48,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                        borderTop: ri > 0 && !isSplit ? "1px solid var(--color-border-light)" : undefined,
                        borderLeft: isSplit
                          ? "2px solid var(--color-dark)"
                          : "1px solid var(--color-border-light)",
                        boxShadow: isSplit && ri > 0 ? "inset 0 1px 0 var(--color-border-light)" : undefined,
                        background: isToday
                          ? "var(--color-today-bg)"
                          : "transparent",
                        cursor: isCellInteractive ? "pointer" : "default",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        if (isCellInteractive) {
                          e.currentTarget.style.background = "var(--color-today-bg)";
                        }
                        if (shiftCode && shiftCode !== "OFF") {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const content = shiftCode.split("/").map((l, li) => {
                            const style = getStyleByIdOrLabel(l, cellCodeIds[li]);
                            // Check if this specific shift code belongs to a different focus area
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
                      onMouseLeave={(e) => {
                        if (isCellInteractive) {
                          e.currentTarget.style.background = isToday
                            ? "var(--color-today-bg)"
                            : rowBg;
                        }
                        onTooltipChange(null);
                      }}
                    >
                      {shiftCode && shiftCode !== "OFF" ? (
                        (() => {
                          const labels = shiftCode.split("/");
                          if (labels.length === 1) {
                            const label = labels[0];
                            const style = getStyleByIdOrLabel(label, cellCodeIds[0]);
                            const codeEntry0 = cellCodeIds[0] != null ? shiftCodeById.get(cellCodeIds[0]) : undefined;
                            const isCross = label !== "X" && codeEntry0?.focusAreaId != null
                              && sectionFocusArea != null
                              && codeEntry0.focusAreaId !== sectionFocusArea.id;
                            const crossHomeFa = isCross
                              ? focusAreas.find((fa) => fa.id === codeEntry0!.focusAreaId)
                              : undefined;
                             return (
                               <div
                                 style={{
                                   position: "absolute",
                                   top: customTimes ? "3px" : "4px",
                                   right: "4px",
                                   bottom: customTimes ? "3px" : "4px",
                                   left: "4px",
                                   background: isCross ? "#ffffff" : style.color,
                                   opacity: draftKind === 'deleted' ? 0.5 : 1,
                                   border: getDraftBorder(draftKind, `1px solid ${borderColor(style.text)}`),
                                   borderRadius: 3,
                                   color: style.text,
                                   boxShadow: "none",
                                   cursor: "pointer",
                                   display: "flex",
                                   flexDirection: "column",
                                   alignItems: "center",
                                   justifyContent: showDiffOverlay && draftKind && draftKind !== 'deleted' ? "flex-start" : "center",
                                   paddingTop: showDiffOverlay && draftKind && draftKind !== 'deleted' ? 4 : 0,
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
                                       fontSize: 11,
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
                                 {draftKind === 'new' && (
                                   <span
                                     style={{
                                       position: "absolute",
                                       top: 0,
                                       right: 0,
                                       width: 0,
                                       height: 0,
                                       borderStyle: "solid",
                                       borderWidth: "0 12px 12px 0",
                                       borderColor: "transparent #16A34A transparent transparent",
                                       pointerEvents: "none",
                                     }}
                                   />
                                 )}
                                 {draftKind === 'modified' && (
                                   <span
                                     style={{
                                       position: "absolute",
                                       top: 0,
                                       right: 0,
                                       width: 0,
                                       height: 0,
                                       borderStyle: "solid",
                                       borderWidth: "0 12px 12px 0",
                                       borderColor: "transparent #D97706 transparent transparent",
                                       pointerEvents: "none",
                                     }}
                                   />
                                 )}
                                 <span style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{label}</span>
                                 {customTimes && (
                                   <span style={{
                                     fontSize: 11,
                                     fontWeight: 500,
                                     lineHeight: 1,
                                     marginTop: 4,
                                     opacity: 0.7,
                                     letterSpacing: "0.02em",
                                   }}>
                                     {fmt12hShort(customTimes.start)}–{fmt12hShort(customTimes.end)}
                                   </span>
                                 )}
                                 {showDiffOverlay && draftKind === 'modified' && publishedLabel && (
                                   <span style={{
                                     position: "absolute",
                                     bottom: 2,
                                     left: "50%",
                                     transform: "translateX(-50%)",
                                     fontSize: 13,
                                     fontWeight: 700,
                                     color: "#D97706",
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
                                     fontSize: 13,
                                     fontWeight: 800,
                                     color: "#16A34A",
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
                                     {indicatorTypes.filter(ind => noteTypes.includes(ind.name)).map(ind => (
                                       <div
                                         key={ind.name}
                                         title={ind.name}
                                         style={{
                                           width: 7,
                                           height: 7,
                                           borderRadius: "50%",
                                           background: ind.color,
                                           border: "1px solid rgba(255,255,255,0.85)",
                                           flexShrink: 0,
                                         }}
                                       />
                                     ))}
                                   </div>
                                 )}
                               </div>
                             );
                          }

                          // Edit mode: render each shift as a separate vertical pill
                          if (isEditMode) {
                            return (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "3px",
                                  right: "4px",
                                  bottom: "3px",
                                  left: "4px",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 2,
                                  alignItems: "stretch",
                                  opacity: draftKind === 'deleted' ? 0.5 : 1,
                                }}
                              >
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
                                  const pillBorder = isNewPill
                                    ? `2px dashed ${DRAFT_BORDER_COLORS[draftKind!]}`
                                    : draftKind === 'new'
                                      ? `2px dashed ${DRAFT_BORDER_COLORS.new}`
                                      : `1px solid ${borderColor(style.text)}`;
                                  const pillTime = customTimes?.perPill?.[li] ?? (li === 0 && !customTimes?.perPill ? customTimes : null);
                                  const hasTime = pillTime && (pillTime.start || pillTime.end);
                                  return (
                                    <div
                                      key={li}
                                      style={{
                                        flex: 1,
                                        background: isCross ? "#ffffff" : style.color,
                                        border: draftKind === 'deleted'
                                          ? getDraftBorder(draftKind, `1px solid ${borderColor(style.text)}`)
                                          : pillBorder,
                                        borderRadius: 3,
                                        color: style.text,
                                        display: "flex",
                                        flexDirection: hasTime ? "row" : "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: hasTime ? 3 : 0,
                                        fontSize: 14,
                                        fontWeight: 800,
                                        position: "relative",
                                        cursor: "pointer",
                                        textDecoration: draftKind === 'deleted' ? 'line-through' : 'none',
                                        lineHeight: 1,
                                        overflow: "hidden",
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
                                            fontSize: 9,
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
                                      {isNewPill && (
                                        <span
                                          style={{
                                            position: "absolute",
                                            top: 0,
                                            right: 0,
                                            width: 0,
                                            height: 0,
                                            borderStyle: "solid",
                                            borderWidth: "0 6px 6px 0",
                                            borderColor: `transparent ${DRAFT_BORDER_COLORS[draftKind!]} transparent transparent`,
                                            pointerEvents: "none",
                                          }}
                                        />
                                      )}
                                      <span>{label}</span>
                                      {hasTime && (
                                        <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7, lineHeight: 1 }}>
                                          {fmt12hShort(pillTime!.start)}–{fmt12hShort(pillTime!.end)}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                                {noteTypes.length > 0 && (
                                  <div
                                    style={{
                                      position: "absolute",
                                      top: 1,
                                      right: 2,
                                      display: "flex",
                                      gap: 2,
                                      zIndex: 1,
                                    }}
                                  >
                                    {indicatorTypes.filter(ind => noteTypes.includes(ind.name)).map(ind => (
                                      <div
                                        key={ind.name}
                                        title={ind.name}
                                        style={{
                                          width: 7,
                                          height: 7,
                                          borderRadius: "50%",
                                          background: ind.color,
                                          border: "1px solid rgba(255,255,255,0.8)",
                                          flexShrink: 0,
                                        }}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          // View mode: render as separate vertical pills (like edit mode)
                          // Each pill independently shows dashed (new) or solid (existing) border
                          return (
                            <div
                              style={{
                                position: "absolute",
                                top: "3px",
                                right: "4px",
                                bottom: showDiffOverlay && draftKind && draftKind !== 'deleted' ? "18px" : "3px",
                                left: "4px",
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                                alignItems: "stretch",
                                opacity: draftKind === 'deleted' ? 0.5 : 1,
                              }}
                            >
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
                                const pillBorder = isNewPill
                                  ? `2px dashed ${DRAFT_BORDER_COLORS[draftKind!]}`
                                  : draftKind === 'new'
                                    ? `2px dashed ${DRAFT_BORDER_COLORS.new}`
                                    : `1px solid ${borderColor(style.text)}`;
                                const pillTime = customTimes?.perPill?.[li] ?? (li === 0 && !customTimes?.perPill ? customTimes : null);
                                const hasTime = pillTime && (pillTime.start || pillTime.end);

                                return (
                                  <div
                                    key={li}
                                    style={{
                                      flex: 1,
                                      background: isCross ? "#ffffff" : style.color,
                                      border: draftKind === 'deleted'
                                        ? getDraftBorder(draftKind, `1px solid ${borderColor(style.text)}`)
                                        : pillBorder,
                                      borderRadius: 3,
                                      color: style.text,
                                      display: "flex",
                                      flexDirection: hasTime ? "row" : "column",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      gap: hasTime ? 3 : 0,
                                      fontSize: 14,
                                      fontWeight: 800,
                                      position: "relative",
                                      cursor: "pointer",
                                      textDecoration: draftKind === 'deleted' ? 'line-through' : 'none',
                                      lineHeight: 1,
                                      overflow: "hidden",
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
                                          fontSize: 9,
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
                                    {isNewPill && (
                                      <span
                                        style={{
                                          position: "absolute",
                                          top: 0,
                                          right: 0,
                                          width: 0,
                                          height: 0,
                                          borderStyle: "solid",
                                          borderWidth: "0 6px 6px 0",
                                          borderColor: `transparent ${DRAFT_BORDER_COLORS[draftKind!]} transparent transparent`,
                                          pointerEvents: "none",
                                        }}
                                      />
                                    )}
                                    <span>{label}</span>
                                    {hasTime && (
                                      <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7, lineHeight: 1 }}>
                                        {fmt12hShort(pillTime!.start)}–{fmt12hShort(pillTime!.end)}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                              {showDiffOverlay && draftKind === 'modified' && publishedLabel && (
                                <span style={{
                                  position: "absolute",
                                  bottom: -14,
                                  left: "50%",
                                  transform: "translateX(-50%)",
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: "#D97706",
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
                                  bottom: -14,
                                  left: "50%",
                                  transform: "translateX(-50%)",
                                  fontSize: 13,
                                  fontWeight: 800,
                                  color: "#16A34A",
                                  whiteSpace: "nowrap",
                                  pointerEvents: "none",
                                  zIndex: 1,
                                }}>
                                  new
                                </span>
                              )}
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
                                  {indicatorTypes.filter(ind => noteTypes.includes(ind.name)).map(ind => (
                                    <div
                                      key={ind.name}
                                      title={ind.name}
                                      style={{
                                        width: 7,
                                        height: 7,
                                        borderRadius: "50%",
                                        background: ind.color,
                                        border: "1px solid rgba(255,255,255,0.8)",
                                        flexShrink: 0,
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      ) : showDiffOverlay && draftKind === 'deleted' && publishedLabel ? (
                        <div
                          style={{
                            position: "absolute",
                            top: "4px",
                            right: "4px",
                            bottom: "4px",
                            left: "4px",
                            background: "#FEE2E2",
                            opacity: 0.35,
                            border: "2px dashed #DC2626",
                            borderRadius: 3,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            textDecoration: "line-through",
                            color: "#DC2626",
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1 }}>
                            {publishedLabel}
                          </span>
                        </div>
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
                              {indicatorTypes.filter(ind => noteTypes.includes(ind.name)).map(ind => (
                                <div
                                  key={ind.name}
                                  title={ind.name}
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: "50%",
                                    background: ind.color,
                                    border: "1px solid #fff",
                                    flexShrink: 0,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Count rows — one per active tally category for this section */}
          {tallyRows.map((row, ci) => {
            const isLastRow = ci === tallyRows.length - 1;
            return (
            <div
              key={row.id}
              style={{
                ...rowGrid,
                borderTop: ci === 0 ? "2px solid var(--color-dark)" : undefined,
                background: "#fff",
              }}
            >
              <div
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                  background: "#fff",
                  padding: "6px 14px",
                  fontSize: 10,
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
              {dailyTallies.map((tallies, i) => {
                const tally = tallies[row.id] ?? {};
                const hasCount = Object.keys(tally).length > 0;
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
                      fontSize: 10,
                      lineHeight: 1.3,
                      fontWeight: 700,
                      color: hasCount ? "var(--color-text-secondary)" : "var(--color-text-subtle)",
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {renderTally(tally)}
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
  noteTypesForKey,
  activeFocusArea = null,
  certifications = [],
  orgRoles = [],
  isEditMode = true,
  getCustomShiftTimes,
  draftKindForKey,
  showDiffOverlay,
  publishedLabelForKey,
  publishedShiftCodeIdsForKey,
}: ScheduleGridProps) {
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
    const homeEmps = isEditMode
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
            background: "#fff",
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
          <div style={{ color: "var(--color-text-faint)", background: "#F8FAFC", padding: "12px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
              No shifts found for this period
            </div>
            <div style={{ fontSize: 13 }}>
              {isEditMode
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
                background: "#FFFFFF",
                padding: "8px 14px",
                borderRadius: "10px",
                boxShadow: `
                  0 10px 25px -5px rgba(0, 0, 0, 0.1),
                  0 8px 10px -6px rgba(0, 0, 0, 0.1),
                  0 0 0 1px rgba(0,0,0,0.05)
                `,
                zIndex: 1000,
                fontSize: "13px",
                fontWeight: 700,
                color: "#1E293B",
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
                  background: "#FFFFFF",
                  boxShadow: "2px 2px 2px rgba(0,0,0,0.02)",
                }}
              />
              <style>{`
                @keyframes tooltipFadeIn {
                  from { opacity: 0; transform: translate(-50%, -90%); scale: 0.95; }
                  to { opacity: 1; transform: translate(-50%, -100%); scale: 1; }
                }
              `}</style>
            </div>
          )}
          {renderedSections.map((section) => {
        const exclusiveCodeIds = exclusiveCodeIdsPerSection[section] ?? new Set<number>();
        const sectionId = focusAreaIdByName[section];
        const rawHomeEmps = filteredEmployees.filter((e) =>
          sectionId != null && e.focusAreaIds.includes(sectionId),
        );
        const homeEmps = isEditMode
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
            noteTypesForKey={noteTypesForKey}
            onTooltipChange={setTooltip}
            getCustomShiftTimes={getCustomShiftTimes}
            draftKindForKey={draftKindForKey}
            showDiffOverlay={showDiffOverlay}
            publishedLabelForKey={publishedLabelForKey}
            publishedShiftCodeIdsForKey={publishedShiftCodeIdsForKey}
            certifications={certifications}
            orgRoles={orgRoles}
            isEditMode={isEditMode}
          />
        );
      })}
        </>
      )}
    </div>
  );
}
