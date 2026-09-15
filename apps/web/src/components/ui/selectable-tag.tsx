"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { MaybeHint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";

type SelectableTagProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children: ReactNode;
  selected: boolean;
  borderRadius?: CSSProperties["borderRadius"];
  padding?: CSSProperties["padding"];
  gap?: number;
  fontSize?: CSSProperties["fontSize"];
  fontWeight?: CSSProperties["fontWeight"];
  selectedFontWeight?: CSSProperties["fontWeight"];
  selectedBackground?: string;
  selectedBorderColor?: string;
  selectedTextColor?: string;
  disabledBackground?: string;
  disabledBorderColor?: string;
  disabledTextColor?: string;
  disabledOpacity?: number;
  labelStyle?: CSSProperties;
};

export function SelectableTag({
  children,
  selected,
  disabled,
  type = "button",
  borderRadius = 999,
  padding = "5px 12px",
  gap = 8,
  fontSize = "var(--dg-fs-caption)",
  fontWeight = 600,
  selectedFontWeight = 700,
  selectedBackground = "var(--dg-color-brand)",
  selectedBorderColor = "var(--dg-color-brand)",
  selectedTextColor = "var(--dg-color-text-inverse)",
  disabledBackground,
  disabledBorderColor,
  disabledTextColor,
  disabledOpacity = 0.65,
  labelStyle,
  className,
  title,
  style,
  ...buttonProps
}: SelectableTagProps) {
  const fullLabel = title ?? (typeof children === "string" ? children : undefined);
  const borderColor =
    disabled && disabledBorderColor
      ? disabledBorderColor
      : selected
        ? selectedBorderColor
        : "var(--dg-color-border)";
  const background =
    disabled && disabledBackground
      ? disabledBackground
      : selected
        ? selectedBackground
        : "var(--dg-color-surface)";
  const textColor =
    disabled && disabledTextColor
      ? disabledTextColor
      : selected
        ? selectedTextColor
        : "var(--dg-color-text-secondary)";

  return (
    <MaybeHint content={fullLabel}>
      <button
        {...buttonProps}
        type={type}
        aria-pressed={selected}
        className={cn("dg-pill-action", className)}
        disabled={disabled}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap,
          padding,
          borderRadius,
          border: `1.5px solid ${borderColor}`,
          background,
          color: textColor,
          fontSize,
          fontWeight: selected ? selectedFontWeight : fontWeight,
          cursor: disabled ? "default" : "pointer",
          transition: "border-color 150ms ease, background 150ms ease, color 150ms ease",
          fontFamily: "inherit",
          lineHeight: 1.2,
          textAlign: "left",
          opacity: disabled ? disabledOpacity : 1,
          ...style,
        }}
      >
        <span className="dg-pill-action-label" style={labelStyle}>
          {children}
        </span>
      </button>
    </MaybeHint>
  );
}
