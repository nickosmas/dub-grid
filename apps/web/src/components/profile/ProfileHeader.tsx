"use client";

import type { ReactNode } from "react";
import { getAvatarTypography } from "@dubgrid/design-tokens";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AccessInsignia } from "@/components/staff/AccessInsignia";
import { StatusMarkIcon } from "@/components/staff-detail/StatusMarkIcon";
import { useAvatarTone } from "@/hooks/useAvatarTone";
import { getInitials } from "@/lib/utils";
import type { Employee, OrganizationRole } from "@/types";

interface ProfileHeaderProps {
  name: string;
  avatarSeed: string;
  orgRole: OrganizationRole | null;
  /** Their staff record, for the status icon; null for a Gridmaster. */
  employee: Employee | null;
  /** "Mentor · Skilled Nursing · Full-time", or "Gridmaster". */
  summary: string;
  email: string | null;
  phone: string | null;
  actions?: ReactNode;
}

/** The staff page's header, for your own profile. */
export function ProfileHeader({
  name,
  avatarSeed,
  orgRole,
  employee,
  summary,
  email,
  phone,
  actions,
}: ProfileHeaderProps) {
  const avatarTone = useAvatarTone(avatarSeed);

  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-5">
        <Avatar className="h-[72px] w-[72px] shrink-0">
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
            {employee ? <StatusMarkIcon person={employee} size={20} /> : null}
          </div>
          {summary ? (
            <p className="m-0 mt-1.5 text-[15px] text-[var(--dg-color-text-secondary)]">
              {summary}
            </p>
          ) : null}
          {email || phone ? (
            <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 text-[14px] text-[var(--dg-color-text-secondary)]">
              {email ? <span className="[overflow-wrap:anywhere]">{email}</span> : null}
              {email && phone ? (
                <span aria-hidden className="text-[var(--dg-color-text-faint)]">
                  ·
                </span>
              ) : null}
              {phone ? <span className="dg-tabular-nums">{phone}</span> : null}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
