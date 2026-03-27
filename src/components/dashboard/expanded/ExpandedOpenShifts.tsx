import { useState, useMemo } from "react";
import type { OpenShift } from "@/lib/dashboard-stats";
import type { FocusArea } from "@/types";
import Modal from "@/components/Modal";

const BADGE_STYLES: Record<OpenShift["urgency"], { bg: string; color: string; border: string; label: string }> = {
  high: { bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", label: "Urgent" },
  medium: { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", label: "Open" },
  low: { bg: "#F0F7F0", color: "#004501", border: "#BFDFBF", label: "Open" },
};

const URGENCY_OPTIONS = ["all", "high", "medium", "low"] as const;

interface ExpandedOpenShiftsProps {
  openShifts: OpenShift[];
  focusAreas: FocusArea[];
  onClose: () => void;
}

export default function ExpandedOpenShifts({ openShifts, focusAreas, onClose }: ExpandedOpenShiftsProps) {
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | OpenShift["urgency"]>("all");
  const [focusAreaFilter, setFocusAreaFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    let list = openShifts;
    if (urgencyFilter !== "all") list = list.filter((s) => s.urgency === urgencyFilter);
    if (focusAreaFilter !== "all") list = list.filter((s) => s.focusAreaName === focusAreaFilter);
    return list;
  }, [openShifts, urgencyFilter, focusAreaFilter]);

  const focusAreaNames = useMemo(
    () => [...new Set(openShifts.map((s) => s.focusAreaName))].sort(),
    [openShifts],
  );

  return (
    <Modal title="Open shifts" onClose={onClose} style={modalStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={filterLabelStyle}>Filter:</span>
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value as typeof urgencyFilter)}
            style={selectStyle}
          >
            {URGENCY_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "all" ? "All urgency" : opt.charAt(0).toUpperCase() + opt.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={focusAreaFilter}
            onChange={(e) => setFocusAreaFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">All sections</option>
            {focusAreaNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: "var(--color-text-subtle)", marginLeft: "auto" }}>
            {filtered.length} shift{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* List */}
        <div style={{ maxHeight: "60vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 ? (
            <div style={emptyStyle}>No open shifts matching filters</div>
          ) : (
            filtered.map((shift) => {
              const badge = BADGE_STYLES[shift.urgency];
              return (
                <div key={shift.id} style={itemStyle}>
                  <div style={{ textAlign: "center", minWidth: 40 }}>
                    <div style={{ fontSize: 10, color: "var(--color-text-subtle)", fontWeight: 500 }}>
                      {shift.dayOfWeek}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)", lineHeight: 1 }}>
                      {shift.dayOfMonth}
                    </div>
                  </div>
                  <div style={{ width: 1, height: 40, background: "var(--color-border)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {shift.shiftCodeLabel}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--color-text-subtle)", marginTop: 2 }}>
                      {shift.focusAreaName}
                      {shift.timeRange && ` \u00B7 ${shift.timeRange}`}
                      {shift.needed > 1 && ` \u00B7 ${shift.needed} needed`}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: "3px 10px",
                      borderRadius: 5,
                      background: badge.bg,
                      color: badge.color,
                      border: `1px solid ${badge.border}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {badge.label}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}

const modalStyle = { maxWidth: 700, width: "90vw" };

const filterLabelStyle = {
  fontSize: 11,
  fontWeight: 600 as const,
  color: "var(--color-text-subtle)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};

const selectStyle = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 6,
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  cursor: "pointer" as const,
};

const itemStyle = {
  display: "flex" as const,
  alignItems: "center" as const,
  gap: 12,
  padding: "12px 14px",
  borderRadius: 8,
  background: "var(--color-bg, #F8FAFC)",
  border: "1px solid var(--color-border)",
};

const emptyStyle = {
  fontSize: 13,
  color: "var(--color-text-subtle)",
  textAlign: "center" as const,
  padding: "32px 0",
};
