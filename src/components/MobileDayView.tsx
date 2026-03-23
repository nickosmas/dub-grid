"use client";

import React, { useMemo } from "react";
import { DAY_LABELS } from "@/lib/constants";
import { formatDateKey } from "@/lib/utils";
import { computeDailyTallies } from "@/lib/schedule-logic";
import { Employee, ShiftCode, ShiftCategory, FocusArea, IndicatorType, NamedItem, DraftKind } from "@/types";
import { getCertAbbr, getEmployeeDisplayName } from "@/lib/utils";
import { borderColor, DRAFT_BORDER_COLORS } from "@/lib/colors";

interface MobileDayViewProps {
  filteredEmployees: Employee[];
  allEmployees: Employee[];
  dates: Date[];
  shiftForKey: (empId: string, date: Date) => string | null;
  shiftCodeIdsForKey?: (empId: string, date: Date) => number[];
  getShiftStyle: (type: string, focusAreaName?: string) => ShiftCode;
  handleCellClick: (emp: Employee, date: Date, focusAreaName?: string) => void;
  today: Date;
  focusAreas: FocusArea[];
  shiftCodes: ShiftCode[];
  shiftCategories: ShiftCategory[];
  indicatorTypes?: IndicatorType[];
  isCellInteractive?: boolean;
  activeIndicatorIdsForKey?: (empId: string, date: Date, focusAreaId?: number) => number[];
  activeFocusArea?: number | null;
  certifications?: NamedItem[];
  orgRoles?: NamedItem[];
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
}

function getDraftBorderStyle(draftKind: DraftKind): string | undefined {
  if (!draftKind) return undefined;
  return `2px dashed ${DRAFT_BORDER_COLORS[draftKind]}`;
}

const GRID_COLS = "100px repeat(7, 1fr)";

