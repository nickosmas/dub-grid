const NAMES_SHOWN = 3;

/** "East, West, North +2"; "No wings" when empty. `plural` is already lower case. */
export function summarizeNames(names: readonly string[], plural: string): string {
  if (names.length === 0) return `No ${plural}`;
  if (names.length <= NAMES_SHOWN) return names.join(", ");
  return `${names.slice(0, NAMES_SHOWN).join(", ")} +${names.length - NAMES_SHOWN}`;
}

/**
 * Names for the given ids, in the order of `items`, skipping ids with no match.
 * A name repeats once: each focus area has its own "Day" shift.
 */
export function namesForIds(
  items: readonly { id: number; name: string }[],
  ids: readonly number[],
): string[] {
  const wanted = new Set(ids);
  return [...new Set(items.filter((item) => wanted.has(item.id)).map((item) => item.name))];
}
