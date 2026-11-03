"use client";

import type { ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import { describeStatusCard } from "@dubgrid/domain";
import type { AbsenceType, Employee } from "@/types";
import { formatDateKey } from "@/lib/utils";
import { STATUS_KIND_ICONS, STATUS_TONE_COLORS, StatusSymbol } from "./StatusMarkIcon";

interface EmployeeStatusCardProps {
  employee: Employee;
  absenceTypes?: readonly AbsenceType[];
  /** Change status, when the viewer may change it. */
  action?: ReactNode;
  /** Edit plan on the planned card, when the viewer may change it. */
  planAction?: ReactNode;
  /**
   * A card sharing the status card's row as an equal column from 768px, such
   * as the staff page's invite card; the planned cards then sit below.
   */
  companion?: ReactNode;
}

const LATER_GRID = "grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3";
const ROW_GRID = "grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-3";

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

// A CSS dashed border can't set its dash length, so a plan's outline is drawn:
// long, spaced dashes in amber muted toward the gray border, so it keeps its
// colour as quietly as a plain border.
const PLAN_OUTLINE = `color-mix(in srgb, ${STATUS_TONE_COLORS.warning.text} 45%, var(--dg-color-border))`;

function PlanOutline() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute -inset-px h-[calc(100%+2px)] w-[calc(100%+2px)] overflow-visible"
    >
      <rect
        x="0.5"
        y="0.5"
        rx="9.5"
        className="h-[calc(100%-1px)] w-[calc(100%-1px)]"
        fill="none"
        stroke={PLAN_OUTLINE}
        strokeWidth={1}
        strokeDasharray="7 5"
      />
    </svg>
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
  companion,
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

  const statusSection = (
    <section
      aria-label="Staff status"
      data-status={current.kind}
      style={{
        ...cardStyle,
        border: `1px solid ${active ? "var(--dg-color-border)" : colors.border}`,
        background: active ? "var(--dg-color-surface)" : colors.bg,
      }}
    >
      <StatusSymbol
        icon={STATUS_KIND_ICONS[current.kind]}
        tone={current.tone}
        color={active ? undefined : colors.text}
      />
      <CardText
        title={current.title}
        detail={current.detail}
        color={active ? "var(--dg-color-text-primary)" : colors.text}
      />
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );

  const laterCards = (
    <>
      {starts ? (
        <section
          aria-label="First day"
          data-status="starts"
          style={{
            ...cardStyle,
            position: "relative",
            border: "1px solid transparent",
            background: "var(--dg-color-surface)",
          }}
        >
          <PlanOutline />
          <StatusSymbol
            icon={CalendarDays}
            tone="warning"
            color={STATUS_TONE_COLORS.warning.text}
          />
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
            position: "relative",
            border: "1px solid transparent",
            background: "var(--dg-color-surface)",
          }}
        >
          <PlanOutline />
          <StatusSymbol
            icon={CalendarDays}
            tone="warning"
            color={STATUS_TONE_COLORS.warning.text}
          />
          <CardText
            eyebrow="Planned"
            title={planned.title}
            detail={planned.detail}
            color={STATUS_TONE_COLORS.warning.text}
          />
          {planAction ? <div className="shrink-0">{planAction}</div> : null}
        </section>
      ) : null}
    </>
  );

  // The status, anything planned and the companion share one row when they fit,
  // and wrap to the next row when they don't.
  if (companion) {
    return (
      <div data-slot="employee-status-card" className={ROW_GRID}>
        {statusSection}
        {laterCards}
        {companion}
      </div>
    );
  }

  return (
    <div data-slot="employee-status-card" className={LATER_GRID}>
      {statusSection}
      {laterCards}
    </div>
  );
}
