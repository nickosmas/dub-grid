import { extractDateKeyFromCellKey } from "@/lib/draft-utils";

const CELL_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/**
 * Turns a schedule cell key into something a person can read, for presence
 * surfaces that report what another editor is working on.
 *
 * Cell keys are `${employeeId}_${dateKey}`, so both halves need resolving: the
 * employee through the caller's directory, the date through a fixed formatter.
 * Either half can legitimately be missing (an employee outside the loaded
 * directory, a malformed key), so every combination degrades to whatever is
 * known rather than rendering a raw key or a broken date.
 */
export function describeEditingCell(
  cellKey: string | null,
  employeeNameById: Map<string, string>,
): string | null {
  if (!cellKey) return null;

  const employeeId = cellKey.split("_")[0] ?? "";
  const employeeName = employeeId ? (employeeNameById.get(employeeId) ?? null) : null;

  const dateKey = extractDateKeyFromCellKey(cellKey);
  let dateLabel: string | null = null;
  if (dateKey) {
    // Parse as local noon: constructing from the bare date string yields UTC
    // midnight, which formats as the previous day for negative offsets.
    const [year, month, day] = dateKey.split("-").map(Number);
    const parsed = new Date(year, month - 1, day, 12);
    if (!Number.isNaN(parsed.getTime())) dateLabel = CELL_DATE_FORMATTER.format(parsed);
  }

  if (employeeName && dateLabel) return `${employeeName}, ${dateLabel}`;
  return employeeName ?? dateLabel;
}
