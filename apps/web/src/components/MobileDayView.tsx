"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { DAY_LABELS } from "@/lib/constants";
import { Button } from "@/components/Button";
import { formatDateKey } from "@/lib/utils";
import { computeDailyTallies } from "@/lib/schedule-logic";
import {
  Employee,
  AssignmentDefinition,
  ShiftCategory,
  FocusArea,
  IndicatorType,
  NamedItem,
  DraftKind,
  ShiftDisplayMode,
  AbsenceType,
} from "@/types";
import { getCertAbbr, getEmployeeDisplayName } from "@/lib/utils";
import { borderColor, DRAFT_BORDER_COLORS, resolveShiftPillColors } from "@/lib/colors";
import { useTheme } from "next-themes";
import { MaybeHint } from "@/components/ui/hint";
import { CalendarOff } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

function pillText(label: string, max: number): string {
  if (label.length <= max) return label;
  return label.slice(0, max - 1).trimEnd() + "\u2026";
}

interface MobileDayViewProps {
  filteredEmployees: Employee[];
  allEmployees: Employee[];
  highlightEmpIds?: Set<string>;
  highlightScrollKey?: string;
  dates: Date[];
  shiftForKey: (empId: string, date: Date) => string | null;
  assignmentIdsForKey?: (empId: string, date: Date) => number[];
  getShiftStyle: (type: string, focusAreaName?: string) => AssignmentDefinition;
  handleCellClick: (emp: Employee, date: Date, focusAreaName?: string) => void;
  todayKey: string;
  focusAreas: FocusArea[];
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  indicatorTypes?: IndicatorType[];
  isCellInteractive?: boolean;
  activeIndicatorIdsForKey?: (empId: string, date: Date, focusAreaId?: number) => number[];
  activeFocusArea?: number | null;
  certifications?: NamedItem[];
  orgRoles?: NamedItem[];
  draftKindForKey?: (empId: string, date: Date) => DraftKind;
  shiftDisplayMode?: ShiftDisplayMode;
  useCompactRoleCertificationLabels?: boolean;
  /** Returns the absence type ID for a given cell, or null if not an absence. */
  absenceTypeIdForKey?: (empId: string, date: Date) => number | null;
  /** Map from absence type ID to AbsenceType for color/label resolution. */
  absenceTypeMap?: Map<number, AbsenceType>;
}

function getDraftBorderStyle(draftKind: DraftKind): string | undefined {
  if (!draftKind) return undefined;
  return `2px dashed ${DRAFT_BORDER_COLORS[draftKind]}`;
}

const GRID_COLS = "100px repeat(7, minmax(0, 1fr))";

