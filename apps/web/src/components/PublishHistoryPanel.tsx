"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/Button";
import { CloseButton } from "@/components/ui/CloseButton";
import { ScrollOverflowCue } from "@/components/ui/ScrollOverflowCue";
import { Hint } from "@/components/ui/hint";
import { hint } from "@/components/ui/hint.types";
import { fetchPublishHistory } from "@/features/schedule/client";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { ButtonLoading } from "@/components/ButtonSpinner";
import { formatRelativeTime } from "@/lib/utils";
import type {
  PublishHistoryEntryWithName,
  PublishChange,
  AbsenceType,
  Employee,
  FocusArea,
  JobDefinition,
  ScheduleCellState,
  ShiftCategory,
  AssignmentDefinition,
} from "@/types";
import { useMediaQuery, MOBILE } from "@/hooks";
import { ChevronLeft, History, User } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import ProgressBar from "@/components/ProgressBar";
import {
  createAssignmentDefinitionIdByPairMap,
  deriveAssignmentDefinitionIdsFromAssignments,
} from "@/lib/shift-job-segments";
import { buildAssignableShiftDisplayMap } from "@/lib/assignable-shifts";

interface PublishHistoryPanelProps {
  orgId: string;
  open: boolean;
  onClose: () => void;
  onSelectEntry: (entry: PublishHistoryEntryWithName) => void;
  assignments: AssignmentDefinition[];
  shiftCategories: ShiftCategory[];
  jobs: JobDefinition[];
  focusAreas: FocusArea[];
  employees: Employee[];
  absenceTypes: AbsenceType[];
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  if (start === end) return s.toLocaleDateString("en-US", opts);
  return `${s.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} – ${e.toLocaleDateString("en-US", opts)}`;
}

function ChangeBreakdown({ changes }: { changes: PublishChange[] }) {
  const newCount = changes.filter((c) => c.kind === "new").length;
  const modCount = changes.filter((c) => c.kind === "modified").length;
  const delCount = changes.filter((c) => c.kind === "deleted").length;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {newCount > 0 && (
        <span
          style={{
            fontSize: "var(--dg-fs-footnote)",
            padding: "2px 6px",
            borderRadius: "var(--dg-radius-xs)",
            background: "var(--dg-color-success-bg)",
            color: "var(--dg-color-success-text)",
            fontWeight: 600,
          }}
        >
          {newCount} new
        </span>
      )}
      {modCount > 0 && (
        <span
          style={{
            fontSize: "var(--dg-fs-footnote)",
            padding: "2px 6px",
            borderRadius: "var(--dg-radius-xs)",
            background: "var(--dg-color-info-bg)",
            color: "var(--dg-color-info-text)",
            fontWeight: 600,
          }}
        >
          {modCount} modified
        </span>
      )}
      {delCount > 0 && (
        <span
          style={{
            fontSize: "var(--dg-fs-footnote)",
            padding: "2px 6px",
            borderRadius: "var(--dg-radius-xs)",
            background: "var(--dg-color-danger-bg)",
            color: "var(--dg-color-danger-text)",
            fontWeight: 600,
          }}
        >
          {delCount} removed
        </span>
      )}
    </div>
  );
}

