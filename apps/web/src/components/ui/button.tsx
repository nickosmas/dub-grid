"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--dg-btn-radius)] border border-transparent bg-clip-padding font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[var(--dg-btn-icon)]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-brand)] text-[var(--color-text-inverse)] hover:bg-[var(--color-brand-light)]",
        brand:
          "bg-[var(--color-brand)] text-[var(--color-text-inverse)] hover:bg-[var(--color-brand-light)]",
        outline:
          "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] aria-expanded:bg-[var(--color-bg-secondary)] aria-expanded:text-[var(--color-text-secondary)]",
        secondary:
          "border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] aria-expanded:bg-[var(--color-bg-secondary)] aria-expanded:text-[var(--color-text-secondary)]",
        ghost:
          "text-[var(--color-text-muted)] hover:bg-[var(--color-border-light)] hover:text-[var(--color-text-secondary)] aria-expanded:bg-[var(--color-border-light)] aria-expanded:text-[var(--color-text-secondary)]",
        destructive:
          "border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] hover:bg-[var(--color-danger-border)] focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
        warningFilled:
          "border-[var(--color-warning)] bg-[var(--color-warning)] text-[var(--color-text-inverse)] hover:brightness-95 active:brightness-90",
        dangerFilled:
          "border-[var(--color-danger)] bg-[var(--color-danger)] text-[var(--color-text-inverse)] hover:brightness-95 active:brightness-90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-[var(--dg-btn-h-lg)] gap-[var(--dg-btn-gap)] px-[var(--dg-btn-px)] text-[13px] sm:h-[var(--dg-btn-h)] has-data-[icon=inline-end]:pr-[calc(var(--dg-btn-px)-4px)] has-data-[icon=inline-start]:pl-[calc(var(--dg-btn-px)-4px)]",
        xs: "h-[var(--dg-btn-h-lg)] gap-1.5 px-[var(--dg-btn-px-xs)] text-[11px] sm:h-[var(--dg-btn-h-xs)] in-data-[slot=button-group]:rounded-[var(--dg-btn-radius)] has-data-[icon=inline-end]:pr-[calc(var(--dg-btn-px-xs)-2px)] has-data-[icon=inline-start]:pl-[calc(var(--dg-btn-px-xs)-2px)] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[var(--dg-btn-h-lg)] gap-[var(--dg-btn-gap)] px-[var(--dg-btn-px-sm)] text-[12px] sm:h-[var(--dg-btn-h-sm)] in-data-[slot=button-group]:rounded-[var(--dg-btn-radius)] has-data-[icon=inline-end]:pr-[calc(var(--dg-btn-px-sm)-2px)] has-data-[icon=inline-start]:pl-[calc(var(--dg-btn-px-sm)-2px)] [&_svg:not([class*='size-'])]:size-[var(--dg-btn-icon)]",
        lg: "h-[var(--dg-btn-h-lg)] gap-[var(--dg-btn-gap)] px-5 text-[13px] has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-6",
        icon: "size-[var(--dg-btn-h-lg)] sm:size-[var(--dg-btn-h)]",
        "icon-xs":
          "size-[var(--dg-btn-h-lg)] rounded-[var(--dg-btn-radius)] sm:size-[var(--dg-btn-h-xs)] in-data-[slot=button-group]:rounded-[var(--dg-btn-radius)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-[var(--dg-btn-h-lg)] rounded-[var(--dg-btn-radius)] sm:size-[var(--dg-btn-h-sm)] in-data-[slot=button-group]:rounded-[var(--dg-btn-radius)]",
        "icon-lg": "size-[var(--dg-btn-h-lg)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
