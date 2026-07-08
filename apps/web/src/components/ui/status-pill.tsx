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
    bg: "var(--color-success-bg)",
    text: "var(--color-success-text)",
    border: "var(--color-success-border)",
  },
  warning: {
    bg: "var(--color-warning-bg)",
    text: "var(--color-warning-text)",
    border: "var(--color-warning-border)",
  },
  danger: {
    bg: "var(--color-danger-bg)",
    text: "var(--color-danger-text)",
    border: "var(--color-danger-border)",
  },
  info: {
    bg: "var(--color-info-bg)",
    text: "var(--color-info-text)",
    border: "var(--color-info-border)",
  },
  neutral: {
    bg: "var(--color-bg-secondary)",
    text: "var(--color-text-secondary)",
    border: "var(--color-border-light)",
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