/** Resolve a shift/absence label from change data. Shows the exact absence type. */
function resolveLabel(
  codeIds: number[] | undefined,
  state: ScheduleCellState | null | undefined,
  absenceTypeId: number | null | undefined,
  assignmentIdByPair: Map<string, number>,
  assignmentLabelMap: Map<number, string>,
  absenceTypeMap: Map<number, string>,
): string {
  if (state != null) {
    if (state.kind === "absence") {
      return absenceTypeMap.get(state.absenceTypeId ?? -1) ?? `Absence #${state.absenceTypeId}`;
    }
    if (state.kind === "worked") {
      const orderedSegments = [...state.segments].sort((a, b) => a.position - b.position);
      const derivedIds = deriveAssignmentDefinitionIdsFromAssignments(
        {
          shiftIds: orderedSegments.map((segment) => segment.shiftId),
          jobIds: orderedSegments.map((segment) => segment.jobId),
        },
        assignmentIdByPair,
      );
      if (derivedIds.length > 0) {
        return derivedIds.map((id) => assignmentLabelMap.get(id) ?? "?").join("/");
      }
    }
  }
  if (absenceTypeId != null) {
    return absenceTypeMap.get(absenceTypeId) ?? `Absence #${absenceTypeId}`;
  }
  if ((codeIds?.length ?? 0) > 0) {
    return (codeIds ?? []).map((id) => assignmentLabelMap.get(id) ?? "?").join("/");
  }
  return "";
}

/** Strip seconds from "HH:MM:SS" → "HH:MM" */
function fmtTime(t: string): string {
  const parts = t.split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : t;
}

/** Format a time range concisely */
function fmtTimeRange(start?: string | null, end?: string | null): string {
  if (start && end) return `${fmtTime(start)}–${fmtTime(end)}`;
  if (start) return fmtTime(start);
  if (end) return fmtTime(end);
  return "";
}

/** Check if canonical state + absence type are identical between from/to */
function sameCanonicalState(
  left: ScheduleCellState | null | undefined,
  right: ScheduleCellState | null | undefined,
): boolean {
  if (left == null || right == null) {
    return false;
  }
  if (left.kind !== right.kind) {
    return false;
  }
  if ((left.absenceTypeId ?? null) !== (right.absenceTypeId ?? null)) {
    return false;
  }

  const leftSegments =
    left.kind === "worked" ? [...left.segments].sort((a, b) => a.position - b.position) : [];
  const rightSegments =
    right.kind === "worked" ? [...right.segments].sort((a, b) => a.position - b.position) : [];

  return (
    leftSegments.length === rightSegments.length &&
    leftSegments.every((segment, index) => {
      const other = rightSegments[index];
      return other != null && segment.shiftId === other.shiftId && segment.jobId === other.jobId;
    })
  );
}

function sameShiftContent(change: PublishChange): boolean {
  if (change.fromState != null || change.toState != null) {
    return sameCanonicalState(change.fromState, change.toState);
  }
  const sameAbsence = (change.fromAbsenceTypeId ?? null) === (change.toAbsenceTypeId ?? null);
  const before = change.from ?? [];
  const after = change.to ?? [];
  const sameCodes = before.length === after.length && before.every((id, i) => id === after[i]);
  return sameAbsence && sameCodes;
}

