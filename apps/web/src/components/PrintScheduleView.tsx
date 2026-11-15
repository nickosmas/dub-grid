"use client";

import type { AbsencePillLayout } from "@/lib/absence-pill";
import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
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
import { buildRowAbsenceRuns } from "@/components/schedule-grid/absenceRuns";
import {
  getCrossFocusBadgePalette,
  getFocusAreaInitials,
  stacksShifts,
} from "@/components/schedule-grid/gridHelpers";
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
  FILLED_PILL_BORDER,
  getReadableTextOnSurface,
} from "@/lib/colors";
import { buildShiftDisplayParts } from "@/lib/assignable-shifts";
import { legendGroupsByFocusArea } from "@/components/PrintLegend";
import { printFontSizeLabel } from "@/components/print-font-sizes";
import {
  PrintShiftPill,
  PRINT_PILL_RADIUS,
  type PrintNoteDot,
  type PrintShiftPillProps,
} from "@/components/PrintShiftPill";
import { PRINT_INK } from "@/components/print-palette";
import { absenceStripeFill } from "@/lib/absence-stripes";
import { attachedPillSeams, gapBefore, timesMeet } from "@/lib/attached-pill";
import { fitPrintText, PRINT_FIT_LINE as FIT_TEXT } from "@/components/print-fit";
import {
  buildPrintDocument,
  collectFontFaceCss,
  whenPrintReady,
} from "@/components/print-document";
import { DEFAULT_ORGANIZATION_LABELS, shiftDisplayName } from "@dubgrid/domain";
import { formatAbsenceRunLabel } from "@dubgrid/schedule-core";

