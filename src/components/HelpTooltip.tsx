"use client";

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface HelpTooltipProps {
  text: string;
  side?: "top" | "bottom" | "left" | "right";
  /** Icon size in px (default 14) */
  size?: number;
}

/**
 * A small "?" icon that shows a help tooltip on hover/focus.
 * Uses the shadcn/base-ui Tooltip under the hood.
 */
export default function HelpTooltip({ text, side = "top", size = 14 }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label="Help"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size + 4,
          height: size + 4,
          borderRadius: "50%",
          background: "var(--color-bg-secondary)",
          color: "var(--color-text-muted)",
          fontSize: size - 2,
          fontWeight: 700,
          lineHeight: 1,
          cursor: "help",
          border: "none",
          padding: 0,
          verticalAlign: "middle",
          flexShrink: 0,
        }}
      >
        ?
      </TooltipTrigger>
      <TooltipContent side={side} style={{ maxWidth: 260 }}>
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
