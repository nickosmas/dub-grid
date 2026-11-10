/**
 * Whether two id lists hold the same ids, in any order. Pickers append in the
 * order things were tapped, so comparing positions would call an untouched
 * selection changed, and comparing lengths would miss a swap.
 */
export function sameIds<T extends number | string>(
  left: readonly T[],
  right: readonly T[],
): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}
