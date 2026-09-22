import type { ComponentType } from "react";
import {
  ArrowLeftRight,
  CalendarCheck,
  CalendarOff,
  HandHelping,
  UserRoundPlus,
  type LucideProps,
} from "lucide-react";
import type { ActivityIconKind, ActivityIconVariant } from "@/lib/dashboard-stats";

const GLYPHS: Record<ActivityIconKind, ComponentType<LucideProps>> = {
  publish: CalendarCheck,
  pickup: HandHelping,
  swap: ArrowLeftRight,
  calloff: CalendarOff,
  user_signup: UserRoundPlus,
};

const TONES: Record<ActivityIconVariant, { bg: string; border: string; color: string }> = {
  success: {
    bg: "var(--dg-color-success-bg)",
    border: "var(--dg-color-success-border)",
    color: "var(--dg-color-success-text)",
  },
  warning: {
    bg: "var(--dg-color-warning-bg)",
    border: "var(--dg-color-warning-border)",
    color: "var(--dg-color-warning-text)",
  },
  danger: {
    bg: "var(--dg-color-danger-bg)",
    border: "var(--dg-color-danger-border)",
    color: "var(--dg-color-danger-text)",
  },
  neutral: {
    bg: "var(--dg-color-surface)",
    border: "var(--dg-color-border-subtle)",
    color: "var(--dg-color-text-primary)",
  },
};

// The same tile as the mobile app's list icons: a bordered 32px rounded
// square (a full circle would read as an avatar) framing one outline glyph.
export function ActivityIcon({
  kind,
  variant,
}: {
  kind: ActivityIconKind;
  variant: ActivityIconVariant;
}) {
  const Glyph = GLYPHS[kind];
  const tone = TONES[variant];
  return (
    <div
      aria-hidden
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Glyph size={16} strokeWidth={1.75} />
    </div>
  );
}
