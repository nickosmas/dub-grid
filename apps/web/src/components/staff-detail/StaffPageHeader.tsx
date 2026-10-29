"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { getAvatarTypography, resolveAvatarSeed } from "@dubgrid/design-tokens";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/status-pill";
import { AccessInsignia } from "@/components/staff/AccessInsignia";
import { useAvatarTone } from "@/hooks/useAvatarTone";
import { getEmployeeDisplayName, getInitials } from "@/lib/utils";
import type { Employee, OrganizationRole } from "@/types";
import { StatusMarkIcon } from "./StatusMarkIcon";

interface StaffPageHeaderProps {
  employee: Employee;
  /** The membership's role, or the one a pending invitation will grant. */
  orgRole: OrganizationRole | null;
  actions?: ReactNode;
}

/** The staff page's header: who this is, with the page's own actions on the right. */
export function StaffPageHeader({ employee, orgRole, actions }: StaffPageHeaderProps) {
  const name = getEmployeeDisplayName(employee);
  const avatarTone = useAvatarTone(resolveAvatarSeed(employee));

  return (
    <header className="flex flex-col gap-4">
      <Link
        href="/people"
        className="inline-flex w-fit items-center gap-1.5 text-[length:var(--dg-type-navigation-size)] font-medium text-[var(--dg-type-navigation-color)] transition-colors hover:text-[var(--dg-color-text-secondary)]"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Back to People
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="h-16 w-16 shrink-0">
            <AvatarFallback
              style={{
                ...getAvatarTypography(64),
                background: avatarTone.backgroundColor,
                border: `1px solid ${avatarTone.borderColor}`,
                color: avatarTone.textColor,
              }}
            >
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 text-[length:var(--dg-type-page-title-size)] font-bold leading-[var(--dg-type-page-title-line-height)] tracking-tight text-[var(--dg-color-text-primary)]">
                {name}
              </h1>
              <StatusMarkIcon person={employee} size={20} />
              <AccessInsignia orgRole={orgRole} size="lg" />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-[var(--dg-color-text-subtle)]">
              {!orgRole && <StatusPill tone="neutral">No app access</StatusPill>}
              {employee.employeeNumber != null && (
                <span>
                  Employee ID{" "}
                  <span className="dg-tabular-nums font-medium text-[var(--dg-color-text-primary)]">
                    #{employee.employeeNumber}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
