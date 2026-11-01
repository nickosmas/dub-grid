"use client";

import { CalendarDays, Check, Lock, Moon, UserMinus, type LucideIcon } from "lucide-react";
import { formatDateKey } from "@/lib/utils";
import {
  statusMark,
  type StatusChoiceKind,
  type StatusMarkKind,
  type StatusState,
  type StatusTone,
} from "@dubgrid/domain";
import { MaybeHint } from "@/components/ui/hint";

export const STATUS_MARK_ICONS: Record<StatusMarkKind, LucideIcon> = {
  suspended: Lock,
  away: Moon,
  planned: CalendarDays,
  archived: UserMinus,
};

/** The icon for each status a person can be in or be moved to. */
export const STATUS_KIND_ICONS: Record<StatusChoiceKind, LucideIcon> = {
  active: Check,
  away: Moon,
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
 * moon for Away, a calendar for a planned away, a person with a minus for Offboarded.
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

/** An icon in a tinted circle, for the status card and the Change staff status dialog. */
export function StatusIconCircle({
  icon: Icon,
  tone,
  size = 32,
}: {
  icon: LucideIcon;
  tone: StatusTone;
  size?: number;
}) {
  const colors = STATUS_TONE_COLORS[tone];
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
      }}
    >
      <Icon size={Math.round(size / 2)} strokeWidth={2.4} />
    </span>
  );
}
