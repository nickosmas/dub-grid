"use client";

import { CalendarDays } from "lucide-react";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";

interface ActivityEmptyPeriodProps {
  /** "this week", "in August 2026". */
  periodPhrase: string;
  hasFilters: boolean;
  onClearFilters: () => void;
  /** The nearest activity outside this period, when there is any. */
  previousActivity?: { label: string; onJump: () => void } | null;
  /** Replaces the default copy when nothing has ever been recorded here. */
  description?: string;
}

/**
 * Stepping to the previous period is the toolbar's job, so this offers only
 * what the toolbar cannot: clearing filters, or skipping straight to where the
 * activity actually is.
 */
export function ActivityEmptyPeriod({
  periodPhrase,
  hasFilters,
  onClearFilters,
  previousActivity = null,
  description,
}: ActivityEmptyPeriodProps) {
  const action = hasFilters ? (
    <Button type="button" className="dg-btn dg-btn-secondary dg-btn-sm" onClick={onClearFilters}>
      Clear filters
    </Button>
  ) : previousActivity ? (
    <Button
      type="button"
      className="dg-btn dg-btn-secondary dg-btn-sm"
      onClick={previousActivity.onJump}
    >
      Jump to {previousActivity.label}
    </Button>
  ) : undefined;

  return (
    <EmptyState
      size="compact"
      icon={<CalendarDays size={20} />}
      title={
        description && !hasFilters
          ? "No activity yet"
          : hasFilters
            ? "No matching activity"
            : `No activity ${periodPhrase}`
      }
      description={
        description ??
        (hasFilters
          ? "Nothing in this period matches the current filters."
          : "Nothing was recorded in this period.")
      }
      action={action}
    />
  );
}
