"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { useFloatingFooter } from "@/components/ui/use-floating-footer";
import { cn } from "@/lib/utils";

interface EditorActionRowProps {
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  destructiveAction?: ReactNode;
  inline?: boolean;
  style?: CSSProperties;
  className?: string;
  gap?: number;
  /**
   * The row is the footer of a box that can grow taller than the screen, such
   * as an editor opened inside a list: it floats at the bottom of the screen
   * while the box scrolls, and rests as the box's footer at its end.
   */
  floating?: boolean;
}

export function EditorActionRow({
  primaryAction,
  secondaryAction,
  destructiveAction,
  inline = false,
  style,
  className,
  gap = 8,
  floating = false,
}: EditorActionRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const lifted = useFloatingFooter(rowRef, floating);

  const baseStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap,
  };

  if (inline) {
    return (
      <div className={className} style={{ ...baseStyle, ...style }}>
        {destructiveAction}
        {secondaryAction}
        {primaryAction}
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className={cn(className, floating && "dg-floating-footer")}
      data-placement={floating ? (lifted ? "floating" : "resting") : undefined}
      style={{
        ...baseStyle,
        justifyContent: "flex-end",
        ...style,
      }}
    >
      {destructiveAction ? (
        <>
          {destructiveAction}
          <div style={{ flex: 1, minWidth: 0 }} />
        </>
      ) : null}
      {secondaryAction}
      {primaryAction}
    </div>
  );
}
