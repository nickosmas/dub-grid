"use client";

import type { ComponentProps, KeyboardEvent, MouseEvent } from "react";
import { CloseButton } from "@/components/ui/CloseButton";
import { cn } from "@/lib/utils";

/** Right padding a search field needs while its clear button shows. */
export const SEARCH_CLEAR_PADDING = 36;

function nearestInput(from: HTMLElement): HTMLInputElement | null {
  let node: HTMLElement | null = from.parentElement;
  for (let depth = 0; node && depth < 3; depth += 1, node = node.parentElement) {
    const input = node.querySelector("input");
    if (input) return input;
  }
  return null;
}

/**
 * The X inside a search field. The button unmounts once the query is empty,
 * so it hands focus back to the field; otherwise focus drops to the page and a
 * keyboard user loses their place.
 */
export function SearchClearButton({
  onClear,
  onClick,
  className,
  ...rest
}: Omit<ComponentProps<typeof CloseButton>, "aria-label" | "size"> & {
  onClear: () => void;
}) {
  return (
    // Spread first: a tooltip trigger wraps this and passes its ref and
    // hover and focus handlers through these props.
    <CloseButton
      {...rest}
      size="sm"
      aria-label="Clear search"
      className={cn("dg-search-clear", className)}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        const input = nearestInput(event.currentTarget);
        onClear();
        input?.focus();
      }}
    />
  );
}

/**
 * Escape clears a search that has text. It stops there, so a field inside a
 * dialog or popover clears first and only a second Escape closes the surface.
 */
export function clearSearchOnEscape(onClear: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape" || !event.currentTarget.value) return;
    event.preventDefault();
    event.stopPropagation();
    onClear();
  };
}
