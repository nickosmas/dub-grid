/**
 * Which before-segment each after-segment came from.
 *
 * Segments used to be compared by position alone, which misreads any edit
 * that removes something other than the last one: dropping the D from D/N
 * left the surviving N labelled "Was D" and the summary claiming N was
 * removed, when D was. Same-position matches are taken first (so a straight
 * replacement still reads as one), then equal keys elsewhere in the cell, and
 * only then whatever before-segment is left over, positionally. A `null`
 * entry means the after-segment is genuinely new.
 *
 * A `null` key never matches by key, only positionally: an absence segment
 * has no shift or job to match on.
 */
export function alignSegmentsToBefore<T>(
  before: ReadonlyArray<T>,
  after: ReadonlyArray<T>,
  keyOf: (item: T) => string | number | null,
): Array<number | null> {
  const beforeKeys = before.map(keyOf);
  const afterKeys = after.map(keyOf);
  const alignment: Array<number | null> = after.map(() => null);
  const claimed = new Set<number>();

  const claim = (afterIndex: number, beforeIndex: number) => {
    alignment[afterIndex] = beforeIndex;
    claimed.add(beforeIndex);
  };

  afterKeys.forEach((key, afterIndex) => {
    if (key != null && beforeKeys[afterIndex] === key) claim(afterIndex, afterIndex);
  });

  afterKeys.forEach((key, afterIndex) => {
    if (alignment[afterIndex] != null || key == null) return;
    const match = beforeKeys.findIndex(
      (beforeKey, beforeIndex) => beforeKey === key && !claimed.has(beforeIndex),
    );
    if (match !== -1) claim(afterIndex, match);
  });

  afterKeys.forEach((_key, afterIndex) => {
    if (alignment[afterIndex] != null) return;
    const leftover = beforeKeys.findIndex((_beforeKey, beforeIndex) => !claimed.has(beforeIndex));
    if (leftover !== -1) claim(afterIndex, leftover);
  });

  return alignment;
}

/** Before-indices no after-segment claimed: the segments that were removed. */
export function unclaimedBeforeIndices(
  alignment: ReadonlyArray<number | null>,
  beforeCount: number,
): number[] {
  const claimed = new Set(alignment.filter((index): index is number => index != null));
  const unclaimed: number[] = [];
  for (let index = 0; index < beforeCount; index += 1) {
    if (!claimed.has(index)) unclaimed.push(index);
  }
  return unclaimed;
}
