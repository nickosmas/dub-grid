import type { EmployeeHours } from "@/lib/dashboard-stats";
import type { Employee, FocusArea } from "@/types";
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
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
            Staff hours
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-subtle)", marginTop: 1 }}>
            This week &middot; {otThreshold}h limit
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <a
            href="/staff"
            style={{ fontSize: 11, fontWeight: 500, color: "var(--color-primary, #2D6B3A)", cursor: "pointer", textDecoration: "none" }}
          >
            All staff &rarr;
          </a>
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
                  borderBottom: "1px solid var(--color-bg, #F8FAFC)",
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
                    background: h.isOvertime ? "#FEF2F2" : "var(--color-bg-secondary, #F1F5F9)",
                    color: h.isOvertime ? "#DC2626" : "var(--color-text-secondary)",
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
                      color: h.isOvertime ? "#DC2626" : "var(--color-text-secondary)",
                    }}
                  >
                    {h.totalHours}h
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: h.isOvertime ? "#DC2626" : "var(--color-text-subtle)",
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

const cardStyle = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  overflow: "hidden" as const,
};

const headerStyle = {
  padding: "14px 18px",
  borderBottom: "1px solid var(--color-border-light, #E2E8F0)",
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
};
