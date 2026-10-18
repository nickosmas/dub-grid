/** Layout of a reorderable list at the moment a drag starts, in one frame of reference. */
export interface ReorderLayout {
  tops: number[];
  heights: number[];
}

/**
 * Where the dragged item lands: the number of other items that end up above
 * it. Reaching an item's center counts as passing it, so a drag clamped at
 * either end of the list still lands first or last.
 */
export function computeDropIndex(layout: ReorderLayout, sourceIdx: number, deltaY: number): number {
  const draggedCenter = layout.tops[sourceIdx] + layout.heights[sourceIdx] / 2 + deltaY;
  let dropIdx = 0;
  for (let index = 0; index < layout.tops.length; index += 1) {
    if (index === sourceIdx) continue;
    const center = layout.tops[index] + layout.heights[index] / 2;
    if (index < sourceIdx ? draggedCenter > center : draggedCenter >= center) dropIdx += 1;
  }
  return dropIdx;
}

/**
 * How far the dragged item travels to reach its slot. Measured edge to edge
 * rather than by summing heights, so gaps between items are included.
 */
export function computeTargetDelta(
  layout: ReorderLayout,
  sourceIdx: number,
  dropIdx: number,
): number {
  const { tops, heights } = layout;
  if (sourceIdx === dropIdx) return 0;
  if (dropIdx > sourceIdx) {
    return tops[dropIdx] + heights[dropIdx] - (tops[sourceIdx] + heights[sourceIdx]);
  }
  return tops[dropIdx] - tops[sourceIdx];
}

/** How far each displaced item steps aside: the dragged item's height plus the gap after it. */
export function computeSlotSize(layout: ReorderLayout, sourceIdx: number): number {
  const { tops, heights } = layout;
  if (sourceIdx + 1 < tops.length) return tops[sourceIdx + 1] - tops[sourceIdx];
  if (sourceIdx > 0)
    return tops[sourceIdx] - tops[sourceIdx - 1] - heights[sourceIdx - 1] + heights[sourceIdx];
  return heights[sourceIdx] ?? 0;
}

/** Keeps the dragged item within the list instead of letting it float past either end. */
export function clampDragDelta(layout: ReorderLayout, sourceIdx: number, deltaY: number): number {
  const { tops, heights } = layout;
  const last = tops.length - 1;
  const min = tops[0] - tops[sourceIdx];
  const max = tops[last] + heights[last] - (tops[sourceIdx] + heights[sourceIdx]);
  return Math.min(max, Math.max(min, deltaY));
}

/**
 * Pixels to scroll this frame while the pointer is near (or past) an edge of
 * the visible area. Speed ramps up toward the edge so a small nudge creeps and
 * a pointer held at the edge moves quickly.
 */
export function computeAutoScrollStep(
  pointerY: number,
  visibleTop: number,
  visibleBottom: number,
  maxStep = 22,
): number {
  const height = visibleBottom - visibleTop;
  if (height <= 0) return 0;
  const zone = Math.min(96, Math.max(40, height * 0.15));
  const intoTop = visibleTop + zone - pointerY;
  const intoBottom = pointerY - (visibleBottom - zone);
  const ramp = (depth: number) => Math.min(1, depth / zone) ** 2;
  if (intoTop > 0) return -Math.max(1, Math.round(maxStep * ramp(intoTop)));
  if (intoBottom > 0) return Math.max(1, Math.round(maxStep * ramp(intoBottom)));
  return 0;
}
