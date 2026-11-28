/** One row of Home's week on the phone. */
export type WeekRow = { kind: "day"; date: string } | { kind: "free"; from: string; to: string };

/**
 * Home's week with free days in a row folded into one row, from the first to
 * the last. Today keeps a row of its own, so the list still shows where you
 * are, and so does a day that changed, which says what it was. A week with no
 * shifts at all is Home's empty state instead of a list.
 */
export function groupFreeDays(
  days: ReadonlyArray<{ date: string; free: boolean; changed: boolean }>,
  todayDate: string,
): WeekRow[] {
  const rows: WeekRow[] = [];
  let run: { from: string; to: string } | null = null;
  const closeRun = () => {
    if (!run) return;
    rows.push(run.from === run.to ? { kind: "day", date: run.from } : { kind: "free", ...run });
    run = null;
  };
  for (const day of days) {
    if (day.free && !day.changed && day.date !== todayDate) {
      run = run ? { from: run.from, to: day.date } : { from: day.date, to: day.date };
      continue;
    }
    closeRun();
    rows.push({ kind: "day", date: day.date });
  }
  closeRun();
  return rows;
}
