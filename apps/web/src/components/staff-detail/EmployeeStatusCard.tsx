"use client";

import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { describeStatusCard } from "@dubgrid/domain";
import type { AbsenceType, Employee } from "@/types";
import { formatDateKey } from "@/lib/utils";
import { STATUS_KIND_ICONS, STATUS_TONE_COLORS, StatusIconCircle } from "./StatusMarkIcon";

interface EmployeeStatusCardProps {
  employee: Employee;
  absenceTypes?: readonly AbsenceType[];
  /** Change status, when the viewer may change it. */
  action?: ReactNode;
  /** Edit plan on the planned card, when the viewer may change it. */
  planAction?: ReactNode;
}

function CardText({
  eyebrow,
  title,
  detail,
  color,
}: {
  eyebrow?: string;
  title: string;
  detail: string;
  color: string;
}) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
      {eyebrow ? (
        <span
          style={{
            fontSize: "var(--dg-fs-caption)",
            fontWeight: 600,
            color: "var(--dg-color-text-secondary)",
          }}
        >
          {eyebrow}
        </span>
      ) : null}
      <span
        className="dg-tabular-nums"
        style={{ fontSize: "var(--dg-fs-label)", fontWeight: 600, color }}
      >
        {title}
      </span>
      <span
        className="dg-tabular-nums"
        style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-secondary)" }}
      >
        {detail}
      </span>
    </span>
  );
}

/**
 * Where someone stands, at the top of their profile, in the dialog's words:
 * tinted like their pill, white while Active, with a dashed card for a first
 * day still ahead (51g4) and one for a change planned for later.
 */
export function EmployeeStatusCard({
  employee,
  absenceTypes = [],
  action,
  planAction,
}: EmployeeStatusCardProps) {
  const absenceId =
    employee.status === "inactive" ? employee.awayAbsenceTypeId : employee.plannedAbsenceTypeId;
  const absenceName = absenceTypes.find((absenceType) => absenceType.id === absenceId)?.name;
  const { current, planned, starts } = describeStatusCard(employee, {
    absenceName,
    today: formatDateKey(new Date()),
  });
  const active = current.kind === "active";
  const colors = STATUS_TONE_COLORS[current.tone];
  const cardStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderRadius: "var(--dg-radius-lg)",
    minWidth: 0,
  } as const;

  return (
    <div
      data-slot="employee-status-card"
      className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3"
    >
      <section
        aria-label="Status"
        data-status={current.kind}
        style={{
          ...cardStyle,
          border: `1px solid ${active ? "var(--dg-color-border)" : colors.border}`,
          background: active ? "var(--dg-color-surface)" : colors.bg,
        }}
      >
        <StatusIconCircle icon={STATUS_KIND_ICONS[current.kind]} tone={current.tone} />
        <CardText
          title={current.title}
          detail={current.detail}
          color={active ? "var(--dg-color-text-primary)" : colors.text}
        />
        {action ? <div className="shrink-0">{action}</div> : null}
      </section>
      {starts ? (
        <section
          aria-label="First day"
          data-status="starts"
          style={{
            ...cardStyle,
            border: `1px dashed ${STATUS_TONE_COLORS.warning.border}`,
            background: "var(--dg-color-surface)",
          }}
        >
          <StatusIconCircle icon={CalendarDays} tone="warning" />
          <CardText
            eyebrow="First day"
            title={starts.title}
            detail={starts.detail}
            color={STATUS_TONE_COLORS.warning.text}
          />
        </section>
      ) : null}
      {planned ? (
        <section
          aria-label="Planned"
          data-status="planned"
          style={{
            ...cardStyle,
            border: `1px dashed ${STATUS_TONE_COLORS.warning.border}`,
            background: "var(--dg-color-surface)",
          }}
        >
          <StatusIconCircle icon={CalendarDays} tone="warning" />
          <CardText
            eyebrow="Planned"
            title={planned.title}
            detail={planned.detail}
            color={STATUS_TONE_COLORS.warning.text}
          />
          {planAction ? <div className="shrink-0">{planAction}</div> : null}
        </section>
      ) : null}
    </div>
  );
}
