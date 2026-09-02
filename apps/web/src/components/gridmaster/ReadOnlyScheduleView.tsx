"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { resolveShiftPillColors } from "@/lib/colors";
import { Button } from "@/components/Button";
import { sectionStyle, thStyle, tdStyle } from "@/lib/styles";
import { EmptyState } from "@/components/EmptyState";
import { addDays, formatDateKey } from "@/lib/utils";
import { getScheduleStartForSpan } from "@/lib/schedule-view";
import { queryKeys } from "@/lib/query-keys";
import {
  formatClientErrorMessage,
  formatShiftRequestStatusLabel,
  formatShiftRequestTypeLabel,
} from "@/lib/client-facing";
import {
  fetchGridmasterReadOnlySchedule,
  type GridmasterReadOnlyShiftRow as ShiftRow,
} from "@/features/gridmaster/client";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getAssignmentStyle(
  assignment: ShiftRow["assignmentDetails"][number],
  isDarkTheme: boolean,
) {
  if (!assignment.color) {
    return {
      background: "var(--dg-color-bg-secondary)",
      borderColor: assignment.border ?? "var(--dg-color-border)",
      color: assignment.text ?? "var(--dg-color-text-primary)",
    };
  }
  const resolved = resolveShiftPillColors(
    {
      color: assignment.color,
      text: assignment.text ?? "var(--dg-color-text-primary)",
      border: assignment.border ?? "var(--dg-color-border)",
    },
    isDarkTheme,
  );
  return {
    background: resolved.color,
    borderColor: resolved.border,
    color: resolved.text,
  };
}

function formatRequestIndicator(request: ShiftRow["requestIndicators"][number]) {
  const relation = request.relation === "target" ? "target person" : "requester";
  return `${formatShiftRequestTypeLabel(request.type)} request - ${formatShiftRequestStatusLabel(request.status).toLowerCase()} (${relation})`;
}

