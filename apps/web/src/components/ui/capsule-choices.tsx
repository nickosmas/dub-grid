"use client";

import { Button } from "@/components/Button";
import { NumericBadge } from "@/components/ui/numeric-badge";

export interface CapsuleChoice<T extends string> {
  value: T;
  label: string;
  /** Something waiting there, shown as a count after the label. */
  count?: number;
  /** What the count means to a screen reader; "N waiting" by default. */
  countLabel?: string;
}

/**
 * A filter's choices as a wrapping row of capsules, one chosen. Views and form
 * answers are the segmented control (`SpanTabs`) instead.
 */
export function CapsuleChoices<T extends string>({
  items,
  value,
  onChange,
  "aria-label": ariaLabel,
  className = "",
}: {
  items: CapsuleChoice<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={`dg-capsules ${className}`.trim()}>
      {items.map((item) => {
        const isActive = value === item.value;
        return (
          <Button
            key={item.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(item.value)}
            className={`dg-capsule${isActive ? " active" : ""}`}
          >
            {item.label}
            {item.count ? (
              <NumericBadge
                count={item.count}
                tone="label"
                label={item.countLabel ?? `${item.count} waiting`}
                className="dg-capsule-count"
              />
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
