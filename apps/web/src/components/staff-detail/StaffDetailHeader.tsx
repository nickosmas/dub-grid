"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Employee } from "@/types";
import { getInitials, getEmployeeDisplayName } from "@/lib/utils";

interface StaffDetailHeaderProps {
  employee: Employee;
  canEditDetails: boolean;
  showManagementPanel: boolean;
  onToggleEditDetails: () => void;
}

export function StaffDetailHeader({
  employee,
  canEditDetails,
  showManagementPanel,
  onToggleEditDetails,
}: StaffDetailHeaderProps) {
  const displayName = getEmployeeDisplayName(employee);
  const employmentLabel =
    employee.employmentType === "part_time" ? "Part-time" : "Full-time";

  const statusConfig = {
    active: {
      label: "Active",
      style: {
        background: "var(--color-success-bg)",
        color: "var(--color-success-text)",
        borderColor: "var(--color-success-border)",
      },
    },
    benched: {
      label: "Benched",
      style: {
        background: "var(--color-warning-bg)",
        color: "var(--color-warning-text)",
        borderColor: "var(--color-warning-border)",
      },
    },
    terminated: {
      label: "Terminated",
      style: {
        background: "var(--color-danger-bg)",
        color: "var(--color-danger-text)",
        borderColor: "var(--color-danger-border)",
      },
    },
  }[employee.status];

  return (
    <div className="dg-card">
      <div className="p-4 md:p-5">
        <div className="flex flex-col gap-4 sm:gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16 shrink-0 ring-1 ring-[var(--color-border)]">
                <AvatarFallback className="bg-[var(--color-bg-secondary)] text-xl font-bold text-[var(--color-text-secondary)]">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <Badge
                  variant="outline"
                  className="px-2 font-semibold"
                  style={statusConfig.style}
                >
                  {statusConfig.label}
                </Badge>

                <h1 className="mt-3 text-[28px] font-bold tracking-tight text-[var(--color-text-primary)]">
                  {displayName}
                </h1>
              </div>
            </div>

            {canEditDetails ? (
              <button
                type="button"
                onClick={onToggleEditDetails}
                className="dg-btn dg-btn-secondary dg-btn-sm self-start"
              >
                {showManagementPanel ? "Hide Edit Details" : "Edit Details"}
              </button>
            ) : null}
          </div>

          <div className="grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <BioField label="Email" value={employee.email || "—"} />
            <BioField label="Phone" value={employee.phone || "—"} />
            <BioField label="Employment" value={employmentLabel} />
            <BioField label="Seniority" value={`#${employee.seniority}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

function BioField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[var(--dg-radius-md)] bg-[var(--color-bg)] px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div className="mt-1 truncate text-[13px] font-medium text-[var(--color-text-primary)]">
        {value}
      </div>
    </div>
  );
}
