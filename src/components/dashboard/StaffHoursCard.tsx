import type { EmployeeHours } from "@/lib/dashboard-stats";
import type { Employee, FocusArea } from "@/types";
import Link from "next/link";
import ExpandButton from "./ExpandButton";

interface StaffHoursCardProps {
  employeeHours: EmployeeHours[];
  employees: Employee[];
  focusAreas: FocusArea[];
  otThreshold?: number;
  maxVisible?: number;
  onExpand?: () => void;
}

export default function StaffHoursCard({
  employeeHours,
  employees,
  focusAreas,
  otThreshold = 40,
  maxVisible = 6,
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
    })
    .slice(0, maxVisible);

  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">
            Staff hours
          </div>
          <div className="dg-card-subtitle">
            This week &middot; {otThreshold}h limit
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link
            href="/staff"
            style={{ fontSize: 11, fontWeight: 500, color: "var(--color-primary)", cursor: "pointer", textDecoration: "none" }}
          >
            All staff &rarr;
          </Link>
          {onExpand && <ExpandButton onClick={onExpand} label="Expand staff hours" />}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {sorted.length === 0 ? (
          <div style={{ padding: "20px 18px", fontSize: 12, color: "var(--color-text-subtle)", textAlign: "center" }}>
            No shifts scheduled
          </div>
        ) : (
          sorted.map((h) => {
            const emp = empMap.get(h.empId);
            if (!emp) return null;
            const faId = emp.focusAreaIds[0];
            const fa = faId != null ? faMap.get(faId) : undefined;
            const initials = `${emp.firstName.charAt(0)}${emp.lastName.charAt(0)}`;

            return (
              <div
                key={h.empId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 18px",
                  borderBottom: "1px solid var(--color-bg)",
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
            );
          })
        )}
      </div>
    </div>
  );
}
