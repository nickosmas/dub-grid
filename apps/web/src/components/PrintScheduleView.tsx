"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AbsenceType,
  Employee,
  ShiftCategory,
  AssignmentDefinition,
  FocusArea,
  JobDefinition,
  IndicatorType,
  NamedItem,
  ShiftDisplayMode,
} from "@/types";
import type { ScheduleNoteMark } from "@/components/schedule-grid/noteDots";
import { ScheduleNoteIcon } from "@/components/schedule-grid/noteIcon";
import {
  addDays,
  formatDateKey,
  formatDate,
  getCertAbbr,
  getRoleAbbrs,
  getEmployeeDisplayName,
} from "@/lib/utils";
import { DAY_LABELS } from "@/lib/constants";
import { Button } from "@/components/Button";
import { computeDailyTallies } from "@/lib/schedule-logic";
import { PrintConfig } from "./PrintOptionsModal";
import {
  borderColor,
  DESIGNATION_COLORS,
  DEFAULT_DESIG_COLOR,
  getReadableTextOnSurface,
} from "@/lib/colors";
import { buildShiftDisplayParts } from "@/lib/assignable-shifts";
import { MaybeHint } from "@/components/ui/hint";
import { printFontSizeLabel } from "@/components/print-font-sizes";
import { PrintShiftPill, type PrintShiftPillProps } from "@/components/PrintShiftPill";
import { fitPrintText, PRINT_FIT_LINE as FIT_TEXT } from "@/components/print-fit";
import {
  buildPrintDocument,
  collectFontFaceCss,
  whenPrintReady,
} from "@/components/print-document";

const BRAND_MUTED = "#4A607F";
const BRAND_SEPARATOR = "#94A3B8";

// public/lockup.png is the symbol and a 16 px wordmark at 8x (616x192),
// padded so its center is the wordmark's optical center: centering it in a
// row lines it up with the separator and the organization name.
const LOCKUP_HEIGHT_EM = 192 / 128;

