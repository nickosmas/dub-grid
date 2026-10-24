"use client";

import { Button } from "@/components/Button";
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
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {options.map((option) => {
        const checked = option.scope === value;
        const note = notes?.[option.scope];
        return (
          <Button
            key={option.scope}
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.scope)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "12px 14px",
              borderRadius: "var(--dg-radius-lg)",
              border: `1px solid ${checked ? "var(--dg-color-primary)" : "var(--dg-color-border)"}`,
              background: checked ? "var(--dg-color-primary-bg)" : "var(--dg-color-surface)",
              textAlign: "left",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 18,
                height: 18,
                marginTop: 1,
                flexShrink: 0,
                borderRadius: 9,
                border: `2px solid ${checked ? "var(--dg-color-primary)" : "var(--dg-color-border-strong)"}`,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {checked ? (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: "var(--dg-color-primary)",
                  }}
                />
              ) : null}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span
                style={{
                  fontSize: "var(--dg-fs-label)",
                  fontWeight: 600,
                  color: "var(--dg-color-text-primary)",
                }}
              >
                {option.label}
              </span>
              {option.detail ? (
                <span
                  className="dg-tabular-nums"
                  style={{ fontSize: "var(--dg-fs-caption)", color: "var(--dg-color-text-muted)" }}
                >
                  {option.detail}
                </span>
              ) : null}
              {note ? (
                <span
                  style={{
                    fontSize: "var(--dg-fs-footnote)",
                    color: "var(--dg-color-accent-text)",
                    marginTop: 2,
                  }}
                >
                  {note}
                </span>
              ) : null}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
