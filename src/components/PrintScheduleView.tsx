"use client";

import { useMemo, useRef } from "react";
import { Employee, ShiftCategory, ShiftCode, FocusArea, NamedItem } from "@/types";
import { addDays, formatDateKey, formatDate, getCertAbbr, getRoleAbbrs } from "@/lib/utils";
import { DAY_LABELS } from "@/lib/constants";
import { computeDailyTallies } from "@/lib/schedule-logic";
import { PrintConfig } from "./PrintOptionsModal";
import { DubGridLogo, DubGridWordmark } from "@/components/Logo";
import { borderColor } from "@/lib/colors";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DESIGNATION_COLORS: Record<string, { bg: string; text: string }> = {
  JLCSN: { bg: "#EDE9FE", text: "#6D28D9" },
  "CSN III": { bg: "#DBEAFE", text: "#1D4ED8" },
  "CSN II": { bg: "#CCFBF1", text: "#0E7490" },
  STAFF: { bg: "#F1F5F9", text: "#475569" },
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

// ── Per-section print grid ─────────────────────────────────────────────────

interface PrintSectionProps {
  sectionName: string;
  focusAreaId: number;
  employees: Employee[];
  dates: Date[];
  shiftForKey: (empId: string, date: Date) => string | null;
  shiftCodeIdsForKey?: (empId: string, date: Date) => number[];
  getShiftStyle: (type: string, focusAreaName?: string) => ShiftCode;
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  focusAreas: FocusArea[];
  getCustomShiftTimes?: (empId: string, date: Date) => { start: string; end: string; perPill?: { start: string; end: string }[] } | null;
  splitAtIndex?: number;
  fontSize: number;
}

function PrintSection({
  sectionName,
  focusAreaId,
  employees,
  dates,
  shiftForKey,
  shiftCodeIdsForKey,
  getShiftStyle,
  shiftCodes,
  shiftCategories,
  certifications,
  orgRoles,
  focusAreas,
  getCustomShiftTimes,
  splitAtIndex,
  fontSize,
}: PrintSectionProps) {
  if (employees.length === 0) return null;

  // Bind focus-area context so label lookups resolve the section-specific definition first.
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

  // Set of shift code IDs that belong to this section's focus area
  const sectionCodeIds = useMemo(() => {
    return new Set(
      shiftCodes.filter((sc) => sc.focusAreaId === focusAreaId).map((sc) => sc.id),
    );
  }, [shiftCodes, focusAreaId]);

  const shiftCodeIdsForKeyFn = shiftCodeIdsForKey ?? (() => []);

  const dailyTallies = useMemo(
    () => dates.map((date) => computeDailyTallies(employees, date, shiftCodeIdsForKeyFn, shiftCodeById, sectionCodeIds)),
    [dates, employees, shiftCodeIdsForKeyFn, shiftCodeById, sectionCodeIds],
  );

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

  // em-based name column; day columns fill the rest equally
  const nameColEm = 16;
  const gridTemplate = `${nameColEm}em repeat(${dates.length}, 1fr)`;

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: gridTemplate,
  };

  const cellH = `${fontSize * 3.4}px`;
  const tallyH = `${fontSize * 2.8}px`;

  return (
    <div style={{ marginBottom: "1.4em" }}>
      <div
        style={{
          fontSize: "1.3em",
          fontWeight: 700,
          color: "#1E293B",
          marginBottom: "0.5em",
          paddingLeft: "0.3em",
          breakAfter: "avoid",
        }}
      >
        {sectionName}
      </div>

      <div
        style={{
          background: "#fff",
          border: "1px solid #CBD5E1",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        {/* Header row */}
        <div style={{ ...rowStyle, borderBottom: "2px solid #0F172A" }}>
          <div style={{ padding: "0.5em 0.8em", fontWeight: 700, fontSize: "0.85em", color:"#64748B", letterSpacing: "0.08em", borderRight: "1px solid #E2E8F0", background: "#F8FAFC" }}>
            STAFF NAME
          </div>
          {dates.map((date, i) => {
            const isSplit = splitAtIndex !== undefined && i === splitAtIndex;
            return (
              <div
                key={formatDateKey(date)}
                style={{
                  textAlign: "center",
                  padding: "0.4em 0",
                  borderLeft: isSplit ? "2px solid #0F172A" : "1px solid #E2E8F0",
                }}
              >
                <div style={{ fontSize: "0.8em", fontWeight: 600, color:"#94A3B8", letterSpacing: "0.05em" }}>
                  {DAY_LABELS[date.getDay()]}
                </div>
                <div style={{ fontSize: "1.2em", fontWeight: 700, color: "#1E293B", lineHeight: 1.2, marginTop: "0.05em" }}>
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Employee rows */}
        {employees.map((emp, ri) => {
          const certAbbr = getCertAbbr(emp.certificationId, certifications);
          const dc = DESIGNATION_COLORS[certAbbr] ?? DEFAULT_DESIG_COLOR;

          return (
            <div
              key={emp.id}
              style={{
                ...rowStyle,
                background: "#fff",
                alignItems: "stretch",
                breakInside: "avoid",
                pageBreakInside: "avoid",
              }}
            >
              {/* Name cell */}
              <div
                style={{
                  padding: "0.3em 0.6em 0.3em 0.8em",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.4em",
                  minWidth: 0,
                  height: cellH,
                  borderTop: ri > 0 ? "1px solid #E2E8F0" : undefined,
                  borderRight: "1px solid #E2E8F0",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.3em" }}>
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#1E293B",
                        whiteSpace: "normal",
                        overflowWrap: "break-word",
                        lineHeight: 1.05,
                        fontSize: emp.name.length > 25 ? "0.85em" : emp.name.length > 18 ? "0.95em" : "1em",
                        display: "block",
                        maxWidth: `${nameColEm - 4}em`,
                      }}
                    >
                      {emp.name}
                    </span>
                  </div>
                  {emp.roleIds.length > 0 && (
                    <div style={{ fontSize: "0.8em", color:"#64748B", marginTop: "0.1em", whiteSpace: "nowrap" }}>
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

              {/* Shift cells */}
              {dates.map((date, di) => {
                const isSplit = splitAtIndex !== undefined && di === splitAtIndex;
                const shiftCode = shiftForKey(emp.id, date);
                const cellCodeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
                const customTimes = getCustomShiftTimes?.(emp.id, date) ?? null;

                return (
                  <div
                    key={formatDateKey(date)}
                    style={{
                      height: cellH,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative",
                      borderTop: ri > 0 && !isSplit ? "1px solid #E2E8F0" : undefined,
                      boxShadow: isSplit && ri > 0 ? "inset 0 1px 0 #E2E8F0" : undefined,
                      borderLeft: isSplit ? "2px solid #0F172A" : "1px solid #E2E8F0",
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
                            && codeEntry0.focusAreaId !== focusAreaId;
                          const crossHomeFa = isCross
                            ? focusAreas.find((fa) => fa.id === codeEntry0!.focusAreaId)
                            : undefined;
                          return (
                            <div
                              style={{
                                position: "absolute",
                                top: customTimes ? "0.25em" : "0.5em",
                                right: "0.5em",
                                bottom: customTimes ? "0.25em" : "0.5em",
                                left: "0.5em",
                                background: isCross ? "#ffffff" : style.color,
                                border: `1px solid ${borderColor(style.text)}`,
                                borderRadius: 4,
                                color: style.text,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                overflow: "hidden",
                              }}
                            >
                              {isCross && crossHomeFa && (
                                <span
                                  style={{
                                    position: "absolute",
                                    top: "0.25em",
                                    left: "0.35em",
                                    fontSize: "1em",
                                    fontWeight: 800,
                                    lineHeight: 1,
                                    background: crossHomeFa.colorBg,
                                    color: crossHomeFa.colorText,
                                    borderRadius: 3,
                                    padding: "0.1em 0.3em",
                                    letterSpacing: "0.02em",
                                  }}
                                >
                                  {getFocusAreaInitials(crossHomeFa.name)}
                                </span>
                              )}
                              <span style={{ fontWeight: 800, lineHeight: 1 }}>{label}</span>
                              {customTimes && (
                                <span style={{
                                  fontSize: "0.75em",
                                  fontWeight: 500,
                                  lineHeight: 1,
                                  marginTop: "0.3em",
                                  opacity: 0.7,
                                  letterSpacing: "0.02em",
                                }}>
                                  {fmt12hShort(customTimes.start)}–{fmt12hShort(customTimes.end)}
                                </span>
                              )}
                            </div>
                          );
                        }

                        const firstStyle = getStyleByIdOrLabel(labels[0], cellCodeIds[0]);
                        return (
                          <div
                            style={{
                              position: "absolute",
                              top: "0.5em",
                              right: "0.5em",
                              bottom: "0.5em",
                              left: "0.5em",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                borderRadius: 4,
                                overflow: "hidden",
                                border: firstStyle ? `1px solid ${borderColor(firstStyle.text)}` : "1px solid rgba(0,0,0,0.1)",
                                width: "100%",
                                height: "100%",
                              }}
                            >
                              {labels.map((label, li) => {
                                const style = getStyleByIdOrLabel(label, cellCodeIds[li]);
                                const codeEntryLi = cellCodeIds[li] != null ? shiftCodeById.get(cellCodeIds[li]) : undefined;
                                const isCross = label !== "X"
                                  && codeEntryLi?.focusAreaId != null
                                  && codeEntryLi.focusAreaId !== focusAreaId;
                                const crossHomeFaLi = isCross
                                  ? focusAreas.find((fa) => fa.id === codeEntryLi!.focusAreaId)
                                  : undefined;

                                return (
                                  <div
                                    key={li}
                                    style={{
                                      flex: 1,
                                      background: isCross ? "#ffffff" : style.color,
                                      color: style.text,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontWeight: 800,
                                      fontSize: "0.85em",
                                      borderRight:
                                        li < labels.length - 1
                                          ? `1px solid rgba(0,0,0,0.1)`
                                          : "none",
                                      position: "relative",
                                    }}
                                  >
                                    {isCross && crossHomeFaLi && (
                                      <span
                                        style={{
                                          position: "absolute",
                                          top: "0.2em",
                                          left: "0.2em",
                                          fontSize: "0.85em",
                                          fontWeight: 800,
                                          lineHeight: 1,
                                          background: crossHomeFaLi.colorBg,
                                          color: crossHomeFaLi.colorText,
                                          borderRadius: 3,
                                          padding: "0.1em 0.2em",
                                          letterSpacing: "0.02em",
                                        }}
                                      >
                                        {getFocusAreaInitials(crossHomeFaLi.name)}
                                      </span>
                                    )}
                                    {label}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div
                        style={{
                          width: "1.2em",
                          height: "0.18em",
                          background: shiftCode === "OFF" ? "#CBD5E1" : "#E2E8F0",
                          borderRadius: 2,
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Tally rows — one per active tally category for this section */}
        {tallyRows.map((row, ci) => (
          <TallyRow
            key={row.id}
            label={row.name}
            bgColor="#fff"
            gridTemplate={gridTemplate}
            height={tallyH}
            splitAtIndex={splitAtIndex}
            dailyTallies={dailyTallies.map((t) => t[row.id] ?? {})}
            isFirst={ci === 0}
          />
        ))}
      </div>
    </div>
  );
}

function TallyRow({
  label,
  bgColor,
  gridTemplate,
  height,
  splitAtIndex,
  dailyTallies,
  isFirst,
}: {
  label: string;
  bgColor: string;
  gridTemplate: string;
  height: string;
  splitAtIndex?: number;
  dailyTallies: Record<string, number>[];
  isFirst?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: gridTemplate,
        background: bgColor,
        borderTop: isFirst ? "2px solid #0F172A" : undefined,
      }}
    >
      <div
        style={{
          padding: "0.3em 0.8em",
          fontSize: "0.8em",
          fontWeight: 700,
          color: "#1E293B",
          letterSpacing: "0.04em",
          display: "flex",
          alignItems: "center",
          height,
          borderRight: "1px solid #CBD5E1",
          borderTop: !isFirst ? "1px solid #CBD5E1" : undefined,
        }}
      >
        {label}
      </div>
      {dailyTallies.map((tally, i) => {
        const entries = Object.entries(tally);
        const isSplit = splitAtIndex !== undefined && i === splitAtIndex;
        return (
          <div
            key={i}
            style={{
              textAlign: "center",
              padding: "0.2em 0.2em",
              borderLeft: isSplit ? "2px solid #0F172A" : "1px solid #CBD5E1",
              borderTop: !isFirst ? "1px solid #CBD5E1" : undefined,
              fontSize: "0.8em",
              fontWeight: 700,
              color: entries.length > 0 ? "#1E293B" : "#94A3B8",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1.3,
              height,
            }}
          >
            {entries.length === 0
              ? "-"
              : entries.map(([lbl, cnt], ei) => (
                  <span key={lbl} style={{ whiteSpace: "nowrap" }}>
                    {ei > 0 && <span style={{ color:"#94A3B8", margin: "0 0.3em" }}>|</span>}
                    {lbl}: {cnt}
                  </span>
                ))}
          </div>
        );
      })}
    </div>
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
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  shiftForKey: (empId: string, date: Date) => string | null;
  shiftCodeIdsForKey?: (empId: string, date: Date) => number[];
  getShiftStyle: (type: string, focusAreaName?: string) => ShiftCode;
  getCustomShiftTimes?: (empId: string, date: Date) => { start: string; end: string; perPill?: { start: string; end: string }[] } | null;
  onClose: () => void;
  focusAreaLabel?: string;
}

export default function PrintScheduleView({
  orgName,
  weekStart,
  config,
  employees,
  allEmployees,
  focusAreas,
  shiftCodes,
  shiftCategories,
  certifications,
  orgRoles,
  shiftForKey,
  shiftCodeIdsForKey,
  getShiftStyle,
  getCustomShiftTimes,
  onClose,
  focusAreaLabel = "Focus Areas",
}: PrintScheduleViewProps) {
  const { fontSize, selectedFocusAreas: selectedWings, spanWeeks } = config;

  // Build date array
  const dates = useMemo(() => {
    if (spanWeeks === "month") {
      const year = weekStart.getFullYear();
      const month = weekStart.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) =>
        new Date(year, month, i + 1),
      );
    }
    return Array.from({ length: spanWeeks * 7 }, (_, i) =>
      addDays(weekStart, i),
    );
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
    () =>
      focusAreas.filter(
        (w) =>
          selectedWings.length === 0 || selectedWings.includes(w.name),
      ),
    [focusAreas, selectedWings],
  );

  // Exclusive code IDs per section (matches ScheduleGrid approach)
  const exclusiveCodeIdsPerSection = useMemo(() => {
    return Object.fromEntries(
      printFocusAreas.map((w) => [
        w.name,
        new Set(shiftCodes.filter((st) => st.focusAreaId === w.id).map((st) => st.id)),
      ]),
    );
  }, [printFocusAreas, shiftCodes]);

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
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.addEventListener("afterprint", () => printWindow.close());
    }, 250);
  }

  const legendItems = shiftCodes.filter((s) => !EXCLUDED_LEGEND.has(s.label));

  return (
    <div
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
          borderBottom: "1px solid #E2E8F0",
          background: "#F8FAFC",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          className="dg-btn dg-btn-secondary"
          style={{ padding: "7px 14px" }}
        >
          ← Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, lineHeight: 1 }}>
            <DubGridLogo size={32} color="#0F172A" />
            <DubGridWordmark fontSize={20} color="#0F172A" />
          </div>
          {orgName && (
            <>
              <span style={{ color:"#94A3B8", fontSize: 20, fontWeight: 300, userSelect: "none", alignSelf: "center", marginBottom: 2 }}>|</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>
                {orgName}
              </span>
            </>
          )}
          <span style={{ color:"#94A3B8", fontSize: 20, fontWeight: 300, userSelect: "none", alignSelf: "center", marginBottom: 2 }}>|</span>
          <span style={{ fontSize: 13, fontWeight: 500, color:"#475569", lineHeight: 1 }}>
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
              fontSize: 12,
              color:"#64748B",
            }}
          >
            {fontSize <= 7 ? "Small" : fontSize >= 9 ? "Large" : "Medium"} · {spanWeeks === "month" ? "Month" : `${spanWeeks}W`} · {selectedWings.length === focusAreas.length ? `All ${focusAreaLabel.toLowerCase()}` : selectedWings.join(", ")}
          </span>
          <button
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
          </button>
        </div>
      </div>

      {/* Scrollable preview area */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "24px",
          background: "#CBD5E1",
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
              borderBottom: "2px solid #0F172A",
            }}
          >
            <div>
              {/* Logo + Wordmark + Org Name in one line */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.6em", marginBottom: "0.7em" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5em", lineHeight: 1 }}>
                  <DubGridLogo size={24} color="#0F172A" />
                  <DubGridWordmark fontSize={16} color="#0F172A" />
                </div>
                
                {orgName && (
                  <>
                    <span style={{ color: "#94A3B8", fontSize: "1.4em", fontWeight: 300, userSelect: "none", alignSelf: "center", marginTop: "-0.1em" }}>|</span>
                    <span
                      style={{
                        fontSize: "1.4em",
                        fontWeight: 800,
                        color: "#0F172A",
                        lineHeight: 1,
                      }}
                    >
                      {orgName}
                    </span>
                  </>
                )}
              </div>

              <div
                style={{
                  fontSize: "1.1em",
                  fontWeight: 600,
                  color:"#475569",
                }}
              >
                Schedule — {dateRangeLabel}
              </div>
            </div>
            <div
              style={{
                fontSize: "0.9em",
                color:"#64748B",
                textAlign: "right",
              }}
            >
              Printed {new Date().toLocaleDateString()}
            </div>
          </div>

          {/* Focus area sections */}
          {printFocusAreas.map((focusArea) => {
            const exclusiveCodeIds = exclusiveCodeIdsPerSection[focusArea.name] ?? new Set<number>();
            const homeEmps = employees.filter((e) => e.focusAreaIds.includes(focusArea.id));
            const guestEmps = allEmployees.filter(
              (e) =>
                e.focusAreaIds.length > 0 &&
                !e.focusAreaIds.includes(focusArea.id) &&
                dates.some((date) => {
                  const codeIds = shiftCodeIdsForKey?.(e.id, date) ?? [];
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
                shiftCodeIdsForKey={shiftCodeIdsForKey}
                getShiftStyle={getShiftStyle}
                shiftCodes={shiftCodes}
                shiftCategories={shiftCategories}
                certifications={certifications}
                orgRoles={orgRoles}
                focusAreas={focusAreas}
                getCustomShiftTimes={getCustomShiftTimes}
                splitAtIndex={splitAtIndex}
                fontSize={fontSize}
              />
            );
          })}

          {/* Legend */}
          {legendItems.length > 0 && (
            <div
              style={{
                marginTop: "1.5em",
                paddingTop: "0.8em",
                borderTop: "1px solid #E2E8F0",
              }}
            >
              <div
                style={{
                  fontSize: "1em",
                  fontWeight: 700,
                  color: "#1E293B",
                  marginBottom: "0.7em",
                }}
              >
                Shift Code Key
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(10em, 1fr))",
                  gap: "0.5em 1.5em",
                }}
              >
                {legendItems.map((s) => (
                  <div
                    key={s.id}
                    style={{ display: "flex", alignItems: "center", gap: "0.5em" }}
                  >
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
                        minWidth: "2.5em",
                        textAlign: "center",
                      }}
                    >
                      {s.label}
                    </span>
                    <span style={{ fontSize: "0.9em", color:"#475569" }}>
                      {s.name}
                    </span>
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
