"use client";

import type { ReactNode } from "react";
import { describePlannedChangeInFull, formatFirstDay, plannedReturn } from "@dubgrid/domain";
import { Button } from "@/components/Button";
import { MaybeHint } from "@/components/ui/hint";
import { formatDateTimeLabel } from "@/lib/client-facing";
import type { PersonAccountState } from "@/lib/person-account-state";
import { formatRelativeTime } from "@/lib/utils";
import type { AdminPermissions, Employee, FocusArea, NamedItem, OrganizationRole } from "@/types";

const ROLE_NAMES: Record<OrganizationRole, string> = {
  user: "User",
  admin: "Admin",
  super_admin: "Super Admin",
};

const ACCOUNT_LABELS: Record<PersonAccountState["kind"], string> = {
  linked: "Linked account",
  pending: "Invitation pending",
  expired: "Invitation expired",
  "not-invited": "Not invited",
  "no-email": "No email",
};

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function InfoField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="dg-type-field-title mb-1">{label}</dt>
      <dd className="m-0 text-[14px] leading-[1.45] text-[var(--dg-color-text-primary)] [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="text-[var(--dg-color-text-faint)]">{children}</span>;
}

function AboutCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="dg-card">
      <div className="dg-card-header">
        <div className="dg-card-title">{title}</div>
        {action}
      </div>
      <div className="dg-card-body">{children}</div>
    </section>
  );
}

const namesOf = (ids: number[], items: ReadonlyArray<{ id: number; name: string }>) =>
  ids
    .map((id) => items.find((item) => item.id === id)?.name)
    .filter((name): name is string => Boolean(name));

interface WorkCardProps {
  employee: Employee;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  focusAreaLabel?: string;
  certificationLabel?: string;
  roleLabel?: string;
  /** Management-only people have no schedule fields to show. */
  showScheduleDetails: boolean;
}

export function WorkCard({
  employee,
  focusAreas,
  certifications,
  roles,
  focusAreaLabel = "Focus areas",
  certificationLabel = "Certification",
  roleLabel = "Roles",
  showScheduleDetails,
}: WorkCardProps) {
  const certification = certifications.find((item) => item.id === employee.certificationId);
  const list = (names: string[]) => (names.length > 0 ? names.join(", ") : <Missing>None</Missing>);

  return (
    <AboutCard title="Work">
      {showScheduleDetails ? (
        <dl className="m-0 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <InfoField label={focusAreaLabel}>
            {list(namesOf(employee.focusAreaIds, focusAreas))}
          </InfoField>
          <InfoField label={certificationLabel}>
            {certification ? certification.name : <Missing>None</Missing>}
          </InfoField>
          <InfoField label={roleLabel}>{list(namesOf(employee.roleIds, roles))}</InfoField>
        </dl>
      ) : null}
      <dl
        className={`m-0 rounded-[var(--dg-radius-md)] bg-[var(--dg-color-bg-secondary)] px-3.5 py-3 ${showScheduleDetails ? "mt-4" : ""}`}
      >
        <InfoField label="Internal notes">
          {employee.contactNotes ? (
            <span className="whitespace-pre-wrap">{employee.contactNotes}</span>
          ) : (
            <Missing>None</Missing>
          )}
        </InfoField>
      </dl>
    </AboutCard>
  );
}

interface AccessCardProps {
  orgRole: OrganizationRole | null;
  /** True while an invitation is out and not yet accepted. */
  invited: boolean;
  adminPermissions?: AdminPermissions | null;
  /** The departments they manage, or null when management doesn't apply. */
  managedDepartments: string[] | null;
  accountState: PersonAccountState | null;
  lastSignInAt?: string | null;
  onEditAccess?: () => void;
  onEditManagement?: () => void;
  onInvite?: () => void;
}

