/**
 * One part of a job's placement line: "No wings", the name when there is one,
 * "All wings" when every choice is ticked, otherwise a count ("2 wings").
 * `plural` is already lower case. Names count once: each focus area has its
 * own "Day" shift.
 */
export function summarizeSelection(
  choices: readonly { id: number; name: string }[],
  selectedIds: readonly number[],
  plural: string,
): string {
  const wanted = new Set(selectedIds);
  const chosen = choices.filter((choice) => wanted.has(choice.id));
  const names = new Set(chosen.map((choice) => choice.name));
  if (names.size === 0) return `No ${plural}`;
  if (names.size === 1) return chosen[0].name;
  if (chosen.length === choices.length) return `All ${plural}`;
  return `${names.size} ${plural}`;
}