function PrintBrandLockup({
  orgName,
  wordmarkSize,
  separatorHeight,
  orgFontSize,
}: {
  orgName?: string;
  wordmarkSize: number;
  separatorHeight: number;
  orgFontSize: number;
}) {
  const height = wordmarkSize * LOCKUP_HEIGHT_EM;
  return (
    <div style={{ display: "flex", alignItems: "center", lineHeight: 1 }}>
      <img src="/lockup.png" alt="dubgrid" style={{ display: "block", width: "auto", height }} />
      {orgName && (
        <>
          <span
            aria-hidden="true"
            style={{
              display: "block",
              width: 0.8,
              height: separatorHeight,
              background: BRAND_SEPARATOR,
              marginLeft: 7,
              marginRight: 7,
              flex: "0 0 auto",
            }}
          />
          <span
            style={{
              color: BRAND_MUTED,
              fontSize: orgFontSize,
              fontWeight: 600,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            {orgName}
          </span>
        </>
      )}
    </div>
  );
}

function formatPrintedAt(date: Date): string {
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function getFocusAreaInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
}

function getCrossFocusBadgePalette(style?: Pick<AssignmentDefinition, "color" | "text"> | null) {
  return {
    background: style?.color ?? "#FFFFFF",
    color: style?.text ?? "#334155",
  };
}

// ── Per-section print grid ─────────────────────────────────────────────────

// The print window carries none of the app's CSS variables, so every colour
// here is a literal. An archived or unknown indicator prints in plain grey.
const PRINT_UNKNOWN_INDICATOR = "#94A3B8";

function printedIndicatorIds(marks: ScheduleNoteMark[]): number[] {
  return marks.map((mark) => mark.indicatorTypeId);
}

function PrintIndicatorDots({
  ids,
  indicatorTypes,
}: {
  ids: number[];
  indicatorTypes: IndicatorType[];
}) {
  if (ids.length === 0) return null;
  return (
    <div
      data-print-indicators="true"
      style={{ position: "absolute", top: 1, right: 1, display: "flex", gap: 1 }}
    >
      {ids.map((id) => {
        const indicator = indicatorTypes.find((type) => type.id === id);
        return (
          <span
            key={id}
            aria-label={indicator?.name ?? "Schedule note"}
            style={{
              width: "0.55em",
              height: "0.55em",
              borderRadius: "50%",
              background: indicator?.color ?? PRINT_UNKNOWN_INDICATOR,
              border: "1px solid #FFFFFF",
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

interface PrintSectionProps {
  sectionName: string;
  focusAreaId: number;
  employees: Employee[];
  dates: Date[];
  shiftForKey: (empId: string, date: Date) => string | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  /** A worked cell's absence for the rest of the day (item 45), printed after its shifts. */
  restOfDayAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  absenceTypeMap?: Map<number, AbsenceType>;
  getShiftStyle: (type: string, focusAreaName?: string) => AssignmentDefinition;
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  focusAreas: FocusArea[];
  getCustomShiftTimes?: (
    empId: string,
    date: Date,
  ) => { start: string; end: string; perPill?: { start: string; end: string }[] } | null;
  splitAtIndex?: number;
  fontSize: number;
  shiftDisplayMode?: ShiftDisplayMode;
  noteMarksForKey?: (empId: string, date: Date, focusAreaId?: number) => ScheduleNoteMark[];
  indicatorTypes: IndicatorType[];
}

function PrintSection({
  sectionName,
  focusAreaId,
  employees,
  dates,
  shiftForKey,
  assignmentIdsForKey,
  absenceTypeIdForKey,
  restOfDayAbsenceTypeIdForKey,
  absenceTypeMap,
  getShiftStyle,
  assignments,
  shiftCategories,
  jobs,
  certifications,
  orgRoles,
  focusAreas,
  getCustomShiftTimes,
  splitAtIndex,
  fontSize,
  shiftDisplayMode = "code",
  noteMarksForKey,
  indicatorTypes,
}: PrintSectionProps) {
  const isNameMode = shiftDisplayMode === "name";
  // Bind focus-area context so label lookups resolve the section-specific definition first.
  const contextualGetShiftStyle = useMemo(
    () => (label: string) => getShiftStyle(label, sectionName),
    [getShiftStyle, sectionName],
  );

  // Look up assignments by ID so cross-focus-area shifts render in their own color
  const assignmentById = useMemo(() => {
    const map = new Map<number, AssignmentDefinition>();
    for (const sc of assignments) map.set(sc.id, sc);
    return map;
  }, [assignments]);

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
  const categoryById = useMemo(() => {
    const map = new Map<number, ShiftCategory>();
    for (const category of shiftCategories) map.set(category.id, category);
    return map;
  }, [shiftCategories]);
  const jobById = useMemo(() => {
    const map = new Map<number, JobDefinition>();
    for (const job of jobs) map.set(job.id, job);
    return map;
  }, [jobs]);
  const getDisplayPartsByIdOrLabel = useMemo(
    () => (label: string, codeId?: number) => {
      const assignment = getStyleByIdOrLabel(label, codeId);
      const shiftId = assignment.shiftId ?? assignment.categoryId ?? null;
      const shift = shiftId != null ? (categoryById.get(shiftId) ?? null) : null;
      const job = assignment.jobId != null ? (jobById.get(assignment.jobId) ?? null) : null;
      return buildShiftDisplayParts({
        shift,
        job,
        assignment,
        shiftDisplayMode,
      });
    },
    [categoryById, getStyleByIdOrLabel, jobById, shiftDisplayMode],
  );

  // Set of shift code IDs that belong to this section's focus area
  const sectionCodeIds = useMemo(() => {
    return new Set(assignments.filter((sc) => sc.focusAreaId === focusAreaId).map((sc) => sc.id));
  }, [assignments, focusAreaId]);

  const tallyLabelResolver = useMemo(
    () => (isNameMode ? (code: AssignmentDefinition) => code.name || code.label : undefined),
    [isNameMode],
  );

  const dailyTallies = useMemo(() => {
    const fn = assignmentIdsForKey ?? (() => []);
    return dates.map((date) =>
      computeDailyTallies(employees, date, fn, assignmentById, sectionCodeIds, tallyLabelResolver),
    );
  }, [dates, employees, assignmentIdsForKey, assignmentById, sectionCodeIds, tallyLabelResolver]);

  // Derive tally rows from actual data so tallies always show when categorized shifts exist
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

  if (employees.length === 0) return null;

  // Two weeks leave each day half the room, so the pills sit closer to the
  // cell edge.
  const cellInsetX = dates.length > 7 ? "0.2em" : "0.4em";

  const cellH = `${fontSize * 3.4}px`;
  const stackedCellH = `${fontSize * 5.4}px`;
  const tallyH = `${fontSize * 2.8}px`;

  type CellPill = Omit<PrintShiftPillProps, "variant" | "isNameMode" | "wingOnTop">;

  function resolveCellPills(
    assignment: string,
    cellCodeIds: number[],
    absenceTypeId: number | null,
    customTimes: ReturnType<NonNullable<PrintSectionProps["getCustomShiftTimes"]>>,
    restOfDayAbsenceTypeId: number | null = null,
  ): CellPill[] {
    // An absence carries no assignment id, so a label lookup would resolve it
    // against the assignment list: either finding nothing (printing vacation
    // in the fallback grey) or, worse, an assignment sharing its label and
    // printing someone's day off in that shift's colors.
    const absence = absenceTypeId != null ? (absenceTypeMap?.get(absenceTypeId) ?? null) : null;
    if (absence) {
      return [
        {
          primaryLabel: isNameMode ? absence.name || absence.label : assignment,
          time: customTimes,
          background: absence.color,
          color: absence.text,
          border: `1px solid ${borderColor(absence.text)}`,
        },
      ];
    }

    // "/" joins the segments of a worked cell, so it is what splits it into pills.
    const labels = assignment.split("/");
    const workedPills: CellPill[] = labels.map((label, li) => {
      const codeId = cellCodeIds[li];
      const style = getStyleByIdOrLabel(label, codeId);
      const entry = codeId != null ? assignmentById.get(codeId) : undefined;
      const displayParts = getDisplayPartsByIdOrLabel(label, codeId);
      const homeFocusArea =
        label !== "X" && entry?.focusAreaId != null && entry.focusAreaId !== focusAreaId
          ? focusAreas.find((fa) => fa.id === entry.focusAreaId)
          : undefined;
      const foreground = homeFocusArea
        ? getReadableTextOnSurface(style.color, style.text)
        : style.text;
      const wingPalette = getCrossFocusBadgePalette(style);
      return {
        primaryLabel: displayParts.primaryLabel,
        secondaryLabel: displayParts.secondaryLabel,
        time:
          labels.length === 1
            ? customTimes
            : (customTimes?.perPill?.[li] ??
              (li === 0 && !customTimes?.perPill ? customTimes : null)),
        background: homeFocusArea ? "#FFFFFF" : style.color,
        color: foreground,
        border: `1px solid ${borderColor(foreground)}`,
        wing: homeFocusArea
          ? { initials: getFocusAreaInitials(homeFocusArea.name), ...wingPalette }
          : null,
      };
    });

    // The absence for the rest of the day prints after the shifts, with no time.
    const restOfDay =
      restOfDayAbsenceTypeId != null ? (absenceTypeMap?.get(restOfDayAbsenceTypeId) ?? null) : null;
    if (!restOfDay) return workedPills;
    return [
      ...workedPills,
      {
        primaryLabel: isNameMode ? restOfDay.name || restOfDay.label : restOfDay.label,
        time: null,
        background: restOfDay.color,
        color: restOfDay.text,
        border: `1px solid ${borderColor(restOfDay.text)}`,
      },
    ];
  }

  return (
    <div style={{ marginBottom: "1.4em" }}>
      <div
        style={{
          fontSize: "1.3em",
          fontWeight: 700,
          color: "#1A2640",
          marginBottom: "0.5em",
          paddingLeft: "0.3em",
          breakAfter: "avoid",
          pageBreakAfter: "avoid",
        }}
      >
        {sectionName}
      </div>

      <table
        style={{
          width: "100%",
          tableLayout: "fixed",
          borderCollapse: "separate",
          borderSpacing: 0,
          background: "#fff",
          border: "1px solid #9EB4D4",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <colgroup>
          <col style={{ width: "16em" }} />
          {dates.map((date) => (
            <col key={formatDateKey(date)} />
          ))}
        </colgroup>

        {/* Header row */}
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "0.5em 0.8em",
                fontWeight: 700,
                fontSize: "0.85em",
                color: "#4D6080",
                letterSpacing: "0.08em",
                borderRight: "1px solid #C8D6EC",
                borderBottom: "2px solid #0F1724",
                background: "#F5F7FA",
              }}
            >
              STAFF NAME
            </th>
            {dates.map((date, i) => {
              const isSplit = splitAtIndex !== undefined && i === splitAtIndex;
              return (
                <th
                  key={formatDateKey(date)}
                  style={{
                    textAlign: "center",
                    padding: "0.4em 0",
                    fontWeight: 400,
                    borderLeft: isSplit ? "2px solid #0F1724" : "1px solid #C8D6EC",
                    borderBottom: "2px solid #0F1724",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8em",
                      fontWeight: 600,
                      color: "#94A3B8",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {DAY_LABELS[date.getDay()]}
                  </div>
                  <div
                    style={{
                      fontSize: "1.2em",
                      fontWeight: 700,
                      color: "#1A2640",
                      lineHeight: 1.2,
                      marginTop: "0.05em",
                    }}
                  >
                    {date.getDate()}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        {/* Employee rows */}
        <tbody>
          {employees.map((emp, ri) => {
            // Always compact: a printed name cell has no room for a full
            // certification name, and DESIGNATION_COLORS is keyed by abbreviation.
            const certAbbr = getCertAbbr(emp.certificationId, certifications, true);
            const dc = DESIGNATION_COLORS[certAbbr] ?? DEFAULT_DESIG_COLOR;

            return (
              <tr
                key={emp.id}
                style={{
                  background: "#fff",
                  breakInside: "avoid",
                  pageBreakInside: "avoid",
                }}
              >
                {/* Name cell */}
                <td
                  style={{
                    padding: 0,
                    borderTop: ri > 0 ? "1px solid #C8D6EC" : undefined,
                    borderRight: "1px solid #C8D6EC",
                  }}
                >
                  <div
                    style={{
                      padding: "0.3em 0.6em 0.3em 0.8em",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.4em",
                      minWidth: 0,
                      minHeight: cellH,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span data-print-fit="" style={{ ...FIT_TEXT, whiteSpace: "normal" }}>
                        <span
                          style={{
                            fontWeight: 600,
                            color: "#1A2640",
                            lineHeight: 1.1,
                            fontSize:
                              getEmployeeDisplayName(emp).length > 25
                                ? "0.85em"
                                : getEmployeeDisplayName(emp).length > 18
                                  ? "0.95em"
                                  : "1em",
                          }}
                        >
                          {getEmployeeDisplayName(emp)}
                        </span>
                      </span>
                      {emp.roleIds.length > 0 && (
                        <span data-print-fit="" style={{ ...FIT_TEXT, marginTop: "0.1em" }}>
                          <span style={{ fontSize: "0.8em", color: "#4D6080" }}>
                            {getRoleAbbrs(emp.roleIds, orgRoles, true).join(", ")}
                          </span>
                        </span>
                      )}
                    </div>
                    {certAbbr && certAbbr !== "—" && (
                      <span
                        style={{
                          fontSize: "0.8em",
                          fontWeight: 700,
                          background: dc.bg,
                          color: dc.text,
                          padding: "0.15em 0.5em",
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
                </td>

                {/* Shift cells */}
                {dates.map((date, di) => {
                  const isSplit = splitAtIndex !== undefined && di === splitAtIndex;
                  const assignment = shiftForKey(emp.id, date);
                  const pills =
                    assignment && assignment !== "OFF"
                      ? resolveCellPills(
                          assignment,
                          assignmentIdsForKey?.(emp.id, date) ?? [],
                          absenceTypeIdForKey?.(emp.id, date) ?? null,
                          getCustomShiftTimes?.(emp.id, date) ?? null,
                          restOfDayAbsenceTypeIdForKey?.(emp.id, date) ?? null,
                        )
                      : [];
                  // Three items (two shifts and an absence) stack in a taller
                  // row rather than squeezing side by side.
                  const stacksPills = pills.length >= 3;

                  return (
                    <td
                      key={formatDateKey(date)}
                      style={{
                        padding: 0,
                        verticalAlign: "middle",
                        borderTop: ri > 0 && !isSplit ? "1px solid #C8D6EC" : undefined,
                        boxShadow: isSplit && ri > 0 ? "inset 0 1px 0 #C8D6EC" : undefined,
                        borderLeft: isSplit ? "2px solid #0F1724" : "1px solid #C8D6EC",
                      }}
                    >
                      <div
                        data-print-cell-layout={stacksPills ? "stacked" : undefined}
                        style={{
                          minHeight: stacksPills ? stackedCellH : cellH,
                          display: "flex",
                          flexDirection: stacksPills ? "column" : "row",
                          alignItems: "stretch",
                          justifyContent: "center",
                          gap: "0.15em",
                          padding: `0.3em ${cellInsetX}`,
                          position: "relative",
                        }}
                      >
                        <PrintIndicatorDots
                          ids={printedIndicatorIds(
                            noteMarksForKey?.(emp.id, date, focusAreaId) ?? [],
                          )}
                          indicatorTypes={indicatorTypes}
                        />
                        {pills.length > 0 ? (
                          pills.map((pill, pi) => (
                            <PrintShiftPill
                              key={pi}
                              {...pill}
                              variant={pills.length === 1 ? "single" : "multi"}
                              isNameMode={isNameMode}
                              wingOnTop={pills.length > 1}
                            />
                          ))
                        ) : (
                          <div
                            style={{
                              alignSelf: "center",
                              margin: "auto",
                              width: "1.2em",
                              height: "0.18em",
                              background: assignment === "OFF" ? "#9EB4D4" : "#C8D6EC",
                              borderRadius: 2,
                            }}
                          />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {/* Tally rows — one per active tally category for this section */}
          {tallyRows.map((row, ci) => (
            <TallyRow
              key={row.id}
              label={row.name}
              bgColor="#fff"
              height={tallyH}
              splitAtIndex={splitAtIndex}
              dailyTallies={dailyTallies.map((t) => t[row.id] ?? {})}
              isFirst={ci === 0}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TallyRow({
  label,
  bgColor,
  height,
  splitAtIndex,
  dailyTallies,
  isFirst,
}: {
  label: string;
  bgColor: string;
  height: string;
  splitAtIndex?: number;
  dailyTallies: Record<string, number>[];
  isFirst?: boolean;
}) {
  return (
    <tr style={{ background: bgColor }}>
      <td
        style={{
          padding: "0.3em 0.8em",
          fontSize: "0.8em",
          fontWeight: 700,
          color: "#1A2640",
          letterSpacing: "0.04em",
          height,
          borderRight: "1px solid #9EB4D4",
          borderTop: isFirst ? "2px solid #0F1724" : "1px solid #9EB4D4",
        }}
      >
        {label}
      </td>
      {dailyTallies.map((tally, i) => {
        const entries = Object.entries(tally);
        const isSplit = splitAtIndex !== undefined && i === splitAtIndex;
        return (
          <td
            key={i}
            style={{
              textAlign: "center",
              padding: "0.25em 0.2em",
              borderLeft: isSplit ? "2px solid #0F1724" : "1px solid #9EB4D4",
              borderTop: isFirst ? "2px solid #0F1724" : "1px solid #9EB4D4",
              fontSize: "0.8em",
              fontWeight: 700,
              color: entries.length > 0 ? "#1A2640" : "#94A3B8",
              lineHeight: 1.3,
              height,
            }}
          >
            {entries.length === 0
              ? "-"
              : entries.map(([lbl, cnt]) => (
                  // One line per count, so a long shift name shrinks rather
                  // than wrapping into the next count.
                  <MaybeHint key={lbl} content={`${lbl}: ${cnt}`} side="top">
                    <span data-print-fit="" style={{ ...FIT_TEXT, textAlign: "center" }}>
                      {lbl}: {cnt}
                    </span>
                  </MaybeHint>
                ))}
          </td>
        );
      })}
    </tr>
  );
}

// ── Main PrintScheduleView ──────────────────────────────────────────────────

const EXCLUDED_LEGEND = new Set(["OFF", "0.3"]);

interface PrintScheduleViewProps {
  orgName?: string;
  weekStart: Date;
  config: PrintConfig;
  employees: Employee[];
  allEmployees: Employee[];
  focusAreas: FocusArea[];
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  shiftForKey: (empId: string, date: Date) => string | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  /** A worked cell's absence for the rest of the day (item 45), printed after its shifts. */
  restOfDayAbsenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  absenceTypeMap?: Map<number, AbsenceType>;
  getShiftStyle: (type: string, focusAreaName?: string) => AssignmentDefinition;
  getCustomShiftTimes?: (
    empId: string,
    date: Date,
  ) => { start: string; end: string; perPill?: { start: string; end: string }[] } | null;
  onClose: () => void;
  focusAreaLabel?: string;
  shiftDisplayMode?: ShiftDisplayMode;
  /** The page's note marks, printed in each cell with an indicator legend. */
  noteMarksForKey?: (empId: string, date: Date, focusAreaId?: number) => ScheduleNoteMark[];
  indicatorTypes?: IndicatorType[];
}

const NO_INDICATORS: IndicatorType[] = [];

export default function PrintScheduleView({
  orgName,
  weekStart,
  config,
  employees,
  allEmployees,
  focusAreas,
  assignments,
  shiftCategories,
  jobs,
  certifications,
  orgRoles,
  shiftForKey,
  assignmentIdsForKey,
  absenceTypeIdForKey,
  restOfDayAbsenceTypeIdForKey,
  absenceTypeMap,
  getShiftStyle,
  getCustomShiftTimes,
  onClose,
  focusAreaLabel = "Focus Areas",
  shiftDisplayMode = "code",
  noteMarksForKey,
  indicatorTypes = NO_INDICATORS,
}: PrintScheduleViewProps) {
  const isNameMode = shiftDisplayMode === "name";
  const { fontSize, selectedFocusAreas: selectedWings, spanWeeks } = config;

  const dates = useMemo(
    () => Array.from({ length: spanWeeks * 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart, spanWeeks],
  );

  const splitAtIndex = spanWeeks === 2 ? 7 : undefined;

  const dateRangeLabel = useMemo(
    () => `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, spanWeeks * 7 - 1))}`,
    [weekStart, spanWeeks],
  );

  // Filter focus areas to print
  const printFocusAreas = useMemo(
    () => focusAreas.filter((w) => selectedWings.includes(w.name)),
    [focusAreas, selectedWings],
  );

  // Exclusive code IDs per section (matches ScheduleGrid approach)
  const exclusiveCodeIdsPerSection = useMemo(() => {
    return Object.fromEntries(
      printFocusAreas.map((w) => [
        w.name,
        new Set(assignments.filter((st) => st.focusAreaId === w.id).map((st) => st.id)),
      ]),
    );
  }, [printFocusAreas, assignments]);

  const contentRef = useRef<HTMLDivElement>(null);

  // Labels are measured at the printed width and shrunk to fit, then again
  // once Inter has loaded, since the fallback face has different widths.
  useLayoutEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl) return;
    fitPrintText(contentEl);
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) fitPrintText(contentEl);
    });
    return () => {
      cancelled = true;
    };
  });

  // Returns its promise so the shared Button latch spins for as long as the
  // images the print window needs are still loading.
  function handlePrint() {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const printWindow = window.open("", "_blank", "toolbar=0,scrollbars=1,status=0");
    if (!printWindow) return;

    const printedAt = contentEl.querySelector("[data-printed-at]");
    if (printedAt) printedAt.textContent = `Printed ${formatPrintedAt(new Date())}`;
    fitPrintText(contentEl);

    printWindow.document.write(
      buildPrintDocument({
        title: `Schedule: ${dateRangeLabel}`,
        fontFaceCss: collectFontFaceCss(document),
        bodyHtml: contentEl.outerHTML,
      }),
    );
    printWindow.document.close();
    return whenPrintReady(printWindow).then(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.addEventListener("afterprint", () => printWindow.close());
    });
  }

  const legendItems = assignments.filter((s) => !EXCLUDED_LEGEND.has(s.label));

  // The indicator key lists only the indicators this printout shows.
  const printedIndicators = useMemo(() => {
    if (!noteMarksForKey || indicatorTypes.length === 0) return [];
    const ids = new Set<number>();
    for (const focusArea of printFocusAreas) {
      for (const emp of allEmployees) {
        for (const date of dates) {
          for (const id of printedIndicatorIds(noteMarksForKey(emp.id, date, focusArea.id))) {
            ids.add(id);
          }
        }
      }
    }
    return indicatorTypes.filter((type) => ids.has(type.id));
  }, [noteMarksForKey, indicatorTypes, printFocusAreas, allEmployees, dates]);

  return (
    <div
      className="dg-force-light"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Screen-only controls bar */}
      <div
        className="print-view-controls"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 20px",
          borderBottom: "1px solid #C8D6EC",
          background: "#F5F7FA",
          flexShrink: 0,
        }}
      >
        <Button
          onClick={onClose}
          className="dg-btn dg-btn-secondary"
          style={{ padding: "7px 14px" }}
        >
          ← Back
        </Button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <PrintBrandLockup
            orgName={orgName}
            wordmarkSize={22}
            separatorHeight={18}
            orgFontSize={13}
          />
          <span style={{ width: 0.8, height: 18, background: BRAND_SEPARATOR, display: "block" }} />
          <span
            style={{
              fontSize: "var(--dg-fs-label)",
              fontWeight: 500,
              color: "#334766",
              lineHeight: 1,
            }}
          >
            {dateRangeLabel}
          </span>
        </div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: "var(--dg-fs-caption)",
              color: "#4D6080",
            }}
          >
            {printFontSizeLabel(fontSize)} · {`${spanWeeks}W`} ·{" "}
            {selectedWings.length === focusAreas.length
              ? `All ${focusAreaLabel.toLowerCase()}`
              : selectedWings.join(", ")}
          </span>
          <Button
            onClick={handlePrint}
            className="dg-btn dg-btn-primary"
            style={{ padding: "8px 18px" }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: 5 }}
            >
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print
          </Button>
        </div>
      </div>

      {/* Scrollable preview area */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "24px",
          background: "#9EB4D4",
        }}
      >
        {/* Paper simulation on screen */}
        <div
          ref={contentRef}
          className="print-schedule-content"
          style={{
            background: "#fff",
            fontSize: `${fontSize}px`,
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            fontVariantNumeric: "tabular-nums",
            // A landscape Letter page: the preview lays out at the printed
            // width, so it wraps and shortens text where the printout will.
            width: "11in",
            minHeight: "8.5in",
            margin: "0 auto",
            padding: "0.5in",
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            borderRadius: "var(--dg-radius-xs)",
          }}
        >
          {/* Print header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              marginBottom: "1.2em",
              paddingBottom: "0.6em",
              borderBottom: "2px solid #0F1724",
            }}
          >
            <div>
              {/* Logo + Wordmark + Org Name in one line */}
              <div style={{ marginBottom: "0.7em" }}>
                <PrintBrandLockup
                  orgName={orgName}
                  wordmarkSize={fontSize * 1.6}
                  separatorHeight={fontSize * 1.45}
                  orgFontSize={fontSize}
                />
              </div>

              <div
                style={{
                  fontSize: "1.1em",
                  fontWeight: 600,
                  color: "#334766",
                }}
              >
                Schedule: {dateRangeLabel}
              </div>
            </div>
            <div
              data-printed-at=""
              style={{
                fontSize: "0.9em",
                color: "#4D6080",
                textAlign: "right",
              }}
            >
              Printed {formatPrintedAt(new Date())}
            </div>
          </div>

          {/* Focus area sections */}
          {printFocusAreas.map((focusArea) => {
            const exclusiveCodeIds =
              exclusiveCodeIdsPerSection[focusArea.name] ?? new Set<number>();
            // A row with nothing scheduled in the printed range is left off.
            const homeEmps = employees.filter(
              (e) =>
                e.focusAreaIds.includes(focusArea.id) &&
                dates.some((date) => {
                  const assignment = shiftForKey(e.id, date);
                  return !!assignment && assignment !== "OFF";
                }),
            );
            const guestEmps = allEmployees.filter(
              (e) =>
                e.focusAreaIds.length > 0 &&
                !e.focusAreaIds.includes(focusArea.id) &&
                dates.some((date) => {
                  const codeIds = assignmentIdsForKey?.(e.id, date) ?? [];
                  return codeIds.some((id) => exclusiveCodeIds.has(id));
                }),
            );
            const sectionEmps = [...homeEmps, ...guestEmps];
            if (sectionEmps.length === 0) return null;

            return (
              <PrintSection
                key={focusArea.name}
                sectionName={focusArea.name}
                focusAreaId={focusArea.id}
                employees={sectionEmps}
                dates={dates}
                shiftForKey={shiftForKey}
                absenceTypeIdForKey={absenceTypeIdForKey}
                restOfDayAbsenceTypeIdForKey={restOfDayAbsenceTypeIdForKey}
                absenceTypeMap={absenceTypeMap}
                assignmentIdsForKey={assignmentIdsForKey}
                getShiftStyle={getShiftStyle}
                assignments={assignments}
                shiftCategories={shiftCategories}
                jobs={jobs}
                certifications={certifications}
                orgRoles={orgRoles}
                focusAreas={focusAreas}
                getCustomShiftTimes={getCustomShiftTimes}
                splitAtIndex={splitAtIndex}
                fontSize={fontSize}
                shiftDisplayMode={shiftDisplayMode}
                noteMarksForKey={noteMarksForKey}
                indicatorTypes={indicatorTypes}
              />
            );
          })}

          {/* Full shift names already say what each pill is, so only codes need a key. */}
          {!isNameMode && legendItems.length > 0 && (
            <div
              data-print-legend="true"
              style={{
                marginTop: "1.5em",
                paddingTop: "0.8em",
                borderTop: "1px solid #C8D6EC",
              }}
            >
              <div
                style={{
                  fontSize: "1em",
                  fontWeight: 700,
                  color: "#1A2640",
                  marginBottom: "0.7em",
                }}
              >
                Shift Key
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(10em, 1fr))",
                  gap: "0.5em 1.5em",
                }}
              >
                {legendItems.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
                    <span
                      style={{
                        background: s.color,
                        border: `1px solid ${borderColor(s.text)}`,
                        color: s.text,
                        borderRadius: "0.3em",
                        padding: "0.15em 0.5em",
                        fontSize: "0.9em",
                        fontWeight: 700,
                        flexShrink: 0,
                        minWidth: "2.5em",
                        textAlign: "center",
                      }}
                    >
                      {s.label}
                    </span>
                    <span style={{ fontSize: "0.9em", color: "#334766" }}>{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {printedIndicators.length > 0 && (
            <div
              data-print-indicator-legend="true"
              data-print-legend="true"
              style={{ marginTop: "1em", paddingTop: "0.8em", borderTop: "1px solid #C8D6EC" }}
            >
              <div
                style={{
                  fontSize: "1em",
                  fontWeight: 700,
                  color: "#1A2640",
                  marginBottom: "0.7em",
                }}
              >
                Schedule notes
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(10em, 1fr))",
                  gap: "0.5em 1.5em",
                }}
              >
                {printedIndicators.map((indicator) => (
                  <div
                    key={indicator.id}
                    style={{ display: "flex", alignItems: "center", gap: "0.5em" }}
                  >
                    <ScheduleNoteIcon color="#334766" size="1em" />
                    <span style={{ fontSize: "0.9em", color: "#334766" }}>{indicator.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
