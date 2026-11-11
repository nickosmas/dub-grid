"use client";

import { NumericBadge } from "@/components/ui/numeric-badge";

export interface CheckboxChoice<T extends string | number> {
  value: T;
  label: string;
  /** Something waiting there, shown as a count after the label. */
  count?: number;
  /** What the count means to a screen reader; "N waiting" by default. */
  countLabel?: string;
}

/**
 * A filter's choices as a list of checkboxes, one per row. Any number can be
 * ticked, and none ticked means the filter is off. The ticked values come back
 * in the order the choices are listed, whatever order they were ticked in.
 */
export function CheckboxChoices<T extends string | number>({
  items,
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  items: CheckboxChoice<T>[];
  value: readonly T[];
  onChange: (value: T[]) => void;
  "aria-label": string;
}) {
  const toggle = (choice: T) =>
    onChange(
      items
        .map((item) => item.value)
        .filter((itemValue) =>
          itemValue === choice ? !value.includes(choice) : value.includes(itemValue),
        ),
    );

  return (
    <div role="group" aria-label={ariaLabel} className="dg-checkbox-choices">
      {items.map((item) => (
        <label key={String(item.value)} className="dg-checkbox-choice">
          <input
            type="checkbox"
            className="dg-checkbox"
            checked={value.includes(item.value)}
            onChange={() => toggle(item.value)}
          />
          <span className="dg-checkbox-choice-label">{item.label}</span>
          {item.count ? (
            <NumericBadge
              count={item.count}
              tone="neutral"
              label={item.countLabel ?? `${item.count} waiting`}
            />
          ) : null}
        </label>
      ))}
    </div>
  );
}
