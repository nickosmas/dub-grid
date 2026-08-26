"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

type SelectableTagProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  children: ReactNode;
  selected: boolean;
  borderRadius?: CSSProperties["borderRadius"];
  padding?: CSSProperties["padding"];
  gap?: number;
  fontSize?: CSSProperties["fontSize"];
  fontWeight?: CSSProperties["fontWeight"];
  selectedFontWeight?: CSSProperties["fontWeight"];
  unselectedBackground?: string;
  selectedBackground?: string;
  unselectedBorderColor?: string;
  selectedBorderColor?: string;
  unselectedTextColor?: string;
  selectedTextColor?: string;
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
  unselectedBackground = "var(--dg-color-surface)",
  selectedBackground = "var(--dg-color-brand)",
  unselectedBorderColor = "var(--dg-color-border)",
  selectedBorderColor = "var(--dg-color-brand)",
  unselectedTextColor = "var(--dg-color-text-secondary)",
  selectedTextColor = "var(--dg-color-text-inverse)",
  labelStyle,
  style,
  ...buttonProps
}: SelectableTagProps) {
  const borderColor = selected ? selectedBorderColor : unselectedBorderColor;
  const textColor = selected ? selectedTextColor : unselectedTextColor;

  return (
    <button
      {...buttonProps}
      type={type}
      aria-pressed={selected}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        padding,
        borderRadius,
        border: `1.5px solid ${borderColor}`,
        background: selected ? selectedBackground : unselectedBackground,
        color: textColor,
        fontSize,
        fontWeight: selected ? selectedFontWeight : fontWeight,
        cursor: disabled ? "default" : "pointer",
        transition: "border-color 150ms ease, background 150ms ease, color 150ms ease",
        fontFamily: "inherit",
        lineHeight: 1.2,
        textAlign: "left",
        opacity: disabled ? 0.65 : 1,
        ...style,
      }}
    >
      <span style={labelStyle}>{children}</span>
    </button>
  );
}
