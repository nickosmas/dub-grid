import { useEffect, useRef, useState } from "react";

/** A load that finishes this fast shows no skeleton at all: the flash reads as a glitch. */
export const SKELETON_DELAY_MS = 150;

/** A skeleton that appeared stays this long, so a load landing just after the delay doesn't strobe. */
export const SKELETON_MIN_VISIBLE_MS = 300;

/**
 * Whether a loading skeleton should be painted. It stays false for a load
 * that resolves within the delay, and once true it holds for the minimum
 * visible time even after loading ends, so callers render the skeleton while
 * this is true and their content only once it is false and loading is done.
 * Mirrors the mobile app's hook of the same name.
 */
export function useSkeletonGate(
  isLoading: boolean,
  options?: { delayMs?: number; minVisibleMs?: number },
): boolean {
  const delayMs = options?.delayMs ?? SKELETON_DELAY_MS;
  const minVisibleMs = options?.minVisibleMs ?? SKELETON_MIN_VISIBLE_MS;
  const [isVisible, setIsVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      if (shownAtRef.current !== null) return;
      const showTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setIsVisible(true);
      }, delayMs);
      return () => clearTimeout(showTimer);
    }

    const shownAt = shownAtRef.current;
    if (shownAt === null) {
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
