"use client";

import { useTheme } from "next-themes";
import { resolveShiftPillColors, type ShiftPillColors } from "@/lib/colors";

export type { ShiftPillColors };

/**
 * Resolves a shift/job/absence-type's stored {color, text, border} triple
 * for the active theme. In light mode (or before the theme is known, e.g.
 * during SSR/tests without a ThemeProvider) returns the values unchanged.
 * In dark mode, remaps the pastel bg to a dark-appropriate tone so the same
 * admin-picked category color still reads well against the ink-black page.
 *
 * Only safe to call a fixed number of times per render (React's Rules of
 * Hooks) — for pills rendered inside a loop/map, call `useTheme()` once at
 * the top of the component instead and use `resolveShiftPillColors` (the
 * plain function this hook wraps) inside the loop.
 */
export function useShiftPillColors(style: ShiftPillColors): ShiftPillColors {
  const { resolvedTheme } = useTheme();
  return resolveShiftPillColors(style, resolvedTheme === "dark");
}
