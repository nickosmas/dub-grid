"use client";

import { useMemo, useCallback } from "react";
import type {
  Employee,
  ShiftMap,
  ShiftCode,
  FocusArea,
  NamedItem,
  ShiftCategory,
  RecurringShift,
} from "@/types";
import { sectionStyle, sectionHeaderStyle, sectionBodyStyle, thStyle, tdStyle } from "@/lib/styles";
import {
  computeEmployeeHoursHistory,
  computeShiftDistribution,
  computeDayPattern,
  computeFocusAreaDistribution,
  computeOvertimeSummary,
  generateEmployeeCSV,
} from "@/lib/staff-detail-stats";

interface ReportsTabProps {
  employee: Employee;
  shifts: ShiftMap;
  shiftCodeById: Map<number, ShiftCode>;
  shiftCodes: ShiftCode[];
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  categoryById: Map<number, ShiftCategory>;
  focusAreaById: Map<number, FocusArea>;
  recurringShifts: RecurringShift[];
}

const WEEK_COUNT = 12;

export function ReportsTab({
  employee,
  shifts,
  shiftCodeById,
  shiftCodes,
  focusAreas,
  certifications,
  orgRoles,
  categoryById,
  focusAreaById,
  recurringShifts,
}: ReportsTabProps) {
  const hoursHistory = useMemo(
    () => computeEmployeeHoursHistory(employee.id, shifts, shiftCodeById, WEEK_COUNT, 40, categoryById, focusAreaById),
    [employee.id, shifts, shiftCodeById, categoryById, focusAreaById],
  );
  const shiftDist = useMemo(
    () => computeShiftDistribution(employee.id, shifts, shiftCodeById),
    [employee.id, shifts, shiftCodeById],
  );
  const dayPattern = useMemo(
    () => computeDayPattern(employee.id, shifts, shiftCodeById),
    [employee.id, shifts, shiftCodeById],
  );
  const faDist = useMemo(
    () => computeFocusAreaDistribution(employee.id, shifts, shiftCodeById, focusAreas),
    [employee.id, shifts, shiftCodeById, focusAreas],
  );
  const otSummary = useMemo(() => computeOvertimeSummary(hoursHistory), [hoursHistory]);

  const maxDayCount = useMemo(() => Math.max(...dayPattern.map(d => d.count), 1), [dayPattern]);

  const handleExportCSV = useCallback(() => {
    const csv = generateEmployeeCSV(
      employee,
      shifts,
      shiftCodeById,
      focusAreas,
      certifications,
      orgRoles,
      recurringShifts,
      hoursHistory,
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${employee.firstName}_${employee.lastName}_report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [employee, shifts, shiftCodeById, focusAreas, certifications, orgRoles, recurringShifts, hoursHistory]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Export button */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleExportCSV}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 20px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-text-secondary)",
            fontWeight: 600,
            fontSize: "var(--dg-fs-body-sm)",
            cursor: "pointer",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Shift Code Distribution */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>Shift Code Distribution</div>
          <div style={sectionBodyStyle}>
            {shiftDist.length === 0 ? (
              <div style={{ color: "var(--color-text-faint)", fontSize: "var(--dg-fs-caption)" }}>
                No shift data available
              </div>
            ) : (
              <>
                {/* Donut */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <DonutChart
                    segments={shiftDist.map(d => ({
                      value: d.count,
                      color: d.color,
                      label: d.label,
                    }))}
                    size={140}
                    label={`${shiftDist.reduce((s, d) => s + d.count, 0)}`}
                    subLabel="shifts"
                  />
                </div>
                {/* Legend */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {shiftDist.map((d) => (
                    <div key={d.shiftCodeId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                          {d.name}
                        </span>
                      </div>
                      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                        {d.count} ({d.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Focus Area Distribution */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>Focus Area Distribution</div>
          <div style={sectionBodyStyle}>
            {faDist.length === 0 ? (
              <div style={{ color: "var(--color-text-faint)", fontSize: "var(--dg-fs-caption)" }}>
                No shift data available
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <DonutChart
                    segments={faDist.map(d => ({
                      value: d.shiftCount,
                      color: d.colorBg,
                      label: d.name,
                    }))}
                    size={140}
                    label={`${faDist.reduce((s, d) => s + d.shiftCount, 0)}`}
                    subLabel="shifts"
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {faDist.map((d) => (
                    <div key={d.focusAreaId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: d.colorBg, flexShrink: 0 }} />
                        <span style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                          {d.name}
                        </span>
                      </div>
                      <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                        {d.shiftCount} ({d.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Day-of-Week Pattern */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Day-of-Week Pattern</div>
        <div style={{ ...sectionBodyStyle, display: "flex", gap: 8, justifyContent: "center" }}>
          {dayPattern.map((d) => (
            <div key={d.dayIndex} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1, maxWidth: 80 }}>
              <div style={{ width: "100%", height: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                <div
                  style={{
                    width: "60%",
                    height: `${Math.max((d.count / maxDayCount) * 100, 4)}%`,
                    background: d.count > 0 ? "var(--color-info)" : "var(--color-border-light)",
                    borderRadius: "4px 4px 0 0",
                    transition: "height 300ms ease",
                  }}
                />
              </div>
              <span style={{ fontSize: "var(--dg-fs-badge)", fontWeight: 700, color: "var(--color-text-muted)" }}>
                {d.day}
              </span>
              <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                {d.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Overtime Summary */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Overtime Summary (Last {WEEK_COUNT} Weeks)</div>
        <div style={{ ...sectionBodyStyle, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase" }}>
              Weeks with OT
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: otSummary.weeksWithOT > 0 ? "var(--color-danger)" : "var(--color-text-primary)", marginTop: 4 }}>
              {otSummary.weeksWithOT}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase" }}>
              Total OT Hours
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: otSummary.totalOTHours > 0 ? "var(--color-danger)" : "var(--color-text-primary)", marginTop: 4 }}>
              {otSummary.totalOTHours}h
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase" }}>
              Avg OT/Week
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: otSummary.avgOTPerWeek > 0 ? "var(--color-danger)" : "var(--color-text-primary)", marginTop: 4 }}>
              {otSummary.avgOTPerWeek}h
            </div>
          </div>
        </div>
      </div>

      {/* Hours Table */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>Weekly Hours Detail</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Week</th>
              <th style={thStyle}>Hours</th>
              <th style={thStyle}>Shifts</th>
              <th style={thStyle}>Overtime</th>
            </tr>
          </thead>
          <tbody>
            {[...hoursHistory].reverse().map((week) => (
              <tr key={week.weekStart}>
                <td style={tdStyle}>{week.weekStart}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{week.totalHours}h</td>
                <td style={tdStyle}>{week.shiftCount}</td>
                <td style={{ ...tdStyle, color: week.isOvertime ? "var(--color-danger)" : "var(--color-text-muted)", fontWeight: week.isOvertime ? 600 : 400 }}>
                  {week.isOvertime ? `+${week.overtimeHours}h` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Donut Chart (SVG) ──────────────────────────────────

interface DonutSegment {
  value: number;
  color: string;
  label: string;
}

function DonutChart({
  segments,
  size,
  label,
  subLabel,
}: {
  segments: DonutSegment[];
  size: number;
  label: string;
  subLabel: string;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let accumulatedOffset = 0;
  const arcs = segments.map((seg) => {
    const ratio = seg.value / total;
    const dashLength = circumference * ratio;
    const dashOffset = circumference - accumulatedOffset;
    accumulatedOffset += dashLength;
    return { ...seg, dashLength, dashOffset };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background track */}
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--color-border-light)" strokeWidth={16} />
      {/* Segments */}
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={arc.color}
          strokeWidth={16}
          strokeDasharray={`${arc.dashLength} ${circumference - arc.dashLength}`}
          strokeDashoffset={arc.dashOffset}
          transform={`rotate(-90 ${center} ${center})`}
          strokeLinecap="butt"
        />
      ))}
      {/* Center text */}
      <text x={center} y={center - 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--color-text-primary)">
        {label}
      </text>
      <text x={center} y={center + 12} textAnchor="middle" fontSize="10" fontWeight="500" fill="var(--color-text-muted)">
        {subLabel}
      </text>
    </svg>
  );
}
