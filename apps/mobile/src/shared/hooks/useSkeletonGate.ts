import { useEffect, useRef, useState } from "react";

/**
 * A request that resolves this fast should never have shown a skeleton at all:
 * the flash reads as a glitch, and it is more distracting than the brief blank
 * it replaced.
 */
export const SKELETON_DELAY_MS = 150;

/**
 * Once a skeleton is on screen it stays for at least this long. Without it, a
 * request landing just after the delay strobes the skeleton for a few frames,
 * which looks worse than either extreme.
 */
export const SKELETON_MIN_VISIBLE_MS = 300;

/**
 * Decides whether a loading placeholder should actually be painted.
 *
 * Screens keep asking react-query "is this loading?", but that answer is the
 * wrong one to render directly: it is true for one frame on a warm cache and
 * for ten seconds on a cold network. This gates it into "is a skeleton the
 * honest thing to show right now?".
 *
 * Deliberately not tied to reduce-motion. This is about the timing of
 * information, not about movement, so it applies either way.
 */
export function useSkeletonGate(
  isLoading: boolean,
  options?: { delayMs?: number; minVisibleMs?: number },
): boolean {
  const delayMs = options?.delayMs ?? SKELETON_DELAY_MS;
  const minVisibleMs = options?.minVisibleMs ?? SKELETON_MIN_VISIBLE_MS;
  const [isVisible, setIsVisible] = useState(false);
  // Null whenever no skeleton is showing; otherwise when it first appeared.
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      if (shownAtRef.current !== null) {
        // Already showing, and it stays showing until loading ends.
        return;
      }

      const showTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setIsVisible(true);
      }, delayMs);

      return () => clearTimeout(showTimer);
    }

    const shownAt = shownAtRef.current;

    if (shownAt === null) {
      // Resolved inside the delay window, so nothing was ever painted.
      setIsVisible(false);
      return;
    }

    const remainingMs = minVisibleMs - (Date.now() - shownAt);

    if (remainingMs <= 0) {
      shownAtRef.current = null;
      setIsVisible(false);
      return;
    }

    const hideTimer = setTimeout(() => {
      shownAtRef.current = null;
      setIsVisible(false);
    }, remainingMs);

    return () => clearTimeout(hideTimer);
  }, [isLoading, delayMs, minVisibleMs]);

  return isVisible;
}
