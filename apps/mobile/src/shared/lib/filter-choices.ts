/** Ticks or unticks one choice, keeping the ticked choices in the list's order. */
export function toggleFilterChoice<T>(ticked: readonly T[], choice: T, order: readonly T[]): T[] {
  return order.filter((item) =>
    item === choice ? !ticked.includes(choice) : ticked.includes(item),
  );
}

/**
 * A filter with nothing ticked is off. Otherwise a person matches when any of
 * their values is one of the ticked choices.
 */
export function matchesAnyChoice<T>(ticked: readonly T[], values: readonly T[]): boolean {
  return ticked.length === 0 || values.some((value) => ticked.includes(value));
}
