"use client";

import ButtonSpinner from "@/components/ButtonSpinner";
import ProgressBar from "@/components/ProgressBar";

/**
 * Fallbacks for `next/dynamic` boundaries.
 *
 * `dynamic(..., { ssr: false })` opens a Suspense boundary whose fallback is
 * `null` unless a `loading` option is passed, so a component mounted by a click
 * paints nothing at all while its chunk downloads. The click handler is
 * synchronous, so `<Button>`'s promise latch never sees the wait either. Over a
 * real network that reads as a dead click.
 *
 * Pick the one shaped like what is arriving: an overlay keeps the click's
 * destination where the user is already looking, while a progress bar suits a
 * view swapping in under a page that stays put.
 */

/** For a chunk that arrives as a modal or slide-over. */
export function LazyOverlayFallback() {
  return (
    <div className="dg-modal-overlay" role="status" aria-label="Loading">
      <ButtonSpinner color="var(--dg-color-brand)" size={32} />
    </div>
  );
}

/**
 * For the print preview, which is its own full-bleed light surface. Under
 * `dg-force-light` the surface token is the same white the real view paints, so
 * the swap is not a flash.
 */
export function LazyPrintFallback() {
  return (
    <div
      className="dg-force-light"
      role="status"
      aria-label="Loading"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "var(--dg-color-surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ButtonSpinner color="var(--dg-color-brand)" size={32} />
    </div>
  );
}

/** For a chunk that swaps in under a page that stays visible. */
export function LazyProgressFallback() {
  return <ProgressBar loading />;
}
