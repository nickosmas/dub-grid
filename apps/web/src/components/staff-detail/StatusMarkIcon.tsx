"use client";

import { CalendarDays, CircleCheck, Lock, Plane, UserMinus, type LucideIcon } from "lucide-react";
import { formatDateKey } from "@/lib/utils";
import {
  statusMark,
  type StatusChoiceKind,
  type StatusMarkKind,
  type StatusState,
  type StatusTone,
} from "@dubgrid/domain";
import { MaybeHint } from "@/components/ui/hint";
import { StatusIcon as SolidStatusIcon } from "@/components/ui/StatusIcon";

export const STATUS_MARK_ICONS: Record<StatusMarkKind, LucideIcon> = {
  suspended: Lock,
  away: Plane,
  planned: CalendarDays,
  archived: UserMinus,
};

/** The icon for each status a person can be in or be moved to. */
export const STATUS_KIND_ICONS: Record<StatusChoiceKind, LucideIcon> = {
  active: CircleCheck,
  away: Plane,
  suspended: Lock,
  archived: UserMinus,
};

export const STATUS_TONE_COLORS: Record<StatusTone, { bg: string; border: string; text: string }> =
  {
    success: {
      bg: "var(--dg-color-success-bg)",
      border: "var(--dg-color-success-border)",
      text: "var(--dg-color-success-text)",
    },
    warning: {
      bg: "var(--dg-color-warning-bg)",
      border: "var(--dg-color-warning-border)",
      text: "var(--dg-color-status-warning-text)",
    },
    danger: {
      bg: "var(--dg-color-danger-bg)",
      border: "var(--dg-color-danger-border)",
      text: "var(--dg-color-danger-text)",
    },
    neutral: {
      bg: "var(--dg-color-bg-secondary)",
      border: "var(--dg-color-border-light)",
      text: "var(--dg-color-text-secondary)",
    },
  };

/**
 * A status icon's bright tone colour, as toasts use: status cards and Change
 * status options sit on white with neutral text, so the icon carries the tone.
 */
const STATUS_ICON_COLORS: Record<StatusTone, string> = {
  success: "var(--dg-color-toast-icon-success)",
  warning: "var(--dg-color-toast-icon-warning)",
  danger: "var(--dg-color-toast-icon-danger)",
  neutral: "var(--dg-color-text-muted)",
};

/**
 * The status icon drawn right after a person's name: a lock for Suspended, a
 * plane for Away, a calendar for a planned away, a person with a minus for Offboarded.
 * `only` limits it to some kinds, as the grid does.
 */
export function StatusMarkIcon({
  person,
  size = 13,
  only,
}: {
  person: StatusState;
  size?: number;
  only?: readonly StatusMarkKind[];
}) {
  const mark = statusMark(person, formatDateKey(new Date()));
  if (!mark || (only && !only.includes(mark.kind))) return null;
  const Icon = STATUS_MARK_ICONS[mark.kind];
  return (
    <MaybeHint content={mark.label} side="top">
      <span
        role="img"
        aria-label={mark.label}
        data-status-mark={mark.kind}
        style={{
          display: "inline-flex",
          flexShrink: 0,
          color: STATUS_TONE_COLORS[mark.tone].text,
        }}
      >
        <Icon aria-hidden="true" size={size} strokeWidth={2.4} />
      </span>
    </MaybeHint>
  );
}

/** The bare icon for a status, beside text that already says it. */
export function StatusIcon({ kind, size = 13 }: { kind: StatusMarkKind; size?: number }) {
  const Icon = STATUS_MARK_ICONS[kind];
  return <Icon aria-hidden="true" size={size} strokeWidth={2.4} />;
}

/**
 * A status's icon drawn solid, for the status cards and Change status. Beside
 * a status written in its tone's colour, it takes that colour (`color`);
 * beside neutral text, the tone's bright colour.
 */
export function StatusSymbol({
  icon,
  tone,
  color = STATUS_ICON_COLORS[tone],
}: {
  icon: LucideIcon;
  tone: StatusTone;
  color?: string;
}) {
  return (
    <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color }}>
      <SolidStatusIcon tone={tone === "neutral" ? "info" : tone} icon={icon} size={25} />
    </span>
  );
}
