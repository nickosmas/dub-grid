import type { WeeklyStats } from "@/lib/dashboard-stats";
import StatCard from "./StatCard";
import ExpandButton from "./ExpandButton";

interface StatCardsRowProps {
  stats: WeeklyStats;
  showOT: boolean;
  isMobile: boolean;
  hasRequirements: boolean;
  prevPeriodLabel?: string;
  onExpand?: () => void;
}

export default function StatCardsRow({ stats, showOT, isMobile, hasRequirements, prevPeriodLabel = "last week", onExpand }: StatCardsRowProps) {
  const cards = [
    <StatCard
      key="shifts"
      label="Total shifts"
      dotColor="var(--color-success, #22C55E)"
      value={stats.totalShifts.value}
      subtext={`vs ${stats.totalShifts.prevValue} ${prevPeriodLabel}`}
      progress={stats.totalShifts.prevValue > 0 ? (stats.totalShifts.value / stats.totalShifts.prevValue) * 100 : 100}
      progressColor="var(--color-success, #22C55E)"
      delta={stats.totalShifts.delta}
      deltaLabel={`${stats.totalShifts.delta > 0 ? "+" : ""}${stats.totalShifts.delta}`}
    />,
    <StatCard
      key="coverage"
      label="Coverage"
      dotColor="#2563EB"
      value={hasRequirements ? `${stats.coverage.pct}%` : "\u2014"}
      subtext={hasRequirements ? `${stats.coverage.openSlots} open slot${stats.coverage.openSlots !== 1 ? "s" : ""}` : "Not configured"}
      progress={hasRequirements ? stats.coverage.pct : 0}
      progressColor="#2563EB"
      delta={hasRequirements ? stats.coverage.delta : 0}
      deltaLabel={hasRequirements ? `${stats.coverage.delta}%` : ""}
    />,
    <StatCard
      key="staff"
      label="Staff scheduled"
      dotColor="var(--color-text-subtle, #64748B)"
      value={stats.staffScheduled.scheduled}
      subtext={`of ${stats.staffScheduled.total} active`}
      progress={stats.staffScheduled.total > 0 ? (stats.staffScheduled.scheduled / stats.staffScheduled.total) * 100 : 100}
      progressColor="var(--color-text-subtle, #64748B)"
      delta={stats.staffScheduled.delta}
      deltaLabel={`${stats.staffScheduled.delta}`}
    />,
  ];

  if (showOT) {
    cards.push(
      <StatCard
        key="ot"
        label="OT alerts"
        dotColor="var(--color-danger, #DC2626)"
        value={stats.otAlerts.count}
        subtext="over 40h limit"
        progress={stats.otAlerts.count > 0 ? (stats.otAlerts.count / stats.staffScheduled.total) * 100 : 0}
        progressColor="var(--color-danger, #DC2626)"
        delta={stats.otAlerts.delta}
        deltaLabel={`${stats.otAlerts.delta}`}
        variant="danger"
      />,
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {onExpand && (
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 1 }}>
          <ExpandButton onClick={onExpand} label="Expand stats" />
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile
            ? "1fr"
            : `repeat(${cards.length}, minmax(0, 1fr))`,
          gap: 12,
        }}
      >
        {cards}
      </div>
    </div>
  );
}
