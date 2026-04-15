"use client";

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { HintContent } from "./hint.types";
import { hint } from "./hint.types";

export interface HintProps {
  /** Tooltip text. Branded to max 80 characters by convention. */
  content: HintContent;
  /** Preferred placement side. Auto-flips near viewport edges. */
  side?: "top" | "bottom" | "left" | "right";
  /** Suppress the tooltip (e.g. while editing). */
  disabled?: boolean;
  /** The trigger element. */
  children: React.ReactElement;
}

/**
 * Lightweight, ambient tooltip. Appears on hover (500ms delay) or keyboard
 * focus (instant). Dismisses on mouse-leave or Escape. Persists while cursor
 * is over the tooltip itself.
 *
 * Uses Base UI tooltip primitives — handles positioning, keyboard a11y,
 * aria-describedby, and role="tooltip" automatically.
 */
export function Hint({
  content,
  side = "top",
  disabled = false,
  children,
}: HintProps) {
  if (disabled) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  );
}

interface MaybeHintProps {
  content?: string | null;
  side?: "top" | "bottom" | "left" | "right";
  disabled?: boolean;
  children: React.ReactElement;
}

export function MaybeHint({
  content,
  side = "top",
  disabled = false,
  children,
}: MaybeHintProps) {
  if (!content || disabled) {
    return children;
  }

  return (
    <Hint content={hint(content)} side={side}>
      {children}
    </Hint>
  );
}

/* ── HelpHint ─────────────────────────────────────────────── */

interface HelpHintProps {
  /** Help text. Branded to max 80 characters by convention. */
  content: HintContent;
  side?: "top" | "bottom" | "left" | "right";
  /** Icon size in px (default 14). */
  size?: number;
}

/**
 * A small "?" icon that shows a help tooltip on hover/focus.
 * Drop-in replacement for the legacy HelpTooltip.
 */
export function HelpHint({ content, side = "top", size = 14 }: HelpHintProps) {
  return (
    <Hint content={content} side={side}>
      <button
        type="button"
        aria-label="Help"
        className="help-hint-trigger"
        style={{
          width: size + 4,
          height: size + 4,
          fontSize: size - 2,
        }}
      >
        ?
      </button>
    </Hint>
  );
}
export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";
