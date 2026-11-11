"use client";

import { Button } from "@/components/Button";

export interface SpanTabItem<T extends string> {
  value: T;
  label: string;
  /** Something waiting there, shown as a count after the label. */
  count?: number;
}

/**
 * The segmented control: one choice among a few views, filters or answers.
 * The sections of a page are `UnderlineTabs` instead.
 */
export function SpanTabs<T extends string>({
  items,
  value,
  onChange,
  "aria-label": ariaLabel,
  className = "",
}: {
  items: SpanTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`dg-span-tabs dg-span-tabs--light ${className}`.trim()}
    >
      {items.map((item) => {
        const isActive = value === item.value;
        return (
          <Button
            key={item.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(item.value)}
            className={`dg-span-tab${isActive ? " active" : ""}`}
          >
            {item.label}
            {item.count ? (
              <span
                aria-label={`${item.count} waiting`}
                className="dg-span-tab-count dg-tabular-nums"
              >
                {item.count}
              </span>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
