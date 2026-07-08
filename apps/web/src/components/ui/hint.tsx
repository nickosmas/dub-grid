"use client";

import React, { useId, useRef, useState } from "react";

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Popover, PopoverContent } from "@/components/ui/popover";
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
export function Hint({ content, side = "top", disabled = false, children }: HintProps) {
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

export function MaybeHint({ content, side = "top", disabled = false, children }: MaybeHintProps) {
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
 * A small "?" icon that shows contextual help on click.
 */
export function HelpHint({ content, side = "top", size = 14 }: HelpHintProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupId = useId();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Help"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        className="help-hint-trigger"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((previous) => !previous);
        }}
        style={{
          width: size + 6,
          height: size + 6,
          fontSize: size - 2,
        }}
      >
        ?
      </button>

      {open && triggerRef.current ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverContent
            id={popupId}
            role="dialog"
            aria-label="Help"
            anchor={triggerRef}
            side={side}
            align="center"
            sideOffset={8}
            positionMethod="fixed"
            collisionPadding={12}
            collisionAvoidance={{
              side: "flip",
              align: "shift",
              fallbackAxisSide: "none",
            }}
            style={{
              maxWidth: 260,
              padding: "10px 12px",
              borderRadius: "var(--dg-radius-md)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              boxShadow: "var(--tooltip-shadow)",
              color: "var(--color-text-primary)",
              fontSize: "var(--dg-fs-caption)",
              lineHeight: 1.45,
            }}
          >
            {content}
          </PopoverContent>
        </Popover>
      ) : null}
    </>
  );
}
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