/** Single change line with accurate descriptions for all edge cases */
function ChangeRow({
  change,
  assignmentIdByPair,
  assignmentLabelMap,
  absenceTypeMap,
}: {
  change: PublishChange;
  assignmentIdByPair: Map<string, number>;
  assignmentLabelMap: Map<number, string>;
  absenceTypeMap: Map<number, string>;
}) {
  const dateObj = new Date(change.date + "T00:00:00");
  const dateStr = dateObj.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const fromLabel = resolveLabel(
    change.from,
    change.fromState,
    change.fromAbsenceTypeId,
    assignmentIdByPair,
    assignmentLabelMap,
    absenceTypeMap,
  );
  const toLabel = resolveLabel(
    change.to,
    change.toState,
    change.toAbsenceTypeId,
    assignmentIdByPair,
    assignmentLabelMap,
    absenceTypeMap,
  );

  // Determine if only custom times changed (same shift/absence, different times)
  const timeOnlyChange = change.kind === "modified" && sameShiftContent(change);

  const hadTime = change.fromCustomStart || change.fromCustomEnd;
  const hasTime = change.toCustomStart || change.toCustomEnd;
  const timeAdded = !hadTime && hasTime;
  const timeRemoved = hadTime && !hasTime;
  const timeEdited =
    hadTime &&
    hasTime &&
    (change.fromCustomStart !== change.toCustomStart ||
      change.fromCustomEnd !== change.toCustomEnd);

  // Build time annotation shown below the main line
  let timeAnnotation: string | null = null;
  if (timeAdded) {
    timeAnnotation = `Added time ${fmtTimeRange(change.toCustomStart, change.toCustomEnd)}`;
  } else if (timeRemoved) {
    timeAnnotation = "Removed custom time";
  } else if (timeEdited) {
    timeAnnotation = `Edited time to ${fmtTimeRange(change.toCustomStart, change.toCustomEnd)}`;
  }

  // For time-only changes, the main description should reflect the time change, not "M → M"
  let mainDescription: React.ReactNode;
  if (change.kind === "new") {
    const timePart = hasTime ? ` (${fmtTimeRange(change.toCustomStart, change.toCustomEnd)})` : "";
    mainDescription = (
      <span style={{ color: "var(--dg-color-success-text)" }}>
        {toLabel}
        {timePart}
      </span>
    );
    timeAnnotation = null; // already shown inline
  } else if (change.kind === "deleted") {
    mainDescription = (
      <span style={{ color: "var(--dg-color-danger-text)", textDecoration: "line-through" }}>
        {fromLabel}
      </span>
    );
  } else if (timeOnlyChange) {
    // Only times changed — don't show "M → M"
    mainDescription = (
      <span>
        {toLabel} ({timeAnnotation ?? "time updated"})
      </span>
    );
    timeAnnotation = null; // already shown inline
  } else {
    mainDescription = (
      <span>
        {fromLabel} → {toLabel}
      </span>
    );
  }

  return (
    <div
      style={{
        fontSize: "var(--dg-fs-footnote)",
        color: "var(--dg-color-text-secondary)",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            flexShrink: 0,
            background:
              change.kind === "new"
                ? "var(--dg-color-success-text)"
                : change.kind === "modified"
                  ? "var(--dg-color-primary)"
                  : "var(--dg-color-danger-text)",
          }}
        />
        <span style={{ minWidth: 100 }}>{dateStr}</span>
        <span style={{ opacity: 0.5 }}>—</span>
        {mainDescription}
      </div>
      {timeAnnotation && (
        <div
          style={{
            paddingLeft: 22,
            fontSize: "var(--dg-fs-footnote)",
            color: "var(--dg-color-text-muted)",
            fontStyle: "italic",
          }}
        >
          {timeAnnotation}
        </div>
      )}
    </div>
  );
}