export function AccessCard({
  orgRole,
  invited,
  adminPermissions,
  managedDepartments,
  accountState,
  lastSignInAt,
  onEditAccess,
  onEditManagement,
  onInvite,
}: AccessCardProps) {
  const access = orgRole
    ? invited
      ? `${ROLE_NAMES[orgRole]}, once they accept`
      : ROLE_NAMES[orgRole]
    : "No app access";
  const permissionValues = adminPermissions ? Object.values(adminPermissions) : [];
  const action = onInvite ? (
    <Button type="button" className="dg-btn dg-btn-secondary dg-btn-sm" onClick={onInvite}>
      Send invitation
    </Button>
  ) : onEditAccess ? (
    <Button type="button" className="dg-btn dg-btn-secondary dg-btn-sm" onClick={onEditAccess}>
      Change access
    </Button>
  ) : null;

  return (
    <AboutCard title="Access" action={action}>
      <dl className="m-0 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <InfoField label="Access level">{access}</InfoField>
        {orgRole === "admin" && permissionValues.length > 0 ? (
          <InfoField label="Permissions">
            <span className="dg-tabular-nums">
              {permissionValues.filter(Boolean).length} of {permissionValues.length}
            </span>
          </InfoField>
        ) : null}
        {managedDepartments ? (
          <InfoField label="Manages">
            <span className="inline-flex flex-wrap items-baseline gap-x-2">
              {managedDepartments.length > 0 ? (
                managedDepartments.join(", ")
              ) : (
                <Missing>Nobody</Missing>
              )}
              {onEditManagement ? (
                <button
                  type="button"
                  onClick={onEditManagement}
                  className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-[var(--dg-color-link)] hover:underline"
                  aria-label="Edit management access"
                >
                  Edit
                </button>
              ) : null}
            </span>
          </InfoField>
        ) : null}
        {accountState ? (
          <InfoField label="Account">{ACCOUNT_LABELS[accountState.kind]}</InfoField>
        ) : null}
        {lastSignInAt ? (
          <InfoField label="Last active">
            <MaybeHint content={formatDateTimeLabel(lastSignInAt)}>
              <span className="dg-tabular-nums">{formatRelativeTime(lastSignInAt)}</span>
            </MaybeHint>
          </InfoField>
        ) : null}
      </dl>
    </AboutCard>
  );
}

/** The facts of their record: who they are on file and when things happened. */
export function RecordCard({ employee }: { employee: Employee }) {
  const planned =
    (employee.status === "active" || plannedReturn(employee)) &&
    describePlannedChangeInFull(employee);
  const day = (value: string | null | undefined) =>
    value ? DAY.format(new Date(value)) : <Missing>Not recorded</Missing>;

  return (
    <AboutCard title="Record">
      <dl
        data-testid="person-record"
        className="dg-tabular-nums m-0 grid gap-x-6 gap-y-4 sm:grid-cols-2"
      >
        <InfoField label="Employee ID">
          {employee.employeeNumber != null ? (
            `#${employee.employeeNumber}`
          ) : (
            <Missing>None</Missing>
          )}
        </InfoField>
        <InfoField label="Added">{day(employee.createdAt)}</InfoField>
        {employee.joinedAt !== undefined ? (
          <InfoField label="Joined">
            {employee.joinedAt ? day(employee.joinedAt) : <Missing>Not joined</Missing>}
          </InfoField>
        ) : null}
        {employee.firstDay ? (
          <InfoField label="First day">{formatFirstDay(employee.firstDay)}</InfoField>
        ) : null}
        <InfoField label="Status changed">{day(employee.statusChangedAt)}</InfoField>
        {planned ? <InfoField label="Planned">{planned}</InfoField> : null}
      </dl>
      {employee.statusNote ? (
        <dl className="m-0 mt-4 rounded-[var(--dg-radius-md)] bg-[var(--dg-color-bg-secondary)] px-3.5 py-3">
          <InfoField label="Status note">
            <span className="whitespace-pre-wrap">{employee.statusNote}</span>
          </InfoField>
        </dl>
      ) : null}
    </AboutCard>
  );
}
