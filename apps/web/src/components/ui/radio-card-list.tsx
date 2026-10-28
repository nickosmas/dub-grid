"use client";

import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/Button";

export interface RadioCardOption<T extends string | number> {
  value: T;
  label: string;
  /** A muted line under the label. */
  detail?: string | null;
  /** An accented line under the detail, such as what only this choice can change. */
  note?: string | null;
  /** Drawn in place of the radio; the picked card then carries a check. */
  icon?: ReactNode;
  /** Shown muted and can't be picked; its detail should say why. */
  disabled?: boolean;
}

interface RadioCardListProps<T extends string | number> {
  label: string;
  options: readonly RadioCardOption<T>[];
  /** Null when nothing is picked yet. */
  value: T | null;
  onChange: (value: T) => void;
}

/** A column of radio cards: the app's choice list inside dialogs and panels. */
export function RadioCardList<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: RadioCardListProps<T>): ReactNode {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {options.map((option) => {
        const checked = option.value === value;
        const note = option.note;
        const disabled = Boolean(option.disabled);
        return (
          <Button
            key={String(option.value)}
            role="radio"
            aria-checked={checked}
            // Left focusable, so a screen reader still reaches the reason.
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled) onChange(option.value);
            }}
            style={{
              display: "flex",
              alignItems: option.icon ? "center" : "flex-start",
              gap: 12,
              padding: "12px 14px",
              borderRadius: "var(--dg-radius-lg)",
              border: `1px solid ${checked ? "var(--dg-color-primary)" : "var(--dg-color-border)"}`,
              background: checked ? "var(--dg-color-primary-bg)" : "var(--dg-color-surface)",
              textAlign: "left",
              font: "inherit",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : undefined,
            }}
          >
            {option.icon ?? (
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
            )}
            <span
              style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}
            >
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
            {option.icon && checked ? (
              <CircleCheck
                aria-hidden="true"
                size={18}
                style={{ flexShrink: 0, color: "var(--dg-color-primary)" }}
              />
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}
