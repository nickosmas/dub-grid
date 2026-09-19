import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { formatBadgeCount, numericBadgeSize, type NumericBadgeSize } from "@dubgrid/design-tokens";

import { cn } from "@/lib/utils";

const numericBadgeVariants = cva(
  "dg-tabular-nums box-border inline-flex shrink-0 items-center justify-center rounded-full text-[length:var(--dg-fs-badge)] leading-none font-bold whitespace-nowrap",
  {
    variants: {
      tone: {
        danger: "bg-[var(--dg-color-danger)] text-[var(--dg-color-text-inverse)]",
        brand: "bg-[var(--dg-color-brand)] text-[var(--dg-color-text-inverse)]",
        brandSoft: "bg-[var(--dg-color-brand-bg)] text-[var(--dg-color-brand)]",
        neutral: "bg-[var(--dg-color-border-light)] text-[var(--dg-color-text-muted)]",
        // Sits on a filled control (an active tab), so it borrows the control's
        // text color and lightens its fill instead of picking a surface.
        onAccent: "bg-[rgba(255,255,255,0.25)] text-inherit",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

type NumericBadgeProps = Omit<ComponentProps<"span">, "children" | "aria-label"> &
  VariantProps<typeof numericBadgeVariants> & {
    count: number;
    /** Counts above this show as `${max}+`. Bell badges pass 9. */
    max?: number;
    size?: NumericBadgeSize;
    /**
     * Accessible name for a badge floating on an icon ("26 unread alerts").
     * An inline count inside a labeled control omits it; the control's own
     * text already reads the number.
     */
    label?: string;
  };

/**
 * The one count badge: always a pill whose height and minimum width come from
 * the shared size token, so a one-digit value only looks circular because its
 * content is narrower than the minimum. Renders nothing for a count of zero.
 */
export function NumericBadge({
  className,
  count,
  max,
  size = "md",
  tone,
  label,
  style,
  ...props
}: NumericBadgeProps) {
  const text = formatBadgeCount(count, max);
  if (text === null) return null;

  const { size: box, paddingX } = numericBadgeSize[size];

  return (
    <span
      {...props}
      aria-label={label}
      className={cn(numericBadgeVariants({ tone }), className)}
      data-numeric-badge=""
      data-size={size}
      data-tone={tone ?? "neutral"}
      style={{
        height: box,
        minWidth: box,
        paddingLeft: paddingX,
        paddingRight: paddingX,
        ...style,
      }}
    >
      {text}
    </span>
  );
}

export { numericBadgeVariants };
