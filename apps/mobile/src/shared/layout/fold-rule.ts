/**
 * How a split view collapses and expands as the iPhone Duo folds (Apple's
 * split view): a row the person picked becomes a page pushed with Back; a
 * default the page chose on its own gives way to the list.
 */
export function shouldPushPickOnClose({
  wasSplit,
  isSplit,
  pickedId,
}: {
  wasSplit: boolean;
  isSplit: boolean;
  pickedId: string | null;
}): boolean {
  return wasSplit && !isSplit && pickedId !== null;
}

/** A page pushed by that collapse goes back into the split when it opens again. */
export function shouldReturnToSplit({
  isSplit,
  pushedByFold,
}: {
  isSplit: boolean;
  pushedByFold: boolean;
}): boolean {
  return isSplit && pushedByFold;
}

/** The route param that marks a page pushed by a collapsing split. */
export const PUSHED_BY_FOLD_PARAM = "fromSplit";