/** Grouped expanded view: changes grouped by employee name */
export function ExpandedChangesGrouped({
  changes,
  assignmentIdByPair,
  assignmentLabelMap,
  empNameMap,
  absenceTypeMap,
}: {
  changes: PublishChange[];
  assignmentIdByPair: Map<string, number>;
  assignmentLabelMap: Map<number, string>;
  empNameMap: Map<string, string>;
  absenceTypeMap: Map<number, string>;
}) {
  if (changes.length === 0) return null;

  // Group changes by empId
  const grouped = new Map<string, PublishChange[]>();
  for (const c of changes) {
    const existing = grouped.get(c.empId);
    if (existing) existing.push(c);
    else grouped.set(c.empId, [c]);
  }

  // Sort groups by employee name
  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    const nameA = empNameMap.get(a[0]) ?? "";
    const nameB = empNameMap.get(b[0]) ?? "";
    return nameA.localeCompare(nameB);
  });

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      {sortedGroups.map(([empId, empChanges]) => {
        const empName = empNameMap.get(empId) ?? "Unknown employee";
        // Sort changes by date within each employee group
        const sorted = [...empChanges].sort((a, b) => a.date.localeCompare(b.date));
        return (
          <div key={empId}>
            <div
              style={{
                fontSize: "var(--dg-fs-footnote)",
                fontWeight: 600,
                color: "var(--dg-color-text-primary)",
                marginBottom: 3,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <User size={12} style={{ opacity: 0.5 }} />
              {empName}
              <span style={{ fontWeight: 400, color: "var(--dg-color-text-muted)" }}>
                ({sorted.length} change{sorted.length !== 1 ? "s" : ""})
              </span>
            </div>
            <div style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
              {sorted.map((c) => (
                <ChangeRow
                  key={`${c.empId}-${c.date}-${c.kind}`}
                  change={c}
                  assignmentIdByPair={assignmentIdByPair}
                  assignmentLabelMap={assignmentLabelMap}
                  absenceTypeMap={absenceTypeMap}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PublishHistoryPanel({
  orgId,
  open,
  onClose,
  onSelectEntry,
  assignments,
  shiftCategories,
  jobs,
  focusAreas,
  employees,
  absenceTypes,
}: PublishHistoryPanelProps) {
  const isMobile = useMediaQuery(MOBILE);
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Build empId → "First Last" lookup from employees prop
  const empNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employees) {
      map.set(emp.id, `${emp.firstName} ${emp.lastName}`.trim());
    }
    return map;
  }, [employees]);
  const assignmentIdByPair = useMemo(
    () => createAssignmentDefinitionIdByPairMap(assignments),
    [assignments],
  );

  // History spells every shift and absence out in full, whatever the org's
  // shiftDisplayMode is. A change log is read long after the edit, often by
  // someone reconstructing what happened, and "D/RN → N/RN" only means
  // something to a reader who already has the codes memorized.
  const assignmentLabelMap = useMemo(
    () =>
      buildAssignableShiftDisplayMap({
        assignments,
        shiftCategories,
        jobs,
        focusAreas,
        shiftDisplayMode: "name",
      }),
    [assignments, focusAreas, jobs, shiftCategories],
  );
  const absenceTypeMap = useMemo(
    () =>
      new Map(
        absenceTypes.map((absenceType) => [absenceType.id, absenceType.name || absenceType.label]),
      ),
    [absenceTypes],
  );

  const PAGE_SIZE = 20;

  const historyQuery = useQuery({
    queryKey: queryKeys.org.publishHistory(orgId),
    queryFn: () => fetchPublishHistory(orgId, PAGE_SIZE, 0),
    enabled: open,
  });

  const entries = historyQuery.data ?? [];
  const loading = open && historyQuery.isPending;
  const hasMore = entries.length > 0 && entries.length % PAGE_SIZE === 0;

  // Latched: a second click while the page is still in flight would append the
  // same slice twice, since the offset is read from `entries.length` and that
  // has not grown yet.
  const loadMore = useAsyncAction(async () => {
    try {
      const more = await fetchPublishHistory(orgId, PAGE_SIZE, entries.length);
      queryClient.setQueryData<PublishHistoryEntryWithName[]>(
        queryKeys.org.publishHistory(orgId),
        (prev) => [...(prev ?? []), ...more],
      );
    } catch {
      // Silently fail
    }
  });

  if (!open) return null;

  const subtitle = loading ? (
    <span
      className="dg-skeleton"
      style={{
        display: "inline-block",
        width: 88,
        height: 10,
        borderRadius: "var(--dg-radius-xs)",
      }}
    />
  ) : (
    `${entries.length} publish${entries.length !== 1 ? "es" : ""}`
  );

  return (
    <>
      <div className="dg-panel-overlay" onClick={onClose} />
      <div
        className="dg-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Publish history"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? "12px 16px" : "16px 20px",
            borderBottom: "1px solid var(--dg-color-border)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
            background: "var(--dg-color-surface)",
          }}
        >
          {isMobile && (
            <Button
              onClick={onClose}
              aria-label="Back"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                background: "transparent",
                border: "none",
                borderRadius: "var(--dg-radius-md)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={20} color="var(--dg-color-text-primary)" />
            </Button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "var(--dg-fs-body)",
                fontWeight: 700,
                color: "var(--dg-color-text-secondary)",
              }}
            >
              Publish History
            </div>
            <div
              style={{
                fontSize: "var(--dg-fs-caption)",
                color: "var(--dg-color-text-subtle)",
                marginTop: 2,
              }}
            >
              {subtitle}
            </div>
          </div>
          {!isMobile && <CloseButton size="md" onClick={onClose} aria-label="Close" />}
        </div>

        <ProgressBar loading={loading} />

        {/* Body */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: isMobile ? "16px" : "20px 24px",
          }}
        >
          {loading && entries.length === 0 && (
            <div
              aria-hidden
              style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 8 }}
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    padding: 12,
                    border: "1px solid var(--dg-color-border-light)",
                    borderRadius: "var(--dg-radius-md)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    className="dg-skeleton"
                    style={{ width: 140, height: 12, borderRadius: "var(--dg-radius-xs)" }}
                  />
                  <div
                    className="dg-skeleton"
                    style={{ width: "60%", height: 10, borderRadius: "var(--dg-radius-xs)" }}
                  />
                  <div
                    className="dg-skeleton"
                    style={{ width: 84, height: 18, borderRadius: 999 }}
                  />
                </div>
              ))}
            </div>
          )}

          {!loading && entries.length === 0 && (
            <EmptyState
              size="compact"
              icon={<History size={22} />}
              title="No publish history yet"
              description="Published schedules appear here."
            />
          )}

          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const uniqueEmpCount = new Set(entry.changes.map((c) => c.empId)).size;
            return (
              <div
                key={entry.id}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid var(--dg-color-border)",
                }}
              >
                {/* Entry header row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-primary)",
                        }}
                      >
                        {entry.publishedByName}
                      </span>
                      <span
                        style={{
                          fontSize: "var(--dg-fs-footnote)",
                          color: "var(--dg-color-text-muted)",
                        }}
                      >
                        {formatRelativeTime(entry.publishedAt)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "var(--dg-fs-footnote)",
                        color: "var(--dg-color-text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      {formatDateRange(entry.startDate, entry.endDate)} — {entry.changeCount} change
                      {entry.changeCount !== 1 ? "s" : ""} for {uniqueEmpCount} employee
                      {uniqueEmpCount !== 1 ? "s" : ""}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <ChangeBreakdown changes={entry.changes} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <Button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="dg-btn dg-btn-secondary"
                      style={{ fontSize: "var(--dg-fs-footnote)", padding: "3px 8px" }}
                    >
                      {isExpanded ? "Hide" : "Details"}
                    </Button>
                    <Hint
                      content={hint(
                        "Navigate to this date range and highlight changes on the grid",
                      )}
                      side="bottom"
                    >
                      <Button
                        onClick={() => onSelectEntry(entry)}
                        className="dg-btn dg-btn-secondary"
                        style={{ fontSize: "var(--dg-fs-footnote)", padding: "3px 8px" }}
                      >
                        Show on Grid
                      </Button>
                    </Hint>
                  </div>
                </div>

                {/* Expanded detail — grouped by employee */}
                {isExpanded && (
                  <ExpandedChangesGrouped
                    changes={entry.changes}
                    assignmentIdByPair={assignmentIdByPair}
                    assignmentLabelMap={assignmentLabelMap}
                    empNameMap={empNameMap}
                    absenceTypeMap={absenceTypeMap}
                  />
                )}
              </div>
            );
          })}

          {hasMore && entries.length > 0 && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <Button
                onClick={loadMore.run}
                disabled={loadMore.isRunning}
                className="dg-btn dg-btn-secondary"
                style={{ fontSize: "var(--dg-fs-caption)", padding: "6px 16px" }}
              >
                <ButtonLoading loading={loadMore.isRunning} spinnerSize={14}>
                  Load More
                </ButtonLoading>
              </Button>
            </div>
          )}
        </div>
        <ScrollOverflowCue />
      </div>
    </>
  );
}
