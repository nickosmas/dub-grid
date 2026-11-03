"use client";

import {
  CalendarDays,
  CircleCheck,
  Lock,
  PlaneTakeoff,
  UserMinus,
  type LucideIcon,
} from "lucide-react";
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
  away: PlaneTakeoff,
  planned: CalendarDays,
  archived: UserMinus,
};

/** The icon for each status a person can be in or be moved to. */
export const STATUS_KIND_ICONS: Record<StatusChoiceKind, LucideIcon> = {
  active: CircleCheck,
  away: PlaneTakeoff,
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
      text: "var(--dg-color-warning-text)",
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
 * The status icon drawn right after a person's name: a lock for Suspended, a
 * plane taking off for Away, a calendar for a planned away, a person with a minus for Offboarded.
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

const SYMBOL_COLORS: Record<StatusTone, string> = {
  success: "var(--dg-color-banner-success-icon)",
  warning: "var(--dg-color-banner-warning-icon)",
  danger: "var(--dg-color-banner-danger-icon)",
  neutral: "var(--dg-color-text-muted)",
};

/**
 * A status's icon drawn solid in its tone, as banners draw theirs, for the
 * status card and the Change staff status dialog. Its marks are cut out to
 * `--dg-icon-cut`, which the card it sits on sets to its own background.
 */
export function StatusSymbol({ icon, tone }: { icon: LucideIcon; tone: StatusTone }) {
  return (
    <span aria-hidden="true" style={{ display: "flex", flexShrink: 0, color: SYMBOL_COLORS[tone] }}>
      <SolidStatusIcon tone={tone === "neutral" ? "info" : tone} icon={icon} size={25} />
    </span>
  );
}
