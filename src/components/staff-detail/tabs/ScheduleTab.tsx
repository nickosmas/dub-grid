"use client";

import { useState, useMemo } from "react";
import type {
  Employee,
  ShiftMap,
  ShiftCode,
  FocusArea,
  ShiftCategory,
  ShiftRequest,
  RecurringShift,
} from "@/types";
import { sectionStyle, sectionHeaderStyle, sectionBodyStyle, thStyle, tdStyle } from "@/lib/styles";
import { fmt12h } from "@/lib/utils";
import {
  computeEmployeeHoursHistory,
  computeOvertimeSummary,
} from "@/lib/staff-detail-stats";
import { computeShiftDurationHours } from "@/lib/dashboard-stats";

interface ScheduleTabProps {
  employee: Employee;
  shifts: ShiftMap;
  shiftCodeById: Map<number, ShiftCode>;
  shiftCodes: ShiftCode[];
  focusAreas: FocusArea[];
  categoryById: Map<number, ShiftCategory>;
  focusAreaById: Map<number, FocusArea>;
  shiftRequests: ShiftRequest[];
  recurringShifts: RecurringShift[];
}

const WEEK_COUNT = 12;

export function ScheduleTab({
  employee,
  shifts,
  shiftCodeById,
  shiftCodes,
  focusAreas,
  categoryById,
  focusAreaById,
  shiftRequests,
}: ScheduleTabProps) {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const hoursHistory = useMemo(
    () => computeEmployeeHoursHistory(employee.id, shifts, shiftCodeById, WEEK_COUNT, 40, categoryById, focusAreaById),
    [employee.id, shifts, shiftCodeById, categoryById, focusAreaById],
  );

  const otSummary = useMemo(() => computeOvertimeSummary(hoursHistory), [hoursHistory]);

  const maxHours = useMemo(() => Math.max(...hoursHistory.map(w => w.totalHours), 1), [hoursHistory]);

  const shiftEntries = useMemo(() => {
    return Object.entries(shifts)
      .filter(([key]) => key.startsWith(`${employee.id}_`))
      .filter(([, entry]) => !entry.isDelete && entry.shiftCodeIds.length > 0)
      .map(([key, entry]) => ({
        dateKey: key.substring(key.indexOf("_") + 1),
        ...entry,
      }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [shifts, employee.id]);

  const totalPages = Math.ceil(shiftEntries.length / PAGE_SIZE);
  const pageEntries = shiftEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalShifts = shiftEntries.length;
  const avgWeeklyHours = hoursHistory.length > 0
    ? Math.round((hoursHistory.reduce((s, w) => s + w.totalHours, 0) / hoursHistory.length) * 10) / 10
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary Stats — 4-col grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatCard
          label="Avg Weekly Hours"
          value={`${avgWeeklyHours}h`}
          dotColor="var(--color-info)"
          progress={Math.min((avgWeeklyHours / 40) * 100, 100)}
          progressColor="var(--color-info)"
        />
        <StatCard
          label="Total Shifts"
          value={String(totalShifts)}
          dotColor="var(--color-primary)"
          progress={Math.min((totalShifts / 60) * 100, 100)}
          progressColor="var(--color-primary)"
        />
        <StatCard
          label="OT Weeks"
          value={String(otSummary.weeksWithOT)}
          dotColor={otSummary.weeksWithOT > 0 ? "var(--color-danger)" : "var(--color-border)"}
          progress={Math.min((otSummary.weeksWithOT / WEEK_COUNT) * 100, 100)}
          progressColor="var(--color-danger)"
        />
        <StatCard
          label="Total OT Hours"
          value={`${otSummary.totalOTHours}h`}
          dotColor={otSummary.totalOTHours > 0 ? "var(--color-danger)" : "var(--color-border)"}
          progress={Math.min((otSummary.totalOTHours / 20) * 100, 100)}
          progressColor="var(--color-danger)"
        />
      </div>

      {/* Weekly Hours Bar Chart */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Weekly Hours (Last {WEEK_COUNT} Weeks)</div>
        <div style={{ ...sectionBodyStyle, padding: "16px 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {hoursHistory.map((week) => (
              <div key={week.weekStart} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 60, fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-muted)", textAlign: "right", flexShrink: 0, fontWeight: 500 }}>
                  {week.weekLabel}
                </span>
                <div style={{ flex: 1, height: 20, background: "var(--color-bg-secondary)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min((week.totalHours / maxHours) * 100, 100)}%`,
                      background: week.isOvertime
                        ? "linear-gradient(90deg, var(--color-info) 0%, var(--color-danger) 100%)"
                        : "var(--color-info)",
                      borderRadius: 4,
                      transition: "width 300ms ease",
                    }}
                  />
                  {maxHours > 40 && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: `${(40 / maxHours) * 100}%`,
                        width: 1,
                        background: "var(--color-danger)",
                        opacity: 0.4,
                      }}
                    />
                  )}
                </div>
                <span style={{ width: 44, fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: week.isOvertime ? "var(--color-danger)" : "var(--color-text-secondary)", textAlign: "right", flexShrink: 0 }}>
                  {week.totalHours}h
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Shift History Table */}
      <div style={sectionStyle}>
        <div style={{ ...sectionHeaderStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Shift History</span>
          <span style={{ fontWeight: 500, color: "var(--color-text-faint)", fontSize: "var(--dg-fs-caption)" }}>
            {totalShifts} shift{totalShifts !== 1 ? "s" : ""}
          </span>
        </div>
        {shiftEntries.length === 0 ? (
          <div style={{ ...sectionBodyStyle, color: "var(--color-text-faint)", fontSize: "var(--dg-fs-caption)", textAlign: "center", padding: "32px 20px" }}>
            No shifts found
          </div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Shift</th>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>Hours</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {pageEntries.map((entry) => {
                  const hours = computeShiftDurationHours(
                    entry.shiftCodeIds,
                    shiftCodeById,
                    entry.customStartTime,
                    entry.customEndTime,
                    categoryById,
                    focusAreaById,
                  );
                  const date = new Date(entry.dateKey + "T00:00:00");
                  const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];

                  return (
                    <tr key={entry.dateKey} className="dg-table-row">
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600 }}>{dayName}</span>{" "}
                        <span style={{ color: "var(--color-text-muted)" }}>{entry.dateKey}</span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {entry.shiftCodeIds.map((id) => {
                            const sc = shiftCodeById.get(id);
                            return sc ? (
                              <span
                                key={id}
                                style={{
                                  display: "inline-block",
                                  padding: "1px 8px",
                                  borderRadius: 6,
                                  background: sc.color,
                                  color: sc.text,
                                  border: `1px solid ${sc.border}`,
                                  fontSize: "var(--dg-fs-footnote)",
                                  fontWeight: 700,
                                }}
                              >
                                {sc.label}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                        {entry.customStartTime && entry.customEndTime
                          ? `${fmt12h(entry.customStartTime)} – ${fmt12h(entry.customEndTime)}`
                          : "—"}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {hours > 0 ? `${Math.round(hours * 10) / 10}h` : "—"}
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            fontSize: "var(--dg-fs-badge)",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 10,
                            background: entry.isDraft ? "var(--color-warning-bg)" : "var(--color-success-bg)",
                            color: entry.isDraft ? "var(--color-warning-text)" : "var(--color-success-text)",
                          }}
                        >
                          {entry.isDraft ? "Draft" : "Published"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--color-border-light)" }}>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="dg-btn dg-btn-secondary"
                  style={{ padding: "4px 12px", fontSize: "var(--dg-fs-caption)", opacity: page === 0 ? 0.5 : 1 }}
                >
                  Previous
                </button>
                <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)", alignSelf: "center" }}>
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="dg-btn dg-btn-secondary"
                  style={{ padding: "4px 12px", fontSize: "var(--dg-fs-caption)", opacity: page >= totalPages - 1 ? 0.5 : 1 }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Shift Requests */}
      {shiftRequests.length > 0 && (
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            Shift Requests
            <span style={{ fontWeight: 500, color: "var(--color-text-faint)", marginLeft: 8, fontSize: "var(--dg-fs-caption)" }}>
              {shiftRequests.length}
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Shift</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {shiftRequests.map((req) => (
                <tr key={req.id} className="dg-table-row">
                  <td style={{ ...tdStyle, textTransform: "capitalize" }}>{req.type}</td>
                  <td style={tdStyle}>{req.requesterShiftDate}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{req.requesterShiftLabel}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        fontSize: "var(--dg-fs-badge)",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: 10,
                        background: req.status === "approved" ? "var(--color-success-bg)"
                          : req.status === "rejected" ? "var(--color-danger-bg)"
                          : "var(--color-warning-bg)",
                        color: req.status === "approved" ? "var(--color-success-text)"
                          : req.status === "rejected" ? "var(--color-danger-text)"
                          : "var(--color-warning-text)",
                        textTransform: "capitalize",
                      }}
                    >
                      {req.status.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: "var(--color-text-muted)", fontSize: "var(--dg-fs-caption)" }}>
                    {new Date(req.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  dotColor,
  progress,
  progressColor,
}: {
  label: string;
  value: string;
  dotColor: string;
  progress: number;
  progressColor: string;
}) {
  return (
    <div className="staff-stat">
      <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-subtle)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: dotColor === "var(--color-danger)" ? "var(--color-danger)" : "var(--color-text-primary)", lineHeight: 1, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      <div style={{ height: 4, background: "var(--color-border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: 4, borderRadius: 2, width: `${Math.min(100, Math.max(0, progress))}%`, background: progressColor, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}
