"use client";

import { Button } from "@/components/Button";

export function clearFiltersLabel(activeFilterCount: number): string {
  return activeFilterCount === 1 ? "Clear filter" : "Clear filters";
}

/** The way out of a list that filters emptied. Renders nothing when no filter is on. */
export function ClearFiltersButton({
  activeFilterCount,
  onClear,
  small = false,
}: {
  activeFilterCount: number;
  onClear: () => void;
  small?: boolean;
}) {
  if (activeFilterCount <= 0) return null;
  return (
    <Button
      type="button"
      className={small ? "dg-btn dg-btn-secondary dg-btn-sm" : "dg-btn dg-btn-secondary"}
      onClick={onClear}
    >
      {clearFiltersLabel(activeFilterCount)}
    </Button>
  );
}
