/**
 * The "M" of a mentored shift, drawn rather than typeset so it sits at the
 * exact centre of its circle at every size, on screen and in print. A text
 * glyph's ink sits on font metrics and snaps to whole pixels, which left it a
 * pixel off at the badge's sizes.
 *
 * The strokes span 1.45 to 8.55 across and 1.65 to 8.3 down a 10-unit box,
 * both centred on 5.
 */
export function MentoredGlyph({ size }: { size: number | string }) {
  return (
    <svg
      aria-hidden="true"
      data-mentored-glyph=""
      viewBox="0 0 10 10"
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0 }}
    >
      <polyline
        points="2.2,8.3 2.2,2.4 5,6.2 7.8,2.4 7.8,8.3"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="butt"
      />
    </svg>
  );
}
