"use client";

import { RadioCardList } from "@/components/ui/radio-card-list";
import type { SeriesScopeChoice, SeriesScopeOption } from "@/lib/series-summary";

interface SeriesScopeChoicesProps {
  label: string;
  options: SeriesScopeOption[];
  value: SeriesScopeChoice;
  onChange: (scope: SeriesScopeChoice) => void;
  /** A line under one choice, such as what only that choice can change. */
  notes?: Partial<Record<SeriesScopeChoice, string>>;
}

/** Which days of a repeating item an edit or removal reaches. */
export function SeriesScopeChoices({
  label,
  options,
  value,
  onChange,
  notes,
}: SeriesScopeChoicesProps) {
  return (
    <RadioCardList
      label={label}
      options={options.map((option) => ({
        value: option.scope,
        label: option.label,
        detail: option.detail,
        note: notes?.[option.scope],
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
