/**
 * Geometry for the schedule grid's sticky focus-area label and date row.
 *
 * The pair is a native `position: sticky` group so the compositor moves it in
 * lockstep with the page. That rules out keeping the date row inside the
 * horizontal scroller (a scroll container would become its scrollport), so the
 * header lives in its own mirrored scroller above the card body instead.
 */

/** Staff rows kept clear of the sticky group at the bottom of a section. */
export const STICKY_RELEASE_ROWS = 5;

/**
 * How far a change chip hangs above its row's top edge. The card body reserves
 * this much transparent padding so the first row's chip can paint over the
 * header cap while the group is at rest, exactly as it hangs into the row above
 * everywhere else.
 */
export const CHIP_OVERHANG_PX = 6;

export interface StickyReleaseInsetInput {
  /** Viewport y of the card body's bottom edge. */
  cardBottom: number;
  /** Viewport y of the release anchor row, or null when the section has none. */
  releaseRowTop: number | null;
}

/**
 * A sticky element is confined to its containing block's content box. Padding
 * the section by this inset (and pulling the card body back up by the same
 * amount, so nothing moves visually) ends that content box at the release row,
 * which makes the group slide away that many pixels before the section ends.
 */
export function computeStickyReleaseInset({
  cardBottom,
  releaseRowTop,
}: StickyReleaseInsetInput): number {
  if (releaseRowTop == null) return 0;
  if (!Number.isFinite(cardBottom) || !Number.isFinite(releaseRowTop)) return 0;
  return Math.max(0, cardBottom - releaseRowTop);
}
