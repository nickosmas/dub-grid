import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { StatusIcon } from "./StatusIcon";

export type BannerTone = "info" | "success" | "warning" | "danger";

const BOX_ICON_SIZE = 20;
const BAR_ICON_SIZE = 25;

const TONE_CLASSES: Record<BannerTone, string> = {
  info: "bg-[var(--dg-color-banner-info-bg)]",
  success: "bg-[var(--dg-color-banner-success-bg)]",
  warning: "bg-[var(--dg-color-banner-warning-bg)]",
  danger: "bg-[var(--dg-color-banner-danger-bg)]",
};

const BAR_TONE_CLASSES: Record<BannerTone, string> = {
  info: "bg-[var(--dg-color-banner-info-vivid-bg)] text-[var(--dg-color-banner-info-vivid-text)]",
  success:
    "bg-[var(--dg-color-banner-success-vivid-bg)] text-[var(--dg-color-banner-success-vivid-text)]",
  warning:
    "bg-[var(--dg-color-banner-warning-vivid-bg)] text-[var(--dg-color-banner-warning-vivid-text)]",
  danger:
    "bg-[var(--dg-color-banner-danger-vivid-bg)] text-[var(--dg-color-banner-danger-vivid-text)]",
};

// Only the icon carries the tone; the text stays neutral. Whole class names,
// so Tailwind sees them.
const ICON_CLASSES: Record<BannerTone, string> = {
  info: "text-[var(--dg-color-banner-info-icon)]",
  success: "text-[var(--dg-color-banner-success-icon)]",
  warning: "text-[var(--dg-color-banner-warning-icon)]",
  danger: "text-[var(--dg-color-banner-danger-icon)]",
};

// A bar's icon takes the bar's text colour too.
const BAR_ICON_CLASSES: Record<BannerTone, string> = {
  info: "text-[var(--dg-color-banner-info-vivid-text)]",
  success: "text-[var(--dg-color-banner-success-vivid-text)]",
  warning: "text-[var(--dg-color-banner-warning-vivid-text)]",
  danger: "text-[var(--dg-color-banner-danger-vivid-text)]",
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

/** Every banner and notice in the app: a tinted fill, a tone icon and neutral text, no border. */
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
      ? "items-center justify-center px-4 py-2"
      : "items-start rounded-[10px] px-3.5 py-3";

  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={`flex gap-2.5 text-[13px] font-normal leading-[1.5] ${shape} ${layout === "bar" ? BAR_TONE_CLASSES[tone] : `${TONE_CLASSES[tone]} text-[var(--dg-color-text-primary)]`} ${className ?? ""}`}
    >
      <span className="flex shrink-0">
        <StatusIcon
          tone={tone}
          icon={icon}
          size={layout === "bar" ? BAR_ICON_SIZE : BOX_ICON_SIZE}
          className={layout === "bar" ? BAR_ICON_CLASSES[tone] : ICON_CLASSES[tone]}
        />
      </span>
      <div className={`flex min-w-0 flex-col gap-1 ${layout === "bar" ? "" : "flex-1"}`}>
        {title ? <span className="font-semibold">{title}</span> : null}
        {children}
      </div>
      {/* The negative margin keeps a button from growing a one-line box past the icon. */}
      {action ? (
        <div
          className={`flex shrink-0 items-center self-center ${layout === "bar" ? "" : "-my-1"}`}
        >
          {action}
        </div>
      ) : null}
    </div>
  );
}

/** A banner's icon on its own, for a notice that lays out its own row on a banner tint. */
export function BannerIcon({ tone, icon }: { tone: BannerTone; icon?: LucideIcon }) {
  return (
    <StatusIcon
      tone={tone}
      icon={icon}
      size={BOX_ICON_SIZE}
      className={`shrink-0 ${ICON_CLASSES[tone]}`}
    />
  );
}
