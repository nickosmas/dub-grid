"use client";

import { useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/Button";
import { NumericBadge } from "@/components/ui/numeric-badge";

export interface UnderlineTabItem<T extends string> {
  value: T;
  label: string;
  /** Something waiting there, shown as a count after the label. */
  count?: number;
}

function tabId(idPrefix: string, value: string): string {
  return `${idPrefix}-tab-${value}`;
}

function panelId(idPrefix: string, value: string): string {
  return `${idPrefix}-panel-${value}`;
}

/** Props for the element that holds the chosen tab's content. */
export function underlineTabPanelProps(idPrefix: string, value: string) {
  return {
    id: panelId(idPrefix, value),
    role: "tabpanel" as const,
    "aria-labelledby": tabId(idPrefix, value),
    tabIndex: 0,
  };
}

/**
 * The sections of a page or panel. A choice among views of the same content
 * (a period, a filter, a form answer) is a `SpanTabs` segmented control instead.
 */
export function UnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  idPrefix,
  compact = false,
  "aria-label": ariaLabel,
  className = "",
}: {
  items: UnderlineTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Ties each tab to its panel; pair it with `underlineTabPanelProps`. */
  idPrefix: string;
  /** Tighter spacing for a narrow panel. */
  compact?: boolean;
  "aria-label": string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  const moveTo = (index: number) => {
    const next = items[(index + items.length) % items.length];
    if (!next) return;
    onChange(next.value);
    listRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(tabId(idPrefix, next.value))}`)
      ?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.value === value);
    if (event.key === "ArrowRight") moveTo(current + 1);
    else if (event.key === "ArrowLeft") moveTo(current - 1);
    else if (event.key === "Home") moveTo(0);
    else if (event.key === "End") moveTo(items.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`dg-underline-tabs${compact ? " dg-underline-tabs--compact" : ""} ${className}`.trim()}
    >
      {items.map((item) => {
        const isActive = item.value === value;
        return (
          <Button
            key={item.value}
            type="button"
            role="tab"
            id={tabId(idPrefix, item.value)}
            aria-selected={isActive}
            aria-controls={panelId(idPrefix, item.value)}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={`dg-underline-tab${isActive ? " active" : ""}`}
          >
            <span className="dg-underline-tab-label" data-label={item.label}>
              {item.label}
            </span>
            {item.count ? (
              <NumericBadge
                count={item.count}
                tone="label"
                label={`${item.count} waiting`}
                className="dg-underline-tab-count"
              />
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