export default function ReadOnlyScheduleView({
  orgId,
  payPeriodStartDate,
}: {
  orgId: string;
  payPeriodStartDate: string | null;
}) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const [periodOffset, setPeriodOffset] = useState(0);

  const { startDate, endDate } = useMemo(() => {
    const baseStart = getScheduleStartForSpan({
      date: new Date(),
      span: 2,
      payPeriodStartDate,
    });
    const start = addDays(baseStart, periodOffset * 14);
    const end = addDays(start, 13);
    return {
      startDate: formatDateKey(start),
      endDate: formatDateKey(end),
    };
  }, [payPeriodStartDate, periodOffset]);

  const scheduleQuery = useQuery({
    queryKey: queryKeys.gridmaster.orgSchedule(orgId, startDate, endDate),
    queryFn: () => fetchGridmasterReadOnlySchedule({ orgId, startDate, endDate }),
    staleTime: 30_000,
  });
  const shifts = scheduleQuery.data?.shifts ?? [];
  const error = scheduleQuery.error
    ? formatClientErrorMessage(scheduleQuery.error, "We couldn't load this schedule right now.")
    : null;

  // Group by date
  const byDate = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const s of shifts) {
      const existing = map.get(s.date) ?? [];
      existing.push(s);
      map.set(s.date, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [shifts]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button
            className="dg-btn dg-btn-secondary"
            style={{ fontSize: "var(--dg-fs-caption)", padding: "4px 10px" }}
            onClick={() => setPeriodOffset((current) => current - 1)}
          >
            ← Prev
          </Button>
          <Button
            className="dg-btn dg-btn-secondary"
            style={{ fontSize: "var(--dg-fs-caption)", padding: "4px 10px" }}
            onClick={() => setPeriodOffset(0)}
          >
            Current Period
          </Button>
          <Button
            className="dg-btn dg-btn-secondary"
            style={{ fontSize: "var(--dg-fs-caption)", padding: "4px 10px" }}
            onClick={() => setPeriodOffset((current) => current + 1)}
          >
            Next →
          </Button>
        </div>
        <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}>
          {formatDate(startDate)} - {formatDate(endDate)} ({shifts.length} shifts)
        </span>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--dg-color-danger-bg)",
            color: "var(--dg-color-danger)",
            borderRadius: "var(--dg-radius-lg)",
            fontSize: "var(--dg-fs-label)",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {scheduleQuery.isLoading ? (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--dg-color-text-muted)",
            fontSize: "var(--dg-fs-label)",
          }}
        >
          Loading schedule…
        </div>
      ) : shifts.length === 0 ? (
        <EmptyState title="No shifts found" description="No schedule data for this date range." />
      ) : (
        byDate.map(([date, rows]) => (
          <div key={date} style={{ ...sectionStyle, marginBottom: 12 }}>
            <div
              style={{
                padding: "8px 14px",
                fontSize: "var(--dg-fs-label)",
                fontWeight: 700,
                color: "var(--dg-color-text-primary)",
                borderBottom: "1px solid var(--dg-color-border-light)",
                background: "var(--dg-color-bg-secondary)",
              }}
            >
              {formatDate(date)}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Employee</th>
                    <th style={thStyle}>Shift</th>
                    <th style={thStyle}>Focus area</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.empId}-${i}`}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{r.empName}</td>
                      <td style={tdStyle}>
                        {r.assignmentDetails.length > 0 ? (
                          <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                            {r.assignmentDetails.map((assignment) => (
                              <span
                                key={assignment.id}
                                title={[
                                  assignment.name,
                                  assignment.coverageStatus
                                    ? `Coverage ${assignment.coverageStatus.actual}/${assignment.coverageStatus.required}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                                style={{
                                  display: "inline-block",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                  fontSize: "var(--dg-fs-caption)",
                                  fontWeight: 700,
                                  border: "1px solid",
                                  ...getAssignmentStyle(assignment, isDarkTheme),
                                }}
                              >
                                {assignment.label}
                              </span>
                            ))}
                          </span>
                        ) : r.absenceLabel ? (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "1px 6px",
                              borderRadius: 4,
                              fontSize: "var(--dg-fs-caption)",
                              fontWeight: 700,
                              background: "var(--dg-color-warning-bg)",
                              color: "var(--dg-color-warning)",
                            }}
                          >
                            {r.absenceLabel}
                          </span>
                        ) : (
                          <span style={{ color: "var(--dg-color-text-faint)" }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          fontSize: "var(--dg-fs-caption)",
                          color: "var(--dg-color-text-muted)",
                        }}
                      >
                        {r.focusAreaName ??
                          r.assignmentDetails.find((assignment) => assignment.focusAreaName)
                            ?.focusAreaName ??
                          "—"}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {r.isDraft ? (
                            <span
                              style={{
                                fontSize: "var(--dg-fs-footnote)",
                                fontWeight: 600,
                                color: "var(--dg-color-warning)",
                                background: "var(--dg-color-warning-bg)",
                                padding: "1px 6px",
                                borderRadius: 4,
                              }}
                            >
                              Draft
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: "var(--dg-fs-footnote)",
                                fontWeight: 600,
                                color: "var(--dg-color-success)",
                                background: "var(--dg-color-success-bg)",
                                padding: "1px 6px",
                                borderRadius: 4,
                              }}
                            >
                              Published
                            </span>
                          )}
                          {r.requestIndicators.map((request) => (
                            <span
                              key={request.id}
                              title={formatRequestIndicator(request)}
                              style={{
                                fontSize: "var(--dg-fs-footnote)",
                                fontWeight: 600,
                                color: "var(--dg-color-today-text)",
                                background: "var(--dg-color-today-bg)",
                                padding: "1px 6px",
                                borderRadius: 4,
                              }}
                            >
                              {formatShiftRequestTypeLabel(request.type)}
                            </span>
                          ))}
                          {r.assignmentDetails.some(
                            (assignment) =>
                              assignment.coverageStatus && !assignment.coverageStatus.isMet,
                          ) && (
                            <span
                              style={{
                                fontSize: "var(--dg-fs-footnote)",
                                fontWeight: 600,
                                color: "var(--dg-color-danger)",
                                background: "var(--dg-color-danger-bg)",
                                padding: "1px 6px",
                                borderRadius: 4,
                              }}
                            >
                              Coverage
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
