import { type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusPillTone = "success" | "warning" | "danger" | "info" | "neutral";
export type StatusPillVariant = "status" | "category";

interface StatusPillProps {
  tone?: StatusPillTone;
  variant?: StatusPillVariant;
  bordered?: boolean;
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

const CATEGORY_NEUTRAL_VARS = {
  bg: "var(--dg-color-surface)",
  text: "var(--dg-color-text-label)",
  border: "var(--dg-color-border)",
};

export function StatusPill({
  tone = "neutral",
  variant = "status",
  bordered = true,
  dot,
  children,
  title,
  className,
  "aria-label": ariaLabel,
}: StatusPillProps) {
  const vars =
    variant === "category" && tone === "neutral" ? CATEGORY_NEUTRAL_VARS : TONE_VARS[tone];
  const showDot = dot ?? (variant === "status" && tone !== "neutral");
  const style: CSSProperties = {
    background:
      variant === "category"
        ? tone === "neutral"
          ? "var(--dg-color-bg-secondary)"
          : `color-mix(in srgb, ${vars.bg} 96%, ${vars.text})`
        : vars.bg,
    color: vars.text,
    ...(bordered ? { border: `1px solid ${vars.border}` } : {}),
  };

  return (
    <span
      aria-label={ariaLabel}
      data-status-pill-variant={variant}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 tracking-normal whitespace-nowrap",
        variant === "category"
          ? "rounded-[4px] text-[length:var(--dg-fs-footnote)] font-semibold"
          : "rounded-md text-[length:var(--dg-type-badge-size)] font-medium",
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
