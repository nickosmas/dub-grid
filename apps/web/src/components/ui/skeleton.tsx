import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("dg-skeleton rounded-[var(--dg-radius-sm)]", className)}
      {...props}
    />
  );
}

export { Skeleton };
