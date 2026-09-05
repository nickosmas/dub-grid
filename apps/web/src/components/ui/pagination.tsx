"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/Button";
import { cn } from "@/lib/utils";

export type PaginationItem = number | "gap";

/**
 * The page numbers to render, with runs of hidden pages collapsed to a gap.
 *
 * The slot count stays fixed once the list is long enough to need gaps, so the
 * control doesn't reflow (and move the button under the cursor) as you page.
 */
export function getPaginationItems(page: number, totalPages: number): PaginationItem[] {
  const SIBLINGS = 1;
  const MAX_SLOTS = SIBLINGS * 2 + 5;
  const range = (from: number, to: number) =>
    Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

  if (totalPages <= MAX_SLOTS) return range(1, totalPages);

  const left = Math.max(page - SIBLINGS, 1);
  const right = Math.min(page + SIBLINGS, totalPages);
  const showLeftGap = left > 2;
  const showRightGap = right < totalPages - 1;
  const edgeRunLength = SIBLINGS * 2 + 3;

  if (!showLeftGap) return [...range(1, edgeRunLength), "gap", totalPages];
  if (!showRightGap) return [1, "gap", ...range(totalPages - edgeRunLength + 1, totalPages)];
  return [1, "gap", ...range(left, right), "gap", totalPages];
}

// `.dg-btn` and its size modifiers are unlayered, so they beat Tailwind
// height/padding utilities. Size these through the button system's own
// modifier instead, or every control here silently renders at 38px.
const CONTROL_CLASS = "dg-btn dg-btn-secondary dg-btn-sm dg-btn-icon";

// The numerals deliberately skip `.dg-btn`. At button size they read as a row
// of chunky squares competing with Previous/Next; staying off the class also
// keeps their sizing in the utility layer, where it actually applies.
const PAGE_CLASS =
  "inline-flex h-7 min-w-7 items-center justify-center rounded-[var(--dg-radius-sm)] px-1.5 " +
  "text-[length:var(--dg-fs-label)] tabular-nums transition-colors";
const PAGE_IDLE =
  "cursor-pointer text-[var(--dg-color-text-secondary)] hover:bg-[var(--dg-color-border-light)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dg-color-border-focus)]";
const PAGE_CURRENT =
  "bg-[var(--dg-color-brand)] font-semibold text-[var(--dg-color-on-brand-text)]";

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points={direction === "left" ? "15 6 9 12 15 18" : "9 6 15 12 9 18"} />
    </svg>
  );
}

interface PaginationProps {
  /** One-based. Sources that count from zero pass `page + 1`. */
  page: number;
  onPageChange: (page: number) => void;
  /** Omit when the source pages by cursor and cannot know the total. */
  totalPages?: number;
  /** Stands in for `totalPages` when the total is unknown. */
  hasNext?: boolean;
  /** Centered line beneath the controls, e.g. "Showing 21-30 of 196". */
  summary?: ReactNode;
  className?: string;
}

export function Pagination({
  page,
  onPageChange,
  totalPages,
  hasNext,
  summary,
  className,
}: PaginationProps) {
  // A known total of one page means there is nothing to navigate. A cursor
  // source can't tell a short first page from a full one, so it keeps its
  // controls and lets `hasNext` disable them.
  if (totalPages != null && totalPages <= 1) return null;

  const canGoNext = totalPages != null ? page < totalPages : Boolean(hasNext);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-col items-center gap-1.5 px-4 py-3 text-[var(--dg-color-text-muted)]",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        <Button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={CONTROL_CLASS}
        >
          <Chevron direction="left" />
        </Button>

        {totalPages != null ? (
          <div className="mx-1 flex items-center gap-1 max-sm:hidden">
            {getPaginationItems(page, totalPages).map((item, index) =>
              item === "gap" ? (
                <span
                  key={`gap-${index}`}
                  aria-hidden="true"
                  className="w-4 text-center text-[length:var(--dg-fs-caption)] select-none"
                >
                  &hellip;
                </span>
              ) : (
                <Button
                  key={item}
                  onClick={() => onPageChange(item)}
                  aria-label={`Page ${item}`}
                  aria-current={item === page ? "page" : undefined}
                  className={cn(PAGE_CLASS, item === page ? PAGE_CURRENT : PAGE_IDLE)}
                >
                  {item}
                </Button>
              ),
            )}
          </div>
        ) : (
          <span aria-current="page" className={cn("mx-1", PAGE_CLASS, PAGE_CURRENT)}>
            {page}
          </span>
        )}

        {totalPages != null && (
          <span className="mx-1 text-[length:var(--dg-fs-label)] tabular-nums sm:hidden">
            Page {page} of {totalPages}
          </span>
        )}

        <Button
          onClick={() => onPageChange(page + 1)}
          disabled={!canGoNext}
          aria-label="Next page"
          className={CONTROL_CLASS}
        >
          <Chevron direction="right" />
        </Button>
      </div>

      {summary != null && (
        <span className="text-[length:var(--dg-fs-caption)] tabular-nums">{summary}</span>
      )}
    </nav>
  );
}
