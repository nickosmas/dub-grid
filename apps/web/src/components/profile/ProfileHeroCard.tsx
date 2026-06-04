"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Employee } from "@/types";

interface ProfileHeroCardProps {
  initials: string;
  name: string;
  email: string | null;
  roleLabel: string;
  createdAt: string | null;
  lastSignIn: string | null;
  employee?: Employee | null;
}

export function ProfileHeroCard({
  initials,
  name,
  email,
  roleLabel,
  createdAt,
  lastSignIn,
  employee,
}: ProfileHeroCardProps) {
  const statusConfig = employee ? {
    active: {
      label: "Active",
      background: "var(--color-success-bg)",
      color: "var(--color-success-text)",
      borderColor: "var(--color-success-border)",
    },
    inactive: {
      label: "Inactive",
      background: "var(--color-warning-bg)",
      color: "var(--color-warning-text)",
      borderColor: "var(--color-warning-border)",
    },
    removed: {
      label: "Removed",
      background: "var(--color-danger-bg)",
      color: "var(--color-danger-text)",
      borderColor: "var(--color-danger-border)",
    },
  }[employee.status] : null;

  return (
    <div className="dg-card">
      <div className="p-4 md:p-5">
        <div className="flex flex-col gap-4 sm:gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16 shrink-0 ring-1 ring-[var(--color-border)]">
                <AvatarFallback className="bg-[var(--color-brand)] text-xl font-bold text-[var(--color-text-inverse)]">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {statusConfig ? (
                    <span
                      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        background: statusConfig.background,
                        color: statusConfig.color,
                        borderColor: statusConfig.borderColor,
                      }}
                    >
                      {statusConfig.label}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center rounded-full bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-muted)]">
                    {roleLabel}
                  </span>
                </div>

                <h1 className="mt-3 text-[28px] font-bold tracking-tight text-[var(--color-text-primary)]">
                  {name}
                </h1>

                <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">
                  {email ?? "No email on file"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 text-[13px] md:grid-cols-4">
            <HeroField label="Email" value={email || "—"} />
            <HeroField label="Phone" value={employee?.phone || "—"} />
            <HeroField label="Date Joined" value={createdAt || "—"} />
            <HeroField label="Last Sign In" value={lastSignIn || "—"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroField({ label, value }: { label: string; value: string }) {
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
