"use client";

import { Fragment } from "react";
import { Button } from "@/components/Button";

export interface SpanTabItem<T extends string> {
  value: T;
  label: string;
}

/**
 * The pill-in-a-shell selector the dashboard and schedule toolbars use for a
 * period or filter. The 1px dividers appear only between two inactive tabs, so
 * the active pill never sits against a line.
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
      {items.map((item, index) => {
        const isActive = value === item.value;
        const previousActive = index > 0 && value === items[index - 1].value;
        const showDivider = index > 0 && !isActive && !previousActive;

        return (
          <Fragment key={item.value}>
            {index > 0 && (
              <div
                aria-hidden
                className={`w-px h-4 shrink-0 self-center ${
                  showDivider ? "bg-[var(--dg-color-border)]" : "bg-transparent"
                }`}
              />
            )}
            <Button
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(item.value)}
              className={`dg-span-tab${isActive ? " active" : ""}`}
            >
              {item.label}
            </Button>
          </Fragment>
        );
      })}
    </div>
  );
}
