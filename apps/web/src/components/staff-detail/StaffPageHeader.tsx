"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { getAvatarTypography, resolveAvatarSeed } from "@dubgrid/design-tokens";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AccessInsignia } from "@/components/staff/AccessInsignia";
import { useAvatarTone } from "@/hooks/useAvatarTone";
import { getEmployeeDisplayName, getInitials } from "@/lib/utils";
import type { Employee, OrganizationRole } from "@/types";
import { StatusMarkIcon } from "./StatusMarkIcon";

interface StaffPageHeaderProps {
  employee: Employee;
  /** The membership's role, or the one a pending invitation will grant. */
  orgRole: OrganizationRole | null;
  /** "Mentor · Skilled Nursing · Full-time" */
  summary: string;
  /** Previous and next person, beside the back link. */
  pager?: ReactNode;
  actions?: ReactNode;
}

/** Who this is and how to reach them, with the page's own actions on the right. */
export function StaffPageHeader({
  employee,
  orgRole,
  summary,
  pager,
  actions,
}: StaffPageHeaderProps) {
  const name = getEmployeeDisplayName(employee);
  const avatarTone = useAvatarTone(resolveAvatarSeed(employee));
  const faded = employee.status === "removed";

  return (
    <header className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/people"
          className="inline-flex w-fit items-center gap-1.5 text-[length:var(--dg-type-navigation-size)] font-medium text-[var(--dg-type-navigation-color)] transition-colors hover:text-[var(--dg-color-text-secondary)]"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Back to People
        </Link>
        {pager}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-5">
          <Avatar className={`h-[72px] w-[72px] shrink-0 ${faded ? "opacity-50" : ""}`}>
            <AvatarFallback
              style={{
                ...getAvatarTypography(72),
                background: avatarTone.backgroundColor,
                border: `1px solid ${avatarTone.borderColor}`,
                color: avatarTone.textColor,
              }}
            >
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="min-w-0 text-[length:var(--dg-type-page-title-size)] font-bold leading-[var(--dg-type-page-title-line-height)] tracking-tight text-[var(--dg-color-text-primary)]">
                {name}
              </h1>
              <AccessInsignia orgRole={orgRole} size="lg" />
              <StatusMarkIcon person={employee} size={20} />
            </div>
            {summary ? (
              <p className="m-0 mt-1.5 text-[15px] text-[var(--dg-color-text-secondary)]">
                {summary}
              </p>
            ) : null}
            {employee.email || employee.phone ? (
              <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 text-[14px] text-[var(--dg-color-text-secondary)]">
                {employee.email ? (
                  <a
                    href={`mailto:${employee.email}`}
                    className="text-[var(--dg-color-link)] no-underline [overflow-wrap:anywhere] hover:underline"
                  >
                    {employee.email}
                  </a>
                ) : null}
                {employee.email && employee.phone ? (
                  <span aria-hidden className="text-[var(--dg-color-text-faint)]">
                    ·
                  </span>
                ) : null}
                {employee.phone ? <span className="dg-tabular-nums">{employee.phone}</span> : null}
              </p>
            ) : null}
          </div>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