export default function MobileDayView({
  filteredEmployees,
  highlightEmpIds,
  highlightScrollKey,
  dates,
  shiftForKey,
  assignmentIdsForKey,
  getShiftStyle,
  handleCellClick,
  todayKey,
  focusAreas,
  assignments,
  isCellInteractive = false,
  activeIndicatorIdsForKey,
  activeFocusArea,
  certifications = [],
  draftKindForKey,
  shiftDisplayMode = "code",
  useCompactRoleCertificationLabels = false,
  absenceTypeIdForKey,
  absenceTypeMap,
}: MobileDayViewProps) {
  const isNameMode = shiftDisplayMode === "name";
  const hasHighlightedSearch = !!(highlightEmpIds && highlightEmpIds.size > 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";

  // Always show exactly 7 dates (navigation handled by parent chevrons)
  const visibleDates = useMemo(() => dates.slice(0, 7), [dates]);

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

  const assignmentById = useMemo(
    () => new Map(assignments.map((sc) => [sc.id, sc])),
    [assignments],
  );

  // For each section, exclusive code IDs
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

  // Focus area initials lookup (e.g. "Skilled Nursing" → "SN")
  const focusAreaInitials = useMemo(
    () =>
      new Map(
        focusAreas.map((fa) => [
          fa.id,
          fa.name
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .toUpperCase(),
        ]),
      ),
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
              const codeIds = assignmentIdsForKey?.(emp.id, date) ?? [];
              return codeIds.some(
                (id) => exclusiveCodeIds.has(id) || assignmentById.get(id)?.focusAreaId == null,
              );
            }),
          );
      const guestEmps = filteredEmployees.filter((emp) => {
        if (sectionId != null && emp.focusAreaIds.includes(sectionId)) return false;
        return visibleDates.some((date) => {
          const codeIds = assignmentIdsForKey?.(emp.id, date) ?? [];
          return codeIds.some((id) => exclusiveCodeIds.has(id));
        });
      });
      return homeEmps.length + guestEmps.length > 0;
    });
  }, [
    sections,
    focusAreaIdByName,
    exclusiveCodeIdsPerSection,
    filteredEmployees,
    isCellInteractive,
    visibleDates,
    assignmentIdsForKey,
    assignmentById,
  ]);

  useEffect(() => {
    if (!highlightScrollKey || !hasHighlightedSearch) return;

    const frame = window.requestAnimationFrame(() => {
      const firstHighlightedRow = rootRef.current?.querySelector<HTMLElement>(
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
    <div ref={rootRef} style={{ minHeight: "50vh" }}>
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
                const codeIds = assignmentIdsForKey?.(emp.id, date) ?? [];
                return codeIds.some(
                  (id) => exclusiveCodeIds.has(id) || assignmentById.get(id)?.focusAreaId == null,
                );
              }),
            );

        // Guest employees — check ALL visible dates for exclusive codes
        const guestEmps = filteredEmployees.filter((emp) => {
          if (sectionId != null && emp.focusAreaIds.includes(sectionId)) return false;
          return visibleDates.some((date) => {
            const codeIds = assignmentIdsForKey?.(emp.id, date) ?? [];
            return codeIds.some((id) => exclusiveCodeIds.has(id));
          });
        });

        const sectionEmps = [...homeEmps, ...guestEmps];
        if (sectionEmps.length === 0) return null;

        // Tally — aggregate across all visible dates
        const tallies: Record<string, Record<string, number>> = {};
        if (assignmentIdsForKey) {
          for (const date of visibleDates) {
            const dayTallies = computeDailyTallies(
              sectionEmps,
              date,
              assignmentIdsForKey,
              assignmentById,
              exclusiveCodeIds,
            );
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
                top: "var(--dg-app-shell-header-height)",
                zIndex: 10,
                background: "var(--dg-color-bg)",
                borderBottom: "1px solid var(--dg-color-border)",
              }}
            >
              {/* Section name */}
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: "var(--dg-fs-caption)",
                  fontWeight: 700,
                  color: "var(--dg-color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {sectionName}
                <span
                  style={{
                    fontSize: "var(--dg-fs-footnote)",
                    fontWeight: 500,
                    color: "var(--dg-color-text-faint)",
                  }}
                >
                  ({sectionEmps.length})
                </span>
              </div>

              {/* Day columns */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: GRID_COLS,
                  padding: "0 12px 4px",
                  alignItems: "end",
                }}
              >
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
                        borderRadius: "var(--dg-radius-md)",
                        background: isToday ? "var(--dg-color-today-bg)" : "transparent",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "var(--dg-type-metadata-size)",
                          fontWeight: 500,
                          color: isToday
                            ? "var(--dg-color-today-text)"
                            : "var(--dg-color-text-faint)",
                          textTransform: "uppercase",
                          letterSpacing: "0.3px",
                        }}
                      >
                        {DAY_LABELS[d.getDay()]}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--dg-fs-label)",
                          fontWeight: 700,
                          color: isToday
                            ? "var(--dg-color-today-text)"
                            : "var(--dg-color-text-secondary)",
                          lineHeight: 1.2,
                        }}
                      >
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
              const isHighlighted = hasHighlightedSearch
                ? (highlightEmpIds?.has(emp.id) ?? false)
                : true;
              const baseRowBg = isGuest
                ? "var(--dg-color-bg-secondary)"
                : "var(--dg-color-surface)";
              const rowBg =
                hasHighlightedSearch && isHighlighted
                  ? isGuest
                    ? "linear-gradient(90deg, var(--dg-color-brand-bg) 0%, var(--dg-color-bg-secondary) 100%)"
                    : "var(--dg-color-brand-bg)"
                  : baseRowBg;
              const certAbbr =
                emp.certificationId != null
                  ? getCertAbbr(
                      emp.certificationId,
                      certifications,
                      useCompactRoleCertificationLabels,
                    )
                  : null;
              const empName = getEmployeeDisplayName(emp);

              return (
                <div
                  key={emp.id}
                  data-search-highlight={hasHighlightedSearch && isHighlighted ? "true" : undefined}
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID_COLS,
                    padding: "0 12px",
                    alignItems: "center",
                    minHeight: 44,
                    background: rowBg,
                    borderBottom: "1px solid var(--dg-color-border)",
                    boxShadow:
                      hasHighlightedSearch && isHighlighted
                        ? "inset 4px 0 0 0 var(--dg-color-brand)"
                        : undefined,
                    opacity: isHighlighted ? 1 : 0.35,
                    transition: "opacity 150ms ease, background 150ms ease, box-shadow 150ms ease",
                  }}
                >
                  {/* Name column */}
                  <div style={{ padding: "6px 0 6px 4px", minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "var(--dg-fs-caption)",
                        fontWeight: 600,
                        color:
                          hasHighlightedSearch && isHighlighted
                            ? "var(--dg-color-brand)"
                            : "var(--dg-color-text-secondary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {empName}
                    </div>
                    {certAbbr && (
                      <div
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--dg-color-text-faint)",
                          fontWeight: 500,
                        }}
                      >
                        {certAbbr}
                      </div>
                    )}
                  </div>

                  {/* 7 shift cells */}
                  {visibleDates.map((date) => {
                    const dk = formatDateKey(date);
                    const isToday = dk === todayKey;
                    const combinedLabel = shiftForKey(emp.id, date) ?? "";
                    const labelParts = combinedLabel.split("/");
                    const codeIds = assignmentIdsForKey?.(emp.id, date) ?? [];
                    const draftKind = draftKindForKey?.(emp.id, date) ?? null;
                    const hasIndicators =
                      activeIndicatorIdsForKey && sectionId != null
                        ? (activeIndicatorIdsForKey(emp.id, date, sectionId)?.length ?? 0) > 0
                        : false;

                    // Check for absence (off-day) entry first
                    const absenceTypeId = absenceTypeIdForKey?.(emp.id, date) ?? null;
                    const absenceType =
                      absenceTypeId != null ? (absenceTypeMap?.get(absenceTypeId) ?? null) : null;

                    // Build pills for all codes (supports split shifts)
                    // For absence cells, synthesize a single pill from the absence type
                    const pills = absenceType
                      ? [
                          (() => {
                            const resolved = resolveShiftPillColors(
                              {
                                color: absenceType.color,
                                text: absenceType.text,
                                border: absenceType.border,
                              },
                              isDarkTheme,
                            );
                            return {
                              label: isNameMode
                                ? absenceType.name || absenceType.label
                                : absenceType.label,
                              bg: resolved.color,
                              text: resolved.text,
                              border: resolved.border,
                              foreignInitials: null,
                              foreignBg: null,
                              foreignText: null,
                            };
                          })(),
                        ]
                      : codeIds.map((id, idx) => {
                          const sc = assignmentById.get(id);
                          if (!sc) {
                            const label = labelParts[idx]?.trim() || String(id);
                            const style = getShiftStyle(label, sectionName);
                            const isForeign =
                              style.focusAreaId != null &&
                              sectionId != null &&
                              style.focusAreaId !== sectionId;
                            const foreignInitials = isForeign
                              ? (focusAreaInitials.get(style.focusAreaId!) ?? null)
                              : null;
                            const foreignBg = isForeign ? "var(--dg-color-bg-secondary)" : null;
                            const foreignText = isForeign ? "var(--dg-color-text-secondary)" : null;
                            const resolved = resolveShiftPillColors(
                              {
                                color: style.color,
                                text: style.text || borderColor(style.color),
                                border: style.border || borderColor(style.color),
                              },
                              isDarkTheme,
                            );
                            return {
                              label: isNameMode ? style.name || style.label : style.label,
                              bg: resolved.color,
                              text: resolved.text,
                              border: resolved.border,
                              foreignInitials,
                              foreignBg,
                              foreignText,
                            };
                          }
                          // Cross-wing: show initials if code belongs to a different focus area
                          const isForeign =
                            sc.focusAreaId != null &&
                            sectionId != null &&
                            sc.focusAreaId !== sectionId;
                          const foreignInitials = isForeign
                            ? (focusAreaInitials.get(sc.focusAreaId!) ?? null)
                            : null;
                          // BUG 1.10: Use distinct background color for the foreign header strip
                          // Use the shift code's own color as the home area identifier
                          const foreignBg = isForeign ? "var(--dg-color-bg-secondary)" : null;
                          const foreignText = isForeign ? "var(--dg-color-text-secondary)" : null;
                          const resolved = resolveShiftPillColors(
                            {
                              color: sc.color,
                              text: sc.text || borderColor(sc.color),
                              border: sc.border || borderColor(sc.color),
                            },
                            isDarkTheme,
                          );
                          return {
                            label: isNameMode ? sc.name || sc.label : sc.label,
                            bg: resolved.color,
                            text: resolved.text,
                            border: resolved.border,
                            foreignInitials,
                            foreignBg,
                            foreignText,
                          };
                        });

                    return (
                      <Button
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
                          background: isToday ? "var(--dg-color-today-bg)" : "transparent",
                          border: "none",
                          borderLeft: "1px solid var(--dg-color-border)",
                          cursor: isCellInteractive ? "pointer" : "default",
                          padding: "2px 1px",
                          fontFamily: "inherit",
                          gap: 1,
                        }}
                      >
                        {pills.length > 0 ? (
                          pills.map((pill, pillIdx) => {
                            const fs = pills.length > 1 ? 8 : 10;
                            const codePill = (
                              <span
                                key={`pill-${pill.label}-${pillIdx}`}
                                style={{
                                  fontSize: fs,
                                  fontWeight: 700,
                                  background: pill.foreignInitials
                                    ? "var(--dg-color-surface)"
                                    : pill.bg,
                                  color: pill.text,
                                  borderRadius: pill.foreignInitials ? "0 0 2px 2px" : 3,
                                  padding: pills.length > 1 ? "2px 4px" : "2px 4px",
                                  width: pill.foreignInitials ? "100%" : "calc(100% - 2px)",
                                  textAlign: "center",
                                  lineHeight: 1.2,
                                  border: pill.foreignInitials
                                    ? "none"
                                    : draftKind
                                      ? getDraftBorderStyle(draftKind)
                                      : "1px solid var(--dg-color-border)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  display: "block",
                                }}
                              >
                                <MaybeHint content={isNameMode ? pill.label : undefined} side="top">
                                  <span
                                    style={{
                                      overflow: "hidden",
                                      display: "block",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {isNameMode ? pillText(pill.label, 10) : pill.label}
                                  </span>
                                </MaybeHint>
                              </span>
                            );

                            if (pill.foreignInitials) {
                              return (
                                <div
                                  key={`foreign-${pill.label}-${pillIdx}`}
                                  style={{
                                    width: "calc(100% - 2px)",
                                    borderRadius: 3,
                                    overflow: "hidden",
                                    border: draftKind
                                      ? getDraftBorderStyle(draftKind)
                                      : "1px solid var(--dg-color-border)",
                                    display: "flex",
                                    flexDirection: "column",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: fs,
                                      fontWeight: 700,
                                      color: pill.foreignText || "var(--dg-color-text-secondary)",
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
                              color: "var(--dg-color-text-faint)",
                              lineHeight: 1.2,
                              textAlign: "center",
                              borderRadius: 3,
                              padding: "2px 2px",
                              width: "calc(100% - 2px)",
                              border: draftKind
                                ? getDraftBorderStyle(draftKind)
                                : "1px solid var(--dg-color-border)",
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
                              background: "var(--dg-color-info)",
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </Button>
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
                  background: "var(--dg-color-bg-secondary)",
                  borderBottom: "1px solid var(--dg-color-border)",
                }}
              >
                {Object.entries(tallies).map(([catId, tally]) =>
                  Object.entries(tally).map(([label, count]) => {
                    const sc = assignments.find((s) => s.label === label || s.name === label);
                    const displayLabel = isNameMode && sc ? sc.name || sc.label : label;
                    return (
                      <MaybeHint
                        key={`${catId}-${label}`}
                        content={isNameMode ? `${displayLabel}: ${count}` : undefined}
                        side="top"
                      >
                        <span
                          style={{
                            fontSize: "var(--dg-fs-footnote)",
                            fontWeight: 600,
                            color: sc ? borderColor(sc.color) : "var(--dg-color-text-muted)",
                            background: sc ? `${sc.color}30` : "var(--dg-color-border-light)",
                            padding: "2px 8px",
                            borderRadius: "var(--dg-radius-md)",
                            maxWidth: isNameMode ? 140 : undefined,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {displayLabel}: {count}
                        </span>
                      </MaybeHint>
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
        <EmptyState
          size="compact"
          icon={<CalendarOff size={22} />}
          title="No shifts found for this period"
          description={
            isCellInteractive
              ? "No employees are assigned to this focus area. Add employees in the Staff view."
              : "No shifts have been published for this period yet."
          }
        />
      )}
    </div>
  );
}
