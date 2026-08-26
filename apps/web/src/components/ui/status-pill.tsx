import { type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusPillTone = "success" | "warning" | "danger" | "info" | "neutral";

interface StatusPillProps {
  tone?: StatusPillTone;
  dot?: boolean;
  children: ReactNode;
  title?: string;
  className?: string;
  "aria-label"?: string;
}

const TONE_VARS: Record<StatusPillTone, { bg: string; text: string; border: string }> = {
  success: {
    bg: "var(--dg-color-success-bg)",
    text: "var(--dg-color-success-text)",
    border: "var(--dg-color-success-border)",
  },
  warning: {
    bg: "var(--dg-color-warning-bg)",
    text: "var(--dg-color-warning-text)",
    border: "var(--dg-color-warning-border)",
  },
  danger: {
    bg: "var(--dg-color-danger-bg)",
    text: "var(--dg-color-danger-text)",
    border: "var(--dg-color-danger-border)",
  },
  info: {
    bg: "var(--dg-color-info-bg)",
    text: "var(--dg-color-info-text)",
    border: "var(--dg-color-info-border)",
  },
  neutral: {
    bg: "var(--dg-color-bg-secondary)",
    text: "var(--dg-color-text-secondary)",
    border: "var(--dg-color-border-light)",
  },
};

export function StatusPill({
  tone = "neutral",
  dot,
  children,
  title,
  className,
  "aria-label": ariaLabel,
}: StatusPillProps) {
  const vars = TONE_VARS[tone];
  const showDot = dot ?? tone !== "neutral";
  const style: CSSProperties = {
    background: vars.bg,
    color: vars.text,
    border: `1px solid ${vars.border}`,
  };

  return (
    <span
      aria-label={ariaLabel}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        className,
      )}
      style={style}
    >
      {showDot && (
        <span
          aria-hidden="true"
          className="size-1 rounded-full shrink-0"
          style={{ background: vars.text }}
        />
      )}
      {children}
    </span>
  );
}
