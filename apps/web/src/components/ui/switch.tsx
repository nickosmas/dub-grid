"use client";

import type { CSSProperties } from "react";
import { Button } from "@/components/Button";

interface SwitchBaseProps {
  checked: boolean;
  disabled?: boolean;
  style?: CSSProperties;
}

type SwitchProps = SwitchBaseProps &
  (
    | {
        presentationOnly: true;
        onChange?: never;
        ariaLabel?: never;
        id?: never;
      }
    | {
        presentationOnly?: false;
        onChange: (next: boolean) => void;
        ariaLabel?: string;
        id?: string;
      }
  );

export function Switch(props: SwitchProps) {
  const { checked, disabled, style } = props;
  const trackStyle: CSSProperties = {
    width: 44,
    height: 24,
    borderRadius: 12,
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    background: checked ? "var(--dg-color-brand)" : "var(--dg-color-switch-track-off)",
    opacity: disabled ? 0.55 : 1,
    position: "relative",
    transition: "background 0.2s",
    flexShrink: 0,
    padding: 0,
    ...style,
  };
  const thumb = (
    <span
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        background: "var(--dg-color-text-inverse)",
        position: "absolute",
        top: 3,
        left: checked ? 23 : 3,
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
      }}
    />
  );

  if (props.presentationOnly) {
    return (
      <span
        data-slot="switch"
        aria-hidden="true"
        style={{ ...trackStyle, cursor: "default", display: "inline-block" }}
      >
        {thumb}
      </span>
    );
  }

  return (
    <Button
      id={props.id}
      data-slot="switch"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={props.ariaLabel}
      disabled={disabled}
      onClick={() => props.onChange(!checked)}
      style={trackStyle}
    >
      {thumb}
    </Button>
  );
}
