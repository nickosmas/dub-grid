import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const numericBadgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full box-border px-0.5 tabular-nums whitespace-nowrap data-[shape=pill]:w-auto",
  {
    variants: {
      size: {
        sm: "h-[18px] min-w-[18px] data-[shape=circle]:w-[18px] data-[shape=pill]:px-1",
        md: "h-5 min-w-5 data-[shape=circle]:w-5 data-[shape=pill]:px-1.5",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

type NumericBadgeProps = Omit<ComponentProps<"span">, "children"> &
  VariantProps<typeof numericBadgeVariants> & {
    value: number | string;
  };

export function NumericBadge({ className, size, value, ...props }: NumericBadgeProps) {
  const label = String(value);
  const shape = Array.from(label).length > 2 ? "pill" : "circle";

  return (
    <span {...props} className={cn(numericBadgeVariants({ size }), className)} data-shape={shape}>
      {label}
    </span>
  );
}

export { numericBadgeVariants };
