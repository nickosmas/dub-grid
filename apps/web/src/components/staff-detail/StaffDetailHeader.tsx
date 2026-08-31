"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import type { Employee } from "@/types";
import { getInitials, getEmployeeDisplayName } from "@/lib/utils";

interface StaffDetailHeaderProps {
  employee: Employee;
  actions?: ReactNode;
}

export function StaffDetailHeader({ employee, actions }: StaffDetailHeaderProps) {
  const displayName = getEmployeeDisplayName(employee);
  const employmentLabel = employee.employmentType === "part_time" ? "Part-time" : "Full-time";

  const statusConfig = {
    active: {
      label: "Active",
      style: {
        background: "var(--dg-color-success-bg)",
        color: "var(--dg-color-success-text)",
        borderColor: "var(--dg-color-success-border)",
      },
    },
    inactive: {
      label: "Inactive",
      style: {
        background: "var(--dg-color-warning-bg)",
        color: "var(--dg-color-warning-text)",
        borderColor: "var(--dg-color-warning-border)",
      },
    },
    removed: {
      label: "Removed",
      style: {
        background: "var(--dg-color-danger-bg)",
        color: "var(--dg-color-danger-text)",
        borderColor: "var(--dg-color-danger-border)",
      },
    },
  }[employee.status];

  return (
    <header className="pb-2">
      <div className="flex flex-col gap-4 sm:gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 shrink-0 ring-1 ring-[var(--dg-color-border)]">
              <AvatarFallback className="bg-[var(--dg-color-bg-secondary)] text-xl font-bold text-[var(--dg-color-text-secondary)]">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="px-2 font-semibold" style={statusConfig.style}>
                  {statusConfig.label}
                </Badge>
                <span
                  className="font-mono text-[13px] font-medium text-[var(--dg-color-text-faint)]"
                  aria-label="Employee ID"
                >
                  #{employee.employeeNumber}
                </span>
              </div>

              <h1 className="mt-3 text-[length:var(--dg-fs-page-title)] font-bold tracking-tight text-[var(--dg-color-text-primary)]">
                {displayName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start">{actions}</div>
        </div>

        <div className="grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <BioField label="Email" value={employee.email || "—"} />
          <BioField label="Phone" value={employee.phone || "—"} />
          <BioField label="Employment" value={employmentLabel} />
          <BioField label="Employee ID" value={`#${employee.employeeNumber}`} />
        </div>
      </div>
    </header>
  );
}

function BioField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[var(--dg-radius-md)] bg-[var(--dg-color-bg)] px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--dg-color-text-subtle)]">
        {label}
      </div>
      <div className="mt-1 truncate text-[13px] font-medium text-[var(--dg-color-text-primary)]">
        {value}
      </div>
    </div>
  );
}
