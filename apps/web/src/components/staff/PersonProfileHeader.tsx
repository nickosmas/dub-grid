"use client";

import { getAvatarTypography } from "@dubgrid/design-tokens";

import type { ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { useAvatarTone } from "@/hooks/useAvatarTone";
import { AccessInsignia } from "./AccessInsignia";
import type { EmployeeEmploymentType, OrganizationRole } from "@/types";

interface PersonProfileHeaderProps {
  /** Seed the avatar tone with `resolveAvatarSeed` so one human keeps one color. */
  avatarSeed: string;
  name: string;
  /** Drives the avatar insignia. Plain users and staff with no login get none. */
  orgRole?: OrganizationRole | null;
  email?: string | null;
  phone?: string | null;
  employmentType?: EmployeeEmploymentType;
  employeeNumber?: number | null;
  actions?: ReactNode;
}

/** Identity header shared by a staff member's profile and your own profile. */
export function PersonProfileHeader({
  avatarSeed,
  name,
  orgRole,
  email,
  phone,
  employmentType,
  employeeNumber,
  actions,
}: PersonProfileHeaderProps) {
  const avatarTone = useAvatarTone(avatarSeed);
  const employmentLabel = employmentType
    ? employmentType === "part_time"
      ? "Part-time"
      : "Full-time"
    : "—";

  return (
    <header className="pb-2">
      <div className="flex flex-col gap-4 sm:gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
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

            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 text-[length:var(--dg-type-page-title-size)] font-bold tracking-tight text-[var(--dg-color-text-primary)]">
                {name}
              </h1>
              <AccessInsignia orgRole={orgRole} size="lg" />
            </div>
          </div>

          <div className="flex items-center gap-2 self-start">{actions}</div>
        </div>

        <div className="grid gap-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <BioField label="Email" value={email || "—"} />
          <BioField label="Phone" value={phone || "—"} />
          {employmentType !== undefined && <BioField label="Employment" value={employmentLabel} />}
          {employeeNumber !== undefined && (
            <BioField
              label="Employee ID"
              value={employeeNumber != null ? `#${employeeNumber}` : "—"}
            />
          )}
        </div>
      </div>
    </header>
  );
}

function BioField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[var(--dg-radius-md)] bg-[var(--dg-color-bg)] px-3 py-2.5">
      <div className="dg-type-field-title">{label}</div>
      <div className="mt-1 truncate text-[13px] font-medium text-[var(--dg-color-text-primary)]">
        {value}
      </div>
    </div>
  );
}
