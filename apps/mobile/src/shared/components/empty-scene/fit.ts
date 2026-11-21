/** The smallest share of its size a drawing shrinks to before it is left out. */
export const MIN_SCENE_FIT = 0.5;

/**
 * How large a full-page empty state's drawing can be so the whole state shows
 * above whatever covers the foot of the page: 1, a smaller share, or 0 to
 * leave the drawing out. The copy always shows. `room` is the height from the
 * top of the state's content to the end of the visible area; a state that
 * starts below that, or before anything is measured, keeps its drawing.
 */
export function getEmptySceneFit({
  room,
  rest,
  sceneHeight,
  gap,
}: {
  room: number | null;
  /** The state's content without the drawing or the gap under it. */
  rest: number | null;
  sceneHeight: number;
  gap: number;
}): number {
  if (room === null || rest === null || room <= 0) return 1;
  const left = room - rest - gap;
  if (left >= sceneHeight) return 1;
  const share = left / sceneHeight;
  return share >= MIN_SCENE_FIT ? share : 0;
}
