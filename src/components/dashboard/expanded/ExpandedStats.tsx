import { useMemo } from "react";
import type {
  ShiftMap,
  ShiftCode,
  ShiftCategory,
  FocusArea,
  Employee,
  CoverageRequirement,
} from "@/types";
import {
  getDatesInRange,
  addDays,
  formatDateKey,
  filterShiftsByWeek,
  computeAllEmployeeHours,
  computeOTAlerts,
  computeCoveragePctAndSlots,
  countShifts,
  countStaffScheduled,
} from "@/lib/dashboard-stats";
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
  shiftCodes: ShiftCode[];
  shiftCodeById: Map<number, ShiftCode>;
  shiftCategories: ShiftCategory[];
  coverageRequirements: CoverageRequirement[];
  categoryById: Map<number, ShiftCategory>;
  focusAreaById: Map<number, FocusArea>;
  showOT: boolean;
  hasRequirements: boolean;
  onClose: () => void;
}

export default function ExpandedStats({
  allShifts,
  currentWeekStart,
  periodDays,
  activeEmployees,
  focusAreas,
  shiftCodes,
  shiftCodeById,
  shiftCategories,
  coverageRequirements,
  categoryById,
  focusAreaById,
  showOT,
  hasRequirements,
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
      const totalShifts = countShifts(periodShifts, shiftCodeById);
      const staffScheduled = countStaffScheduled(periodShifts, shiftCodeById);

      const coverage = computeCoveragePctAndSlots(
        focusAreas, shiftCodes, coverageRequirements,
        pDates, activeEmployees, periodShifts,
      );

      const hours = computeAllEmployeeHours(
        activeEmployees, dateKeys, periodShifts,
        shiftCodeById, 40, categoryById, focusAreaById,
      );
      const otCount = computeOTAlerts(hours, activeEmployees, focusAreas).length;

      const monthDay = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
      const label = periodDays === 1
        ? monthDay(ps)
        : `${monthDay(ps)} \u2013 ${monthDay(pe)}`;

      rows.push({ label, totalShifts, coveragePct: coverage.pct, staffScheduled, otCount });
    }

    return rows;
  }, [
    allShifts, currentWeekStart, periodDays, activeEmployees, focusAreas, shiftCodes,
    shiftCodeById, shiftCategories, coverageRequirements, categoryById, focusAreaById,
  ]);

  const columns = [
    { key: "totalShifts", label: "Total shifts", color: "var(--color-success, #22C55E)" },
    ...(hasRequirements ? [{ key: "coveragePct", label: "Coverage", color: "#2563EB" }] : []),
    { key: "staffScheduled", label: "Staff", color: "var(--color-text-subtle, #64748B)" },
    ...(showOT ? [{ key: "otCount", label: "OT alerts", color: "var(--color-danger, #DC2626)" }] : []),
  ];

  const periodLabel = periodDays === 1 ? "Day" : periodDays === 7 ? "Week" : "Period";
  const periodLabelPlural = periodDays === 1 ? "days" : periodDays === 7 ? "weeks" : "periods";

  return (
    <Modal title={`${periodLabel}ly stats comparison`} onClose={onClose} style={modalStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>
          Last {NUM_PERIODS} {periodLabelPlural} &middot; most recent first
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left" }}>{periodLabel}</th>
                {columns.map((col) => (
                  <th key={col.key} style={thStyle}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
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
                      background: isCurrent ? "var(--color-bg, #F8FAFC)" : "transparent",
                    }}
                  >
                    <td style={{ ...tdStyle, textAlign: "left", fontWeight: isCurrent ? 600 : 400 }}>
                      {row.label}
                      {isCurrent && (
                        <span style={{ fontSize: 9, color: "var(--color-primary, #2D6B3A)", marginLeft: 6, fontWeight: 600 }}>
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
                          <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt}</span>
                          {delta != null && delta !== 0 && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                marginLeft: 6,
                                color: col.key === "otCount"
                                  ? (delta > 0 ? "#DC2626" : "#2D6B3A")
                                  : (delta > 0 ? "#2D6B3A" : "#DC2626"),
                              }}
                            >
                              {delta > 0 ? "\u2191" : "\u2193"}{Math.abs(delta)}
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
  borderBottom: "1px solid var(--color-border-light, #E2E8F0)",
  color: "var(--color-text-primary)",
};
