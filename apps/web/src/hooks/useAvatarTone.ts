"use client";

import { useTheme } from "next-themes";
import { getAvatarTone, type AvatarTone } from "@dubgrid/design-tokens";

export type { AvatarTone };

/**
 * Resolves a person's avatar chip colors for the active theme.
 *
 * Seed with `resolveAvatarSeed` from `@dubgrid/design-tokens` wherever the
 * person may have a linked account, so the same human keeps one color across
 * presence, the people table, and their own header avatar.
 *
 * Only safe to call a fixed number of times per render (React's Rules of
 * Hooks) - for avatars rendered inside a loop/map, call `useTheme()` once at
 * the top of the component and use `getAvatarTone` (the plain function this
 * wraps) inside the loop.
 */
export function useAvatarTone(seed: string): AvatarTone {
  const { resolvedTheme } = useTheme();
  return getAvatarTone(seed, resolvedTheme === "dark");
}
