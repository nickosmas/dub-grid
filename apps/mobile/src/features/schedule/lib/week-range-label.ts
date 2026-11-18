/** "Nov 15 - Nov 21" as "Nov 15 - 21": a week inside one month needs its name once. */
export function compactSameMonthRange(label: string): string {
  return label.replace(/^(\S+) (\d+) - \1 (\d+)$/, "$1 $2 - $3");
}
