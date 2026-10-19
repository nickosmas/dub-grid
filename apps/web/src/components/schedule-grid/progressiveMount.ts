/**
 * How much of the grid is mounted. The first render mounts what fills the
 * screen: whole sections, then the first rows of the section the screen ends
 * in. The rest mounts afterwards one step at a time, and stays mounted.
 */
export type GridMount = "all" | { sections: number; rows: number };

/** How one section renders under a mount: in full, its first `rows`, or not yet. */
export type SectionMount = "full" | { rows: number } | "pending";

/**
 * The mount that covers `budgetPx` of grid, given each section's row count in
 * render order and the estimated height of a section's chrome and of a row.
 */
export function initialGridMount(
  rowCounts: readonly number[],
  budgetPx: number,
  sectionChromePx: number,
  rowPx: number,
): GridMount {
  let remaining = budgetPx;
  for (let index = 0; index < rowCounts.length; index += 1) {
    const height = sectionChromePx + rowCounts[index] * rowPx;
    if (height >= remaining) {
      const rows = Math.max(1, Math.ceil((remaining - sectionChromePx) / rowPx));
      if (rows < rowCounts[index]) return { sections: index, rows };
      return index + 1 >= rowCounts.length ? "all" : { sections: index + 1, rows: 0 };
    }
    remaining -= height;
  }
  return "all";
}

/** One step on: the partly mounted section in full, else the next section. */
export function nextGridMount(mount: GridMount, sectionCount: number): GridMount {
  if (mount === "all") return "all";
  const sections = mount.sections + 1;
  return sections >= sectionCount ? "all" : { sections, rows: 0 };
}

export function sectionMount(mount: GridMount, index: number): SectionMount {
  if (mount === "all" || index < mount.sections) return "full";
  if (index === mount.sections && mount.rows > 0) return { rows: mount.rows };
  return "pending";
}
