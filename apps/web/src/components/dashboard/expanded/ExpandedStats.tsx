import { useMemo } from "react";
import type {
  ShiftMap,
  AssignmentDefinition,
  ShiftCategory,
  FocusArea,
  Employee,
  CoverageRequirement,
} from "@/types";
import type { CoverageRuleConfig } from "@dubgrid/domain";
import {
  getDatesInRange,
  addDays,
  filterShiftsByWeek,
  computeAllEmployeeHours,
  computeOTAlerts,
  computeCoveragePctAndSlots,
  countShifts,
  countStaffScheduled,
} from "@/lib/dashboard-stats";
import { formatDateKey } from "@/lib/utils";
import Modal from "@/components/Modal";

const NUM_PERIODS = 6;

interface PeriodRow {
  label: string;
  totalShifts: number;
  coveragePct: number;
  staffScheduled: number;
  otCount: number;
}

interface ExpandedStatsProps {
  allShifts: ShiftMap;
  currentWeekStart: Date;
  periodDays: number;
  activeEmployees: Employee[];
  focusAreas: FocusArea[];
  assignments: AssignmentDefinition[];
  assignmentById: Map<number, AssignmentDefinition>;
  shiftCategories: ShiftCategory[];
  coverageRequirements: CoverageRequirement[];
  categoryById: Map<number, ShiftCategory>;
  showOT: boolean;
  hasRequirements: boolean;
  overtimeThreshold?: number;
  coverageRuleConfig?: Partial<CoverageRuleConfig> | null;
  onClose: () => void;
}

export default function ExpandedStats({
  allShifts,
  currentWeekStart,
  periodDays,
  activeEmployees,
  focusAreas,
  assignments,
  assignmentById,
  coverageRequirements,
  categoryById,
  showOT,
  hasRequirements,
  overtimeThreshold = 40,
  coverageRuleConfig,
  onClose,
}: ExpandedStatsProps) {
  const periods = useMemo(() => {
    const rows: PeriodRow[] = [];

    for (let i = 0; i < NUM_PERIODS; i++) {
      const ps = addDays(currentWeekStart, -periodDays * i);
      const pe = addDays(ps, periodDays - 1);
      const pDates = getDatesInRange(ps, periodDays);
      const startKey = formatDateKey(ps);
      const endKey = formatDateKey(pe);
      const dateKeys = pDates.map(formatDateKey);

      const periodShifts = filterShiftsByWeek(allShifts, startKey, endKey);
      const totalShifts = countShifts(periodShifts, assignmentById);
      const staffScheduled = countStaffScheduled(periodShifts, assignmentById);

      const coverage = computeCoveragePctAndSlots(
        focusAreas,
        assignments,
        coverageRequirements,
        pDates,
        activeEmployees,
        periodShifts,
        coverageRuleConfig,
      );

      const hours = computeAllEmployeeHours(
        activeEmployees,
        dateKeys,
        periodShifts,
        assignmentById,
        overtimeThreshold,
        categoryById,
      );
      const otCount = computeOTAlerts(hours, activeEmployees, focusAreas).length;

      const monthDay = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
      const label = periodDays === 1 ? monthDay(ps) : `${monthDay(ps)} \u2013 ${monthDay(pe)}`;

      rows.push({ label, totalShifts, coveragePct: coverage.pct, staffScheduled, otCount });
    }

    return rows;
  }, [
    allShifts,
    currentWeekStart,
    periodDays,
    activeEmployees,
    focusAreas,
    assignments,
    assignmentById,
    coverageRequirements,
    categoryById,
    overtimeThreshold,
    coverageRuleConfig,
  ]);

  const columns = [
    { key: "totalShifts", label: "Total shifts", color: "var(--color-success)" },
    ...(hasRequirements
      ? [{ key: "coveragePct", label: "Coverage", color: "var(--color-info)" }]
      : []),
    { key: "staffScheduled", label: "Staff", color: "var(--color-text-subtle)" },
    ...(showOT ? [{ key: "otCount", label: "OT alerts", color: "var(--color-danger)" }] : []),
  ];

  const periodLabel = periodDays === 1 ? "Day" : periodDays === 7 ? "Week" : "Period";
  const periodLabelPlural = periodDays === 1 ? "days" : periodDays === 7 ? "weeks" : "periods";

  return (
    <Modal title={`${periodLabel}ly stats comparison`} onClose={onClose} style={modalStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-text-subtle)",
            padding: "14px 16px",
            borderRadius: "var(--dg-radius-md)",
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
          }}
        >
          Last {NUM_PERIODS} {periodLabelPlural} &middot; most recent first
        </div>

        <div
          style={{
            overflowX: "auto",
            border: "1px solid var(--color-border)",
            borderRadius: 18,
            background: "var(--color-bg)",
            padding: 12,
          }}
        >
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left" }}>{periodLabel}</th>
                {columns.map((col) => (
                  <th key={col.key} style={thStyle}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: col.color,
                          flexShrink: 0,
                        }}
                      />
                      {col.label}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((row, i) => {
                const prev = periods[i + 1];
                const isCurrent = i === 0;

                return (
                  <tr
                    key={row.label}
                    style={{
                      background: isCurrent ? "var(--color-bg)" : "transparent",
                    }}
                  >
                    <td
                      style={{ ...tdStyle, textAlign: "left", fontWeight: isCurrent ? 600 : 400 }}
                    >
                      {row.label}
                      {isCurrent && (
                        <span
                          style={{
                            fontSize: 9,
                            color: "var(--color-brand)",
                            marginLeft: 6,
                            fontWeight: 600,
                          }}
                        >
                          CURRENT
                        </span>
                      )}
                    </td>
                    {columns.map((col) => {
                      const val = row[col.key as keyof PeriodRow] as number;
                      const prevVal = prev ? (prev[col.key as keyof PeriodRow] as number) : null;
                      const delta = prevVal != null ? val - prevVal : null;
                      const fmt = col.key === "coveragePct" ? `${val}%` : String(val);

                      return (
                        <td key={col.key} style={tdStyle}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: 14,
                              fontFamily: "var(--font-dm-mono), 'DM Mono', monospace",
                            }}
                          >
                            {fmt}
                          </span>
                          {delta != null && delta !== 0 && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                marginLeft: 6,
                                color:
                                  col.key === "otCount"
                                    ? delta > 0
                                      ? "var(--color-danger)"
                                      : "var(--color-success)"
                                    : delta > 0
                                      ? "var(--color-success)"
                                      : "var(--color-danger)",
                              }}
                            >
                              {delta > 0 ? "\u2191" : "\u2193"}
                              {Math.abs(delta)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

const modalStyle = { maxWidth: 800, width: "90vw" };

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: 13,
};

const thStyle = {
  padding: "8px 12px",
  fontSize: 11,
  fontWeight: 600 as const,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
  textAlign: "center" as const,
  borderBottom: "2px solid var(--color-border)",
};

const tdStyle = {
  padding: "10px 12px",
  textAlign: "center" as const,
  borderBottom: "1px solid var(--color-border-light)",
  color: "var(--color-text-primary)",
};
