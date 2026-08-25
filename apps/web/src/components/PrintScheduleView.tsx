"use client";

import { useMemo, useRef } from "react";
import {
  AbsenceType,
  Employee,
  ShiftCategory,
  AssignmentDefinition,
  FocusArea,
  JobDefinition,
  NamedItem,
  ShiftDisplayMode,
} from "@/types";
import {
  addDays,
  formatDateKey,
  formatDate,
  getCertAbbr,
  getRoleAbbrs,
  getEmployeeDisplayName,
  fmt12hShort,
} from "@/lib/utils";
import { DAY_LABELS, BOX_SHADOW_CARD } from "@/lib/constants";
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

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const BRAND_MUTED = "#4A607F";
const BRAND_SEPARATOR = "#94A3B8";

function PrintBrandLockup({
  orgName,
  logoSize,
  wordmarkWidth,
  wordmarkHeight,
  separatorHeight,
  orgFontSize,
}: {
  orgName?: string;
  logoSize: number;
  wordmarkWidth: number;
  wordmarkHeight: number;
  separatorHeight: number;
  orgFontSize: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", lineHeight: 1 }}>
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        style={{
          display: "block",
          width: logoSize,
          height: logoSize,
          objectFit: "contain",
        }}
      />
      <img
        src="/wordmark-white.png"
        alt="dubgrid"
        style={{
          display: "block",
          width: wordmarkWidth,
          height: wordmarkHeight,
          objectFit: "contain",
          marginLeft: 8,
          filter: "brightness(0) saturate(100%)",
        }}
      />
      {orgName && (
        <>
          <span
            aria-hidden="true"
            style={{
              display: "block",
              width: 0.8,
              height: separatorHeight,
              background: BRAND_SEPARATOR,
              marginLeft: 5,
              marginRight: 5,
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

function waitForImages(targetWindow: Window): Promise<void> {
  const images = Array.from(targetWindow.document.images);
  return Promise.all(
    images.map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  ).then(() => undefined);
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

function pillText(label: string, max: number): string {
  if (label.length <= max) return label;
  return label.slice(0, max - 1).trimEnd() + "\u2026";
}

// ── Per-section print grid ─────────────────────────────────────────────────

interface PrintSectionProps {
  sectionName: string;
  focusAreaId: number;
  employees: Employee[];
  dates: Date[];
  shiftForKey: (empId: string, date: Date) => string | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
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
}

function PrintSection({
  sectionName,
  focusAreaId,
  employees,
  dates,
  shiftForKey,
  assignmentIdsForKey,
  absenceTypeIdForKey,
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

  // em-based name column; day columns fill the rest equally
  const nameColEm = 16;

  const cellH = `${fontSize * 3.4}px`;
  const tallyH = `${fontSize * 2.8}px`;

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
          borderRadius: "var(--dg-radius-md)",
          overflow: "hidden",
          boxShadow: BOX_SHADOW_CARD,
        }}
      >
        <colgroup>
          <col style={{ width: `${nameColEm}em` }} />
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
            const certAbbr = getCertAbbr(emp.certificationId, certifications);
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
                      height: cellH,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.3em" }}>
                        <span
                          style={{
                            fontWeight: 600,
                            color: "#1A2640",
                            whiteSpace: "normal",
                            overflowWrap: "break-word",
                            lineHeight: 1.05,
                            fontSize:
                              getEmployeeDisplayName(emp).length > 25
                                ? "0.85em"
                                : getEmployeeDisplayName(emp).length > 18
                                  ? "0.95em"
                                  : "1em",
                            display: "block",
                            maxWidth: `${nameColEm - 4}em`,
                          }}
                        >
                          {getEmployeeDisplayName(emp)}
                        </span>
                      </div>
                      {emp.roleIds.length > 0 && (
                        <div
                          style={{
                            fontSize: "0.8em",
                            color: "#4D6080",
                            marginTop: "0.1em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {getRoleAbbrs(emp.roleIds, orgRoles).join(", ")}
                        </div>
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
                  const cellCodeIds = assignmentIdsForKey?.(emp.id, date) ?? [];
                  const customTimes = getCustomShiftTimes?.(emp.id, date) ?? null;
                  // An absence carries no assignment id, so the label lookup
                  // below would resolve it against the assignment list — which
                  // either finds nothing (printing vacation in the fallback
                  // grey) or, worse, finds an assignment sharing its label and
                  // prints someone's day off in that shift's colors.
                  const cellAbsenceTypeId = absenceTypeIdForKey?.(emp.id, date) ?? null;
                  const cellAbsenceType =
                    cellAbsenceTypeId != null
                      ? (absenceTypeMap?.get(cellAbsenceTypeId) ?? null)
                      : null;
                  const absenceStyle: AssignmentDefinition | null = cellAbsenceType
                    ? {
                        id: 0,
                        orgId: cellAbsenceType.orgId,
                        label: cellAbsenceType.label,
                        name: cellAbsenceType.name || cellAbsenceType.label,
                        color: cellAbsenceType.color,
                        border: cellAbsenceType.border,
                        text: cellAbsenceType.text,
                        sortOrder: cellAbsenceType.sortOrder,
                      }
                    : null;

                  return (
                    <td
                      key={formatDateKey(date)}
                      style={{
                        padding: 0,
                        borderTop: ri > 0 && !isSplit ? "1px solid #C8D6EC" : undefined,
                        boxShadow: isSplit && ri > 0 ? "inset 0 1px 0 #C8D6EC" : undefined,
                        borderLeft: isSplit ? "2px solid #0F1724" : "1px solid #C8D6EC",
                      }}
                    >
                      <div
                        style={{
                          height: cellH,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                        }}
                      >
                        {assignment && assignment !== "OFF" ? (
                          (() => {
                            // "/" joins the segments of a worked cell, so it
                            // is what splits that cell into pills. An absence
                            // is always one pill, whatever the org named it.
                            const labels = cellAbsenceType ? [assignment] : assignment.split("/");
                            if (labels.length === 1) {
                              const label = labels[0];
                              const style =
                                absenceStyle ?? getStyleByIdOrLabel(label, cellCodeIds[0]);
                              const codeEntry0 =
                                cellCodeIds[0] != null
                                  ? assignmentById.get(cellCodeIds[0])
                                  : undefined;
                              const displayParts = cellAbsenceType
                                ? {
                                    primaryLabel: isNameMode
                                      ? cellAbsenceType.name || cellAbsenceType.label
                                      : label,
                                    secondaryLabel: null,
                                  }
                                : getDisplayPartsByIdOrLabel(label, cellCodeIds[0]);
                              const isCross =
                                !cellAbsenceType &&
                                label !== "X" &&
                                codeEntry0?.focusAreaId != null &&
                                codeEntry0.focusAreaId !== focusAreaId;
                              const crossHomeFa = isCross
                                ? focusAreas.find((fa) => fa.id === codeEntry0!.focusAreaId)
                                : undefined;
                              const singleCrossFocusPill =
                                isCross && crossHomeFa ? crossHomeFa : null;
                              const singleCrossFocusPalette = getCrossFocusBadgePalette(style);
                              const singleForegroundColor = isCross
                                ? getReadableTextOnSurface(style.color, style.text)
                                : style.text;
                              const showSingleSecondaryLine = !!displayParts.secondaryLabel;
                              // Matches ScheduleGrid: a row per item in name mode (stepped down
                              // a size when a time joins them), shift · job always on one line
                              // in code mode.
                              const singleIsThreeRow =
                                showSingleSecondaryLine && !!customTimes && isNameMode;
                              const singleInlinesSecondary = showSingleSecondaryLine && !isNameMode;
                              const singleDisplayLabel = displayParts.primaryLabel;
                              return (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: customTimes ? "0.25em" : "0.5em",
                                    right: "0.5em",
                                    bottom: customTimes ? "0.25em" : "0.5em",
                                    left: "0.5em",
                                    background: isCross ? "#ffffff" : style.color,
                                    border: `1px solid ${borderColor(singleForegroundColor)}`,
                                    borderRadius: 4,
                                    color: singleForegroundColor,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    overflow: "hidden",
                                    padding: isNameMode ? "2px 4px" : "2px 3px",
                                    paddingLeft: singleCrossFocusPill
                                      ? isNameMode
                                        ? "1.75em"
                                        : "1.45em"
                                      : undefined,
                                  }}
                                >
                                  {singleCrossFocusPill && (
                                    <span
                                      style={{
                                        position: "absolute",
                                        top: 0,
                                        bottom: 0,
                                        left: 0,
                                        display: "flex",
                                        alignItems: "center",
                                        fontSize: "1em",
                                        fontWeight: 800,
                                        lineHeight: 1,
                                        background: singleCrossFocusPalette.background,
                                        color: singleCrossFocusPalette.color,
                                        borderRadius: "3px 0 0 3px",
                                        padding: "0 0.3em",
                                        letterSpacing: "0.02em",
                                      }}
                                    >
                                      {getFocusAreaInitials(singleCrossFocusPill.name)}
                                    </span>
                                  )}
                                  <MaybeHint content={isNameMode ? label : undefined} side="top">
                                    <div
                                      style={{
                                        display: "flex",
                                        flexDirection: singleInlinesSecondary ? "row" : "column",
                                        alignItems: singleInlinesSecondary ? "baseline" : "center",
                                        justifyContent: "center",
                                        flexWrap: "nowrap",
                                        gap: singleInlinesSecondary
                                          ? "0.2em"
                                          : showSingleSecondaryLine
                                            ? "0.12em"
                                            : 0,
                                        maxWidth: "100%",
                                        minWidth: 0,
                                        overflow: "hidden",
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontWeight: 800,
                                          lineHeight: 1.2,
                                          ...(isNameMode
                                            ? { textAlign: "center" as const, fontSize: "0.85em" }
                                            : {
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                maxWidth: "100%",
                                                minWidth: 0,
                                              }),
                                        }}
                                      >
                                        {isNameMode
                                          ? pillText(singleDisplayLabel, 14)
                                          : singleDisplayLabel}
                                      </span>
                                      {singleInlinesSecondary && (
                                        <span
                                          aria-hidden="true"
                                          style={{
                                            fontSize: "0.7em",
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
                                            fontSize: singleIsThreeRow ? "0.62em" : "0.7em",
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
                                          {isNameMode
                                            ? pillText(displayParts.secondaryLabel ?? "", 14)
                                            : displayParts.secondaryLabel}
                                        </span>
                                      ) : null}
                                    </div>
                                  </MaybeHint>
                                  {customTimes && (
                                    <span
                                      style={{
                                        fontSize: singleIsThreeRow ? "0.62em" : "0.75em",
                                        fontWeight: 500,
                                        lineHeight: 1,
                                        marginTop: singleIsThreeRow ? "0.12em" : "0.3em",
                                        opacity: 0.7,
                                        letterSpacing: "0.02em",
                                      }}
                                    >
                                      {fmt12hShort(customTimes.start)}–
                                      {fmt12hShort(customTimes.end)}
                                    </span>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "0.25em",
                                  right: "0.5em",
                                  bottom: "0.25em",
                                  left: "0.5em",
                                  display: "flex",
                                  flexDirection: "row",
                                  gap: "0.15em",
                                  alignItems: "stretch",
                                }}
                              >
                                {labels.map((label, li) => {
                                  const style = getStyleByIdOrLabel(label, cellCodeIds[li]);
                                  const codeEntryLi =
                                    cellCodeIds[li] != null
                                      ? assignmentById.get(cellCodeIds[li])
                                      : undefined;
                                  const displayParts = getDisplayPartsByIdOrLabel(
                                    label,
                                    cellCodeIds[li],
                                  );
                                  const isCross =
                                    label !== "X" &&
                                    codeEntryLi?.focusAreaId != null &&
                                    codeEntryLi.focusAreaId !== focusAreaId;
                                  const crossHomeFaLi = isCross
                                    ? focusAreas.find((fa) => fa.id === codeEntryLi!.focusAreaId)
                                    : undefined;
                                  const multiCrossFocusPill =
                                    isCross && crossHomeFaLi ? crossHomeFaLi : null;
                                  const multiCrossFocusPalette = getCrossFocusBadgePalette(style);
                                  const multiForegroundColor = isCross
                                    ? getReadableTextOnSurface(style.color, style.text)
                                    : style.text;
                                  const showMultiSecondaryLine = !!displayParts.secondaryLabel;
                                  const multiDisplayLabel = displayParts.primaryLabel;
                                  const pillTime =
                                    customTimes?.perPill?.[li] ??
                                    (li === 0 && !customTimes?.perPill ? customTimes : null);
                                  const hasTime = pillTime && (pillTime.start || pillTime.end);

                                  return (
                                    <div
                                      key={li}
                                      style={{
                                        flex: 1,
                                        background: isCross ? "#ffffff" : style.color,
                                        border: `1px solid ${borderColor(multiForegroundColor)}`,
                                        borderRadius: 4,
                                        color: multiForegroundColor,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 0,
                                        fontWeight: 800,
                                        position: "relative",
                                        lineHeight: 1.2,
                                        overflow: "hidden",
                                        padding: isNameMode ? "1px 3px" : "1px 2px",
                                        paddingLeft: multiCrossFocusPill
                                          ? isNameMode
                                            ? "1.35em"
                                            : "1.15em"
                                          : undefined,
                                      }}
                                    >
                                      {multiCrossFocusPill && (
                                        <span
                                          style={{
                                            position: "absolute",
                                            top: 0,
                                            bottom: 0,
                                            left: 0,
                                            display: "flex",
                                            alignItems: "center",
                                            fontSize: "0.75em",
                                            fontWeight: 800,
                                            lineHeight: 1,
                                            background: multiCrossFocusPalette.background,
                                            color: multiCrossFocusPalette.color,
                                            borderRadius: "2px 0 0 2px",
                                            padding: "0 0.2em",
                                            letterSpacing: "0.02em",
                                          }}
                                        >
                                          {getFocusAreaInitials(multiCrossFocusPill.name)}
                                        </span>
                                      )}
                                      <MaybeHint
                                        content={isNameMode ? label : undefined}
                                        side="top"
                                      >
                                        <div
                                          style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: showMultiSecondaryLine ? "0.1em" : 0,
                                            maxWidth: "100%",
                                            minWidth: 0,
                                          }}
                                        >
                                          <span
                                            style={
                                              isNameMode
                                                ? {
                                                    textAlign: "center" as const,
                                                    fontSize: "0.85em",
                                                  }
                                                : {
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    maxWidth: "100%",
                                                  }
                                            }
                                          >
                                            {isNameMode
                                              ? pillText(multiDisplayLabel, 8)
                                              : multiDisplayLabel}
                                          </span>
                                          {showMultiSecondaryLine ? (
                                            <span
                                              style={{
                                                fontSize: "0.68em",
                                                fontWeight: 700,
                                                lineHeight: 1.3,
                                                opacity: 0.78,
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                maxWidth: "100%",
                                              }}
                                            >
                                              {isNameMode
                                                ? pillText(displayParts.secondaryLabel ?? "", 8)
                                                : displayParts.secondaryLabel}
                                            </span>
                                          ) : null}
                                        </div>
                                      </MaybeHint>
                                      {hasTime && (
                                        <span
                                          style={{
                                            fontSize: "0.7em",
                                            fontWeight: 500,
                                            opacity: 0.7,
                                            lineHeight: 1,
                                          }}
                                        >
                                          {fmt12hShort(pillTime!.start)}–
                                          {fmt12hShort(pillTime!.end)}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()
                        ) : (
                          <div
                            style={{
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
              isNameMode={isNameMode}
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
  isNameMode = false,
}: {
  label: string;
  bgColor: string;
  height: string;
  splitAtIndex?: number;
  dailyTallies: Record<string, number>[];
  isFirst?: boolean;
  isNameMode?: boolean;
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
              padding: "0.2em 0.2em",
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
              : entries.map(([lbl, cnt], ei) => (
                  <MaybeHint key={lbl} content={`${lbl}: ${cnt}`} side="top">
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: isNameMode ? 90 : undefined,
                        display: isNameMode ? "inline-block" : undefined,
                        verticalAlign: isNameMode ? "middle" : undefined,
                      }}
                    >
                      {ei > 0 && <span style={{ color: "#94A3B8", margin: "0 0.3em" }}>|</span>}
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
  absenceTypeMap?: Map<number, AbsenceType>;
  getShiftStyle: (type: string, focusAreaName?: string) => AssignmentDefinition;
  getCustomShiftTimes?: (
    empId: string,
    date: Date,
  ) => { start: string; end: string; perPill?: { start: string; end: string }[] } | null;
  onClose: () => void;
  focusAreaLabel?: string;
  shiftDisplayMode?: ShiftDisplayMode;
}

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
  absenceTypeMap,
  getShiftStyle,
  getCustomShiftTimes,
  onClose,
  focusAreaLabel = "Focus Areas",
  shiftDisplayMode = "code",
}: PrintScheduleViewProps) {
  const isNameMode = shiftDisplayMode === "name";
  const { fontSize, selectedFocusAreas: selectedWings, spanWeeks } = config;

  // Build date array
  const dates = useMemo(() => {
    if (spanWeeks === "month") {
      const year = weekStart.getFullYear();
      const month = weekStart.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
    }
    return Array.from({ length: spanWeeks * 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart, spanWeeks]);

  const splitAtIndex = spanWeeks === 2 ? 7 : undefined;

  // Date range label for header
  const dateRangeLabel = useMemo(() => {
    if (spanWeeks === "month") {
      return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    }
    return `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, spanWeeks * 7 - 1))}`;
  }, [weekStart, spanWeeks]);

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

  function handlePrint() {
    const contentEl = contentRef.current;
    if (!contentEl) return;

    const printWindow = window.open("", "_blank", "toolbar=0,scrollbars=1,status=0");
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <title>Schedule — ${dateRangeLabel}</title>
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page { size: A3 landscape; margin: 0.5in; }
    html, body { margin: 0; padding: 0; background: #fff; font-family: 'DM Sans', system-ui, -apple-system, sans-serif; }
  </style>
</head><body>${contentEl.outerHTML}</body></html>`);

    printWindow.document.close();
    void waitForImages(printWindow).then(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.addEventListener("afterprint", () => printWindow.close());
    });
  }

  const legendItems = assignments.filter((s) => !EXCLUDED_LEGEND.has(s.label));

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
            logoSize={32}
            wordmarkWidth={96}
            wordmarkHeight={34}
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
            {fontSize <= 7 ? "Small" : fontSize >= 9 ? "Large" : "Medium"} ·{" "}
            {spanWeeks === "month" ? "Month" : `${spanWeeks}W`} ·{" "}
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
            fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
            padding: "0.5in",
            maxWidth: "none",
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            borderRadius: 4,
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
                  logoSize={24}
                  wordmarkWidth={72}
                  wordmarkHeight={25.5}
                  separatorHeight={16}
                  orgFontSize={11}
                />
              </div>

              <div
                style={{
                  fontSize: "1.1em",
                  fontWeight: 600,
                  color: "#334766",
                }}
              >
                Schedule — {dateRangeLabel}
              </div>
            </div>
            <div
              style={{
                fontSize: "0.9em",
                color: "#4D6080",
                textAlign: "right",
              }}
            >
              Printed {new Date().toLocaleDateString()}
            </div>
          </div>

          {/* Focus area sections */}
          {printFocusAreas.map((focusArea) => {
            const exclusiveCodeIds =
              exclusiveCodeIdsPerSection[focusArea.name] ?? new Set<number>();
            const homeEmps = employees.filter((e) => e.focusAreaIds.includes(focusArea.id));
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
              />
            );
          })}

          {/* Legend */}
          {legendItems.length > 0 && (
            <div
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
                        borderRadius: 4,
                        padding: "0.15em 0.5em",
                        fontSize: "0.9em",
                        fontWeight: 700,
                        flexShrink: 0,
                        minWidth: isNameMode ? undefined : "2.5em",
                        textAlign: "center",
                      }}
                    >
                      {isNameMode ? s.name || s.label : s.label}
                    </span>
                    {!isNameMode && (
                      <span style={{ fontSize: "0.9em", color: "#334766" }}>{s.name}</span>
                    )}
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
