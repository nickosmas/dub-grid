import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { StatusIcon } from "./StatusIcon";

export type BannerTone = "info" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<BannerTone, string> = {
  info: "border-[var(--dg-color-banner-info-border)] bg-[var(--dg-color-banner-info-bg)] text-[var(--dg-color-banner-info-text)]",
  success:
    "border-[var(--dg-color-banner-success-border)] bg-[var(--dg-color-banner-success-bg)] text-[var(--dg-color-banner-success-text)]",
  warning:
    "border-[var(--dg-color-banner-warning-border)] bg-[var(--dg-color-banner-warning-bg)] text-[var(--dg-color-banner-warning-text)]",
  danger:
    "border-[var(--dg-color-banner-danger-border)] bg-[var(--dg-color-banner-danger-bg)] text-[var(--dg-color-banner-danger-text)]",
};

const BAR_TONE_CLASSES: Record<BannerTone, string> = {
  info: "border-[var(--dg-color-banner-info-vivid-border)] bg-[var(--dg-color-banner-info-vivid-bg)] text-[var(--dg-color-banner-info-vivid-text)]",
  success:
    "border-[var(--dg-color-banner-success-vivid-border)] bg-[var(--dg-color-banner-success-vivid-bg)] text-[var(--dg-color-banner-success-vivid-text)]",
  warning:
    "border-[var(--dg-color-banner-warning-vivid-border)] bg-[var(--dg-color-banner-warning-vivid-bg)] text-[var(--dg-color-banner-warning-vivid-text)]",
  danger:
    "border-[var(--dg-color-banner-danger-vivid-border)] bg-[var(--dg-color-banner-danger-vivid-bg)] text-[var(--dg-color-banner-danger-vivid-text)]",
};

// The icon colour, and the tint its marks are cut out to. Whole class names, so
// Tailwind sees them.
const ICON_CLASSES: Record<BannerTone, string> = {
  info: "text-[var(--dg-color-banner-info-icon)] [--dg-icon-cut:var(--dg-color-banner-info-bg)]",
  success:
    "text-[var(--dg-color-banner-success-icon)] [--dg-icon-cut:var(--dg-color-banner-success-bg)]",
  warning:
    "text-[var(--dg-color-banner-warning-icon)] [--dg-icon-cut:var(--dg-color-banner-warning-bg)]",
  danger:
    "text-[var(--dg-color-banner-danger-icon)] [--dg-icon-cut:var(--dg-color-banner-danger-bg)]",
};

// A bar's fill is the tone itself, so its icon is white with the fill behind.
const BAR_ICON_CLASSES: Record<BannerTone, string> = {
  info: "text-white [--dg-icon-cut:var(--dg-color-banner-info-vivid-bg)]",
  success: "text-white [--dg-icon-cut:var(--dg-color-banner-success-vivid-bg)]",
  warning:
    "text-[var(--dg-color-banner-warning-vivid-text)] [--dg-icon-cut:var(--dg-color-banner-warning-vivid-bg)]",
  danger: "text-white [--dg-icon-cut:var(--dg-color-banner-danger-vivid-bg)]",
};

export interface BannerProps {
  tone: BannerTone;
  /**
   * A glyph that fits the meaning, such as `Clock` for a time limit, drawn
   * solid when it has a solid form and in a tone circle otherwise. Defaults
   * to the tone's own shape.
   */
  icon?: LucideIcon;
  /** Optional bold first line. */
  title?: ReactNode;
  children?: ReactNode;
  /** A control on the right, such as a button or link. */
  action?: ReactNode;
  /** `bar` spans the top of a page edge to edge in a solid fill that calls for attention. */
  layout?: "box" | "bar";
  role?: "note" | "status" | "alert";
  "aria-label"?: string;
  className?: string;
}

/** Every banner and notice in the app: a tinted fill, a deeper border and dark text of one hue. */
export function Banner({
  tone,
  icon,
  title,
  children,
  action,
  layout = "box",
  role = "note",
  "aria-label": ariaLabel,
  className,
}: BannerProps) {
  const shape =
    layout === "bar"
      ? "items-center justify-center border-b px-4 py-2"
      : "items-start rounded-[10px] border px-3.5 py-3";

  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={`flex gap-2.5 text-[13px] font-medium leading-[1.5] ${shape} ${layout === "bar" ? BAR_TONE_CLASSES[tone] : TONE_CLASSES[tone]} ${className ?? ""}`}
    >
      {/* One line tall, so the glyph sits on the first line however many follow. */}
      <span className="flex h-[1lh] shrink-0 items-center">
        <StatusIcon
          tone={tone}
          icon={icon}
          size={20}
          className={layout === "bar" ? BAR_ICON_CLASSES[tone] : ICON_CLASSES[tone]}
        />
      </span>
      <div className={`flex min-w-0 flex-col gap-1 ${layout === "bar" ? "" : "flex-1"}`}>
        {title ? <span className="font-semibold">{title}</span> : null}
        {children}
      </div>
      {action ? <div className="flex shrink-0 items-center self-center">{action}</div> : null}
    </div>
  );
}
