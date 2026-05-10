import Link from "next/link";
import type { EmployeeHours } from "@/lib/dashboard-stats";
import { getAvatarInitials } from "@/lib/utils";
import type { Employee, FocusArea } from "@/types";
import ExpandButton from "./ExpandButton";
import DashboardEmptyState from "./DashboardEmptyState";

interface StaffHoursCardProps {
  employeeHours: EmployeeHours[];
  employees: Employee[];
  focusAreas: FocusArea[];
  otThreshold?: number;
  maxVisible?: number;
  heading?: string;
  subtitle?: string;
  emptyMessage?: string;
  onExpand?: () => void;
}

export default function StaffHoursCard({
  employeeHours,
  employees,
  focusAreas,
  otThreshold = 40,
  maxVisible = 5,
  heading = "Staff hours",
  subtitle,
  emptyMessage = "No shifts scheduled",
  onExpand,
}: StaffHoursCardProps) {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const faMap = new Map(focusAreas.map((fa) => [fa.id, fa]));

  // Sort: OT first (desc), then by hours (desc)
  const sorted = [...employeeHours]
    .filter((h) => h.totalHours > 0)
    .sort((a, b) => {
      if (a.isOvertime !== b.isOvertime) return a.isOvertime ? -1 : 1;
      return b.totalHours - a.totalHours;
    });
  const visible = sorted.slice(0, maxVisible);
  const remainingCount = Math.max(0, sorted.length - visible.length);

  return (
    <div className="dg-card" style={{ display: "flex", flexDirection: "column" }}>
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">
            {heading}
          </div>
          <div className="dg-card-subtitle">
            {subtitle ?? `This week · ${otThreshold}h limit`}
          </div>
        </div>
        {onExpand && <ExpandButton onClick={onExpand} label="Expand staff hours" />}
      </div>

      {visible.length === 0 ? (
        <div className="dg-card-body" style={{ display: "flex", flex: 1 }}>
          <DashboardEmptyState
            title={emptyMessage}
            variant="inline"
            style={{ flex: 1 }}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {visible.map((h) => {
            const emp = empMap.get(h.empId);
            if (!emp) return null;
            const faId = emp.focusAreaIds[0];
            const fa = faId != null ? faMap.get(faId) : undefined;
            const initials = getAvatarInitials(
              `${emp.firstName} ${emp.lastName}`,
            );

            return (
              <Link
                key={h.empId}
                href={`/people/${emp.id}`}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--color-border-light)",
                    margin: "0 16px",
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 7,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                      background: h.isOvertime ? "var(--color-danger-bg)" : "var(--color-bg-secondary)",
                      color: h.isOvertime ? "var(--color-danger)" : "var(--color-text-secondary)",
                    }}
                  >
                    {initials}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {emp.firstName.charAt(0)}. {emp.lastName}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--color-text-subtle)" }}>
                      {fa?.name ?? ""}
                    </div>
                  </div>

                  {/* Hours */}
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: "var(--font-dm-mono), 'DM Mono', monospace",
                        color: h.isOvertime ? "var(--color-danger)" : "var(--color-text-secondary)",
                      }}
                    >
                      {h.totalHours}h
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: h.isOvertime ? "var(--color-danger)" : "var(--color-text-subtle)",
                      }}
                    >
                      {h.isOvertime ? `+${h.overtimeHours}h OT` : `of ${otThreshold}h`}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
          {remainingCount > 0 && (
            <div
              style={{
                padding: "10px 16px 16px",
                margin: "0 16px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-text-subtle)",
              }}
            >
              {remainingCount} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