export default function MobileDayView({
  filteredEmployees,
  allEmployees,
  dates,
  shiftForKey,
  shiftCodeIdsForKey,
  getShiftStyle,
  handleCellClick,
  today,
  focusAreas,
  shiftCodes,
  shiftCategories,
  indicatorTypes = [],
  isCellInteractive = false,
  activeIndicatorIdsForKey,
  activeFocusArea,
  certifications = [],
  orgRoles = [],
  draftKindForKey,
}: MobileDayViewProps) {
  const todayKey = formatDateKey(today);

  // Always show exactly 7 dates (navigation handled by parent chevrons)
  const visibleDates = useMemo(
    () => dates.slice(0, 7),
    [dates],
  );

  // Build sections
  const sections = useMemo(() => {
    const allNames = focusAreas.map((w) => w.name);
    if (activeFocusArea == null) return allNames;
    const activeFA = focusAreas.find((fa) => fa.id === activeFocusArea);
    return activeFA ? allNames.filter((name) => name === activeFA.name) : allNames;
  }, [focusAreas, activeFocusArea]);

  const focusAreaIdByName = useMemo(
    () => Object.fromEntries(focusAreas.map((w) => [w.name, w.id])),
    [focusAreas],
  );

  const shiftCodeById = useMemo(
    () => new Map(shiftCodes.map((sc) => [sc.id, sc])),
    [shiftCodes],
  );

  // For each section, exclusive code IDs
  const exclusiveCodeIdsPerSection = useMemo(() => {
    return Object.fromEntries(
      sections.map((section) => {
        const focusAreaId = focusAreaIdByName[section];
        const ids = new Set(
          shiftCodes
            .filter((st) => focusAreaId != null && st.focusAreaId === focusAreaId)
            .map((st) => st.id),
        );
        return [section, ids];
      }),
    );
  }, [sections, shiftCodes, focusAreaIdByName]);

  // Focus area initials lookup (e.g. "Skilled Nursing" → "SN")
  const focusAreaInitials = useMemo(
    () => new Map(focusAreas.map((fa) => [fa.id, fa.name.split(/\s+/).map((w) => w[0]).join("").toUpperCase()])),
    [focusAreas],
  );

  // Check if any section has visible employees (for empty state)
  const hasAnySectionContent = useMemo(() => {
    return sections.some((sectionName) => {
      const sectionId = focusAreaIdByName[sectionName];
      const exclusiveCodeIds = exclusiveCodeIdsPerSection[sectionName] ?? new Set<number>();
      const rawHomeEmps = filteredEmployees.filter(
        (e) => sectionId != null && e.focusAreaIds.includes(sectionId),
      );
      const homeEmps = isCellInteractive
        ? rawHomeEmps
        : rawHomeEmps.filter((emp) =>
            visibleDates.some((date) => {
              const codeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
              return codeIds.some((id) => exclusiveCodeIds.has(id) || (shiftCodeById.get(id)?.focusAreaId == null));
            }),
          );
      const guestEmps = filteredEmployees.filter((emp) => {
        if (sectionId != null && emp.focusAreaIds.includes(sectionId)) return false;
        return visibleDates.some((date) => {
          const codeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
          return codeIds.some((id) => exclusiveCodeIds.has(id));
        });
      });
      return homeEmps.length + guestEmps.length > 0;
    });
  }, [sections, focusAreaIdByName, exclusiveCodeIdsPerSection, filteredEmployees, isCellInteractive, visibleDates, shiftCodeIdsForKey, shiftCodeById]);

  return (
    <div style={{ minHeight: "50vh" }}>
      {/* Sections */}
      {sections.map((sectionName) => {
        const sectionId = focusAreaIdByName[sectionName];
        const exclusiveCodeIds = exclusiveCodeIdsPerSection[sectionName] ?? new Set<number>();

        // Home employees — for read-only users, only show those with actual shifts
        const rawHomeEmps = filteredEmployees.filter(
          (e) => sectionId != null && e.focusAreaIds.includes(sectionId),
        );
        const homeEmps = isCellInteractive
          ? rawHomeEmps
          : rawHomeEmps.filter((emp) =>
              visibleDates.some((date) => {
                const codeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
                return codeIds.some((id) => exclusiveCodeIds.has(id) || (shiftCodeById.get(id)?.focusAreaId == null));
              }),
            );

        // Guest employees — check ALL visible dates for exclusive codes
        const guestEmps = filteredEmployees.filter((emp) => {
          if (sectionId != null && emp.focusAreaIds.includes(sectionId)) return false;
          return visibleDates.some((date) => {
            const codeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
            return codeIds.some((id) => exclusiveCodeIds.has(id));
          });
        });

        const sectionEmps = [...homeEmps, ...guestEmps];
        if (sectionEmps.length === 0) return null;

        // Tally — aggregate across all visible dates
        const tallies: Record<string, Record<string, number>> = {};
        if (shiftCodeIdsForKey) {
          for (const date of visibleDates) {
            const dayTallies = computeDailyTallies(sectionEmps, date, shiftCodeIdsForKey, shiftCodeById, exclusiveCodeIds);
            for (const [catId, catTally] of Object.entries(dayTallies)) {
              if (!tallies[catId]) tallies[catId] = {};
              for (const [label, count] of Object.entries(catTally)) {
                tallies[catId][label] = (tallies[catId][label] ?? 0) + count;
              }
            }
          }
        }

        return (
          <div key={sectionName} style={{ marginBottom: 8 }}>
            {/* Sticky section header + day columns */}
            <div
              style={{
                position: "sticky",
                top: 56,
                zIndex: 10,
                background: "var(--color-bg)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              {/* Section name */}
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 700,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {sectionName}
                <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 500, color: "var(--color-text-faint)" }}>
                  ({sectionEmps.length})
                </span>
              </div>

              {/* Day columns */}
              <div style={{
                display: "grid",
                gridTemplateColumns: GRID_COLS,
                padding: "0 12px 4px",
                alignItems: "end",
              }}>
                <div /> {/* empty name column */}
                {visibleDates.map((d) => {
                  const dk = formatDateKey(d);
                  const isToday = dk === todayKey;
                  return (
                    <div
                      key={dk}
                      style={{
                        textAlign: "center",
                        padding: "2px 0",
                        borderRadius: 8,
                        background: isToday ? "var(--color-today-bg)" : "transparent",
                      }}
                    >
                      <div style={{
                        fontSize: 9,
                        fontWeight: 500,
                        color: isToday ? "var(--color-today-text)" : "var(--color-text-faint)",
                        textTransform: "uppercase",
                        letterSpacing: "0.3px",
                      }}>
                        {DAY_LABELS[d.getDay()]}
                      </div>
                      <div style={{
                        fontSize: "var(--dg-fs-label)",
                        fontWeight: 700,
                        color: isToday ? "var(--color-today-text)" : "var(--color-text-secondary)",
                        lineHeight: 1.2,
                      }}>
                        {d.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Employee rows */}
            {sectionEmps.map((emp) => {
              const isGuest = !emp.focusAreaIds.includes(sectionId ?? -1);
              const certAbbr = emp.certificationId != null ? getCertAbbr(emp.certificationId, certifications) : null;
              const empName = getEmployeeDisplayName(emp);

              return (
                <div
                  key={emp.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID_COLS,
                    padding: "0 12px",
                    alignItems: "center",
                    minHeight: 44,
                    background: isGuest ? "var(--color-bg-secondary)" : "var(--color-surface)",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  {/* Name column */}
                  <div style={{ padding: "6px 0 6px 4px", minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        color: "var(--color-text-secondary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {empName}
                    </div>
                    {certAbbr && (
                      <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-faint)", fontWeight: 500 }}>
                        {certAbbr}
                      </div>
                    )}
                  </div>

                  {/* 7 shift cells */}
                  {visibleDates.map((date) => {
                    const dk = formatDateKey(date);
                    const isToday = dk === todayKey;
                    const codeIds = shiftCodeIdsForKey?.(emp.id, date) ?? [];
                    const draftKind = draftKindForKey?.(emp.id, date) ?? null;
                    const hasIndicators =
                      activeIndicatorIdsForKey && sectionId != null
                        ? (activeIndicatorIdsForKey(emp.id, date, sectionId)?.length ?? 0) > 0
                        : false;

                    // Build pills for all codes (supports split shifts)
                    const pills = codeIds.map((id) => {
                      const sc = shiftCodeById.get(id);
                      if (!sc) return { label: "?", bg: "var(--color-border-light)", text: "var(--color-text-subtle)", border: "var(--color-border)", foreignInitials: null, foreignBg: null, foreignText: null };
                      // Cross-wing: show initials if code belongs to a different focus area
                      const isForeign = sc.focusAreaId != null && sectionId != null && sc.focusAreaId !== sectionId;
                      const foreignInitials = isForeign ? focusAreaInitials.get(sc.focusAreaId!) ?? null : null;
                      const homeFa = isForeign ? focusAreas.find((fa) => fa.id === sc.focusAreaId) : undefined;
                      return {
                        label: sc.label,
                        bg: sc.color,
                        text: sc.text || borderColor(sc.color),
                        border: sc.border || borderColor(sc.color),
                        foreignInitials,
                        foreignBg: homeFa?.colorBg ?? null,
                        foreignText: homeFa?.colorText ?? null,
                      };
                    });

                    return (
                      <button
                        key={dk}
                        onClick={() => {
                          if (isCellInteractive) handleCellClick(emp, date, sectionName);
                        }}
                        style={{
                          minHeight: 36,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          background: isToday ? "var(--color-today-bg)" : "transparent",
                          border: "none",
                          borderLeft: "1px solid var(--color-border)",
                          cursor: isCellInteractive ? "pointer" : "default",
                          padding: "2px 1px",
                          fontFamily: "inherit",
                          gap: 1,
                        }}
                      >
                        {pills.length > 0 ? (
                          pills.map((pill, i) => {
                            const fs = pills.length > 1 ? 8 : 10;
                            const codePill = (
                              <span
                                key={i}
                                style={{
                                  fontSize: fs,
                                  fontWeight: 700,
                                  background: pill.foreignInitials ? "var(--color-surface)" : pill.bg,
                                  color: pill.text,
                                  borderRadius: pill.foreignInitials ? "0 0 2px 2px" : 3,
                                  padding: pills.length > 1 ? "1px 2px" : "2px 2px",
                                  width: pill.foreignInitials ? "100%" : "calc(100% - 2px)",
                                  textAlign: "center",
                                  lineHeight: 1.2,
                                  border: pill.foreignInitials
                                    ? "none"
                                    : (draftKind ? getDraftBorderStyle(draftKind) : "1px solid var(--color-border)"),
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  display: "block",
                                }}
                              >
                                {pill.label}
                              </span>
                            );

                            if (pill.foreignInitials) {
                              return (
                                <div
                                  key={i}
                                  style={{
                                    width: "calc(100% - 2px)",
                                    borderRadius: 3,
                                    overflow: "hidden",
                                    border: draftKind
                                      ? getDraftBorderStyle(draftKind)
                                      : "1px solid var(--color-border)",
                                    display: "flex",
                                    flexDirection: "column",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: fs,
                                      fontWeight: 700,
                                      color: pill.foreignText || "var(--color-text-secondary)",
                                      textAlign: "center",
                                      lineHeight: 1.2,
                                      padding: "1px 2px 0",
                                      background: pill.foreignBg || pill.bg,
                                    }}
                                  >
                                    {pill.foreignInitials}
                                  </span>
                                  {codePill}
                                </div>
                              );
                            }
                            return codePill;
                          })
                        ) : (
                          <span
                            style={{
                              fontSize: "var(--dg-fs-footnote)",
                              fontWeight: 500,
                              color: "var(--color-text-faint)",
                              lineHeight: 1.2,
                              textAlign: "center",
                              borderRadius: 3,
                              padding: "2px 2px",
                              width: "calc(100% - 2px)",
                              border: draftKind
                                ? getDraftBorderStyle(draftKind)
                                : "1px solid var(--color-border)",
                            }}
                          >
                            —
                          </span>
                        )}
                        {/* Indicator dot */}
                        {hasIndicators && (
                          <div
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: "50%",
                              background: "var(--color-info)",
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Tally row */}
            {Object.keys(tallies).length > 0 && (
              <div
                style={{
                  padding: "6px 16px",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  background: "var(--color-bg-secondary)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                {Object.entries(tallies).map(([catId, tally]) =>
                  Object.entries(tally).map(([label, count]) => {
                    const sc = shiftCodes.find((s) => s.label === label);
                    return (
                      <span
                        key={`${catId}-${label}`}
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          fontWeight: 600,
                          color: sc ? borderColor(sc.color) : "var(--color-text-muted)",
                          background: sc ? `${sc.color}30` : "var(--color-border-light)",
                          padding: "2px 8px",
                          borderRadius: 8,
                        }}
                      >
                        {label}: {count}
                      </span>
                    );
                  }),
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {!hasAnySectionContent && (
        <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--color-text-muted)" }}>
          <div style={{ color: "var(--color-text-faint)", background: "var(--color-bg)", padding: 12, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          </div>
          <div style={{ fontSize: "var(--dg-fs-body)", fontWeight: 600, marginBottom: 4 }}>
            No shifts found for this period
          </div>
          <div style={{ fontSize: "var(--dg-fs-label)" }}>
            {isCellInteractive
              ? "No employees are assigned to this focus area. Add employees in the Staff view."
              : "No shifts have been published for this period yet."}
          </div>
        </div>
      )}
    </div>
  );
}
