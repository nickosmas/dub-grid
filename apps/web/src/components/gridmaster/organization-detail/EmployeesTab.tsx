import { StatusDot } from "@/components/gridmaster/organization-detail/shared";
import { sectionStyle, tdStyle, thStyle } from "@/lib/styles";
import { Button } from "@/components/Button";
import { getEmployeeDisplayName } from "@/lib/utils";
import { type Employee } from "@/types";
import { useState } from "react";

// Employees tab for the gridmaster OrganizationDetail view.

export function EmployeesTab({
  active,
  inactive,
  removed,
}: {
  active: Employee[];
  inactive: Employee[];
  removed: Employee[];
}) {
  const [showStatus, setShowStatus] = useState<"active" | "inactive" | "removed">("active");

  const list = showStatus === "active" ? active : showStatus === "inactive" ? inactive : removed;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Status tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--dg-color-border)" }}>
        {[
          {
            key: "active" as const,
            label: "Active",
            count: active.length,
            color: "var(--dg-color-today-text)",
          },
          {
            key: "inactive" as const,
            label: "Inactive",
            count: inactive.length,
            color: "var(--dg-color-warning)",
          },
          {
            key: "removed" as const,
            label: "Removed",
            count: removed.length,
            color: "var(--dg-color-danger)",
          },
        ].map((tab) => {
          const isActive = showStatus === tab.key;
          return (
            <Button
              key={tab.key}
              onClick={() => setShowStatus(tab.key)}
              style={{
                padding: "8px 20px",
                fontSize: "var(--dg-fs-label)",
                fontWeight: isActive ? 700 : 500,
                color: isActive ? tab.color : "var(--dg-color-text-muted)",
                background: "transparent",
                border: "none",
                borderBottom: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: -1,
                fontFamily: "inherit",
                transition: "color 150ms ease, border-color 150ms ease",
              }}
            >
              {tab.label}
              <span
                style={{
                  fontSize: "var(--dg-fs-footnote)",
                  fontWeight: 700,
                  background: isActive ? `${tab.color}15` : "var(--dg-color-border-light)",
                  color: isActive ? tab.color : "var(--dg-color-text-faint)",
                  borderRadius: 10,
                  padding: "1px 7px",
                  minWidth: 20,
                  textAlign: "center",
                }}
              >
                {tab.count}
              </span>
            </Button>
          );
        })}
      </div>

      <div style={sectionStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Employee ID</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Email</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      color: "var(--dg-color-text-muted)",
                      padding: 32,
                    }}
                  >
                    No {showStatus} employees
                  </td>
                </tr>
              ) : (
                list.map((emp) => (
                  <tr key={emp.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{getEmployeeDisplayName(emp)}</td>
                    <td style={tdStyle}>
                      <StatusDot status={emp.status} />
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>#{emp.employeeNumber}</td>
                    <td
                      style={{
                        ...tdStyle,
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      {emp.phone || "—"}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      {emp.email || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
