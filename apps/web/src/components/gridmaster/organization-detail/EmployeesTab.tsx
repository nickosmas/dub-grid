import { EMPLOYMENT_STATUS_LABELS } from "@dubgrid/domain";
import { StatusDot } from "@/components/gridmaster/organization-detail/shared";
import { sectionStyle } from "@/lib/styles";
import { SpanTabs } from "@/components/ui/span-tabs";
import { EmptyState } from "@/components/EmptyState";
import { getEmployeeDisplayName } from "@/lib/utils";
import { type Employee } from "@/types";
import { useState } from "react";
import {
  gmHeaderStyle,
  gmTableStyle,
  gmTdStyle,
  gmThStyle,
} from "@/components/gridmaster/table-styles";

// Employees tab for the gridmaster OrganizationDetail view.

type StaffStatus = "active" | "inactive" | "removed";

const EMPTY_STATUS_TEXT: Record<StaffStatus, string> = {
  active: "No active staff",
  inactive: "No one is away",
  removed: "No one is archived",
};

export function EmployeesTab({
  active,
  inactive,
  removed,
}: {
  active: Employee[];
  inactive: Employee[];
  removed: Employee[];
}) {
  const [showStatus, setShowStatus] = useState<StaffStatus>("active");

  const list = showStatus === "active" ? active : showStatus === "inactive" ? inactive : removed;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SpanTabs<StaffStatus>
        aria-label="Staff status"
        className="self-start"
        value={showStatus}
        onChange={setShowStatus}
        items={[
          { value: "active", label: "Active", count: active.length },
          { value: "inactive", label: EMPLOYMENT_STATUS_LABELS.inactive, count: inactive.length },
          { value: "removed", label: EMPLOYMENT_STATUS_LABELS.removed, count: removed.length },
        ]}
      />

      <div style={sectionStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={gmTableStyle}>
            <thead>
              <tr>
                <th style={gmHeaderStyle("Name")}>Name</th>
                <th style={gmHeaderStyle("Status")}>Status</th>
                <th style={gmHeaderStyle("Employee ID")}>Employee ID</th>
                <th style={gmHeaderStyle("Phone")}>Phone</th>
                <th style={gmHeaderStyle("Email")}>Email</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...gmTdStyle, padding: 16 }}>
                    <EmptyState size="compact" title={EMPTY_STATUS_TEXT[showStatus]} />
                  </td>
                </tr>
              ) : (
                list.map((emp) => (
                  <tr key={emp.id}>
                    <td style={{ ...gmTdStyle, fontWeight: 600 }}>{getEmployeeDisplayName(emp)}</td>
                    <td style={gmTdStyle}>
                      <StatusDot status={emp.status} />
                    </td>
                    <td style={{ ...gmTdStyle, textAlign: "center" }}>#{emp.employeeNumber}</td>
                    <td
                      style={{
                        ...gmTdStyle,
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      {emp.phone || "-"}
                    </td>
                    <td
                      style={{
                        ...gmTdStyle,
                        fontSize: "var(--dg-fs-caption)",
                        color: "var(--dg-color-text-muted)",
                      }}
                    >
                      {emp.email || "-"}
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