const BRAND_MUTED = PRINT_INK.muted;
const BRAND_SEPARATOR = "#D4D4D4";

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
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}`;
}

/** What a printed cell reads to put the grid's mentored M on a shift. */
export type PrintSegmentsForKey = (
  empId: string,
  date: Date,
) => readonly { isMentored?: boolean | null }[];

// ── Per-section print grid ─────────────────────────────────────────────────

// The print window carries none of the app's CSS variables, so every colour
// here is a literal. An archived or unknown indicator prints in plain grey.
const PRINT_UNKNOWN_INDICATOR = PRINT_INK.borderStrong;

const PRINT_PILL_GAP = "0.2em";
const CELL_INSET_Y = "0.3em";

// The preview lays out on a landscape Letter page with half-inch margins,
// which is also what the print window asks for.
const PAGE_WIDTH_IN = 11;
const PAGE_MARGIN_IN = 0.5;
const NAME_COLUMN_EM = 16;
// The grid sets names at 14px, the size the print's base size stands for.
const GRID_NAME_PX = 14;

/**
 * A printed day's width as the grid would measure it, so a cell's shifts
 * stack on paper exactly when they would on a grid that narrow.
 */
export function gridEquivalentColumnWidth(fontSize: number, dayCount: number): number {
  const contentPx = (PAGE_WIDTH_IN - 2 * PAGE_MARGIN_IN) * 96;
  const dayPx = (contentPx - NAME_COLUMN_EM * fontSize) / dayCount;
  return (dayPx * GRID_NAME_PX) / fontSize;
}

/**
 * An absence prints in its light stripes with a dashed edge, so it still reads
 * as an absence when the browser drops background graphics.
 */
function printAbsenceFill(absence: AbsenceType) {
  const fill = absenceStripeFill(absence.color, false);
  return { background: fill.background, color: fill.text, border: `1px dashed ${fill.border}` };
}

/** A cell's notes as the dots its last pill prints; an archived or unknown note prints grey. */
function printNoteDots(marks: ScheduleNoteMark[], indicatorTypes: IndicatorType[]): PrintNoteDot[] {
  return marks.map((mark) => {
    const indicator = indicatorTypes.find((type) => type.id === mark.indicatorTypeId);
    return {
      id: mark.indicatorTypeId,
      name: indicator?.name ?? "Schedule note",
      color: indicator?.color ?? PRINT_UNKNOWN_INDICATOR,
    };
  });
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
  restOfDayAbsenceLayoutForKey?: (empId: string, date: Date) => AbsencePillLayout | null;
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
  segmentsForKey?: PrintSegmentsForKey;
  splitAtIndex?: number;
  fontSize: number;
  shiftDisplayMode?: ShiftDisplayMode;
  noteMarksForKey?: (empId: string, date: Date, focusAreaId?: number) => ScheduleNoteMark[];
  indicatorTypes: IndicatorType[];
}

type CellPill = Omit<PrintShiftPillProps, "variant" | "isNameMode">;

/** One whole-day absence across days in a row (item 52), drawn from its first cell. */
function PrintAbsenceRun({
  absence,
  length,
  insetX,
}: {
  absence: AbsenceType;
  length: number;
  insetX: string;
}) {
  return (
    <div
      data-print-absence-run={length}
      style={{
        position: "absolute",
        top: CELL_INSET_Y,
        bottom: CELL_INSET_Y,
        left: insetX,
        // Day columns share one width, and each day after the first adds its
        // 1px dividing line, which the bar covers as the grid's does.
        right: `calc(${1 - length} * (100% + 1px) + ${insetX})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 0.5em",
        borderRadius: PRINT_PILL_RADIUS.single,
        ...printAbsenceFill(absence),
      }}
    >
      <span data-print-fit="" style={{ ...FIT_TEXT, textAlign: "center" }}>
        <span style={{ fontSize: "0.9em", fontWeight: 600 }}>
          {formatAbsenceRunLabel(absence.name || absence.label, length)}
        </span>
      </span>
    </div>
  );
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
  restOfDayAbsenceLayoutForKey,
  absenceTypeMap,
  getShiftStyle,
  assignments,
  shiftCategories,
  jobs,
  certifications,
  orgRoles,
  focusAreas,
  getCustomShiftTimes,
  segmentsForKey,
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

  // The grid counts this section's shifts and the ones every area shares.
  const countableCodeIds = useMemo(
    () =>
      new Set(
        assignments
          .filter((sc) => sc.focusAreaId === focusAreaId || sc.focusAreaId == null)
          .map((sc) => sc.id),
      ),
    [assignments, focusAreaId],
  );

  // One row per shift, each day's count of people on it, as the grid totals them.
  const tallyRows = useMemo(() => {
    const idsFor = assignmentIdsForKey ?? (() => []);
    const countsByCategory = new Map<number, number[]>();
    dates.forEach((date, dayIndex) => {
      const tallies = computeDailyTallies(
        employees,
        date,
        idsFor,
        assignmentById,
        countableCodeIds,
      );
      for (const [categoryId, byLabel] of Object.entries(tallies)) {
        const id = Number(categoryId);
        const counts = countsByCategory.get(id) ?? dates.map(() => 0);
        counts[dayIndex] = Object.values(byLabel).reduce((sum, count) => sum + count, 0);
        countsByCategory.set(id, counts);
      }
    });
    const areaName = (id: number) => focusAreas.find((area) => area.id === id)?.name;
    return Array.from(countsByCategory, ([id, counts]) => ({
      id,
      category: categoryById.get(id),
      counts,
    }))
      .sort(
        (left, right) =>
          (left.category?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.category?.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
          (left.category?.name ?? "").localeCompare(right.category?.name ?? ""),
      )
      .map(({ id, category, counts }) => ({
        id,
        label: category ? shiftDisplayName(category, shiftCategories, areaName) : `Category ${id}`,
        counts,
      }));
  }, [
    dates,
    employees,
    assignmentIdsForKey,
    assignmentById,
    countableCodeIds,
    categoryById,
    shiftCategories,
    focusAreas,
  ]);

  if (employees.length === 0) return null;

  // Two weeks leave each day half the room, so the pills sit closer to the
  // cell edge.
  const cellInsetX = dates.length > 7 ? "0.2em" : "0.35em";
  const cellH = `${fontSize * 3.4}px`;
  const columnWidth = gridEquivalentColumnWidth(fontSize, dates.length);

  function resolveCellPills(
    empId: string,
    date: Date,
    assignment: string,
  ): { pills: CellPill[]; stacked: boolean } {
    const customTimes = getCustomShiftTimes?.(empId, date) ?? null;
    // An absence carries no assignment id, so a label lookup would resolve it
    // against the assignment list: either finding nothing (printing vacation
    // in the fallback grey) or, worse, an assignment sharing its label and
    // printing someone's day off in that shift's colors.
    const absenceTypeId = absenceTypeIdForKey?.(empId, date) ?? null;
    const absence = absenceTypeId != null ? (absenceTypeMap?.get(absenceTypeId) ?? null) : null;
    if (absence) {
      return {
        pills: [
          {
            primaryLabel: isNameMode ? absence.name || absence.label : assignment,
            time: customTimes,
            ...printAbsenceFill(absence),
          },
        ],
        stacked: false,
      };
    }

    const cellCodeIds = assignmentIdsForKey?.(empId, date) ?? [];
    const segments = segmentsForKey?.(empId, date) ?? [];
    // "/" joins the segments of a worked cell, so it is what splits it into pills.
    const labels = assignment.split("/");
    const spans: { start?: string | null; end?: string | null }[] = [];
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
      const ownTime =
        customTimes?.perPill?.[li] ?? (li === 0 && !customTimes?.perPill ? customTimes : null);
      const category =
        entry?.categoryId != null ? (categoryById.get(entry.categoryId) ?? null) : null;
      spans.push({
        start: ownTime?.start || entry?.defaultStartTime || category?.startTime,
        end: ownTime?.end || entry?.defaultEndTime || category?.endTime,
      });
      return {
        primaryLabel: displayParts.primaryLabel,
        secondaryLabel: displayParts.secondaryLabel,
        time: labels.length === 1 ? customTimes : ownTime,
        // A filled pill has no visible edge on the grid; a shift from another
        // area is white, edged in its own text color.
        background: homeFocusArea ? PRINT_INK.surface : style.color,
        color: foreground,
        border: homeFocusArea ? `1px solid ${borderColor(foreground)}` : FILLED_PILL_BORDER,
        wing: homeFocusArea
          ? {
              initials: getFocusAreaInitials(homeFocusArea.name),
              ...getCrossFocusBadgePalette(style),
            }
          : null,
        mentored: segments[li]?.isMentored === true,
      };
    });

    // The absence beside the shifts prints in time order with the time it
    // covers (item 50d): first when they arrived late. An untimed one, saved
    // before then, prints last with no time.
    const restOfDayAbsenceTypeId = restOfDayAbsenceTypeIdForKey?.(empId, date) ?? null;
    const absenceLayout = restOfDayAbsenceLayoutForKey?.(empId, date) ?? null;
    const restOfDay =
      restOfDayAbsenceTypeId != null ? (absenceTypeMap?.get(restOfDayAbsenceTypeId) ?? null) : null;
    const absencePill: CellPill | null = restOfDay
      ? {
          primaryLabel: isNameMode ? restOfDay.name || restOfDay.label : restOfDay.label,
          time: null,
          timeLabel: absenceLayout?.shortTime ?? null,
          ...printAbsenceFill(restOfDay),
        }
      : null;
    const absenceFirst = !!absencePill && !!absenceLayout?.first;
    const pills: CellPill[] = absencePill
      ? absenceFirst
        ? [absencePill, ...workedPills]
        : [...workedPills, absencePill]
      : workedPills;
    // Pills stack where the grid would stack them at this column's width, and
    // three always do.
    const stacked = pills.length >= 3 || stacksShifts(columnWidth, pills.length, isNameMode);
    const axis = stacked ? "stacked" : "side-by-side";
    // Pills touch only when connected in time: a shift that runs straight into
    // the next, or a shift and the absence that meets it.
    const shiftJoins = spans.slice(1).map((span, li) => timesMeet(spans[li].end, span.start));
    const absenceJoins = absencePill ? [absenceLayout?.joinsShift ?? true] : [];
    const seams = attachedPillSeams(
      axis,
      absenceFirst ? [...absenceJoins, ...shiftJoins] : [...shiftJoins, ...absenceJoins],
    );
    return {
      pills: pills.map((pill, pi) => ({
        ...pill,
        seams: seams[pi],
        spacing: gapBefore(pi, seams[pi], axis, PRINT_PILL_GAP),
      })),
      stacked,
    };
  }

  const lineBetweenDays = (index: number) =>
    `1px solid ${splitAtIndex !== undefined && index === splitAtIndex ? PRINT_INK.divider : PRINT_INK.border}`;

  return (
    <div style={{ marginBottom: "1.6em" }}>
      <div
        style={{
          fontSize: "1.5em",
          fontWeight: 600,
          color: PRINT_INK.heading,
          lineHeight: 1.2,
          marginBottom: "0.4em",
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
          background: PRINT_INK.surface,
          border: `1px solid ${PRINT_INK.border}`,
          borderRadius: "0.55em",
          overflow: "hidden",
        }}
      >
        <colgroup>
          <col style={{ width: `${NAME_COLUMN_EM}em` }} />
          {dates.map((date) => (
            <col key={formatDateKey(date)} />
          ))}
        </colgroup>

        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                padding: "0.55em 0.85em",
                fontWeight: 600,
                fontSize: "0.85em",
                color: PRINT_INK.subtle,
                letterSpacing: "0.04em",
                borderRight: `1px solid ${PRINT_INK.border}`,
                borderBottom: `1px solid ${PRINT_INK.divider}`,
                background: PRINT_INK.headerFill,
              }}
            >
              Staff
            </th>
            {dates.map((date, i) => (
              <th
                key={formatDateKey(date)}
                style={{
                  textAlign: "center",
                  padding: "0.4em 0",
                  fontWeight: 400,
                  borderLeft: lineBetweenDays(i),
                  borderBottom: `1px solid ${PRINT_INK.divider}`,
                }}
              >
                <div
                  style={{
                    fontSize: "0.85em",
                    fontWeight: 600,
                    color: PRINT_INK.subtle,
                    letterSpacing: "0.04em",
                  }}
                >
                  {DAY_LABELS[date.getDay()]}
                </div>
                <div
                  style={{
                    fontSize: "1.15em",
                    fontWeight: 700,
                    color: PRINT_INK.text,
                    lineHeight: 1.2,
                  }}
                >
                  {date.getDate()}
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {employees.map((emp, ri) => {
            // Always compact, as on the grid: a name cell has no room for a full
            // certification name, and DESIGNATION_COLORS is keyed by abbreviation.
            const certAbbr = getCertAbbr(emp.certificationId, certifications, true);
            const dc = DESIGNATION_COLORS[certAbbr] ?? DEFAULT_DESIG_COLOR;
            const displayName = getEmployeeDisplayName(emp);
            const rowLine = ri > 0 ? `1px solid ${PRINT_INK.border}` : undefined;
            // Whole-day absences on days in a row print as one bar per week (item 52).
            const absenceRuns = buildRowAbsenceRuns(
              emp.id,
              dates,
              {
                shiftForKey,
                absenceTypeIdForKey,
                hasAbsenceType: (absenceTypeId) => !!absenceTypeMap?.has(absenceTypeId),
              },
              splitAtIndex,
            );

            return (
              <tr key={emp.id} style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
                <td
                  style={{
                    padding: 0,
                    borderTop: rowLine,
                    borderRight: `1px solid ${PRINT_INK.border}`,
                  }}
                >
                  <div
                    style={{
                      padding: "0.3em 0.6em 0.3em 0.85em",
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
                            color: PRINT_INK.text,
                            lineHeight: 1.1,
                            fontSize:
                              displayName.length > 25
                                ? "0.85em"
                                : displayName.length > 18
                                  ? "0.95em"
                                  : "1em",
                          }}
                        >
                          {displayName}
                        </span>
                      </span>
                      {emp.roleIds.length > 0 && (
                        <span data-print-fit="" style={{ ...FIT_TEXT, marginTop: "0.1em" }}>
                          <span style={{ fontSize: "0.85em", color: PRINT_INK.subtle }}>
                            {getRoleAbbrs(emp.roleIds, orgRoles, true).join(", ")}
                          </span>
                        </span>
                      )}
                    </div>
                    {certAbbr && certAbbr !== "-" && (
                      <span
                        style={{
                          fontSize: "0.82em",
                          fontWeight: 700,
                          background: dc.bg,
                          color: dc.text,
                          padding: "0.15em 0.55em",
                          borderRadius: 20,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {certAbbr}
                      </span>
                    )}
                  </div>
                </td>

                {dates.map((date, di) => {
                  const assignment = shiftForKey(emp.id, date);
                  const runDay = absenceRuns.days[di];
                  const run = runDay ? absenceRuns.runs[runDay.runIndex] : null;
                  const runAbsence = run ? (absenceTypeMap?.get(run.absenceTypeId) ?? null) : null;
                  const { pills, stacked } =
                    !runDay && assignment && assignment !== "OFF"
                      ? resolveCellPills(emp.id, date, assignment)
                      : { pills: [], stacked: false };

                  return (
                    <td
                      key={formatDateKey(date)}
                      style={{
                        padding: 0,
                        verticalAlign: "middle",
                        borderTop: rowLine,
                        borderLeft: lineBetweenDays(di),
                      }}
                    >
                      <div
                        data-print-cell-layout={stacked ? "stacked" : undefined}
                        style={{
                          minHeight: cellH,
                          display: "flex",
                          flexDirection: stacked ? "column" : "row",
                          alignItems: "stretch",
                          justifyContent: "center",
                          padding: `${CELL_INSET_Y} ${cellInsetX}`,
                          position: "relative",
                        }}
                      >
                        {runDay?.position === "start" && runAbsence && (
                          <PrintAbsenceRun
                            absence={runAbsence}
                            length={runDay.length}
                            insetX={cellInsetX}
                          />
                        )}
                        {pills.map((pill, pi) => (
                          <PrintShiftPill
                            key={pi}
                            {...pill}
                            variant={pills.length === 1 ? "single" : "multi"}
                            isNameMode={isNameMode}
                            notes={
                              pi === pills.length - 1
                                ? printNoteDots(
                                    noteMarksForKey?.(emp.id, date, focusAreaId) ?? [],
                                    indicatorTypes,
                                  )
                                : undefined
                            }
                          />
                        ))}
                        {!runDay && assignment === "OFF" && (
                          <span
                            style={{
                              alignSelf: "center",
                              margin: "auto",
                              fontSize: "0.75em",
                              fontWeight: 600,
                              letterSpacing: "0.06em",
                              color: PRINT_INK.faint,
                            }}
                          >
                            OFF
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {tallyRows.map((row, ci) => (
            <TallyRow
              key={row.id}
              label={row.label}
              height={`${fontSize * 2.4}px`}
              lineBetweenDays={lineBetweenDays}
              counts={row.counts}
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
  height,
  lineBetweenDays,
  counts,
  isFirst,
}: {
  label: string;
  height: string;
  lineBetweenDays: (index: number) => string;
  counts: number[];
  isFirst: boolean;
}) {
  const rowLine = `1px solid ${PRINT_INK.border}`;
  return (
    <tr data-print-tally-row="" style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
      <td
        style={{
          padding: "0.3em 0.85em",
          height,
          borderRight: rowLine,
          borderTop: isFirst ? `1px solid ${PRINT_INK.borderStrong}` : rowLine,
        }}
      >
        <span data-print-fit="" style={FIT_TEXT}>
          <span
            style={{
              fontSize: "0.8em",
              fontWeight: 700,
              color: PRINT_INK.muted,
              letterSpacing: "0.04em",
            }}
          >
            {label}
          </span>
        </span>
      </td>
      {counts.map((count, i) => (
        <td
          key={i}
          data-print-tally-count={count}
          style={{
            textAlign: "center",
            padding: 0,
            height,
            borderLeft: lineBetweenDays(i),
            borderTop: isFirst ? `1px solid ${PRINT_INK.borderStrong}` : rowLine,
            fontSize: "0.85em",
            fontWeight: 600,
            color: count > 0 ? PRINT_INK.muted : PRINT_INK.faint,
          }}
        >
          {count}
        </td>
      ))}
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
  restOfDayAbsenceLayoutForKey?: (empId: string, date: Date) => AbsencePillLayout | null;
  absenceTypeMap?: Map<number, AbsenceType>;
  getShiftStyle: (type: string, focusAreaName?: string) => AssignmentDefinition;
  getCustomShiftTimes?: (
    empId: string,
    date: Date,
  ) => { start: string; end: string; perPill?: { start: string; end: string }[] } | null;
  /** A cell's segments, for the grid's mentored M. */
  segmentsForKey?: PrintSegmentsForKey;
  onClose: () => void;
  focusAreaLabel?: string;
  shiftDisplayMode?: ShiftDisplayMode;
  /** The page's note marks, printed in each cell with an indicator legend. */
  noteMarksForKey?: (empId: string, date: Date, focusAreaId?: number) => ScheduleNoteMark[];
  indicatorTypes?: IndicatorType[];
}

const NO_INDICATORS: IndicatorType[] = [];

const KEY_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(11em, 1fr))",
  gap: "0.5em 1.5em",
};

function KeyHeading({ children }: { children: string }) {
  return (
    <div
      style={{ fontSize: "1em", fontWeight: 600, color: PRINT_INK.heading, marginBottom: "0.7em" }}
    >
      {children}
    </div>
  );
}

function KeyGroupTitle({ children, first }: { children: string; first: boolean }) {
  return (
    <div
      style={{
        fontSize: "0.85em",
        fontWeight: 600,
        color: PRINT_INK.subtle,
        letterSpacing: "0.04em",
        margin: first ? "0 0 0.4em" : "0.9em 0 0.4em",
      }}
    >
      {children}
    </div>
  );
}

function KeyItem({ swatch, name }: { swatch: ReactNode; name: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5em", minWidth: 0 }}>
      {swatch}
      <span style={{ fontSize: "0.9em", color: PRINT_INK.text }}>{name}</span>
    </div>
  );
}

function KeySwatch({ label, style }: { label: string; style: CSSProperties }) {
  return (
    <span
      style={{
        borderRadius: PRINT_PILL_RADIUS.multi,
        padding: "0.15em 0.5em",
        fontSize: "0.9em",
        fontWeight: 600,
        flexShrink: 0,
        minWidth: "2.5em",
        textAlign: "center",
        ...style,
      }}
    >
      {label}
    </span>
  );
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
  restOfDayAbsenceTypeIdForKey,
  restOfDayAbsenceLayoutForKey,
  absenceTypeMap,
  getShiftStyle,
  getCustomShiftTimes,
  segmentsForKey,
  onClose,
  focusAreaLabel = DEFAULT_ORGANIZATION_LABELS.focusArea,
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
    () => `${formatDate(weekStart)} - ${formatDate(addDays(weekStart, spanWeeks * 7 - 1))}`,
    [weekStart, spanWeeks],
  );

  // Each printed area with its rows: everyone home there with something
  // scheduled in the range, then anyone working one of its shifts as a guest.
  const sections = useMemo(() => {
    return focusAreas
      .filter((focusArea) => selectedWings.includes(focusArea.name))
      .map((focusArea) => {
        const ownCodeIds = new Set(
          assignments.filter((st) => st.focusAreaId === focusArea.id).map((st) => st.id),
        );
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
            dates.some((date) =>
              (assignmentIdsForKey?.(e.id, date) ?? []).some((id) => ownCodeIds.has(id)),
            ),
        );
        return { focusArea, employees: [...homeEmps, ...guestEmps] };
      })
      .filter((section) => section.employees.length > 0);
  }, [
    focusAreas,
    selectedWings,
    assignments,
    employees,
    allEmployees,
    dates,
    shiftForKey,
    assignmentIdsForKey,
  ]);

  // What the printed rows show, so the key lists only what appears.
  const printed = useMemo(() => {
    const indicatorIds = new Set<number>();
    const absenceIds = new Set<number>();
    let mentored = false;
    for (const { focusArea, employees: rows } of sections) {
      for (const emp of rows) {
        for (const date of dates) {
          for (const mark of noteMarksForKey?.(emp.id, date, focusArea.id) ?? []) {
            indicatorIds.add(mark.indicatorTypeId);
          }
          for (const id of [
            absenceTypeIdForKey?.(emp.id, date),
            restOfDayAbsenceTypeIdForKey?.(emp.id, date),
          ]) {
            if (id != null && absenceTypeMap?.has(id)) absenceIds.add(id);
          }
          if (segmentsForKey?.(emp.id, date).some((segment) => segment.isMentored === true)) {
            mentored = true;
          }
        }
      }
    }
    return {
      indicators: indicatorTypes.filter((type) => indicatorIds.has(type.id)),
      absences: Array.from(absenceTypeMap?.values() ?? [])
        .filter((absence) => absenceIds.has(absence.id))
        .sort((left, right) => left.sortOrder - right.sortOrder),
      mentored,
    };
  }, [
    sections,
    dates,
    noteMarksForKey,
    absenceTypeIdForKey,
    restOfDayAbsenceTypeIdForKey,
    absenceTypeMap,
    segmentsForKey,
    indicatorTypes,
  ]);

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

  // Full shift names already say what each pill is, so only codes need a key.
  const legendGroups = isNameMode
    ? []
    : legendGroupsByFocusArea(
        assignments.filter((s) => !EXCLUDED_LEGEND.has(s.label)),
        focusAreas,
      );
  const keyedAbsences = isNameMode ? [] : printed.absences;
  const hasKey = legendGroups.length > 0 || keyedAbsences.length > 0 || printed.mentored;

  return (
    <div
      className="dg-force-light"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: PRINT_INK.surface,
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
          borderBottom: `1px solid ${PRINT_INK.border}`,
          background: PRINT_INK.headerFill,
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
              color: PRINT_INK.text,
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
              color: PRINT_INK.subtle,
            }}
          >
            {printFontSizeLabel(fontSize)} · {spanWeeks === 1 ? "1 week" : "2 weeks"} ·{" "}
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
          background: "#E5E5E5",
        }}
      >
        {/* Paper simulation on screen */}
        <div
          ref={contentRef}
          className="print-schedule-content"
          style={{
            background: PRINT_INK.surface,
            color: PRINT_INK.text,
            fontSize: `${fontSize}px`,
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            fontVariantNumeric: "tabular-nums",
            // A landscape Letter page: the preview lays out at the printed
            // width, so it wraps and shortens text where the printout will.
            width: `${PAGE_WIDTH_IN}in`,
            minHeight: "8.5in",
            margin: "0 auto",
            padding: `${PAGE_MARGIN_IN}in`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.08)",
            borderRadius: "var(--dg-radius-xs)",
          }}
        >
          {/* Print header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              marginBottom: "1.4em",
              paddingBottom: "0.7em",
              borderBottom: `1px solid ${PRINT_INK.divider}`,
            }}
          >
            <div>
              <div style={{ marginBottom: "0.7em" }}>
                <PrintBrandLockup
                  orgName={orgName}
                  wordmarkSize={fontSize * 1.6}
                  separatorHeight={fontSize * 1.45}
                  orgFontSize={fontSize}
                />
              </div>

              <div style={{ fontSize: "1.15em", fontWeight: 600, color: PRINT_INK.text }}>
                Schedule: {dateRangeLabel}
              </div>
            </div>
            <div
              data-printed-at=""
              style={{
                fontSize: "0.85em",
                color: PRINT_INK.subtle,
                textAlign: "right",
              }}
            >
              Printed {formatPrintedAt(new Date())}
            </div>
          </div>

          {sections.map(({ focusArea, employees: sectionEmps }) => (
            <PrintSection
              key={focusArea.name}
              sectionName={focusArea.name}
              focusAreaId={focusArea.id}
              employees={sectionEmps}
              dates={dates}
              shiftForKey={shiftForKey}
              absenceTypeIdForKey={absenceTypeIdForKey}
              restOfDayAbsenceTypeIdForKey={restOfDayAbsenceTypeIdForKey}
              restOfDayAbsenceLayoutForKey={restOfDayAbsenceLayoutForKey}
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
              segmentsForKey={segmentsForKey}
              splitAtIndex={splitAtIndex}
              fontSize={fontSize}
              shiftDisplayMode={shiftDisplayMode}
              noteMarksForKey={noteMarksForKey}
              indicatorTypes={indicatorTypes}
            />
          ))}

          {hasKey && (
            <div
              data-print-legend="true"
              style={{
                marginTop: "1.5em",
                paddingTop: "0.8em",
                borderTop: `1px solid ${PRINT_INK.border}`,
              }}
            >
              <KeyHeading>{isNameMode ? "Key" : "Shift key"}</KeyHeading>
              {legendGroups.map((group, index) => (
                <Fragment key={group.title ?? `group-${index}`}>
                  {group.title ? (
                    <KeyGroupTitle first={index === 0}>{group.title}</KeyGroupTitle>
                  ) : null}
                  <div style={KEY_GRID}>
                    {group.items.map((s) => (
                      <KeyItem
                        key={s.id}
                        name={s.name}
                        swatch={
                          <KeySwatch
                            label={s.label}
                            style={{
                              background: s.color,
                              color: s.text,
                              border: FILLED_PILL_BORDER,
                            }}
                          />
                        }
                      />
                    ))}
                  </div>
                </Fragment>
              ))}
              {keyedAbsences.length > 0 && (
                <div data-print-absence-key="">
                  <KeyGroupTitle first={legendGroups.length === 0}>Absences</KeyGroupTitle>
                  <div style={KEY_GRID}>
                    {keyedAbsences.map((absence) => (
                      <KeyItem
                        key={absence.id}
                        name={absence.name || absence.label}
                        swatch={
                          <KeySwatch label={absence.label} style={printAbsenceFill(absence)} />
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
              {printed.mentored && (
                <div data-print-mentored-key="" style={{ marginTop: "0.9em" }}>
                  <KeyItem
                    name="Mentored assignment"
                    swatch={
                      <span
                        style={{
                          width: "1.15em",
                          height: "1.15em",
                          borderRadius: 999,
                          border: `1px solid ${PRINT_INK.border}`,
                          color: PRINT_INK.text,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.85em",
                          fontWeight: 600,
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                      >
                        M
                      </span>
                    }
                  />
                </div>
              )}
            </div>
          )}

          {printed.indicators.length > 0 && (
            <div
              data-print-indicator-legend="true"
              data-print-legend="true"
              style={{
                marginTop: "1em",
                paddingTop: "0.8em",
                borderTop: `1px solid ${PRINT_INK.border}`,
              }}
            >
              <KeyHeading>Schedule notes</KeyHeading>
              <div style={KEY_GRID}>
                {printed.indicators.map((indicator) => (
                  <KeyItem
                    key={indicator.id}
                    name={indicator.name}
                    swatch={
                      <span
                        data-print-key-note-dot={indicator.id}
                        style={{
                          width: "0.75em",
                          height: "0.75em",
                          borderRadius: "50%",
                          background: indicator.color,
                          boxShadow: `inset 0 0 0 1px ${PRINT_INK.text}`,
                          flexShrink: 0,
                        }}
                      />
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
