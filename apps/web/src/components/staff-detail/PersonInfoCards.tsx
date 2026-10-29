"use client";

import type { ReactNode } from "react";
import { Briefcase, Contact } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/ui/status-pill";
import type { Employee, FocusArea, NamedItem } from "@/types";

function InfoCard({
  icon: Icon,
  title,
  onEdit,
  children,
}: {
  icon: LucideIcon;
  title: string;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="dg-card">
      <div className="dg-card-header">
        <div className="dg-card-title flex items-center gap-2">
          <Icon className="h-4 w-4 text-[var(--dg-color-text-muted)]" aria-hidden />
          {title}
        </div>
        {onEdit ? (
          <Button
            type="button"
            className="dg-btn dg-btn-secondary dg-btn-sm"
            onClick={onEdit}
            aria-label={`Edit ${title.toLowerCase()}`}
          >
            Edit
          </Button>
        ) : null}
      </div>
      <dl className="dg-card-body flex flex-col gap-3">{children}</dl>
    </section>
  );
}

export function InfoField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="dg-type-field-title mb-0.5">{label}</dt>
      <dd className="text-[13px] text-[var(--dg-color-text-primary)] [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="text-[var(--dg-color-text-faint)]">{children}</span>;
}

function Pills({ names, empty }: { names: string[]; empty: string }) {
  if (names.length === 0) return <Missing>{empty}</Missing>;
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((name) => (
        <StatusPill key={name} tone="neutral" variant="category">
          {name}
        </StatusPill>
      ))}
    </span>
  );
}

export function ContactCard({ employee, onEdit }: { employee: Employee; onEdit?: () => void }) {
  return (
    <InfoCard icon={Contact} title="Contact" onEdit={onEdit}>
      <InfoField label="Email">
        {employee.email ? (
          <a
            href={`mailto:${employee.email}`}
            className="text-[var(--dg-color-link)] no-underline hover:underline"
          >
            {employee.email}
          </a>
        ) : (
          <Missing>Not added</Missing>
        )}
      </InfoField>
      <InfoField label="Phone">
        {employee.phone ? (
          <span className="dg-tabular-nums">{employee.phone}</span>
        ) : (
          <Missing>Not added</Missing>
        )}
      </InfoField>
    </InfoCard>
  );
}

interface WorkDetailsCardProps {
  employee: Employee;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  roles: NamedItem[];
  focusAreaLabel?: string;
  certificationLabel?: string;
  roleLabel?: string;
  /** Management-only people have no schedule fields to show. */
  showScheduleDetails: boolean;
  onEdit?: () => void;
}

export function WorkDetailsCard({
  employee,
  focusAreas,
  certifications,
  roles,
  focusAreaLabel = "Focus areas",
  certificationLabel = "Certification",
  roleLabel = "Roles",
  showScheduleDetails,
  onEdit,
}: WorkDetailsCardProps) {
  const namesOf = (ids: number[], items: ReadonlyArray<{ id: number; name: string }>) =>
    ids.map((id) => items.find((item) => item.id === id)?.name).filter(Boolean) as string[];
  const certification = certifications.find((item) => item.id === employee.certificationId);

  return (
    <InfoCard icon={Briefcase} title="Work details" onEdit={onEdit}>
      {showScheduleDetails && (
        <>
          <InfoField label="Employment">
            {employee.employmentType === "part_time" ? "Part-time" : "Full-time"}
          </InfoField>
          <InfoField label={focusAreaLabel}>
            <Pills names={namesOf(employee.focusAreaIds, focusAreas)} empty="None" />
          </InfoField>
          <InfoField label={certificationLabel}>
            <Pills names={certification ? [certification.name] : []} empty="None" />
          </InfoField>
          <InfoField label={roleLabel}>
            <Pills names={namesOf(employee.roleIds, roles)} empty="None" />
          </InfoField>
        </>
      )}
      <InfoField label="Internal notes">
        {employee.contactNotes ? (
          <span className="whitespace-pre-wrap">{employee.contactNotes}</span>
        ) : (
          <Missing>None</Missing>
        )}
      </InfoField>
    </InfoCard>
  );
}
