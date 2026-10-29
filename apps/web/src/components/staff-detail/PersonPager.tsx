"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/Button";
import { MaybeHint } from "@/components/ui/hint";

interface PagerTarget {
  /** Null when the directory doesn't have them yet. */
  name: string | null;
  onOpen: () => void;
}

interface PersonPagerProps {
  position: number;
  total: number;
  previous: PagerTarget | null;
  next: PagerTarget | null;
}

function PagerButton({
  direction,
  target,
}: {
  direction: "Previous" | "Next";
  target: PagerTarget | null;
}) {
  const Icon = direction === "Previous" ? ChevronLeft : ChevronRight;
  const label = target?.name ? `${direction}: ${target.name}` : `${direction} person`;
  return (
    <MaybeHint content={target ? label : undefined}>
      <Button
        type="button"
        className="dg-btn dg-btn-secondary dg-btn-icon"
        aria-label={label}
        disabled={!target}
        onClick={target?.onOpen}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </Button>
    </MaybeHint>
  );
}

/** "7 of 37" and the arrows that step through the People list's order. */
export function PersonPager({ position, total, previous, next }: PersonPagerProps) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Move between people">
      <span className="dg-tabular-nums text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-subtle)]">
        {position} of {total}
      </span>
      <div className="flex items-center gap-1">
        <PagerButton direction="Previous" target={previous} />
        <PagerButton direction="Next" target={next} />
      </div>
    </div>
  );
}
