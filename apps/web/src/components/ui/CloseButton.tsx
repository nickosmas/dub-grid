"use client";

import { X } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type CloseButtonSize = "xs" | "sm" | "md" | "lg";

const SIZE_CLASS: Record<CloseButtonSize, string> = {
  xs: "dg-close-btn--xs",
  sm: "dg-close-btn--sm",
  md: "dg-close-btn--md",
  lg: "dg-close-btn--lg",
};

const ICON_PX: Record<CloseButtonSize, number> = { xs: 12, sm: 14, md: 16, lg: 20 };

interface CloseButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "size"> {
  /** Visual + hit-target size. See `.dg-close-btn--*` in globals.css for exact px. */
  size?: CloseButtonSize;
  /** Every close/clear "X" must have an accessible name. */
  "aria-label": string;
}

export function CloseButton({
  size = "md",
  className,
  type = "button",
  ...props
}: CloseButtonProps) {
  return (
    <button type={type} className={cn("dg-close-btn", SIZE_CLASS[size], className)} {...props}>
      <X size={ICON_PX[size]} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
}
